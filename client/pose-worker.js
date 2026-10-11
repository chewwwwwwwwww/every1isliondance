// Construct this as a CLASSIC Worker. The MediaPipe WASM loader uses importScripts.
const VERSION = '0.10.32';
const ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
let models = [], delegates = [], lanes = 2, busy = false;
let vision, files, modelBytes, renderer = '', inputHeight = 320, averageMs = 0, frameCount = 0;
const buffers = [], contexts = [], stamps = [];
let faceModel, faceBuffer, faceContext, faceStamp = 0, faceLoading = false;
const poseAttemptAt = [], poseDetected = [], previousFaces = [];

function chooseDelegate(requested) {
  if (requested === 'CPU') return 'CPU';
  let gl;
  try {
    const probe = new OffscreenCanvas(8, 8);
    gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return 'CPU';
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    // Avoid seconds of shader compilation/inference on software renderers.
    if (/swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i.test(renderer)) return 'CPU';
    // A masked renderer does not establish hardware acceleration.
    return debug || requested === 'GPU' ? 'GPU' : 'CPU';
  } catch (_) { return 'CPU'; }
  finally { try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) {} }
}

async function makeModel(lane, delegate) {
  const options = {
    baseOptions: { modelAssetBuffer: modelBytes.slice(), delegate },
    runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: .45, minPosePresenceConfidence: .45,
    minTrackingConfidence: .45, outputSegmentationMasks: false
  };
  models[lane] = await vision.PoseLandmarker.createFromOptions(files, options);
  delegates[lane] = delegate;
}

async function makeFaceModel() {
  faceLoading = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(FACE_MODEL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Face model download failed (${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // One face model serves every lane. CPU avoids another GPU context and its
    // shader warmup; measured close-up inference is about 10–17 ms on this host.
    faceModel = await vision.FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetBuffer: bytes, delegate: 'CPU' },
      runningMode: 'VIDEO', numFaces: lanes,
      minFaceDetectionConfidence: .5, minFacePresenceConfidence: .55,
      minTrackingConfidence: .5,
      outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false
    });
    self.postMessage({ type: 'faceReady' });
  } catch (error) {
    // Pose tracking remains available if the optional face asset cannot load.
    self.postMessage({ type: 'faceUnavailable', message: error.message });
  } finally { clearTimeout(timeout); faceLoading = false; }
}

function closeFaceNeeded(poses) {
  return poses.some(p => {
    if (!p) return true;
    const eyeSpan = Math.abs(p[2].x - p[5].x);
    const earSpan = Math.abs(p[7].x - p[8].x);
    // Face mesh is useful for close-up accuracy. Small full-body faces retain
    // the faster, already accurate body nose landmark.
    return eyeSpan > .035 || earSpan > .09 || (p[0].visibility ?? 1) < .6;
  });
}

function detectFaces(bitmap, time, poses) {
  const faces = Array(lanes).fill(null);
  if (!faceModel || !closeFaceNeeded(poses)) return { faces, ms: 0 };
  const start = performance.now();
  const height = Math.min(480, bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width / bitmap.height * height));
  if (!faceBuffer) {
    faceBuffer = new OffscreenCanvas(width, height);
    faceContext = faceBuffer.getContext('2d', { alpha: false, desynchronized: true });
  }
  if (faceBuffer.width !== width) faceBuffer.width = width;
  if (faceBuffer.height !== height) faceBuffer.height = height;
  faceContext.drawImage(bitmap, 0, 0, width, height);
  faceStamp = Math.max(Number(time) || 0, faceStamp + .01);
  const result = faceModel.detectForVideo(faceBuffer, faceStamp);
  for (const lm of result.faceLandmarks || []) {
    const nose = lm[1];
    if (!Number.isFinite(nose?.x) || !Number.isFinite(nose?.y) || nose.x < 0 || nose.x > 1 || nose.y < 0 || nose.y > 1) continue;
    const lane = Math.min(lanes - 1, Math.floor(nose.x * lanes));
    const left = Math.min(...lm.map(p => p.x)), right = Math.max(...lm.map(p => p.x));
    const top = Math.min(...lm.map(p => p.y)), bottom = Math.max(...lm.map(p => p.y));
    const face = {
      nose: { x: nose.x, y: nose.y, z: nose.z },
      eyes: [lm[33], lm[263]].map(p => ({ x: p.x, y: p.y })),
      forehead: { x: lm[10].x, y: lm[10].y },
      chin: { x: lm[152].x, y: lm[152].y },
      bounds: { x: left, y: top, width: right - left, height: bottom - top },
      source: 'face', capturedAt: time
    };
    const poseNose = poses[lane]?.[0];
    if (poseNose && (poseNose.visibility ?? 1) > .6) {
      // Avoid adopting another bystander's face in the same lane.
      const distance = Math.hypot(nose.x - poseNose.x, nose.y - poseNose.y);
      if (distance > Math.max(.055, face.bounds.width * .8)) continue;
      const prior = faces[lane];
      if (prior && Math.hypot(prior.nose.x - poseNose.x, prior.nose.y - poseNose.y) <= distance) continue;
    } else if (faces[lane] && faces[lane].bounds.width * faces[lane].bounds.height >= face.bounds.width * face.bounds.height) continue;
    faces[lane] = face;
  }
  return { faces, ms: performance.now() - start };
}

async function initialize(data) {
  lanes = Math.max(1, Math.min(3, Number(data.lanes) || 2));
  for (const model of models) { try { model.close(); } catch (_) {} }
  models = []; delegates = []; stamps.length = 0; averageMs = 0; frameCount = 0;
  poseAttemptAt.length = 0; poseDetected.length = 0; previousFaces.length = 0;
  try { faceModel?.close(); } catch (_) {}
  faceModel = null; faceStamp = 0;
  const delegate = chooseDelegate(data.delegate);
  inputHeight = delegate === 'GPU' ? 384 : lanes === 3 ? 288 : 320;
  vision = await import(`${ROOT}/vision_bundle.mjs`);
  files = await vision.FilesetResolver.forVisionTasks(`${ROOT}/wasm`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(MODEL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Pose model download failed (${response.status}).`);
    modelBytes = new Uint8Array(await response.arrayBuffer());
  } finally { clearTimeout(timeout); }
  for (let i = 0; i < lanes; i++) {
    self.postMessage({ type: 'progress', lane: i, lanes, delegate });
    try { await makeModel(i, delegate); }
    catch (error) {
      if (delegate !== 'GPU') throw error;
      await makeModel(i, 'CPU');
    }
  }
  if (delegates.every(value => value === 'CPU')) inputHeight = lanes === 3 ? 288 : 320;
  self.postMessage({ type: 'ready', delegates, renderer, inputHeight });
  // Load refinement in the background so a weak venue connection cannot delay
  // normal full-body tracking or prevent the camera from starting.
  void makeFaceModel();
}

async function processFrame(data) {
  const { bitmap, time } = data;
  if (busy) { bitmap.close(); return; }
  busy = true;
  const start = performance.now(), frameHeight = inputHeight;
  try {
    const poses = [];
    let poseAttempts = 0, poseSkipped = 0;
    for (let i = 0; i < lanes; i++) {
      // A visible face can keep the close-up cursor fresh without repeatedly
      // asking the body detector to rediscover shoulders/hips outside the frame.
      // Only failed body lanes qualify. A successful pose is sampled every frame,
      // and losing the current face forces a body scan on the next frame.
      const captured = Number(time) || 0;
      if (poseDetected[i] === false && previousFaces[i] && captured - poseAttemptAt[i] < 150) {
        poses.push(null); poseSkipped++; continue;
      }
      poseAttemptAt[i] = captured; poseAttempts++;
      // Independent crops retain stable lane identity while people move together.
      const margin = lanes === 1 ? 0 : bitmap.width / lanes * .07;
      const x = Math.max(0, i * bitmap.width / lanes - margin);
      const end = Math.min(bitmap.width, (i + 1) * bitmap.width / lanes + margin);
      const width = end - x, height = frameHeight;
      const canvasWidth = Math.max(1, Math.round(width / bitmap.height * height));
      let canvas = buffers[i];
      if (!canvas) {
        canvas = buffers[i] = new OffscreenCanvas(canvasWidth, height);
        contexts[i] = canvas.getContext('2d', { alpha: false, desynchronized: true });
      }
      if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
      if (canvas.height !== height) canvas.height = height;
      contexts[i].drawImage(bitmap, x, 0, width, bitmap.height, 0, 0, canvasWidth, height);
      const stamp = stamps[i] = Math.max(Number(time) || 0, (stamps[i] || 0) + .01);
      let result;
      try { result = models[i].detectForVideo(canvas, stamp); }
      catch (error) {
        if (delegates[i] !== 'GPU') throw error;
        try { models[i].close(); } catch (_) {}
        self.postMessage({ type: 'progress', lane: i, lanes, delegate: 'CPU', fallback: true });
        await makeModel(i, 'CPU');
        result = models[i].detectForVideo(canvas, stamp + .01);
        stamps[i] = stamp + .01;
      }
      const landmarks = result.landmarks?.[0];
      if (!landmarks) { poseDetected[i] = false; poses.push(null); continue; }
      const mapped = landmarks.map(p => ({ ...p, x: (x + p.x * width) / bitmap.width, z: p.z * width / bitmap.width }));
      const center = (mapped[11].x + mapped[12].x) / 2;
      poseDetected[i] = center > i / lanes - .01 && center < (i + 1) / lanes + .01;
      poses.push(poseDetected[i] ? mapped : null);
    }
    let faceResult = { faces: Array(lanes).fill(null), ms: 0 };
    try { faceResult = detectFaces(bitmap, time, poses); }
    catch (error) {
      try { faceModel?.close(); } catch (_) {}
      faceModel = null;
      self.postMessage({ type: 'faceUnavailable', message: error.message });
    }
    for (let i = 0; i < lanes; i++) previousFaces[i] = !!faceResult.faces[i];
    const ms = performance.now() - start;
    averageMs = averageMs ? averageMs * .8 + ms * .2 : ms;
    // The tensor size is fixed; smaller input chiefly saves upload/preprocessing.
    // Resize infrequently to avoid reallocating a texture every frame.
    if (++frameCount > 2 && frameCount % 8 === 0) {
      if (averageMs > 110) inputHeight = Math.max(256, inputHeight - 32);
      else if (averageMs < 35) inputHeight = Math.min(384, inputHeight + 32);
    }
    self.postMessage({
      type: 'poses', poses: poses.reverse(), faces: faceResult.faces.reverse(), time, ms,
      faceMs: faceResult.ms, faceReady: !!faceModel, faceLoading,
      poseAttempts, poseSkipped,
      capturedAt: time, completedAtEpoch: performance.timeOrigin + performance.now(),
      delegates: delegates.slice().reverse(), inputHeight: frameHeight, nextInputHeight: inputHeight,
      suggestedInterval: Math.max(33, Math.min(120, averageMs * .2))
    });
  } catch (error) {
    previousFaces.fill(false);
    self.postMessage({ type: 'frameError', message: error.message, time });
  } finally { busy = false; bitmap.close(); }
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try { await initialize(data); }
    catch (error) { self.postMessage({ type: 'error', message: error.message }); }
  } else if (data.type === 'frame') await processFrame(data);
};
