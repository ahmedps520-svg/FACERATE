const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';

let chartInstance = null;
let loadPromise = null;

function loadChartJs() {
  if (window.Chart) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.crossOrigin = 'anonymous';
    script.src = CHART_JS_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Chart.js'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export async function renderHistoryChart(canvas, scans) {
  await loadChartJs();
  const labels = scans.map((s) => new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const scores = scans.map((s) => s.overallScore);

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, 'rgba(255, 45, 58, 0.35)');
  gradient.addColorStop(1, 'rgba(255, 45, 58, 0)');

  chartInstance = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data: scores,
          borderColor: '#ff2d3a',
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointRadius: scores.map((_, i) => (i === scores.length - 1 ? 4 : 0)),
          pointBackgroundColor: '#ff2d3a',
          pointHoverRadius: 5,
          borderWidth: 2.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#17171f', padding: 10, cornerRadius: 10 } },
      scales: {
        x: { grid: { display: false }, ticks: { color: 'rgba(235,240,255,0.4)', font: { size: 10 } } },
        y: {
          min: 4,
          max: 10,
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: { color: 'rgba(235,240,255,0.4)', font: { size: 10 }, stepSize: 2 },
        },
      },
    },
  });
}
