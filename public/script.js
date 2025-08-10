// script.js
const multiplierCtx = document.getElementById('multiplierChart').getContext('2d');
let multiplierChart = new Chart(multiplierCtx, {
  type: 'line',
  data: { labels: [], datasets: [{ label: 'Multiplier', data: [], tension: 0.25, fill: false }] },
  options: { scales: { x: { display: false }, y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
});

async function fetchLatest() {
  try {
    const res = await fetch('/api/latest?n=100');
    const json = await res.json();
    if (!json.ok) return;
    const rows = json.rows;
    // update chart
    const labels = rows.map(r => r.time.slice(11,19));
    const data = rows.map(r => r.crashMultiplier);
    multiplierChart.data.labels = labels;
    multiplierChart.data.datasets[0].data = data;
    multiplierChart.update();

    // table
    const tbody = document.querySelector('#roundsTable tbody');
    tbody.innerHTML = '';
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.roundNumber}</td><td>${r.time.slice(11,19)}</td><td>${r.crashMultiplier}x</td><td>${r.totalBets}</td><td>${r.bettors}</td><td>${r.totalWinnings}</td><td>${r.predictedCap}</td><td>${r.seed}</td>`;
      tbody.appendChild(tr);
    }
  } catch (err) {
    console.error('fetchLatest error', err);
  }
}

async function fetchPrediction() {
  try {
    const res = await fetch('/api/prediction');
    const json = await res.json();
    const predEl = document.getElementById('prediction');
    if (json.ok && json.prediction) {
      // If worker wrote lastPrediction.json it will be returned inside json
      predEl.textContent = `${json.prediction.predictedMultiplier}x (features: ${JSON.stringify(json.prediction.features)})`;
    } else if (json.ok && json.predictedMultiplier) {
      predEl.textContent = `${json.predictedMultiplier}x`;
    } else {
      // fallback: try to fetch lastPrediction.json directly
      const tryFile = await fetch('/lastPrediction.json').catch(()=>null);
      if (tryFile && tryFile.ok) {
        const lp = await tryFile.json();
        predEl.textContent = `${lp.predictedMultiplier}x`;
      } else {
        predEl.textContent = 'No prediction yet';
      }
    }
  } catch (err) {
    console.error('fetchPrediction error', err);
  }
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const json = await res.json();
    const el = document.getElementById('stats');
    if (json.ok && json.stats) {
      el.innerHTML = `Avg: ${json.stats.avgMultiplier.toFixed(2)}x • Max: ${json.stats.maxMultiplier}x • Min: ${json.stats.minMultiplier}x`;
    } else {
      el.textContent = 'No data yet';
    }
  } catch (err) {
    console.error('fetchStats error', err);
  }
}

async function tick() {
  await fetchLatest();
  await fetchPrediction();
  await fetchStats();
}

// initial + polling every 3s
tick();
setInterval(tick, 3000);
