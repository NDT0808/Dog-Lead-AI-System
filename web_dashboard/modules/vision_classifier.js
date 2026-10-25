/**
 * vision_classifier.js - Dog Avatar Classifier
 *
 * 2 chế độ lấy pixel:
 *   1. Tab-based (mặc định): Mở ảnh trong hidden tab → đọc <img> element trực tiếp (không CORS)
 *   2. Fallback: fetch Image object trực tiếp
 *
 * ONNX inference chạy trong dashboard.html context (window.ort đã load sẵn).
 *
 * CSP cần: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
 * Permissions cần: tabs, scripting, <all_urls>
 */

const IMG_SIZE = 224;
const CLASSES  = ['adult_dog', 'non_dog', 'puppy'];  // [0] [1] [2]

let _session  = null;
let _ready    = false;
let _loading  = false;

// ─── Shared hidden tab để extract pixels (không mở nhiều tab) ────────────────
let _scanTabId   = null;
let _tabBusy     = false;
const _tabQueue  = [];

function resolveAssetUrl(relPath) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    try {
      return chrome.runtime.getURL(relPath);
    } catch (_) {}
  }
  return relPath.startsWith('/') ? relPath : ('./' + relPath);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Load Model (chạy trong dashboard.html context)
// ─────────────────────────────────────────────────────────────────────────────
export async function preloadDogModel(onLog) {
  if (_ready && _session) return true;
  if (_loading) {
    for (let i = 0; i < 200; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (_ready) return true;
      if (!_loading) break;
    }
    return _ready;
  }
  _loading = true;
  try {
    const ort = window.ort;
    if (!ort || !ort.InferenceSession) {
      throw new Error('window.ort not found');
    }
    const wasmDir = resolveAssetUrl('lib/');
    ort.env.wasm.wasmPaths  = wasmDir.endsWith('/') ? wasmDir : (wasmDir + '/');
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy      = false;

    const modelUrl = resolveAssetUrl('models/dog-model.onnx');
    onLog && onLog('[ONNX] WASM path: ' + ort.env.wasm.wasmPaths);
    onLog && onLog('[ONNX] Dang tai model: ' + modelUrl);

    _session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm']
    });
    _ready = true;
    onLog && onLog('[ONNX] ✓ dog-model.onnx san sang! Input=' +
      (_session.inputNames[0] || '?') + ' Output=' + (_session.outputNames[0] || '?'));
    return true;
  } catch (e) {
    _ready = false;
    onLog && onLog('[ONNX] ✗ Load fail: ' + e.message.slice(0, 200));
    return false;
  } finally {
    _loading = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Shared Tab Management
// ─────────────────────────────────────────────────────────────────────────────

async function _ensureScanTab() {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.tabs.create) {
    throw new Error('no_chrome_tabs_api');
  }
  if (_scanTabId !== null) {
    try {
      await chrome.tabs.get(_scanTabId);
      return _scanTabId;
    } catch (_) {
      _scanTabId = null;
    }
  }
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
  _scanTabId = tab.id;
  return _scanTabId;
}

function _waitTabComplete(tabId, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(fn);
      reject(new Error('tab_load_timeout'));
    }, timeoutMs);
    function fn(id, info) {
      if (id !== tabId) return;
      if (info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(fn);
        clearTimeout(timer);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(fn);
  });
}

/**
 * Mở ảnh trong shared hidden tab → đọc pixel từ <img> element (không có CORS)
 * Trả về Array RGBA pixels hoặc null nếu lỗi
 */
async function _getPixelsViaTab(avatarUrl) {
  // Serialize tab access (1 tab shared, queue)
  if (_tabBusy) {
    await new Promise(resolve => _tabQueue.push(resolve));
  }
  _tabBusy = true;

  try {
    const tabId = await _ensureScanTab();

    // Navigate tab đến image URL
    await chrome.tabs.update(tabId, { url: avatarUrl });
    await _waitTabComplete(tabId, 10000);

    // Thêm 200ms để img render xong
    await new Promise(r => setTimeout(r, 200));

    // Inject script để đọc pixel từ <img> element trực tiếp (no CORS!)
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      func: function(sz) {
        // Tìm img element (Chrome hiển thị ảnh trực tiếp dạng <img> trong <body>)
        const img = document.querySelector('img');
        if (!img) return { ok: false, err: 'no_img_element' };
        if (!img.naturalWidth) return { ok: false, err: 'img_not_loaded' };

        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = sz;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, sz, sz);
        ctx.drawImage(img, 0, 0, sz, sz);

        try {
          const d = ctx.getImageData(0, 0, sz, sz).data;
          return { ok: true, pixels: Array.from(d) };
        } catch (e) {
          return { ok: false, err: 'canvas_tainted: ' + e.message };
        }
      },
      args: [IMG_SIZE]
    });

    if (!results || !results[0] || !results[0].result) return null;
    const r = results[0].result;
    if (!r.ok) throw new Error(r.err);
    return r.pixels; // Array RGBA

  } finally {
    _tabBusy = false;
    const next = _tabQueue.shift();
    if (next) next();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Fallback: Fetch pixel qua Image object (có thể bị CORS)
// ─────────────────────────────────────────────────────────────────────────────
function _getPixelsDirect(url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 8000);
    function draw(img) {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = IMG_SIZE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, IMG_SIZE, IMG_SIZE);
        ctx.drawImage(img, 0, 0, IMG_SIZE, IMG_SIZE);
        resolve(Array.from(ctx.getImageData(0, 0, IMG_SIZE, IMG_SIZE).data));
      } catch (e) { clearTimeout(timer); reject(e); }
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

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tensor / Softmax / Flora
// ─────────────────────────────────────────────────────────────────────────────
function _toFloat32CHW(pixels) {
  const N = IMG_SIZE * IMG_SIZE;
  const out = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    out[        i] = pixels[i*4    ] / 255.0;
    out[  N   + i] = pixels[i*4 + 1] / 255.0;
    out[2*N   + i] = pixels[i*4 + 2] / 255.0;
  }
  return out;
}

function _softmax(arr) {
  const m = Math.max(...arr);
  const e = arr.map(v => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map(v => v / s);
}

function _isFlora(pixels) {
  const N = IMG_SIZE * IMG_SIZE;
  let plant = 0;
  for (let i = 0; i < N; i++) {
    const r = pixels[i*4]/255, g = pixels[i*4+1]/255, b = pixels[i*4+2]/255;
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
    if (d < 0.08) continue;
    let h = mx===r ? 60*(((g-b)/d)%6) : mx===g ? 60*((b-r)/d+2) : 60*((r-g)/d+4);
    if (h < 0) h += 360;
    if ((h >= 75 && h <= 165 && g > 0.28) || (h >= 255 && h <= 340)) plant++;
  }
  return (plant / N) > 0.45;   // Nâng lên 45% (từ 38%) để giảm false positive
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. classifyAvatar - PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────
export async function classifyAvatar(avatarUrl, opts = {}) {
  const { isDogByKeyword = false, isB2b = false } = opts;

  function _fb(src, p, label, info = '') {
    return {
      p_adult: label === 'adult_dog' ? p : 0,
      p_puppy: label === 'puppy'     ? p : 0,
      p_non:   label === 'non_dog'   ? p : 1 - p,
      p_dog:   label === 'non_dog'   ? 0 : p,
      label, isFlora: false, source: src, info
    };
  }

  // Kiểm tra URL hợp lệ
  const avL = (avatarUrl || '').toLowerCase();
  if (!avatarUrl || avL.includes('ui-avatars') || avL.includes('rsrc.php')
      || avL.includes('blank_profile') || avL.includes('default_avatar')
      || avL.includes('default_profile') || avL.includes('t1.30497-1')) {
    if (isB2b)          return _fb('no_avatar', 0.92, 'adult_dog', 'b2b');
    if (isDogByKeyword) return _fb('no_avatar', 0.82, 'puppy', 'kw');
    return _fb('no_avatar', 0.08, 'non_dog');
  }

  // ── Lấy pixels: Tab-based trước (no CORS), fallback direct hoặc image proxy ──
  let pixels = null;
  let pixelSource = 'tab';
  try {
    pixels = await _getPixelsViaTab(avatarUrl);
  } catch (tabErr) {
    pixelSource = 'direct';
    try {
      pixels = await _getPixelsDirect(avatarUrl);
    } catch (_) {
      try {
        pixels = await _getPixelsDirect('/api/proxy-image?url=' + encodeURIComponent(avatarUrl));
        pixelSource = 'proxy';
      } catch (_) {
        pixels = null;
      }
    }
  }

  if (!pixels) {
    if (isB2b)          return _fb('cors_err', 0.90, 'adult_dog', 'b2b+cors');
    if (isDogByKeyword) return _fb('cors_err', 0.78, 'puppy', 'kw+cors');
    return _fb('cors_err', 0.08, 'non_dog');
  }

  // ── Flora guard (chỉ loại khi rất chắc chắn là cây lá, và không có keyword) ──
  const floraDetected = _isFlora(pixels);
  if (floraDetected && !isB2b && !isDogByKeyword) {
    return { p_adult:0, p_puppy:0, p_non:1, p_dog:0,
      label:'non_dog', isFlora:true, source:'flora',
      info: `HSV>45% [${pixelSource}]` };
  }

  // ── Session check ──────────────────────────────────────────────────────────
  if (!_ready || !_session) {
    if (isB2b)          return _fb('sess_fail', 0.90, 'adult_dog', 'b2b+no_model');
    if (isDogByKeyword) return _fb('sess_fail', 0.78, 'puppy', 'kw+no_model');
    return _fb('sess_fail', 0.08, 'non_dog');
  }

  // ── ONNX inference ─────────────────────────────────────────────────────────
  try {
    const ort        = window.ort;
    const inputName  = _session.inputNames[0]  || 'images';
    const outputName = _session.outputNames[0] || 'output0';

    const floatData = _toFloat32CHW(pixels);
    const tensor    = new ort.Tensor('float32', floatData, [1, 3, IMG_SIZE, IMG_SIZE]);
    const results   = await _session.run({ [inputName]: tensor });
    const probs     = _softmax(Array.from(results[outputName].data));

    // Classes: [0]=adult_dog  [1]=non_dog  [2]=puppy
    let p_adult = probs[0] || 0;
    let p_non   = probs[1] || 0;
    let p_puppy = probs[2] || 0;
    let p_dog   = Math.min(p_adult + p_puppy, 1.0);

    const topIdx = probs.indexOf(Math.max(...probs));
    let label    = CLASSES[topIdx] || 'non_dog';

    // B2B / Keyword immunity boost
    if (isB2b && p_dog < 0.50)               { p_dog = 0.90; label = 'adult_dog'; }
    else if (isDogByKeyword && p_dog < 0.50)   p_dog = Math.max(p_dog, 0.55);

    return {
      p_adult: parseFloat(p_adult.toFixed(4)),
      p_puppy: parseFloat(p_puppy.toFixed(4)),
      p_non:   parseFloat(p_non.toFixed(4)),
      p_dog:   parseFloat(p_dog.toFixed(4)),
      label, isFlora: floraDetected,
      source: `${pixelSource}`,
      info: `A=${p_adult.toFixed(2)} N=${p_non.toFixed(2)} P=${p_puppy.toFixed(2)}`
    };
  } catch (e) {
    if (isB2b)          return _fb('infer_err', 0.90, 'adult_dog', 'b2b+inf');
    if (isDogByKeyword) return _fb('infer_err', 0.78, 'puppy', 'kw+inf');
    return _fb('infer_err', 0.08, 'non_dog', e.message.slice(0, 40));
  }
}

export function isModelReady()     { return _ready && !!_session; }
export function resetOnnxSession() {
  _session = null; _ready = false; _loading = false;
  if (_scanTabId !== null) {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.remove) {
      chrome.tabs.remove(_scanTabId).catch(() => {});
    }
    _scanTabId = null;
  }
}

// Cleanup tab khi dashboard đóng
window.addEventListener('unload', () => {
  if (_scanTabId !== null && typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.remove) {
    chrome.tabs.remove(_scanTabId).catch(() => {});
  }
});
