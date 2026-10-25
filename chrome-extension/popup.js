// Pet Lead AI - Step 1 Popup Controller (Production Enhanced v3.2)
// ============================================================
// ONNX Vision Classifier (dog-model.onnx, YOLOv8-cls 224x224)
// Phan loai avatar moi nguoi dung ngay trong popup khi quet
// Classes: [0]=adult_dog  [1]=puppy  [2]=non_dog
// ============================================================

const ONNX_MODEL_CLASSES = ['adult_dog', 'puppy', 'non_dog'];
const ONNX_INPUT_SIZE = 224;
const ONNX_MEAN = [0.485, 0.456, 0.406];
const ONNX_STD  = [0.229, 0.224, 0.225];
const ONNX_THRESHOLD = 0.50; // p_dog = p_adult + p_puppy >= 0.50 la cho

let _onnxSession   = null;
let _onnxLoading   = false;
let _onnxReady     = false;
let _onnxError     = null;

/** Load dog-model.onnx qua window.ort (ort.min.js da duoc load truoc) */
async function loadDogModel() {
  if (_onnxReady || _onnxLoading) return;
  _onnxLoading = true;
  try {
    if (!window.ort || !window.ort.InferenceSession) {
      throw new Error('window.ort chua san sang - ort.min.js chua duoc load?');
    }
    // Dat WASM path ve thu muc lib/ cua extension
    const wasmBase = chrome.runtime.getURL('lib/');
    window.ort.env.wasm.wasmPaths  = wasmBase;
    window.ort.env.wasm.numThreads = 1;

    const modelUrl = chrome.runtime.getURL('models/dog-model.onnx');
    console.log('[DogVision] Dang load model:', modelUrl);

    _onnxSession = await window.ort.InferenceSession.create(modelUrl, {
      executionProviders:    ['wasm'],
      graphOptimizationLevel: 'all'
    });
    _onnxReady  = true;
    _onnxError  = null;
    console.log('[DogVision] dog-model.onnx san sang! Input=',
      _onnxSession.inputNames[0], 'Output=', _onnxSession.outputNames[0]);
  } catch(err) {
    _onnxError = err.message;
    console.warn('[DogVision] Load model that bai:', err.message);
  } finally {
    _onnxLoading = false;
  }
}

/** Fetch avatar URL -> Canvas 224x224 -> ImageData RGBA */
function _fetchAvatarPixels(url) {
  return new Promise((resolve, reject) => {
    const tid = setTimeout(() => reject(new Error('Timeout: ' + url)), 7000);
    function draw(img) {
      clearTimeout(tid);
      try {
        const c = document.createElement('canvas');
        c.width = c.height = ONNX_INPUT_SIZE;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, ONNX_INPUT_SIZE, ONNX_INPUT_SIZE);
        resolve(ctx.getImageData(0, 0, ONNX_INPUT_SIZE, ONNX_INPUT_SIZE));
      } catch(e) { clearTimeout(tid); reject(e); }
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => draw(img);
    img.onerror = () => {
      const img2 = new Image();
      img2.onload  = () => draw(img2);
      img2.onerror = () => { clearTimeout(tid); reject(new Error('CORS: ' + url)); };
      img2.src = url;
    };
    img.src = url;
  });
}

/** ImageData RGBA -> Float32Array CHW [1,3,224,224] normalized ImageNet */
function _imageDataToTensor(imageData) {
  const { data } = imageData;
  const N = ONNX_INPUT_SIZE * ONNX_INPUT_SIZE;
  const out = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    out[0*N+i] = (data[i*4]   / 255.0 - ONNX_MEAN[0]) / ONNX_STD[0];
    out[1*N+i] = (data[i*4+1] / 255.0 - ONNX_MEAN[1]) / ONNX_STD[1];
    out[2*N+i] = (data[i*4+2] / 255.0 - ONNX_MEAN[2]) / ONNX_STD[2];
  }
  return out;
}

/** Softmax */
function _softmax(logits) {
  const m = Math.max(...logits);
  const e = logits.map(v => Math.exp(v - m));
  const s = e.reduce((a,b) => a+b, 0);
  return e.map(v => v/s);
}

/**
 * Classify mot avatar URL bang dog-model.onnx
 * @returns {{isDog, p_dog, label, p_adult, p_puppy, p_non}}
 */
async function classifyAvatarONNX(avatarUrl) {
  // Ket qua fallback
  const noResult = { isDog: false, p_dog: 0, label: 'unknown', p_adult: 0, p_puppy: 0, p_non: 1 };

  if (!_onnxReady || !_onnxSession) return noResult;
  if (!avatarUrl || avatarUrl.includes('ui-avatars.com') || avatarUrl.includes('rsrc.php')) return noResult;

  try {
    const imageData = await _fetchAvatarPixels(avatarUrl);
    const tensorData = _imageDataToTensor(imageData);
    const inputName  = _onnxSession.inputNames[0] || 'images';
    const outputName = _onnxSession.outputNames[0] || 'output0';

    const inputTensor = new window.ort.Tensor(
      'float32', tensorData,
      [1, 3, ONNX_INPUT_SIZE, ONNX_INPUT_SIZE]
    );
    const results = await _onnxSession.run({ [inputName]: inputTensor });
    const probs   = _softmax(Array.from(results[outputName].data));

    const p_adult = probs[0] || 0;
    const p_puppy = probs[1] || 0;
    const p_non   = probs[2] || 0;
    const p_dog   = Math.min(p_adult + p_puppy, 1.0);
    const topIdx  = probs.indexOf(Math.max(...probs));
    const label   = ONNX_MODEL_CLASSES[topIdx] || 'non_dog';
    const isDog   = p_dog >= ONNX_THRESHOLD;

    return { isDog, p_dog, label, p_adult, p_puppy, p_non };
  } catch(err) {
    // Loi CORS hoac inference - tra ve fallback im lang
    return noResult;
  }
}

// ============================================================
// END ONNX Vision Classifier
// ============================================================

let currentLang = 'vi';
let isRunning = false;
let isPaused = false;
let scrapedData = [];

const I18N = {
  vi: {
    title: "Follower Harvester",
    sub: "Pet Lead AI • Bước 1",
    ready: "Sẵn sàng quét danh sách Facebook",
    running: "Đang cuộn và thu thập...",
    paused: "Đã tạm dừng cuộn",
    stopped: "Đã dừng và hoàn tất quét",
    lblScraped: "ĐÃ QUÉT",
    lblAvatars: "CÓ AVATAR",
    lblNumericId: "FB_ID SỐ",
    btnStart: "Bắt đầu quét Đang theo dõi",
    btnPause: "Tạm dừng",
    btnResume: "Tiếp tục",
    btnStop: "Dừng & Lưu",
    btnExport: "Xuất dữ liệu cho Python Pipeline (JSON)",
    btnOpenAiDashboard: "Mở Master Dashboard (Quy trình & CRM)",
    previewTitle: "Danh sách vừa quét gần đây",
    clearData: "🧹 Dọn sạch dữ liệu rác",
    emptyMsg: "Chưa có dữ liệu. Mở trang Đang theo dõi / Người theo dõi và bấm Bắt đầu quét.",
    notOnFbTitle: "Bạn đang không ở trang Facebook!",
    notOnFbDesc: "Vui lòng mở trang cá nhân / Fanpage Facebook có danh sách Người theo dõi / Đang theo dõi để bắt đầu quét.",
    btnOpenFb: "Mở Facebook (fb.com)",
    btnOpenDashboard: "Mở Master Dashboard",
    lblStandaloneTitle: "CÔNG CỤ ĐỘC LẬP (CHẠY RIÊNG LẺ)",
    txtQuickUid: "Chỉ Lấy FB ID",
    txtQuickContact: "Địa Chỉ & SĐT",
    txtQuickOwner: "Tìm Chủ Trại"
  },
  zh: {
    title: "粉丝采集器 (Follower Harvester)",
    sub: "Pet Lead AI • 第1步",
    ready: "准备扫描 Facebook 粉丝列表",
    running: "正在平滑滚动采集...",
    paused: "已暂停采集",
    stopped: "采集已停止并保存",
    lblScraped: "已采集",
    lblAvatars: "含头像",
    lblNumericId: "数字UID",
    btnStart: "开始采集正在关注",
    btnPause: "暂停",
    btnResume: "继续",
    btnStop: "停止并保存",
    btnExport: "导出数据给 Python Pipeline (JSON)",
    btnOpenAiDashboard: "打开主控制台 (全流程与CRM)",
    previewTitle: "最近采集列表",
    clearData: "🧹 清除无效垃圾档案",
    emptyMsg: "暂无数据。请打开 Facebook 正在关注 / 粉丝页面并点击开始采集。",
    notOnFbTitle: "当前不在 Facebook 页面！",
    notOnFbDesc: "请先打开包含粉丝/关注列表的 Facebook 个人主页或主页以开始采集。",
    btnOpenFb: "打开 Facebook (fb.com)",
    btnOpenDashboard: "打开主控制台",
    lblStandaloneTitle: "独立工具 (单独运行)",
    txtQuickUid: "仅提取UID",
    txtQuickContact: "地址与电话",
    txtQuickOwner: "查找负责人"
  }
};

const INVALID_NAMES_REGEX = /^(?:xem bản dịch|xem bản gốc|bản dịch|dịch|see translation|see original|translation|original|theo dõi|đang theo dõi|follow|following|thêm bạn bè|bạn bè|nhắn tin|tin nhắn|message|chat|xem ảnh|ảnh đại diện|ảnh bìa|chỉ báo|american kennel club.*|dòng thời gian của.*|ảnh đại diện của.*)$/i;

const JUNK_SHORTCUT_KEYWORDS = [
  'chậu kiểng', 'ốc mượn hồn', 'linh mai vàng', 'tps flowerhorn',
  'bệnh viện mắt', 'truyện kiều', 'van hờ foods', 'chậu cảnh',
  'cây cảnh', 'hoa lan', 'bonsai'
];

function isInvalidName(name) {
  if (!name) return true;
  const clean = name.trim();
  if (clean.length < 2) return true;
  if (/^[\d\s.,#@!$%^&*()_+=\-[\]{}|;:'"<>?\/~`]+$/.test(clean)) return true;
  return INVALID_NAMES_REGEX.test(clean);
}

function isJunkFollowerRecord(item) {
  if (!item || !item.name) return true;
  const clean = item.name.trim();
  if (isInvalidName(clean)) return true;

  const lower = clean.toLowerCase();
  if (JUNK_SHORTCUT_KEYWORDS.some(k => lower.includes(k))) return true;

  const raw = item.raw_url || item.url || '';
  if (raw.includes('/friends/suggestions/') || raw.includes('/messages/') || raw.includes('/hashtag/')) {
    return true;
  }

  // Loại bỏ các bản ghi không có ID số VÀ không có ảnh thật (avatar trống hoặc ui-avatars)
  if (!item.fb_id || !/^\d{8,}$/.test(item.fb_id)) {
    if (!item.avatar_url || item.avatar_url.includes('ui-avatars.com') || item.avatar_url.includes('rsrc.php')) {
      return true;
    }
  }

  return false;
}

function isValidFollowerRecord(item) {
  return !isJunkFollowerRecord(item);
}

function updateLangUI() {
  const t = I18N[currentLang];
  document.getElementById('txtTitle').textContent = t.title;
  document.getElementById('txtSub').textContent = t.sub;
  document.getElementById('lblScraped').textContent = t.lblScraped;
  document.getElementById('lblAvatars').textContent = t.lblAvatars;
  document.getElementById('lblNumericId').textContent = t.lblNumericId;
  const txtBtnPauseEl = document.getElementById('txtBtnPause');
  if (txtBtnPauseEl) txtBtnPauseEl.textContent = isPaused ? t.btnResume : t.btnPause;
  const txtBtnStartEl = document.getElementById('txtBtnStart');
  if (txtBtnStartEl) txtBtnStartEl.textContent = t.btnStart;
  const txtBtnStopEl = document.getElementById('txtBtnStop');
  if (txtBtnStopEl) txtBtnStopEl.textContent = t.btnStop;
  const txtBtnExportEl = document.getElementById('txtBtnExport');
  if (txtBtnExportEl) txtBtnExportEl.textContent = t.btnExport;
  const btnOpen = document.getElementById('txtBtnOpenAiDashboard');
  if (btnOpen) btnOpen.textContent = t.btnOpenAiDashboard;
  const txtPrevTitle = document.getElementById('txtPreviewTitle');
  if (txtPrevTitle) txtPrevTitle.textContent = t.previewTitle;
  const btnClearDataEl = document.getElementById('btnClearData');
  if (btnClearDataEl) btnClearDataEl.textContent = t.clearData;
  if (scrapedData.length === 0) {
    const emptyMsgEl = document.getElementById('emptyMsg');
    if (emptyMsgEl) emptyMsgEl.textContent = t.emptyMsg;
  }
  const notOnFbTitleEl = document.getElementById('txtNotOnFbTitle');
  if (notOnFbTitleEl) notOnFbTitleEl.textContent = t.notOnFbTitle;
  const notOnFbDescEl = document.getElementById('txtNotOnFbDesc');
  if (notOnFbDescEl) notOnFbDescEl.textContent = t.notOnFbDesc;
  const btnOpenFbEl = document.getElementById('txtBtnOpenFb');
  if (btnOpenFbEl) btnOpenFbEl.textContent = t.btnOpenFb;
  const btnOpenDashEl = document.getElementById('txtBtnOpenDashboard');
  if (btnOpenDashEl) btnOpenDashEl.textContent = t.btnOpenDashboard;
  const lblStandaloneEl = document.getElementById('lblStandaloneTitle');
  if (lblStandaloneEl) lblStandaloneEl.textContent = t.lblStandaloneTitle;
  const txtQuickUidEl = document.getElementById('txtQuickUid');
  if (txtQuickUidEl) txtQuickUidEl.textContent = t.txtQuickUid;
  const txtQuickContactEl = document.getElementById('txtQuickContact');
  if (txtQuickContactEl) txtQuickContactEl.textContent = t.txtQuickContact;
  const txtQuickOwnerEl = document.getElementById('txtQuickOwner');
  if (txtQuickOwnerEl) txtQuickOwnerEl.textContent = t.txtQuickOwner;
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Load saved language
  const storage = await chrome.storage.local.get(['lang', 'scrapedFollowers', 'harvesterState']);
  if (storage.lang) {
    currentLang = storage.lang;
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(currentLang === 'vi' ? 'btnLangVi' : 'btnLangZh').classList.add('active');
  }

  // 2. Load and sanitize stored follower data (auto-purge non-follower sidebar artifacts)
  if (storage.scrapedFollowers && Array.isArray(storage.scrapedFollowers)) {
    const cleaned = storage.scrapedFollowers.filter(isValidFollowerRecord);
    scrapedData = cleaned;
    if (cleaned.length !== storage.scrapedFollowers.length) {
      console.log(`🐾 [PetLead AI] Đã loại bỏ ${storage.scrapedFollowers.length - cleaned.length} bản ghi rác khỏi bộ nhớ.`);
      chrome.storage.local.set({ scrapedFollowers: cleaned });
    }
    renderStats();
    renderPreview();
  }

  // 2b. Preload ONNX model sau khi UI da hien thi (khong block)
  loadDogModel();

  // 3. Initial harvester state from storage
  if (storage.harvesterState) {
    isRunning = storage.harvesterState.isRunning || false;
    isPaused = storage.harvesterState.isPaused || false;
  } else {
    isRunning = false;
    isPaused = false;
  }

  updateControlButtons();
  setStatus(isRunning ? (isPaused ? 'paused' : 'running') : 'ready');
  updateLangUI();

  // 4. Query active tab content script for live status & check context
  const tab = await getActiveTab();
  checkTabContext(tab);
  if (tab && tab.id && tab.url && tab.url.includes('facebook.com')) {
    chrome.tabs.sendMessage(tab.id, { action: 'GET_STATUS' }, (res) => {
      if (!chrome.runtime.lastError && res && res.status) {
        isRunning = res.isHarvesting;
        isPaused = res.isPaused;
        updateControlButtons();
        setStatus(isRunning ? (isPaused ? 'paused' : 'running') : 'ready');
      }
    });
  }

  // 5. Language switches
  document.getElementById('btnLangVi').addEventListener('click', () => {
    currentLang = 'vi';
    chrome.storage.local.set({ lang: 'vi' });
    document.getElementById('btnLangVi').classList.add('active');
    document.getElementById('btnLangZh').classList.remove('active');
    updateLangUI();
    checkTabContext(tab);
  });
  document.getElementById('btnLangZh').addEventListener('click', () => {
    currentLang = 'zh';
    chrome.storage.local.set({ lang: 'zh' });
    document.getElementById('btnLangZh').classList.add('active');
    document.getElementById('btnLangVi').classList.remove('active');
    updateLangUI();
    checkTabContext(tab);
  });

  // 6. Action buttons
  const bStart = document.getElementById('btnStart');
  if (bStart) bStart.addEventListener('click', startHarvesting);
  const bPause = document.getElementById('btnPause');
  if (bPause) bPause.addEventListener('click', togglePause);
  const bStop = document.getElementById('btnStop');
  if (bStop) bStop.addEventListener('click', stopHarvesting);
  const bExpJson = document.getElementById('btnExportJson');
  if (bExpJson) bExpJson.addEventListener('click', exportJson);
  const bClear = document.getElementById('btnClearData');
  if (bClear) bClear.addEventListener('click', clearData);

  const btnOpenFb = document.getElementById('btnOpenFacebook');
  if (btnOpenFb) {
    btnOpenFb.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://www.facebook.com' });
    });
  }

  const btnOpenDash = document.getElementById('btnOpenWebDashboard');
  if (btnOpenDash) {
    btnOpenDash.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
  }

  const btnOpenAi = document.getElementById('btnOpenAiDashboard');
  if (btnOpenAi) {
    btnOpenAi.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
  }

  // Standalone Quick Tools Launchers
  const btnQuickUid = document.getElementById('btnQuickUid');
  if (btnQuickUid) {
    btnQuickUid.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html?tool=uid') });
    });
  }

  const btnQuickContact = document.getElementById('btnQuickContact');
  if (btnQuickContact) {
    btnQuickContact.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html?tool=contact') });
    });
  }

  const btnQuickOwner = document.getElementById('btnQuickOwner');
  if (btnQuickOwner) {
    btnQuickOwner.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html?tool=owner') });
    });
  }
});

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs.length > 0 ? tabs[0] : null;
}

function checkTabContext(tab) {
  const warningEl = document.getElementById('nonFbWarning');
  const txtPageType = document.getElementById('txtPageType');
  const btnStartTxt = document.getElementById('txtBtnStart');

  if (!tab || !tab.url || !tab.url.includes('facebook.com')) {
    if (warningEl) warningEl.style.display = 'block';
    if (txtPageType) {
      txtPageType.textContent = 'Non-Facebook';
      txtPageType.style.color = 'var(--amber)';
    }
  } else {
    if (warningEl) warningEl.style.display = 'none';
    if (txtPageType) {
      if (tab.url.includes('/following') || tab.url.includes('sk=following')) {
        txtPageType.textContent = currentLang === 'vi' ? '● Đang theo dõi (Following)' : '● 正在关注 (Following)';
        txtPageType.style.color = 'var(--emerald)';
        if (btnStartTxt && !isRunning) {
          btnStartTxt.textContent = currentLang === 'vi' ? '▶ Bắt đầu quét Đang theo dõi' : '▶ 开始采集正在关注';
        }
      } else if (tab.url.includes('/followers') || tab.url.includes('sk=followers')) {
        txtPageType.textContent = currentLang === 'vi' ? '● Người theo dõi (Followers)' : '● 粉丝列表 (Followers)';
        txtPageType.style.color = 'var(--primary)';
        if (btnStartTxt && !isRunning) {
          btnStartTxt.textContent = currentLang === 'vi' ? '▶ Bắt đầu quét Người theo dõi' : '▶ 开始采集粉丝';
        }
      } else {
        txtPageType.textContent = currentLang === 'vi' ? '⚠️ Trang cá nhân (Chưa vào Đang theo dõi)' : '⚠️ 个人主页 (未进入关注页)';
        txtPageType.style.color = 'var(--amber)';
        if (btnStartTxt && !isRunning) {
          btnStartTxt.textContent = currentLang === 'vi' ? '🚀 Chuyển đến & Quét "Đang theo dõi"' : '🚀 跳转并采集"正在关注"';
        }
      }
    }
  }
}

async function startHarvesting() {
  const tab = await getActiveTab();
  if (!tab || !tab.url || !tab.url.includes('facebook.com')) {
    alert(currentLang === 'vi' 
      ? 'Vui lòng mở một trang cá nhân hoặc fanpage Facebook trước khi bấm quét!'
      : '请先打开一个 Facebook 个人主页或主页粉丝页面！');
    return;
  }

  const isAlreadyFollowing = tab.url.includes('/following') || tab.url.includes('sk=following');
  const isAlreadyFollowers = tab.url.includes('/followers') || tab.url.includes('sk=followers');

  // Nếu người dùng đang ở Timeline chính, tự động chuyển tab đến "Đang theo dõi" (Following)
  if (!isAlreadyFollowing && !isAlreadyFollowers) {
    let targetUrl = '';
    if (tab.url.includes('profile.php?id=')) {
      const u = new URL(tab.url);
      u.searchParams.set('sk', 'following');
      targetUrl = u.toString();
    } else {
      const clean = tab.url.split('?')[0].replace(/\/$/, '');
      targetUrl = clean + '/following';
    }

    if (targetUrl) {
      console.log("🐾 [PetLead AI] Tự động chuyển tab đến danh sách Đang theo dõi:", targetUrl);
      isRunning = true;
      isPaused = false;
      updateControlButtons();
      setStatus('running');

      await chrome.storage.local.set({
        harvesterState: { isRunning: true, isPaused: false },
        autoStartHarvestOnLoad: true
      });

      await chrome.tabs.update(tab.id, { url: targetUrl });

      // Đợi trang load xong và thử gửi tin nhắn bổ trợ
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { action: 'START_HARVESTING' }, () => {
          if (chrome.runtime.lastError) {
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js']
            }, () => {
              chrome.tabs.sendMessage(tab.id, { action: 'START_HARVESTING' });
            });
          }
        });
      }, 2500);
      return;
    }
  }

  isRunning = true;
  isPaused = false;
  updateControlButtons();
  setStatus('running');

  chrome.tabs.sendMessage(tab.id, { action: 'START_HARVESTING' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("Injecting content script dynamically...", chrome.runtime.lastError);
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }, () => {
        chrome.tabs.sendMessage(tab.id, { action: 'START_HARVESTING' });
      });
    }
  });
}

async function togglePause() {
  const tab = await getActiveTab();
  isPaused = !isPaused;
  updateControlButtons();
  setStatus(isPaused ? 'paused' : 'running');

  if (tab) {
    chrome.tabs.sendMessage(tab.id, { action: isPaused ? 'PAUSE_HARVESTING' : 'RESUME_HARVESTING' }, () => {
      if (chrome.runtime.lastError) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }, () => {
          chrome.tabs.sendMessage(tab.id, { action: isPaused ? 'PAUSE_HARVESTING' : 'RESUME_HARVESTING' });
        });
      }
    });
  }
}

async function stopHarvesting() {
  const tab = await getActiveTab();
  isRunning = false;
  isPaused = false;
  updateControlButtons();
  setStatus('stopped');

  if (tab) {
    chrome.tabs.sendMessage(tab.id, { action: 'STOP_HARVESTING' });
  }

  if (scrapedData.length > 0) {
    syncDataToWebDashboard(scrapedData);
  }
}

function updateControlButtons() {
  document.getElementById('btnStart').disabled = isRunning;
  document.getElementById('btnPause').disabled = !isRunning;
  document.getElementById('btnStop').disabled = !isRunning;
  document.getElementById('txtBtnPause').textContent = isPaused ? I18N[currentLang].btnResume : I18N[currentLang].btnPause;
  
  chrome.storage.local.set({
    harvesterState: { isRunning, isPaused }
  });
}

function setStatus(state) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  const t = I18N[currentLang];

  if (state === 'running') {
    dot.className = 'status-dot active';
    txt.textContent = t.running;
  } else if (state === 'paused') {
    dot.className = 'status-dot';
    txt.textContent = t.paused;
  } else if (state === 'stopped') {
    dot.className = 'status-dot';
    txt.textContent = t.stopped;
  } else {
    dot.className = 'status-dot';
    txt.textContent = t.ready;
  }
}

// Receive continuous data from Content Script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'NEW_FOLLOWERS_BATCH') {
    const newItems = msg.data || [];
    mergeScrapedData(newItems);
  }
});

function mergeScrapedData(newItems) {
  const map = new Map();
  // Preserve existing (filtered)
  scrapedData.forEach(item => {
    if (isValidFollowerRecord(item)) {
      const key = item.fb_id || item.url;
      map.set(key, item);
    }
  });
  // Add new
  newItems.forEach(item => {
    if (isValidFollowerRecord(item)) {
      const key = item.fb_id || item.url;
      if (!map.has(key)) {
        map.set(key, item);
      } else {
        const existing = map.get(key);
        map.set(key, { ...existing, ...item });
      }
    }
  });

  scrapedData = Array.from(map.values());
  chrome.storage.local.set({ scrapedFollowers: scrapedData });
  renderStats();
  renderPreview();

  // Chay ONNX classification bat dong bo cho cac avatar chua duoc classify
  if (_onnxReady) {
    _classifyPendingAvatars();
  }
}

function renderStats() {
  const total       = scrapedData.length;
  const withAvatars = scrapedData.filter(i => i.avatar_url && i.avatar_url.startsWith('http')).length;
  const withNumericId = scrapedData.filter(i => i.fb_id && /^\d+$/.test(i.fb_id)).length;

  document.getElementById('countScraped').textContent    = total;
  document.getElementById('countAvatars').textContent    = withAvatars;
  document.getElementById('countNumericId').textContent  = withNumericId;
}

/** Classify cac avatar chua duoc phan loai (chay background, khong block UI) */
async function _classifyPendingAvatars() {
  if (!_onnxReady) return;
  const pending = scrapedData.filter(item =>
    item.avatar_url &&
    item.avatar_url.startsWith('http') &&
    item.onnx_label === undefined // chua phan loai
  );
  if (pending.length === 0) return;

  console.log('[DogVision] Bat dau classify', pending.length, 'avatars...');
  for (const item of pending) {
    const result = await classifyAvatarONNX(item.avatar_url);
    // Gan ket qua ONNX vao item (in-place)
    item.onnx_label  = result.label;
    item.onnx_p_dog  = parseFloat(result.p_dog.toFixed(3));
    item.is_dog_onnx = result.isDog;
    // Yield de khong block event loop
    await new Promise(r => setTimeout(r, 30));
  }

  // Luu lai vao storage va refresh UI
  chrome.storage.local.set({ scrapedFollowers: scrapedData });
  renderStats();
  renderPreview();
  console.log('[DogVision] Hoan tat classify. Dog targets:',
    scrapedData.filter(i => i.is_dog_onnx).length);
}

function renderPreview() {
  const container = document.getElementById('previewContainer');
  if (scrapedData.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:10px;" id="emptyMsg">
      ${I18N[currentLang].emptyMsg}
    </div>`;
    return;
  }

  const recent = scrapedData.slice(-6).reverse();
  container.innerHTML = recent.map(item => {
    // Badge ONNX
    let badge = '';
    if (item.onnx_label !== undefined) {
      if (item.is_dog_onnx) {
        const lbl = item.onnx_label === 'puppy' ? '🐶 Puppy' : '🐕 Dog';
        badge = `<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:#064e3b;color:#34d399;font-weight:700;margin-left:4px">${lbl} ${Math.round(item.onnx_p_dog*100)}%</span>`;
      } else {
        badge = `<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:#3b0764;color:#c084fc;font-weight:700;margin-left:4px">❌ ${Math.round(item.onnx_p_dog*100)}%</span>`;
      }
    } else if (_onnxReady) {
      badge = `<span style="font-size:9px;padding:1px 4px;border-radius:8px;background:#1e293b;color:#64748b">...</span>`;
    }

    return `
    <div class="preview-item">
      <img src="${item.avatar_url || 'https://ui-avatars.com/api/?name=User&background=random'}" class="preview-avatar" onerror="this.src='https://ui-avatars.com/api/?name=User&background=random'" />
      <div class="preview-info">
        <div class="preview-name">${item.name || 'Người dùng Facebook'}${badge}</div>
        <div class="preview-id">${item.fb_id ? 'ID: ' + item.fb_id : (item.url ? item.url.split('/').pop() : 'Chưa có ID')}</div>
      </div>
    </div>`;
  }).join('');
}

// Clear Data without blocking modal dialog
async function clearData() {
  scrapedData = [];
  isRunning = false;
  isPaused = false;
  
  // Clear storage and state
  await chrome.storage.local.remove('scrapedFollowers');
  await chrome.storage.local.set({
    harvesterState: { isRunning: false, isPaused: false }
  });

  // Notify content script to reset loop and processedKeys
  try {
    const tab = await getActiveTab();
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'PURGE_JUNK_DATA' });
      chrome.tabs.sendMessage(tab.id, { action: 'RESET_HARVESTING' });
    }
  } catch (e) {}

  updateControlButtons();
  setStatus('ready');
  renderStats();
  renderPreview();

  const clearBtn = document.getElementById('btnClearData');
  const originalText = clearBtn.textContent;
  clearBtn.textContent = currentLang === 'vi' ? '✓ Đã dọn sạch rác!' : '✓ 已清空垃圾档案!';
  clearBtn.style.color = '#10b981';
  setTimeout(() => {
    clearBtn.textContent = originalText;
    clearBtn.style.color = 'var(--rose)';
  }, 1400);
}

async function syncDataToWebDashboard(data, desiredFilename) {
  if (!data || data.length === 0) return null;
  let finalFilename = desiredFilename || `step1_followers_raw_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
  
  // 1. Post to local python server if active
  try {
    await fetch('http://127.0.0.1:8000/api/upload-raw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: finalFilename,
        data: data
      })
    });
  } catch (e) {}

  // 2. Broadcast via BroadcastChannel
  try {
    const bc = new BroadcastChannel('PET_LEAD_CHANNEL');
    bc.postMessage({
      type: 'NEW_RAW_DATA',
      filename: finalFilename,
      data: data,
      count: data.length
    });
    bc.close();
  } catch (e) {}

  return finalFilename;
}

// Clean Facebook URL
function cleanFacebookUrl(rawUrl, numericId) {
  if (!rawUrl) return numericId ? `https://www.facebook.com/profile.php?id=${numericId}` : '';
  try {
    let u = new URL(rawUrl);
    if (u.hostname.includes('facebook.com') && u.pathname.includes('/l.php')) {
      const real = u.searchParams.get('u');
      if (real) u = new URL(real);
    }
    u.searchParams.delete('fbclid');
    u.searchParams.delete('__tn__');
    u.searchParams.delete('epa');
    u.searchParams.delete('ref');
    
    if (numericId && /^\d{8,}$/.test(numericId)) {
      return `https://www.facebook.com/profile.php?id=${numericId}`;
    }
    return u.toString();
  } catch (e) {
    return rawUrl;
  }
}

function exportJson() {
  if (scrapedData.length === 0) {
    alert(currentLang === 'vi' ? 'Chưa có dữ liệu để xuất!' : '暂无数据可导出！');
    return;
  }

  const cleanedData = scrapedData.map((item, index) => {
    const cleanUrl = cleanFacebookUrl(item.url, item.fb_id);
    return {
      index: index + 1,
      fb_id: item.fb_id || '',
      name: item.name || '',
      url: cleanUrl,
      raw_url: item.url || '',
      avatar_url: item.avatar_url || '',
      subtitle: item.subtitle || '',
      photo_urls: item.photo_urls || [item.avatar_url].filter(Boolean),
      source_page: item.source_page || '',
      scraped_at: item.scraped_at || new Date().toISOString()
    };
  });

  const blob = new Blob([JSON.stringify(cleanedData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `step1_followers_raw_${timestamp}.json`;

  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true
  });
}
