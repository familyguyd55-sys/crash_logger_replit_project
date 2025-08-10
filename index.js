/ index.js
const express = require('express');
const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CSV_DIR = path.join(__dirname, 'data');
const MODEL_FILE = path.join(__dirname, 'model.json');
const LAST_PRED_FILE = path.join(__dirname, 'lastPrediction.json');

if (!fs.existsSync(CSV_DIR)) fs.mkdirSync(CSV_DIR);

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let worker = null;
let workerState = { running: false, pollMs: Number(process.env.POLL_MS || 800) };

function startWorker() {
  if (worker) return;
  worker = new Worker(path.join(__dirname, 'scraper-worker.js'));

  worker.on('message', msg => {
    // forward logs and events to clients
    if (msg.type === 'log') console.log('[worker]', msg.text);
    if (msg.type === 'error') console.error('[worker-error]', msg.error);
    if (msg.type === 'newRound') io.emit('newRound', msg.row);
    if (msg.type === 'prediction') io.emit('prediction', msg.prediction);
    if (msg.type === 'stats') io.emit('stats', msg.stats);
    // always forward raw message for debugging
    io.emit('workerMessage', msg);
  });

  worker.on('exit', code => {
    console.error('Worker exited with code', code);
    worker = null;
    workerState.running = false;
    // try to restart after delay
    setTimeout(() => startWorker(), 5000);
  });

  worker.on('error', err => {
    console.error('Worker error', err);
  });

  // initialize
  worker.postMessage({ type: 'init', pollMs: workerState.pollMs, gameUrl: process.env.GAME_URL || '' });
  workerState.running = true;
}

function stopWorker() {
  if (!worker) return;
  worker.postMessage({ type: 'stop' });
  worker.terminate();
  worker = null;
  workerState.running = false;
}

// API: get list of recent CSV files
app.get('/api/files', (req, res) => {
  const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv')).sort().reverse();
  res.json({ ok: true, files });
});

// API: download a CSV file (by name) or latest
app.get('/download', (req, res) => {
  const file = req.query.file;
  let target = null;
  if (file) {
    const p = path.join(CSV_DIR, file);
    if (fs.existsSync(p)) target = p;
  } else {
    const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv')).sort();
    if (files.length) target = path.join(CSV_DIR, files[files.length - 1]);
  }
  if (!target) return res.status(404).send('No CSV available');
  res.download(target);
});

// API: latest N rows (reads latest CSV and returns last N rows)
app.get('/api/latest', (req, res) => {
  const n = Math.min(500, Number(req.query.n || 100));
  // find latest csv
  const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv')).sort();
  if (!files.length) return res.json({ ok: true, rows: [] });
  const latest = path.join(CSV_DIR, files[files.length - 1]);
  const raw = fs.readFileSync(latest, 'utf8').trim();
  const lines = raw.split('\n');
  if (lines.length <= 1) return res.json({ ok: true, rows: [] });
  const dataLines = lines.slice(1);
  const last = dataLines.slice(-n);
  const rows = last.map(line => {
    const [time, totalBets, bettors, totalWinnings, crashMultiplier, roundNumber, predictedCap, seed] = line.split(',');
    return { time, totalBets: Number(totalBets), bettors: Number(bettors), totalWinnings: Number(totalWinnings), crashMultiplier: Number(crashMultiplier), roundNumber: Number(roundNumber), predictedCap: Number(predictedCap), seed };
  });
  res.json({ ok: true, rows });
});

// API: get basic stats
app.get('/api/stats', (req, res) => {
  // scan last 1000 rows across latest file only
  const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv')).sort();
  if (!files.length) return res.json({ ok: true, stats: null });
  const latest = path.join(CSV_DIR, files[files.length - 1]);
  const raw = fs.readFileSync(latest, 'utf8').trim();
  const lines = raw.split('\n');
  const dataLines = lines.slice(1);
  const last = dataLines.slice(-1000);
  if (!last.length) return res.json({ ok: true, stats: null });
  const multipliers = last.map(l => Number(l.split(',')[4]));
  const avg = multipliers.reduce((s, v) => s + v, 0) / multipliers.length;
  res.json({ ok: true, stats: { avgMultiplier: avg, maxMultiplier: Math.max(...multipliers), minMultiplier: Math.min(...multipliers) } });
});

// API: start/stop worker
app.post('/api/worker/start', (req, res) => {
  startWorker();
  res.json({ ok: true });
});
app.post('/api/worker/stop', (req, res) => {
  stopWorker();
  res.json({ ok: true });
});

// API: change poll interval
app.post('/api/worker/poll/:ms', (req, res) => {
  const ms = Math.max(200, Number(req.params.ms));
  workerState.pollMs = ms;
  if (worker) worker.postMessage({ type: 'setPoll', pollMs: ms });
  res.json({ ok: true, pollMs: ms });
});

// Serve lastPrediction.json directly if exists
app.get('/lastPrediction.json', (req, res) => {
  if (!fs.existsSync(LAST_PRED_FILE)) return res.status(404).send('No prediction yet');
  res.sendFile(LAST_PRED_FILE);
});

// Socket.IO connection
io.on('connection', socket => {
  console.log('Client connected', socket.id);
  socket.emit('workerState', workerState);
  socket.on('start', () => startWorker());
  socket.on('stop', () => stopWorker());
  socket.on('setPoll', ms => {
    workerState.pollMs = ms;
    if (worker) worker.postMessage({ type: 'setPoll', pollMs: ms });
  });
});

// start server and worker
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startWorker();
});
