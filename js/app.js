import { PoseScanner, POSES, analyzePhotoFile } from './camera.js';
import { runFullAnalysis, FEATURE_LABELS } from './analysis.js';
import { saveScan, getAllScans, deleteScan, clearAllScans } from './db.js';
import { renderHistoryChart } from './charts.js';

const FEATURE_ORDER = [
  'faceShape', 'jawline', 'chin', 'cheekbones', 'eyeShape', 'eyeSpacing',
  'canthalTilt', 'eyebrows', 'noseWidth', 'noseLength', 'lipFullness',
  'symmetry', 'forehead', 'proportions', 'lighting', 'poseQuality',
];

const ANALYSIS_MESSAGES = [
  'Building facial mesh...',
  'Mapping facial landmarks...',
  'Estimating facial proportions...',
  'Computing symmetry profile...',
  'Detecting jaw geometry...',
  'Measuring eye alignment...',
  'Calculating canthal tilt...',
  'Detecting eyebrow structure...',
  'Estimating facial balance...',
  'Analyzing contour profile...',
  'Refining feature confidence...',
  'Generating profile summary...',
];

const settings = {
  haptics: localStorage.getItem('fs_haptics') !== 'false',
  invertYaw: localStorage.getItem('fs_invertYaw') === 'true',
};

let scanner = null;
let resultsContext = 'new'; // 'new' | 'history'
let viewingScanId = null;
let pendingScanRecord = null;
let confirmAction = null;

// ---------------- navigation ----------------

const screens = document.querySelectorAll('.screen');
function showScreen(name) {
  screens.forEach((s) => {
    if (s.dataset.screen === name) {
      s.classList.remove('leaving');
      s.classList.add('active');
    } else if (s.classList.contains('active')) {
      s.classList.remove('active');
    }
  });
  if (name === 'history') refreshHistoryScreen();
  if (name === 'settings') syncSettingsUI();
}

document.querySelectorAll('[data-nav]').forEach((el) => {
  el.addEventListener('click', () => {
    const target = el.dataset.nav;
    if (document.querySelector('#screen-scan').classList.contains('active') && target !== 'scan') {
      teardownScanner();
    }
    showScreen(target);
  });
});

function teardownScanner() {
  if (scanner) {
    scanner.stop();
    scanner.stopCamera();
  }
}

// ---------------- toast & modal ----------------

let toastTimer = null;
function showToast(message, duration = 2200) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

const confirmOverlay = document.getElementById('confirm-overlay');
function askConfirm(title, message, okLabel, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-ok').textContent = okLabel;
  confirmAction = onConfirm;
  confirmOverlay.classList.add('show');
}
document.getElementById('confirm-cancel').addEventListener('click', () => {
  confirmOverlay.classList.remove('show');
  confirmAction = null;
});
document.getElementById('confirm-ok').addEventListener('click', async () => {
  const action = confirmAction;
  confirmOverlay.classList.remove('show');
  confirmAction = null;
  if (action) await action();
});

// ---------------- scan intro / begin ----------------

document.getElementById('begin-scan-btn').addEventListener('click', beginScan);
document.getElementById('camera-retry-btn').addEventListener('click', beginScan);

async function beginScan() {
  showScreen('scan');
  buildStepDots(0);
  updatePoseUI(POSES[0]);

  const video = document.getElementById('camera-feed');
  const canvas = document.getElementById('overlay-canvas');

  if (!scanner) scanner = new PoseScanner(video, canvas);
  scanner.setInvertYaw(settings.invertYaw);
  scanner.setHaptics(settings.haptics);

  try {
    await scanner.startCamera();
    if (!scanner.landmarker) await scanner.loadModel();
  } catch (err) {
    console.error(err);
    const msg = document.getElementById('camera-error-message');
    if (err && err.name === 'NotAllowedError') {
      msg.textContent = 'Camera access was denied. Please allow camera access in Settings to run a scan.';
    } else {
      msg.textContent = 'Could not start the camera or load the on-device model. Check your connection and try again.';
    }
    showScreen('camera-error');
    return;
  }

  scanner.begin({
    onStepChange: (idx, pose) => {
      buildStepDots(idx);
      updatePoseUI(pose);
    },
    onFaceState: (hasFace, progress) => {
      const ring = document.getElementById('face-guide-ring');
      ring.classList.toggle('locked', hasFace && progress > 0.15);
    },
    onPoseComplete: (idx) => {
      buildStepDots(idx + 1, true);
      const check = document.getElementById('pose-check');
      check.classList.remove('show');
      void check.offsetWidth;
      check.classList.add('show');
    },
    onAllComplete: (captures, w, h) => {
      scanner.stopCamera();
      runAnalysisFlow(captures, w, h);
    },
  });
}

function buildStepDots(currentIdx, justCompleted) {
  const wrap = document.getElementById('step-dots');
  wrap.innerHTML = '';
  POSES.forEach((_, i) => {
    const dot = document.createElement('span');
    dot.className = 'dot';
    if (i < currentIdx) dot.classList.add('done');
    else if (i === currentIdx && !justCompleted) dot.classList.add('current');
    wrap.appendChild(dot);
  });
  document.getElementById('step-label').textContent = `Step ${Math.min(currentIdx + 1, POSES.length)} of ${POSES.length}`;
}

function updatePoseUI(pose) {
  document.getElementById('pose-icon').textContent = pose.icon;
  document.getElementById('pose-title').textContent = pose.title;
  document.getElementById('pose-sub').textContent = pose.sub;
  document.getElementById('face-guide-ring').classList.remove('locked');
}

// ---------------- photo upload ----------------

document.getElementById('upload-photo-btn').addEventListener('click', () => {
  document.getElementById('photo-input').click();
});

document.getElementById('photo-input').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;

  // Start on-device processing while the analysis animation plays.
  const photoPromise = analyzePhotoFile(file);
  runAnalysisRing(async () => {
    let photo;
    try {
      photo = await photoPromise;
    } catch (err) {
      console.error(err);
      showToast('Could not analyze that photo. Check your connection and try again.');
      showScreen('home');
      return;
    }
    if (!photo) {
      showToast('No face detected in that photo — try a clear, front-facing shot.');
      showScreen('home');
      return;
    }
    const poseSamples = {
      straight: { yawDev: photo.metrics.yaw * 100, pitchDev: 0 },
    };
    const result = runFullAnalysis({
      referenceLandmarks: photo.landmarks,
      w: photo.w,
      h: photo.h,
      lightingImageData: photo.lightingImageData,
      poseSamples,
    });
    await presentNewScan({
      date: new Date().toISOString(),
      overallScore: result.overallScore,
      features: result.features,
      suggestions: result.suggestions,
      thumbnail: photo.thumbnail,
      scanType: 'photo',
    });
  });
});

// ---------------- analysis loading ----------------

function runAnalysisFlow(captures, w, h) {
  runAnalysisRing(() => finishAnalysis(captures, w, h));
}

function runAnalysisRing(onComplete) {
  showScreen('analysis');
  const ringFill = document.getElementById('ring-fill');
  const percentEl = document.getElementById('ring-percent');
  const messageEl = document.getElementById('analysis-message');
  const circumference = 2 * Math.PI * 88;
  ringFill.style.strokeDasharray = `${circumference}`;
  ringFill.style.strokeDashoffset = `${circumference}`;

  const duration = 8000 + Math.random() * 4000;
  const startTime = performance.now();
  let msgIndex = 0;
  messageEl.textContent = ANALYSIS_MESSAGES[0];
  const msgInterval = setInterval(() => {
    msgIndex = (msgIndex + 1) % ANALYSIS_MESSAGES.length;
    messageEl.style.animation = 'none';
    void messageEl.offsetWidth;
    messageEl.style.animation = '';
    messageEl.textContent = ANALYSIS_MESSAGES[msgIndex];
  }, duration / ANALYSIS_MESSAGES.length);

  function colorForProgress(t) {
    const stops = [
      [255, 69, 58], [255, 159, 10], [255, 214, 10], [52, 199, 89],
    ];
    const seg = Math.min(t, 0.999) * (stops.length - 1);
    const i = Math.floor(seg);
    const f = seg - i;
    const a = stops[i], b = stops[i + 1] || stops[i];
    const r = Math.round(a[0] + (b[0] - a[0]) * f);
    const g = Math.round(a[1] + (b[1] - a[1]) * f);
    const bl = Math.round(a[2] + (b[2] - a[2]) * f);
    return `rgb(${r},${g},${bl})`;
  }

  function tick(now) {
    const t = Math.min(1, (now - startTime) / duration);
    ringFill.style.strokeDashoffset = `${circumference * (1 - t)}`;
    ringFill.style.stroke = colorForProgress(t);
    percentEl.textContent = `${Math.round(t * 100)}%`;
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      clearInterval(msgInterval);
      onComplete();
    }
  }
  requestAnimationFrame(tick);
}

async function finishAnalysis(captures, w, h) {
  const straight = captures.straight;
  const neutral = captures.neutral;

  const poseSamples = {
    straight: straight ? { yawDev: straight.metrics.yaw * 100, pitchDev: 0 } : null,
    neutral: neutral
      ? {
          yawDev: neutral.metrics.yaw * 100,
          pitchDev: straight
            ? ((neutral.metrics.pitchRatio - straight.metrics.pitchRatio) / straight.metrics.pitchRatio) * 100
            : 0,
        }
      : null,
  };

  const result = runFullAnalysis({
    referenceLandmarks: straight.landmarks,
    w,
    h,
    lightingImageData: straight.lightingImageData,
    poseSamples,
  });

  await presentNewScan({
    date: new Date().toISOString(),
    overallScore: result.overallScore,
    features: result.features,
    suggestions: result.suggestions,
    thumbnail: straight.thumbnail,
    scanType: 'camera',
  });
}

async function presentNewScan(record) {
  // score delta vs the most recent saved scan, persisted with the record
  try {
    const prev = await getAllScans();
    if (prev.length > 0) {
      const last = prev[prev.length - 1];
      record.scoreDelta = Math.round((record.overallScore - last.overallScore) * 10) / 10;
    }
  } catch (e) { /* delta is optional */ }

  pendingScanRecord = record;
  resultsContext = 'new';
  renderResults(record);
  showScreen('results');
}

// ---------------- results ----------------

let currentRenderedScan = null;

function renderResults(scan) {
  currentRenderedScan = scan;
  const circumference = 2 * Math.PI * 70;
  const fill = document.getElementById('score-ring-fill');
  fill.style.strokeDasharray = `${circumference}`;
  const pct = scan.overallScore / 10;
  requestAnimationFrame(() => {
    fill.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.34,1.2,0.4,1), stroke 0.6s ease';
    fill.style.strokeDashoffset = `${circumference * (1 - pct)}`;
    fill.style.stroke = pct > 0.75 ? '#34c759' : pct > 0.55 ? '#ffd60a' : '#ff9f0a';
  });
  document.getElementById('score-value').textContent = scan.overallScore.toFixed(1);
  document.getElementById('score-date').textContent = new Date(scan.date).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  });

  const deltaEl = document.getElementById('score-delta');
  deltaEl.className = 'score-delta';
  if (typeof scan.scoreDelta === 'number') {
    if (scan.scoreDelta > 0) {
      deltaEl.classList.add('up');
      deltaEl.textContent = `▲ +${scan.scoreDelta.toFixed(1)} vs last scan`;
    } else if (scan.scoreDelta < 0) {
      deltaEl.classList.add('down');
      deltaEl.textContent = `▼ ${scan.scoreDelta.toFixed(1)} vs last scan`;
    } else {
      deltaEl.classList.add('same');
      deltaEl.textContent = '— same as last scan';
    }
  } else {
    deltaEl.textContent = '';
  }

  document.getElementById('scan-type-badge').textContent =
    scan.scanType === 'photo' ? '🖼️ Photo Analysis' : '🤳 Camera Scan';

  const grid = document.getElementById('feature-grid');
  grid.innerHTML = '';
  FEATURE_ORDER.forEach((key, i) => {
    const f = scan.features[key];
    if (!f) return;
    const card = document.createElement('div');
    card.className = 'feature-card';
    card.style.setProperty('--i', i);
    card.innerHTML = `
      <div class="fname">${FEATURE_LABELS[key]}</div>
      <div class="fvalue">${f.label}</div>
      <div class="fconf"><div class="fconf-bar" style="width:${f.confidence}%"></div></div>
      <div class="fconf-label">${f.confidence}% confidence</div>
    `;
    grid.appendChild(card);
  });

  const sugList = document.getElementById('suggestion-list');
  sugList.innerHTML = '';
  scan.suggestions.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'suggestion-card';
    card.innerHTML = `
      <div class="sicon">${s.icon}</div>
      <div>
        <div class="scat">${s.category}</div>
        <div class="stext">${s.text}</div>
      </div>
    `;
    sugList.appendChild(card);
  });

  document.getElementById('results-delete-btn').style.display = resultsContext === 'history' ? 'flex' : 'none';
  document.getElementById('results-scroll').scrollTop = 0;
}

// Render the current report to a PNG entirely on-device and trigger a local
// save — nothing is uploaded.
document.getElementById('export-report-btn').addEventListener('click', () => {
  const scan = currentRenderedScan;
  if (!scan) return;

  const W = 900;
  const rowH = 46;
  const featureKeys = FEATURE_ORDER.filter((k) => scan.features[k]);
  const headerH = 360;
  const featuresH = Math.ceil(featureKeys.length / 2) * rowH + 70;
  const suggH = scan.suggestions.length * 78 + 70;
  const H = headerH + featuresH + suggH + 120;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1c060a');
  bg.addColorStop(0.4, '#0a0203');
  bg.addColorStop(1, '#050002');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff2d3a';
  ctx.font = '700 44px -apple-system, system-ui, sans-serif';
  ctx.fillText('FaceScan AI', W / 2, 80);
  ctx.fillStyle = 'rgba(245,235,236,0.5)';
  ctx.font = '400 22px -apple-system, system-ui, sans-serif';
  ctx.fillText(new Date(scan.date).toLocaleString(), W / 2, 116);

  // score ring
  const cx = W / 2, cy = 230, r = 85;
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const pct = scan.overallScore / 10;
  ctx.strokeStyle = '#ff2d3a';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '800 64px -apple-system, system-ui, sans-serif';
  ctx.fillText(scan.overallScore.toFixed(1), cx, cy + 22);

  // features (two columns)
  let y = headerH + 40;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ff5560';
  ctx.font = '700 26px -apple-system, system-ui, sans-serif';
  ctx.fillText('Detected Features', 60, y);
  y += 34;
  ctx.font = '400 22px -apple-system, system-ui, sans-serif';
  featureKeys.forEach((key, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = col === 0 ? 60 : W / 2 + 20;
    const fy = y + row * rowH;
    const f = scan.features[key];
    ctx.fillStyle = 'rgba(245,235,236,0.5)';
    ctx.fillText(FEATURE_LABELS[key], x, fy);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(f.label), x, fy + 24);
  });
  y += Math.ceil(featureKeys.length / 2) * rowH + 40;

  // suggestions
  ctx.fillStyle = '#ff5560';
  ctx.font = '700 26px -apple-system, system-ui, sans-serif';
  ctx.fillText('Suggestions', 60, y);
  y += 40;
  scan.suggestions.forEach((s) => {
    ctx.fillStyle = '#ff5560';
    ctx.font = '700 20px -apple-system, system-ui, sans-serif';
    ctx.fillText(`${s.icon} ${s.category.toUpperCase()}`, 60, y);
    ctx.fillStyle = 'rgba(245,235,236,0.85)';
    ctx.font = '400 21px -apple-system, system-ui, sans-serif';
    // simple two-line wrap
    const words = s.text.split(' ');
    let line = '';
    let ly = y + 28;
    for (const word of words) {
      if (ctx.measureText(line + word).width > W - 120) {
        ctx.fillText(line, 60, ly);
        line = word + ' ';
        ly += 26;
      } else {
        line += word + ' ';
      }
    }
    ctx.fillText(line.trim(), 60, ly);
    y = ly + 50;
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(245,235,236,0.35)';
  ctx.font = '400 18px -apple-system, system-ui, sans-serif';
  ctx.fillText('App-generated estimate — not an objective measure of attractiveness.', W / 2, H - 40);

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `facescan-report-${new Date(scan.date).toISOString().slice(0, 10)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  showToast('Report image saved');
});

document.getElementById('results-back-btn').addEventListener('click', () => {
  showScreen(resultsContext === 'history' ? 'history' : 'home');
});
document.getElementById('results-done-btn').addEventListener('click', async () => {
  if (resultsContext === 'new' && pendingScanRecord) {
    try {
      await saveScan(pendingScanRecord);
      showToast('Scan saved to History');
    } catch (e) {
      console.error(e);
      showToast('Could not save scan locally');
    }
    pendingScanRecord = null;
  }
  showScreen('home');
});
document.getElementById('results-delete-btn').addEventListener('click', () => {
  if (viewingScanId == null) return;
  askConfirm('Delete this scan?', 'This scan report will be permanently removed from your device.', 'Delete', async () => {
    await deleteScan(viewingScanId);
    showToast('Scan deleted');
    showScreen('history');
  });
});

// ---------------- history ----------------

async function refreshHistoryScreen() {
  const scans = await getAllScans();
  const empty = document.getElementById('history-empty');
  const list = document.getElementById('history-list');
  const statsWrap = document.getElementById('history-stats');
  const chartCanvas = document.getElementById('history-chart');

  if (scans.length === 0) {
    empty.style.display = 'flex';
    list.innerHTML = '';
    statsWrap.innerHTML = '';
    chartCanvas.parentElement.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  chartCanvas.parentElement.style.display = 'block';

  const latest = scans[scans.length - 1];
  const highest = scans.reduce((a, b) => (b.overallScore > a.overallScore ? b : a));
  const avg = scans.reduce((s, x) => s + x.overallScore, 0) / scans.length;

  statsWrap.innerHTML = `
    <div class="stat-card latest"><div class="slabel">Latest</div><div class="sval">${latest.overallScore.toFixed(1)}</div></div>
    <div class="stat-card highest"><div class="slabel">Highest</div><div class="sval">${highest.overallScore.toFixed(1)}</div></div>
    <div class="stat-card avg"><div class="slabel">Average</div><div class="sval">${avg.toFixed(1)}</div></div>
  `;

  await renderHistoryChart(chartCanvas, scans);

  list.innerHTML = '';
  [...scans].reverse().forEach((scan) => {
    const card = document.createElement('div');
    card.className = 'history-card';
    const dateStr = new Date(scan.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    card.innerHTML = `
      <img class="hthumb" src="${scan.thumbnail || ''}" alt="" />
      <div class="hinfo">
        <div class="hdate">${dateStr}</div>
        <div class="hmeta">${scan.scanType === 'photo' ? '🖼️ Photo' : '🤳 Camera'} · ${Object.keys(scan.features).length} features</div>
      </div>
      <div class="hscore">${scan.overallScore.toFixed(1)}</div>
    `;
    card.addEventListener('click', () => {
      viewingScanId = scan.id;
      resultsContext = 'history';
      renderResults(scan);
      showScreen('results');
    });
    list.appendChild(card);
  });
}

document.getElementById('history-clear-btn').addEventListener('click', () => {
  askConfirm('Clear all history?', 'All saved scans will be permanently removed from this device.', 'Clear All', async () => {
    await clearAllScans();
    showToast('History cleared');
    refreshHistoryScreen();
  });
});

// ---------------- settings ----------------

function syncSettingsUI() {
  document.getElementById('setting-haptics').checked = settings.haptics;
  document.getElementById('setting-invert-yaw').checked = settings.invertYaw;
}

document.getElementById('setting-haptics').addEventListener('change', (e) => {
  settings.haptics = e.target.checked;
  localStorage.setItem('fs_haptics', settings.haptics);
  if (scanner) scanner.setHaptics(settings.haptics);
});
document.getElementById('setting-invert-yaw').addEventListener('change', (e) => {
  settings.invertYaw = e.target.checked;
  localStorage.setItem('fs_invertYaw', settings.invertYaw);
  if (scanner) scanner.setInvertYaw(settings.invertYaw);
});
document.getElementById('clear-history-btn').addEventListener('click', () => {
  askConfirm('Clear all history?', 'All saved scans will be permanently removed from this device.', 'Clear All', async () => {
    await clearAllScans();
    showToast('History cleared');
  });
});

// ---------------- service worker ----------------

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}
