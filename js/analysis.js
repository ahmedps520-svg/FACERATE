// Geometric facial-feature analysis, computed entirely from MediaPipe FaceLandmarker
// output (478 normalized landmarks). Everything here runs on-device; only the
// derived numbers below are ever stored — raw images are discarded after capture.
//
// This is a heuristic, ratio-based estimate, not a clinical or scientific
// measurement. Landmark indices reference the standard MediaPipe face mesh
// topology (canonical 468-point model, indices unchanged in FaceLandmarker).

const IDX = {
  noseTip: 1,
  noseBase: 2,
  noseBridge: 168,
  foreheadTop: 10,
  chin: 152,
  rightFaceEdge: 234,
  leftFaceEdge: 454,
  jawRight: 172,
  jawLeft: 397,
  chinLeftWidth: 148,
  chinRightWidth: 377,
  templeRight: 103,
  templeLeft: 332,
  eyeRightOuter: 33,
  eyeRightInner: 133,
  eyeRightTop: 159,
  eyeRightBottom: 145,
  eyeLeftInner: 362,
  eyeLeftOuter: 263,
  eyeLeftTop: 386,
  eyeLeftBottom: 374,
  browRight: 105,
  browLeft: 334,
  browRightInner: 55,
  browLeftInner: 285,
  mouthRight: 61,
  mouthLeft: 291,
  lipUpperOuter: 0,
  lipUpperInner: 13,
  lipLowerInner: 14,
  lipLowerOuter: 17,
  noseAlaRight: 98,
  noseAlaLeft: 327,
};

function pt(landmarks, i, w, h) {
  const p = landmarks[i];
  return { x: p.x * w, y: p.y * h, z: p.z * w };
}
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function angleDeg(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function bucket(value, thresholds, labels) {
  for (let i = 0; i < thresholds.length; i++) {
    if (value < thresholds[i]) return labels[i];
  }
  return labels[labels.length - 1];
}

// ---- individual feature computations -------------------------------------

function analyzeFaceShape(P) {
  const faceWidth = dist(P.rightFaceEdge, P.leftFaceEdge);
  const faceHeight = dist(P.foreheadTop, P.chin);
  const jawWidth = dist(P.jawRight, P.jawLeft);
  const foreheadWidth = dist(P.templeRight, P.templeLeft);
  const lengthRatio = faceHeight / faceWidth;
  const jawToFace = jawWidth / faceWidth;
  const foreheadToFace = foreheadWidth / faceWidth;

  let label;
  if (lengthRatio > 1.62) label = 'Oblong';
  else if (Math.abs(jawToFace - foreheadToFace) < 0.06 && jawToFace > 0.82 && lengthRatio < 1.35) label = 'Square';
  else if (foreheadToFace - jawToFace > 0.1) label = 'Heart';
  else if (jawToFace - foreheadToFace > 0.08 && lengthRatio < 1.4) label = 'Round';
  else label = 'Oval';

  return { label, metrics: { lengthRatio, jawToFace, foreheadToFace }, baseConfidence: 80 };
}

function analyzeJawline(P) {
  const left = angleDeg(P.jawLeft, P.chin);
  const right = angleDeg(P.jawRight, P.chin);
  const jawAngle = Math.abs(left - right);
  const label = bucket(jawAngle, [95, 125], ['Defined', 'Moderate', 'Soft']);
  return { label, metrics: { jawAngle }, baseConfidence: 76 };
}

function analyzeChin(P) {
  const chinWidth = dist(P.chinLeftWidth, P.chinRightWidth);
  const chinHeight = dist(midpoint(P.mouthRight, P.mouthLeft), P.chin);
  const ratio = chinWidth / Math.max(chinHeight, 1);
  const label = bucket(ratio, [0.9, 1.3], ['Pointed', 'Rounded', 'Wide']);
  return { label, metrics: { ratio }, baseConfidence: 72 };
}

function analyzeCheekbones(P) {
  const cheekWidth = dist(P.rightFaceEdge, P.leftFaceEdge);
  const jawWidth = dist(P.jawRight, P.jawLeft);
  const foreheadWidth = dist(P.templeRight, P.templeLeft);
  const prominence = cheekWidth / Math.max((jawWidth + foreheadWidth) / 2, 1);
  const label = bucket(prominence, [1.02, 1.12], ['Subtle', 'Balanced', 'Prominent']);
  return { label, metrics: { prominence }, baseConfidence: 68 };
}

function analyzeEyeShape(P) {
  const rW = dist(P.eyeRightOuter, P.eyeRightInner);
  const rH = dist(P.eyeRightTop, P.eyeRightBottom);
  const lW = dist(P.eyeLeftInner, P.eyeLeftOuter);
  const lH = dist(P.eyeLeftTop, P.eyeLeftBottom);
  const ratio = (rW / Math.max(rH, 0.001) + lW / Math.max(lH, 0.001)) / 2;
  const label = bucket(ratio, [2.6, 3.3], ['Round', 'Almond-Round', 'Almond']);
  return { label, metrics: { ratio }, baseConfidence: 82 };
}

function analyzeEyeSpacing(P) {
  const interocular = dist(P.eyeRightInner, P.eyeLeftInner);
  const eyeWidth = (dist(P.eyeRightOuter, P.eyeRightInner) + dist(P.eyeLeftInner, P.eyeLeftOuter)) / 2;
  const ratio = interocular / Math.max(eyeWidth, 1);
  const label = bucket(ratio, [0.9, 1.15], ['Close-set', 'Average', 'Wide-set']);
  return { label, metrics: { ratio }, baseConfidence: 86 };
}

function analyzeCanthalTilt(P) {
  function tiltFor(inner, outer) {
    const medial = inner.x < outer.x ? inner : outer;
    const lateral = inner.x < outer.x ? outer : inner;
    const dx = Math.max(Math.abs(lateral.x - medial.x), 1);
    return (Math.atan2(medial.y - lateral.y, dx) * 180) / Math.PI;
  }
  const rightTilt = tiltFor(P.eyeRightInner, P.eyeRightOuter);
  const leftTilt = tiltFor(P.eyeLeftInner, P.eyeLeftOuter);
  const avgTilt = (rightTilt + leftTilt) / 2;
  const label = bucket(avgTilt, [-2.5, 2.5], ['Negative (downturned)', 'Neutral', 'Positive (upturned)']);
  return { label, metrics: { avgTilt }, baseConfidence: 78 };
}

function analyzeEyebrows(P) {
  const browEyeGapR = dist(P.browRight, P.eyeRightTop);
  const browEyeGapL = dist(P.browLeft, P.eyeLeftTop);
  const faceHeight = dist(P.foreheadTop, P.chin);
  const gapRatio = (browEyeGapR + browEyeGapL) / 2 / faceHeight;
  const archR = P.browRightInner.y - P.browRight.y;
  const archL = P.browLeftInner.y - P.browLeft.y;
  const archScore = (archR + archL) / 2;
  const spacing = bucket(gapRatio, [0.045, 0.075], ['Low-set', 'Balanced', 'High-set']);
  const shape = archScore > 3 ? 'Arched' : 'Straight';
  return { label: `${shape}, ${spacing}`, metrics: { gapRatio, archScore }, baseConfidence: 70 };
}

function analyzeNoseWidth(P) {
  const noseWidth = dist(P.noseAlaRight, P.noseAlaLeft);
  const mouthWidth = dist(P.mouthRight, P.mouthLeft);
  const faceWidth = dist(P.rightFaceEdge, P.leftFaceEdge);
  const ratio = noseWidth / faceWidth;
  const label = bucket(ratio, [0.19, 0.24], ['Narrow', 'Average', 'Wide']);
  return { label, metrics: { ratio, vsMouth: noseWidth / Math.max(mouthWidth, 1) }, baseConfidence: 84 };
}

function analyzeNoseLength(P) {
  const noseLength = dist(P.noseBridge, P.noseBase);
  const faceHeight = dist(P.foreheadTop, P.chin);
  const ratio = noseLength / faceHeight;
  const label = bucket(ratio, [0.19, 0.24], ['Short', 'Average', 'Long']);
  return { label, metrics: { ratio }, baseConfidence: 83 };
}

function analyzeLipFullness(P) {
  const upper = dist(P.lipUpperOuter, P.lipUpperInner);
  const lower = dist(P.lipLowerOuter, P.lipLowerInner);
  const faceHeight = dist(P.foreheadTop, P.chin);
  const ratio = (upper + lower) / faceHeight;
  const label = bucket(ratio, [0.045, 0.07], ['Thin', 'Medium', 'Full']);
  return { label, metrics: { ratio }, baseConfidence: 79 };
}

function analyzeSymmetry(P) {
  const midX = (P.noseBridge.x + P.noseTip.x) / 2;
  const pairs = [
    [P.eyeRightOuter, P.eyeLeftOuter],
    [P.eyeRightInner, P.eyeLeftInner],
    [P.mouthRight, P.mouthLeft],
    [P.jawRight, P.jawLeft],
    [P.templeRight, P.templeLeft],
  ];
  let totalDev = 0;
  for (const [r, l] of pairs) {
    const rDist = Math.abs(r.x - midX);
    const lDist = Math.abs(l.x - midX);
    const avg = (rDist + lDist) / 2 || 1;
    totalDev += Math.abs(rDist - lDist) / avg;
  }
  const avgDevPct = (totalDev / pairs.length) * 100;
  const score = clamp(100 - avgDevPct * 4, 40, 99);
  const label = bucket(100 - score, [6, 14], ['High', 'Good', 'Moderate']);
  return { label, metrics: { score: Math.round(score) }, baseConfidence: 88 };
}

function analyzeForehead(P) {
  const browLine = midpoint(P.browRight, P.browLeft);
  const foreheadHeight = dist(P.foreheadTop, browLine);
  const faceHeight = dist(P.foreheadTop, P.chin);
  const ratio = foreheadHeight / faceHeight;
  const label = bucket(ratio, [0.28, 0.36], ['Low', 'Proportionate', 'High']);
  return { label, metrics: { ratio }, baseConfidence: 66 };
}

function analyzeProportions(P) {
  const browLine = midpoint(P.browRight, P.browLeft);
  const upper = dist(P.foreheadTop, browLine);
  const middle = dist(browLine, P.noseBase);
  const lower = dist(P.noseBase, P.chin);
  const total = upper + middle + lower || 1;
  const thirds = [upper / total, middle / total, lower / total];
  const deviation = thirds.reduce((s, t) => s + Math.abs(t - 1 / 3), 0) * 100;
  const label = bucket(deviation, [8, 16], ['Balanced', 'Slightly Uneven', 'Uneven']);
  return { label, metrics: { thirds: thirds.map((t) => Math.round(t * 100)), deviation }, baseConfidence: 84 };
}

// ---- lighting & pose quality -----------------------------------------------

export function analyzeLighting(imageData) {
  const data = imageData.data;
  let sum = 0;
  let sumSq = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += lum;
    sumSq += lum * lum;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const stddev = Math.sqrt(Math.max(variance, 0));

  let score = 100;
  if (mean < 60) score -= (60 - mean) * 1.2;
  if (mean > 200) score -= (mean - 200) * 1.2;
  if (stddev < 20) score -= (20 - stddev) * 1.5;
  score = clamp(score, 20, 99);

  const label = bucket(100 - score, [10, 30, 55], ['Excellent', 'Good', 'Fair', 'Poor']);
  return { label, score: Math.round(score), mean: Math.round(mean), stddev: Math.round(stddev) };
}

export function analyzePoseQuality(poseSamples) {
  // poseSamples: { straight: {yawDev, pitchDev}, neutral: {yawDev, pitchDev} }
  const devs = Object.values(poseSamples)
    .filter(Boolean)
    .map((s) => Math.abs(s.yawDev) + Math.abs(s.pitchDev));
  const avgDev = devs.length ? devs.reduce((a, b) => a + b, 0) / devs.length : 10;
  const score = clamp(100 - avgDev * 2.2, 30, 99);
  const label = bucket(100 - score, [10, 30, 55], ['Excellent', 'Good', 'Fair', 'Poor']);
  return { label, score: Math.round(score) };
}

// ---- orchestration ----------------------------------------------------------

const FEATURE_FNS = {
  faceShape: analyzeFaceShape,
  jawline: analyzeJawline,
  chin: analyzeChin,
  cheekbones: analyzeCheekbones,
  eyeShape: analyzeEyeShape,
  eyeSpacing: analyzeEyeSpacing,
  canthalTilt: analyzeCanthalTilt,
  eyebrows: analyzeEyebrows,
  noseWidth: analyzeNoseWidth,
  noseLength: analyzeNoseLength,
  lipFullness: analyzeLipFullness,
  symmetry: analyzeSymmetry,
  forehead: analyzeForehead,
  proportions: analyzeProportions,
};

export const FEATURE_LABELS = {
  faceShape: 'Face Shape',
  jawline: 'Jawline',
  chin: 'Chin',
  cheekbones: 'Cheekbones',
  eyeShape: 'Eye Shape',
  eyeSpacing: 'Eye Spacing',
  canthalTilt: 'Canthal Tilt',
  eyebrows: 'Eyebrows',
  noseWidth: 'Nose Width',
  noseLength: 'Nose Length',
  lipFullness: 'Lip Fullness',
  symmetry: 'Facial Symmetry',
  forehead: 'Forehead',
  proportions: 'Facial Proportions',
  lighting: 'Lighting Quality',
  poseQuality: 'Pose Quality',
};

export function buildLandmarkPoints(landmarks, w, h) {
  const P = {};
  for (const key in IDX) P[key] = pt(landmarks, IDX[key], w, h);
  return P;
}

export function runFullAnalysis({ referenceLandmarks, w, h, lightingImageData, poseSamples }) {
  const P = buildLandmarkPoints(referenceLandmarks, w, h);
  const qualityLighting = analyzeLighting(lightingImageData);
  const qualityPose = analyzePoseQuality(poseSamples);
  const qualityFactor = clamp(((qualityLighting.score + qualityPose.score) / 2 / 85), 0.75, 1.08);

  const features = {};
  for (const key in FEATURE_FNS) {
    const result = FEATURE_FNS[key](P);
    const confidence = Math.round(clamp(result.baseConfidence * qualityFactor, 45, 98));
    features[key] = { label: result.label, confidence, metrics: result.metrics };
  }
  features.lighting = { label: qualityLighting.label, confidence: qualityLighting.score, metrics: qualityLighting };
  features.poseQuality = { label: qualityPose.label, confidence: qualityPose.score, metrics: qualityPose };

  const overallScore = computeOverallScore(features, qualityFactor);
  const suggestions = generateSuggestions(features);

  return { features, overallScore, suggestions };
}

function computeOverallScore(features, qualityFactor) {
  const symmetryScore = features.symmetry.metrics.score; // 40-99
  const proportionScore = clamp(100 - features.proportions.metrics.deviation * 2, 30, 99);
  const lightingScore = features.lighting.metrics.score;
  const poseScore = features.poseQuality.metrics.score;

  const composite =
    symmetryScore * 0.35 +
    proportionScore * 0.3 +
    lightingScore * 0.15 +
    poseScore * 0.2;

  // Map composite (roughly 40-99) onto a supportive 1-10 display range (5.0-9.6),
  // since this is a geometric-consistency estimate, not an attractiveness verdict.
  const normalized = clamp((composite - 40) / (99 - 40), 0, 1);
  const score = 5.0 + normalized * 4.6 * clamp(qualityFactor, 0.9, 1.05);
  return Math.round(clamp(score, 5.0, 9.6) * 10) / 10;
}

// ---- suggestions ------------------------------------------------------------

const HAIRSTYLE_TIPS = {
  Oval: ['Most hairstyles suit an oval face — experiment with fringe, volume, or a clean crop.'],
  Round: ['Added height on top and shorter sides can elongate a round face shape.'],
  Square: ['Soft layers or a textured crop can ease strong jaw angles.'],
  Heart: ['Chin-length or side-swept styles help balance a narrower jawline.'],
  Oblong: ['A fringe or bangs can help visually shorten a longer face shape.'],
};

const GROOMING_TIPS = {
  Defined: ['Light stubble or a close trim tends to complement an already-defined jawline.'],
  Moderate: ['A tapered beard along the jaw can add subtle structure.'],
  Soft: ['Fuller beard styling along the jaw and chin can add definition, if that\'s your style.'],
};

const CAMERA_TIPS = [
  'Shoot from slightly above eye level for a flattering, natural perspective.',
  'Keep the camera roughly at eye level and a little to the side rather than dead-on.',
  'Try a 3/4 angle rather than straight-on to add depth to your photos.',
];

const LIGHTING_TIPS = {
  Poor: ['Try soft, diffused daylight facing you — avoid strong overhead or backlighting.'],
  Fair: ['A window facing your face or a simple ring light can even out shadows.'],
  Good: ['Your lighting is solid — soft front lighting will keep it consistent.'],
  Excellent: ['Great lighting — this is close to ideal for consistent scan tracking.'],
};

const WELLNESS_TIPS = [
  'Aim for consistent sleep — it shows up in skin tone and under-eye appearance.',
  'Staying hydrated through the day can help skin look fresher.',
  'Regular exercise and a balanced diet often show in facial definition over time.',
];

const SKINCARE_TIPS = [
  'A simple daily routine — cleanse, moisturize, SPF — goes a long way.',
  'Consistency matters more than product count for skin health.',
  'Daily SPF helps protect skin tone and texture over time.',
];

function pickOne(arr, seed) {
  return arr[Math.abs(seed) % arr.length];
}

function generateSuggestions(features) {
  const seed = Math.round(features.symmetry.metrics.score + features.proportions.metrics.deviation);
  const list = [];

  const shapeKey = features.faceShape.label;
  list.push({ category: 'Hairstyle', icon: '💇', text: pickOne(HAIRSTYLE_TIPS[shapeKey] || HAIRSTYLE_TIPS.Oval, seed) });

  const jawKey = features.jawline.label;
  list.push({ category: 'Grooming', icon: '🪒', text: pickOne(GROOMING_TIPS[jawKey] || GROOMING_TIPS.Moderate, seed + 1) });

  list.push({ category: 'Camera Angle', icon: '📸', text: pickOne(CAMERA_TIPS, seed + 2) });

  const lightKey = features.lighting.label;
  list.push({ category: 'Lighting', icon: '💡', text: pickOne(LIGHTING_TIPS[lightKey] || LIGHTING_TIPS.Good, seed + 3) });

  list.push({ category: 'Wellness', icon: '💧', text: pickOne(WELLNESS_TIPS, seed + 4) });
  list.push({ category: 'Skincare', icon: '🧴', text: pickOne(SKINCARE_TIPS, seed + 5) });

  return list;
}
