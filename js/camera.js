import { buildLandmarkPoints } from './analysis.js';

const VISION_BUNDLE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';
const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const HOLD_MS = 550;
// These geometric thresholds are best-effort estimates (not device-calibrated).
// yawMetric and pitchRatio are self-normalized per-face ratios, so they should
// generalize reasonably across face shapes, but exact numbers may need tuning.
const YAW_THRESHOLD = 0.07;
const YAW_STRAIGHT_MAX = 0.05;
const PITCH_REL_THRESHOLD = 0.16;
const SMILE_ON = 0.42;
const SMILE_OFF = 0.15;
const JAW_OPEN_MAX = 0.2;

export const POSES = [
  { key: 'straight', title: 'Look Straight', sub: 'Center your face in the frame', icon: '👀' },
  { key: 'left', title: 'Turn Left', sub: 'Slowly turn your head to the left', icon: '⬅️' },
  { key: 'right', title: 'Turn Right', sub: 'Slowly turn your head to the right', icon: '➡️' },
  { key: 'up', title: 'Look Up', sub: 'Tilt your head upward', icon: '⬆️' },
  { key: 'down', title: 'Look Down', sub: 'Tilt your head downward', icon: '⬇️' },
  { key: 'smile', title: 'Smile', sub: 'Show us a natural, relaxed smile', icon: '😄' },
  { key: 'neutral', title: 'Neutral Expression', sub: 'Relax your face and look straight ahead', icon: '😐' },
];

function getBlendshape(result, name) {
  const list = result.faceBlendshapes && result.faceBlendshapes[0] && result.faceBlendshapes[0].categories;
  if (!list) return 0;
  const found = list.find((c) => c.categoryName === name);
  return found ? found.score : 0;
}

function computeMetrics(landmarks, w, h, result) {
  const P = buildLandmarkPoints(landmarks, w, h);
  const faceCenterX = (P.rightFaceEdge.x + P.leftFaceEdge.x) / 2;
  const faceWidth = Math.abs(P.leftFaceEdge.x - P.rightFaceEdge.x) || 1;
  const yaw = (P.noseTip.x - faceCenterX) / faceWidth;

  const eyeLineY = (P.eyeRightTop.y + P.eyeLeftTop.y) / 2;
  const foreheadToNose = Math.abs(P.noseTip.y - P.foreheadTop.y);
  const noseToChin = Math.abs(P.chin.y - P.noseTip.y) || 1;
  const pitchRatio = foreheadToNose / noseToChin;

  const smileL = getBlendshape(result, 'mouthSmileLeft');
  const smileR = getBlendshape(result, 'mouthSmileRight');
  const smile = (smileL + smileR) / 2;
  const jawOpen = getBlendshape(result, 'jawOpen');
  const faceSizeRatio = faceWidth / w;

  return { yaw, pitchRatio, smile, jawOpen, faceSizeRatio, eyeLineY };
}

export class PoseScanner {
  constructor(videoEl, canvasEl) {
    this.video = videoEl;
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.landmarker = null;
    this.stream = null;
    this.rafId = null;
    this.running = false;
    this.invertYaw = false;
    this.hapticsEnabled = true;
    this.baseline = null; // { yaw, pitchRatio }
    this.holdStart = null;
    this.stepIndex = 0;
    this.captures = {};
    this.callbacks = {};
    this.lastResult = null;
  }

  async loadModel() {
    const vision = await import(/* webpackIgnore: true */ VISION_BUNDLE_URL);
    const { FaceLandmarker, FilesetResolver } = vision;
    const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
    this.landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    });
  }

  async startCamera() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await new Promise((resolve) => {
      this.video.onloadedmetadata = () => {
        this.video.play();
        resolve();
      };
    });
    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  setInvertYaw(val) {
    this.invertYaw = !!val;
  }

  setHaptics(val) {
    this.hapticsEnabled = !!val;
  }

  begin(callbacks) {
    this.callbacks = callbacks;
    this.running = true;
    this.stepIndex = 0;
    this.captures = {};
    this.baseline = null;
    this.holdStart = null;
    this.callbacks.onStepChange && this.callbacks.onStepChange(0, POSES[0]);
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  captureSnapshot(maxWidth = 240) {
    const scale = Math.min(1, maxWidth / this.video.videoWidth);
    const w = Math.round(this.video.videoWidth * scale);
    const h = Math.round(this.video.videoHeight * scale);
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d');
    octx.drawImage(this.video, 0, 0, w, h);
    const dataUrl = off.toDataURL('image/jpeg', 0.7);
    const imageData = octx.getImageData(0, 0, w, h);
    return { dataUrl, imageData };
  }

  _testPose(key, metrics) {
    const sign = this.invertYaw ? -1 : 1;
    const yawRel = (metrics.yaw - (this.baseline ? this.baseline.yaw : 0)) * sign;
    const pitchRel = this.baseline
      ? (metrics.pitchRatio - this.baseline.pitchRatio) / this.baseline.pitchRatio
      : 0;

    switch (key) {
      case 'straight':
        return Math.abs(metrics.yaw) < YAW_STRAIGHT_MAX && metrics.faceSizeRatio > 0.22;
      case 'left':
        return yawRel > YAW_THRESHOLD;
      case 'right':
        return yawRel < -YAW_THRESHOLD;
      case 'up':
        return pitchRel < -PITCH_REL_THRESHOLD;
      case 'down':
        return pitchRel > PITCH_REL_THRESHOLD;
      case 'smile':
        return metrics.smile > SMILE_ON;
      case 'neutral':
        return (
          metrics.smile < SMILE_OFF &&
          metrics.jawOpen < JAW_OPEN_MAX &&
          Math.abs(yawRel) < YAW_THRESHOLD &&
          Math.abs(pitchRel) < PITCH_REL_THRESHOLD
        );
      default:
        return false;
    }
  }

  _drawOverlay(landmarks) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!landmarks) return;
    ctx.fillStyle = 'rgba(52, 199, 89, 0.55)';
    const step = 4;
    for (let i = 0; i < landmarks.length; i += step) {
      const p = landmarks[i];
      ctx.beginPath();
      ctx.arc(p.x * this.canvas.width, p.y * this.canvas.height, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    let result = null;
    try {
      result = this.landmarker.detectForVideo(this.video, now);
    } catch (e) {
      this.rafId = requestAnimationFrame(() => this._loop());
      return;
    }
    this.lastResult = result;
    const hasFace = result.faceLandmarks && result.faceLandmarks.length > 0;

    this._drawOverlay(hasFace ? result.faceLandmarks[0] : null);

    if (!hasFace) {
      this.holdStart = null;
      this.callbacks.onFaceState && this.callbacks.onFaceState(false, 0);
      this.rafId = requestAnimationFrame(() => this._loop());
      return;
    }

    const landmarks = result.faceLandmarks[0];
    const metrics = computeMetrics(landmarks, this.video.videoWidth, this.video.videoHeight, result);
    const pose = POSES[this.stepIndex];
    const pass = pose ? this._testPose(pose.key, metrics) : false;

    let progress = 0;
    if (pass) {
      if (this.holdStart == null) this.holdStart = now;
      progress = Math.min(1, (now - this.holdStart) / HOLD_MS);
    } else {
      this.holdStart = null;
    }
    this.callbacks.onFaceState && this.callbacks.onFaceState(true, progress);

    if (pass && progress >= 1) {
      this._completeStep(pose, landmarks, metrics);
    }

    this.rafId = requestAnimationFrame(() => this._loop());
  }

  _completeStep(pose, landmarks, metrics) {
    this.holdStart = null;
    const capture = {
      key: pose.key,
      landmarks: landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      metrics: { ...metrics },
    };

    if (pose.key === 'straight') {
      this.baseline = { yaw: metrics.yaw, pitchRatio: metrics.pitchRatio };
      const snap = this.captureSnapshot(240);
      capture.thumbnail = snap.dataUrl;
      capture.lightingImageData = snap.imageData;
    }

    this.captures[pose.key] = capture;

    if (this.hapticsEnabled && navigator.vibrate) navigator.vibrate(35);
    this.callbacks.onPoseComplete && this.callbacks.onPoseComplete(this.stepIndex, pose, capture);

    this.stepIndex += 1;
    if (this.stepIndex >= POSES.length) {
      this.running = false;
      this.callbacks.onAllComplete && this.callbacks.onAllComplete(this.captures, this.video.videoWidth, this.video.videoHeight);
      return;
    }

    setTimeout(() => {
      this.callbacks.onStepChange && this.callbacks.onStepChange(this.stepIndex, POSES[this.stepIndex]);
    }, 450);
  }
}
