/**
 * offscreen_onnx.js - ONNX Dog Classifier chạy trong Offscreen Document
 *
 * Pattern y chang fb-reels-dog-bot/extension/content.js:
 *   - ort.env.wasm.wasmPaths = chrome.runtime.getURL('')
 *   - ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] })
 *   - Float32Array CHW /255.0 only (không normalize ImageNet)
 *
 * Offscreen document cho phép WASM chạy không bị CSP chặn.
 */

const IMG_SIZE = 224;
// Classes: [0]=adult_dog  [1]=non_dog  [2]=puppy
const CLASSES  = ['adult_dog', 'non_dog', 'puppy'];

let model   = null;
let isReady = false;
let isLoading = false;

// ─── 1. Load Model ────────────────────────────────────────────────────────────
async function loadModel() {
  if (isReady && model) return true;
  if (isLoading) return false;
  isLoading = true;
  try {
    // Y chang reels bot
    ort.env.wasm.wasmPaths  = chrome.runtime.getURL('lib/');
    ort.env.wasm.numThreads = 1;

    const modelUrl = chrome.runtime.getURL('models/dog-model.onnx');
    console.log('[OffscreenONNX] Loading model:', modelUrl);

    model   = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm']
    });
    isReady = true;
    console.log('[OffscreenONNX] Model ready! Input:', model.inputNames[0], 'Output:', model.outputNames[0]);
    return true;
  } catch(e) {
    console.error('[OffscreenONNX] Load fail:', e.message);
    isReady  = false;
    return false;
  } finally {
    isLoading = false;
  }
}

// ─── 2. Fetch avatar URL → ImageData ─────────────────────────────────────────
function fetchPixels(url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 8000);
    function draw(img) {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = IMG_SIZE;
        canvas.height = IMG_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
        ctx.drawImage(img, 0, 0, IMG_SIZE, IMG_SIZE);
        resolve(ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE));
      } catch(e) { clearTimeout(timer); reject(e); }
    }
    const img1 = new Image();
    img1.crossOrigin = 'anonymous';
    img1.onload  = () => draw(img1);
    img1.onerror = () => {
      const img2 = new Image();
      img2.onload  = () => draw(img2);
      img2.onerror = () => { clearTimeout(timer); reject(new Error('cors')); };
      img2.src = url;
    };
    img1.src = url;
  });
}

// ─── 3. Tensor preprocessing (y chang reels bot: /255.0 only) ────────────────
function toFloat32CHW(imageData) {
  const { data } = imageData;
  const N   = IMG_SIZE * IMG_SIZE;
  const out = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    out[        i] = data[i*4    ] / 255.0; // R
    out[  N   + i] = data[i*4 + 1] / 255.0; // G
    out[2*N   + i] = data[i*4 + 2] / 255.0; // B
  }
  return out;
}

function softmax(arr) {
  const m = Math.max(...arr);
  const e = arr.map(v => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / s);
}

function isFlora(imageData) {
  const { data } = imageData;
  const N = IMG_SIZE * IMG_SIZE;
  let plantPx = 0;
  for (let i = 0; i < N; i++) {
    const r = data[i*4]   / 255, g = data[i*4+1] / 255, b = data[i*4+2] / 255;
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
    if (d < 0.08) continue;
    let h = mx===r ? 60*(((g-b)/d)%6) : mx===g ? 60*((b-r)/d+2) : 60*((r-g)/d+4);
    if (h < 0) h += 360;
    if ((h >= 75 && h <= 165 && g > 0.28) || (h >= 255 && h <= 340)) plantPx++;
  }
  return (plantPx / N) > 0.38;
}

// ─── 4. Main classify function ────────────────────────────────────────────────
async function classifyAvatar(avatarUrl, isDogByKeyword, isB2b) {
  function fb(src, p_dog, label, info) {
    return { p_adult: label==='adult_dog'?p_dog:0, p_puppy: label==='puppy'?p_dog:0,
      p_non: 1-p_dog, p_dog, label, isFlora: false, source: src, info: info||'' };
  }

  const avL = (avatarUrl||'').toLowerCase();
  if (!avatarUrl || avL.includes('ui-avatars') || avL.includes('rsrc.php')
      || avL.includes('blank_profile') || avL.includes('default_avatar')
      || avL.includes('t1.30497-1')) {
    if (isB2b)          return fb('no_avatar', 0.92, 'adult_dog', 'b2b');
    if (isDogByKeyword) return fb('no_avatar', 0.82, 'puppy', 'kw');
    return fb('no_avatar', 0.08, 'non_dog');
  }

  // Fetch pixels
  let pixels;
  try { pixels = await fetchPixels(avatarUrl); }
  catch(e) {
    if (isB2b)          return fb('cors_err', 0.90, 'adult_dog', 'b2b+cors');
    if (isDogByKeyword) return fb('cors_err', 0.78, 'puppy', 'kw+cors');
    return fb('cors_err', 0.08, 'non_dog', e.message.slice(0,40));
  }

  // Flora guard
  if (isFlora(pixels) && !isB2b && !isDogByKeyword) {
    return { p_adult:0, p_puppy:0, p_non:1, p_dog:0, label:'non_dog',
      isFlora: true, source:'flora', info:'HSV>38%' };
  }

  // ONNX inference
  if (!isReady || !model) {
    if (isB2b)          return fb('sess_fail', 0.90, 'adult_dog', 'b2b+no_model');
    if (isDogByKeyword) return fb('sess_fail', 0.78, 'puppy', 'kw+no_model');
    return fb('sess_fail', 0.08, 'non_dog');
  }

  try {
    const floatData  = toFloat32CHW(pixels);
    const inputName  = model.inputNames[0]  || 'images';
    const outputName = model.outputNames[0] || 'output0';
    const tensor     = new ort.Tensor('float32', floatData, [1, 3, IMG_SIZE, IMG_SIZE]);
    const results    = await model.run({ [inputName]: tensor });
    const probs      = softmax(Array.from(results[outputName].data));

    // [0]=adult_dog  [1]=non_dog  [2]=puppy
    let p_adult = probs[0] || 0;
    let p_non   = probs[1] || 0;
    let p_puppy = probs[2] || 0;
    let p_dog   = Math.min(p_adult + p_puppy, 1.0);

    const topIdx = probs.indexOf(Math.max(...probs));
    let label = CLASSES[topIdx] || 'non_dog';

    if (isB2b && p_dog < 0.50) { p_dog = 0.90; label = 'adult_dog'; }
    else if (isDogByKeyword && p_dog < 0.50) p_dog = Math.max(p_dog, 0.55);

    return {
      p_adult: parseFloat(p_adult.toFixed(4)),
      p_puppy: parseFloat(p_puppy.toFixed(4)),
      p_non:   parseFloat(p_non.toFixed(4)),
      p_dog:   parseFloat(p_dog.toFixed(4)),
      label, isFlora: false, source: 'onnx',
      info: `A=${p_adult.toFixed(2)} N=${p_non.toFixed(2)} P=${p_puppy.toFixed(2)}`
    };
  } catch(e) {
    if (isB2b)          return fb('infer_err', 0.90, 'adult_dog', 'b2b+inf');
    if (isDogByKeyword) return fb('infer_err', 0.78, 'puppy', 'kw+inf');
    return fb('infer_err', 0.08, 'non_dog', e.message.slice(0,40));
  }
}

// ─── 5. Message listener từ dashboard/background ─────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ONNX_LOAD') {
    loadModel().then(ok => sendResponse({ ok }));
    return true; // async
  }
  if (msg.type === 'ONNX_CLASSIFY') {
    const { avatarUrl, isDogByKeyword, isB2b } = msg;
    classifyAvatar(avatarUrl, !!isDogByKeyword, !!isB2b)
      .then(result => sendResponse({ ok: true, result }))
      .catch(e    => sendResponse({ ok: false, error: e.message }));
    return true; // async
  }
});

// Auto-load model khi offscreen document khởi động
loadModel();
console.log('[OffscreenONNX] Offscreen document initialized, loading model...');
