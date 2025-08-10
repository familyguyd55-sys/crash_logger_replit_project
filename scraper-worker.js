// scraper-worker.js
const { parentPort } = require('worker_threads');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const MLR = require('ml-regression-multivariate-linear');

const DATA_DIR = path.join(__dirname, 'data');
const MODEL_FILE = path.join(__dirname, 'model.json');
const LAST_PRED_FILE = path.join(__dirname, 'lastPrediction.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

let POLL_MS = Number(process.env.POLL_MS || 800);
let GAME_URL = process.env.GAME_URL || '';
let running = true;

let trainingData = [];
let trainingLabels = [];
let model = null;
let roundCount = 0;
let lastMultiplier = null;
let lastBettors = null;

// load existing model data
if (fs.existsSync(MODEL_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8'));
    trainingData = saved.trainingData || [];
    trainingLabels = saved.trainingLabels || [];
    if (trainingData.length > 0) {
      model = new MLR(trainingData, trainingLabels);
      parentPort.postMessage({ type: 'log', text: `Loaded model with ${trainingData.length} samples` });
    }
  } catch (err) {
    parentPort.postMessage({ type: 'error', error: 'Model load error: ' + err.message });
  }
}

parentPort.on('message', msg => {
  if (msg.type === 'init') {
    if (msg.pollMs) POLL_MS = Number(msg.pollMs);
    if (msg.gameUrl) GAME_URL = msg.gameUrl;
  }
  if (msg.type === 'setPoll') {
    POLL_MS = Number(msg.pollMs);
    parentPort.postMessage({ type: 'log', text: `Poll interval set to ${POLL_MS}ms` });
  }
  if (msg.type === 'stop') {
    running = false;
  }
});

(async () => {
  parentPort.postMessage({ type: 'log', text: 'Worker initializing Puppeteer...' });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  const url = GAME_URL || 'https://eg1xbet.com/en/games/crash';
  await page.goto(url, { waitUntil: 'networkidle2' });
  parentPort.postMessage({ type: 'log', text: `Opened ${url}` });

  function csvFileNameForNow() {
    const d = new Date();
    const Y = d.getUTCFullYear();
    const M = String(d.getUTCMonth() + 1).padStart(2, '0');
    const D = String(d.getUTCDate()).padStart(2, '0');
    const H = String(d.getUTCHours()).padStart(2, '0');
    return path.join(DATA_DIR, `crash-data-${Y}${M}${D}-${H}.csv`);
  }

  // ensure current CSV exists with header
  function ensureCsv() {
    const f = csvFileNameForNow();
    if (!fs.existsSync(f)) fs.writeFileSync(f, 'time,totalBets,bettors,totalWinnings,crashMultiplier,roundNumber,predictedCap,seed\n');
    return f;
  }

  while (running) {
    try {
      const data = await page.evaluate(() => {
        const getNum = (selector) => {
          const el = document.querySelector(selector);
          return el ? parseInt(el.innerText.replace(/[^\d]/g, ''), 10) : 0;
        };
        const getText = (selector) => {
          const el = document.querySelector(selector);
          return el ? el.innerText.trim() : '';
        };
        return {
          totalBets: getNum('.crash-total__value--bets'),
          bettors: getNum('.crash-total__value--players'),
          totalWinnings: getNum('.crash-total__value--prize'),
          crashMultiplier: parseFloat(getText('.crash-multiplier').replace('x', '')) || null,
          seed: getText('.crash-seed') || ''
        };
      });

      if (data.crashMultiplier !== null) lastMultiplier = data.crashMultiplier;

      // detect round end
      if (lastBettors > 0 && data.bettors === 0 && lastMultiplier !== null) {
        roundCount++;
        const predictedCap = Math.floor(data.totalBets * 0.6);
        const time = new Date().toISOString();

        const row = `${time},${data.totalBets},${lastBettors}
