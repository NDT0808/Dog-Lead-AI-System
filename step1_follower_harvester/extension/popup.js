// Pet Lead AI - Step 1 Popup Controller (Production Enhanced v3.3)
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
    btnOpenHarvesterDashboard: "Mở Bảng Cào Đa Link (Tool 1 UI Trắng)",
    btnOpenAiDashboard: "Mở UI Lọc AI Thị Giác & Gallery",
    previewTitle: "Danh sách vừa quét gần đây",
    clearData: "🧹 Dọn sạch dữ liệu rác",
    emptyMsg: "Chưa có dữ liệu. Mở trang Đang theo dõi / Người theo dõi và bấm Bắt đầu quét.",
    notOnFbTitle: "Bạn đang không ở trang Facebook!",
    notOnFbDesc: "Vui lòng mở trang cá nhân / Fanpage Facebook có danh sách Người theo dõi / Đang theo dõi để bắt đầu quét.",
    btnOpenFb: "Mở Facebook (fb.com)",
    btnOpenDashboard: "Mở Web Dashboard"
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
    btnOpenHarvesterDashboard: "打开多链接采集台 (Tool 1 白天版)",
    btnOpenAiDashboard: "打开 AI视觉筛选 & 画廊",
    previewTitle: "最近采集列表",
    clearData: "🧹 清除无效垃圾档案",
    emptyMsg: "暂无数据。请打开 Facebook 正在关注 / 粉丝页面并点击开始采集。",
    notOnFbTitle: "当前不在 Facebook 页面！",
    notOnFbDesc: "请先打开包含粉丝/关注列表的 Facebook 个人主页或主页以开始采集。",
    btnOpenFb: "打开 Facebook (fb.com)",
    btnOpenDashboard: "打开 Web 控制台"
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

  // Phải có URL profile hoặc UID hợp lệ
  if (!item.fb_id && (!item.url || !item.url.includes('facebook.com/'))) {
    return true;
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
  document.getElementById('txtBtnPause').textContent = isPaused ? t.btnResume : t.btnPause;
  document.getElementById('txtBtnStop').textContent = t.btnStop;
  document.getElementById('txtBtnExport').textContent = t.btnExport;
  const btnHarvester = document.getElementById('txtBtnOpenHarvesterDashboard');
  if (btnHarvester) btnHarvester.textContent = t.btnOpenHarvesterDashboard;
  const btnOpen = document.getElementById('txtBtnOpenAiDashboard');
  if (btnOpen) btnOpen.textContent = t.btnOpenAiDashboard;
  document.getElementById('txtPreviewTitle').textContent = t.previewTitle;
  document.getElementById('btnClearData').textContent = t.clearData;
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
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Load saved language
  const storage = await chrome.storage.local.get(['lang', 'scrapedFollowers', 'harvesterState']);
  if (storage.lang) {
    currentLang = storage.lang;
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(currentLang === 'vi' ? 'btnLangVi' : 'btnLangZh').classList.add('active');
  }

  // 2. Load stored follower data
  if (storage.scrapedFollowers && Array.isArray(storage.scrapedFollowers)) {
    const cleaned = storage.scrapedFollowers.filter(isValidFollowerRecord);
    scrapedData = cleaned;
    renderStats();
    renderPreview();
  }

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
  document.getElementById('btnStart').addEventListener('click', startHarvesting);
  document.getElementById('btnPause').addEventListener('click', togglePause);
  document.getElementById('btnStop').addEventListener('click', stopHarvesting);
  document.getElementById('btnExportJson').addEventListener('click', exportJson);
  document.getElementById('btnClearData').addEventListener('click', clearData);

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

  const btnOpenHarvester = document.getElementById('btnOpenHarvesterDashboard');
  if (btnOpenHarvester) {
    btnOpenHarvester.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('harvester_dashboard.html') });
    });
  }

  const btnOpenAi = document.getElementById('btnOpenAiDashboard');
  if (btnOpenAi) {
    btnOpenAi.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
  }
});

// Realtime sync from Chrome Storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.scrapedFollowers) {
      scrapedData = (changes.scrapedFollowers.newValue || []).filter(isValidFollowerRecord);
      renderStats();
      renderPreview();
    }
    if (changes.harvesterState) {
      const st = changes.harvesterState.newValue;
      if (st) {
        isRunning = st.isRunning;
        isPaused = st.isPaused;
        updateControlButtons();
        setStatus(isRunning ? (isPaused ? 'paused' : 'running') : 'ready');
      }
    }
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

// Continuous real-time updates from Content Script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'NEW_FOLLOWERS_BATCH') {
    const newItems = msg.data || [];
    mergeScrapedData(newItems);
  }
});

function mergeScrapedData(newItems) {
  const map = new Map();
  scrapedData.forEach(item => {
    if (isValidFollowerRecord(item)) {
      const key = item.fb_id || item.url;
      map.set(key, item);
    }
  });
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
}

function renderStats() {
  const total = scrapedData.length;
  const withAvatars = scrapedData.filter(i => i.avatar_url && (i.avatar_url.includes('fbcdn.net') || i.avatar_url.includes('scontent') || i.avatar_url.startsWith('http'))).length;
  const withNumericId = scrapedData.filter(i => i.fb_id && /^\d+$/.test(i.fb_id)).length;

  document.getElementById('countScraped').textContent = total;
  document.getElementById('countAvatars').textContent = withAvatars;
  document.getElementById('countNumericId').textContent = withNumericId;
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
  container.innerHTML = recent.map(item => `
    <div class="preview-item">
      <img src="${item.avatar_url || 'https://ui-avatars.com/api/?name=User&background=random'}" class="preview-avatar" onerror="this.src='https://ui-avatars.com/api/?name=User&background=random'" />
      <div class="preview-info">
        <div class="preview-name">${item.name || 'Người dùng Facebook'}</div>
        <div class="preview-id">${item.fb_id ? 'ID: ' + item.fb_id : (item.url ? item.url.split('/').pop() : 'Chưa có ID')}</div>
      </div>
    </div>
  `).join('');
}

// Clear Data without blocking modal dialog
async function clearData() {
  scrapedData = [];
  isRunning = false;
  isPaused = false;
  
  await chrome.storage.local.remove('scrapedFollowers');
  await chrome.storage.local.set({
    harvesterState: { isRunning: false, isPaused: false }
  });

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
