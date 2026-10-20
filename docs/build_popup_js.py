import os

POPUP_JS_CODE = r'''// Pet Lead AI - Step 1 Popup Controller (Production Enhanced)
let currentLang = 'vi';
let isRunning = false;
let isPaused = false;
let scrapedData = [];

const I18N = {
  vi: {
    title: "Follower Harvester",
    sub: "Pet Lead AI • Bước 1",
    ready: "Sẵn sàng quét danh sách Facebook",
    running: "Đang cuộn và thu thập người theo dõi...",
    paused: "Đã tạm dừng cuộn",
    stopped: "Đã dừng và hoàn tất quét",
    lblScraped: "ĐÃ QUÉT",
    lblAvatars: "CÓ AVATAR",
    lblNumericId: "FB_ID SỐ",
    btnStart: "Bắt đầu quét trang hiện tại",
    btnPause: "Tạm dừng",
    btnResume: "Tiếp tục",
    btnStop: "Dừng & Lưu",
    btnExport: "Xuất dữ liệu cho Python Pipeline (JSON)",
    btnOpenAiDashboard: "Mở UI Lọc AI Thị Giác & Gallery",
    previewTitle: "Danh sách vừa quét gần đây",
    clearData: "Xóa tệp tạm",
    emptyMsg: "Chưa có dữ liệu. Mở trang Follower Facebook và bấm Bắt đầu quét."
  },
  zh: {
    title: "粉丝采集器 (Follower Harvester)",
    sub: "Pet Lead AI • 第1步",
    ready: "准备扫描 Facebook 粉丝列表",
    running: "正在平滑滚动采集粉丝...",
    paused: "已暂停采集",
    stopped: "采集已停止并保存",
    lblScraped: "已采集",
    lblAvatars: "含头像",
    lblNumericId: "数字UID",
    btnStart: "开始采集当前页面",
    btnPause: "暂停",
    btnResume: "继续",
    btnStop: "停止并保存",
    btnExport: "导出数据给 Python Pipeline (JSON)",
    btnOpenAiDashboard: "打开 AI视觉筛选 & 画廊",
    previewTitle: "最近采集列表",
    clearData: "清空暂存",
    emptyMsg: "暂无数据。请打开 Facebook 粉丝页面并点击开始采集。"
  }
};

function updateLangUI() {
  const t = I18N[currentLang];
  document.getElementById('txtTitle').textContent = t.title;
  document.getElementById('txtSub').textContent = t.sub;
  document.getElementById('lblScraped').textContent = t.lblScraped;
  document.getElementById('lblAvatars').textContent = t.lblAvatars;
  document.getElementById('lblNumericId').textContent = t.lblNumericId;
  document.getElementById('txtBtnStart').textContent = t.btnStart;
  document.getElementById('txtBtnPause').textContent = isPaused ? t.btnResume : t.btnPause;
  document.getElementById('txtBtnStop').textContent = t.btnStop;
  document.getElementById('txtBtnExport').textContent = t.btnExport;
  const btnOpen = document.getElementById('txtBtnOpenAiDashboard');
  if (btnOpen) btnOpen.textContent = t.btnOpenAiDashboard;
  document.getElementById('txtPreviewTitle').textContent = t.previewTitle;
  document.getElementById('btnClearData').textContent = t.clearData;
  if (scrapedData.length === 0) {
    const emptyMsgEl = document.getElementById('emptyMsg');
    if (emptyMsgEl) emptyMsgEl.textContent = t.emptyMsg;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Load saved language and data
  const storage = await chrome.storage.local.get(['lang', 'scrapedFollowers', 'harvesterState']);
  if (storage.lang) {
    currentLang = storage.lang;
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(currentLang === 'vi' ? 'btnLangVi' : 'btnLangZh').classList.add('active');
  }
  if (storage.scrapedFollowers && Array.isArray(storage.scrapedFollowers)) {
    scrapedData = storage.scrapedFollowers;
    renderStats();
    renderPreview();
  }
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

  // Language buttons
  document.getElementById('btnLangVi').addEventListener('click', () => {
    currentLang = 'vi';
    chrome.storage.local.set({ lang: 'vi' });
    document.getElementById('btnLangVi').classList.add('active');
    document.getElementById('btnLangZh').classList.remove('active');
    updateLangUI();
  });
  document.getElementById('btnLangZh').addEventListener('click', () => {
    currentLang = 'zh';
    chrome.storage.local.set({ lang: 'zh' });
    document.getElementById('btnLangZh').classList.add('active');
    document.getElementById('btnLangVi').classList.remove('active');
    updateLangUI();
  });

  // Action buttons
  document.getElementById('btnStart').addEventListener('click', startHarvesting);
  document.getElementById('btnPause').addEventListener('click', togglePause);
  document.getElementById('btnStop').addEventListener('click', stopHarvesting);
  document.getElementById('btnExportJson').addEventListener('click', exportJson);
  document.getElementById('btnClearData').addEventListener('click', clearData);

  const btnOpenAi = document.getElementById('btnOpenAiDashboard');
  if (btnOpenAi) {
    btnOpenAi.addEventListener('click', async () => {
      let savedFilename = `step1_followers_raw_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;

      // 1. Đồng bộ sang Web Dashboard qua API & BroadcastChannel
      if (scrapedData && scrapedData.length > 0) {
        const uploadedName = await syncDataToWebDashboard(scrapedData, savedFilename);
        if (uploadedName) savedFilename = uploadedName;
      }

      // 2. Lưu trữ chrome.storage cho dashboard
      await chrome.storage.local.set({
        scrapedFollowers: scrapedData,
        lastHarvestFile: savedFilename,
        lastHarvestTime: Date.now()
      });

      // 3. Mở Web UI: Kiểm tra máy chủ cổng 8000
      const queryParams = `?autoload=latest&raw_file=${encodeURIComponent(savedFilename)}&t=${Date.now()}`;
      let targetUrl = chrome.runtime.getURL(`dashboard.html${queryParams}`);
      try {
        const ping = await fetch('http://127.0.0.1:8000/index.html', { method: 'HEAD', signal: AbortSignal.timeout(1000) });
        if (ping.ok || ping.status === 200 || ping.type === 'opaque') {
          targetUrl = `http://127.0.0.1:8000/index.html${queryParams}`;
        }
      } catch (e) {}

      chrome.tabs.create({ url: targetUrl });
    });
  }
});

// Communication with Content Script
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs.length > 0 ? tabs[0] : null;
}

async function startHarvesting() {
  const tab = await getActiveTab();
  if (!tab || !tab.url || !tab.url.includes('facebook.com')) {
    alert(currentLang === 'vi' 
      ? 'Vui lòng mở một trang cá nhân hoặc fanpage Facebook trước khi bấm quét!'
      : '请先打开一个 Facebook 个人主页或主页粉丝页面！');
    return;
  }

  isRunning = true;
  isPaused = false;
  updateControlButtons();
  setStatus('running');

  chrome.tabs.sendMessage(tab.id, { action: 'START_HARVESTING' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("Could not message tab, injecting content script...", chrome.runtime.lastError);
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
    chrome.tabs.sendMessage(tab.id, { action: isPaused ? 'PAUSE_HARVESTING' : 'RESUME_HARVESTING' });
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
  // Preserve existing
  scrapedData.forEach(item => {
    const key = item.fb_id || item.url;
    map.set(key, item);
  });
  // Add new
  newItems.forEach(item => {
    const key = item.fb_id || item.url;
    if (!map.has(key)) {
      map.set(key, item);
    } else {
      const existing = map.get(key);
      map.set(key, { ...existing, ...item });
    }
  });

  scrapedData = Array.from(map.values());
  chrome.storage.local.set({ scrapedFollowers: scrapedData });
  renderStats();
  renderPreview();
}

function renderStats() {
  const total = scrapedData.length;
  const withAvatars = scrapedData.filter(i => i.avatar_url && i.avatar_url.startsWith('http')).length;
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

  const recent = scrapedData.slice(-5).reverse();
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
  
  // Clear storage and state
  await chrome.storage.local.remove('scrapedFollowers');
  await chrome.storage.local.set({
    harvesterState: { isRunning: false, isPaused: false }
  });

  // Notify content script to reset loop and processedKeys
  try {
    const tab = await getActiveTab();
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'RESET_HARVESTING' });
    }
  } catch (e) {}

  updateControlButtons();
  setStatus('ready');
  renderStats();
  renderPreview();

  const clearBtn = document.getElementById('btnClearData');
  const originalText = clearBtn.textContent;
  clearBtn.textContent = currentLang === 'vi' ? '✓ Đã làm sạch!' : '✓ 已清空!';
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
    const res = await fetch('http://127.0.0.1:8000/api/upload-raw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: finalFilename,
        data: data
      })
    });
    const resJson = await res.json();
    if (resJson && resJson.filename) {
      finalFilename = resJson.filename;
    }
  } catch (err) {}

  // 2. Broadcast to BroadcastChannel
  try {
    const bc = new BroadcastChannel('PET_LEAD_CHANNEL');
    bc.postMessage({
      type: 'NEW_HARVESTED_FOLLOWERS',
      filename: finalFilename,
      data: data,
      count: data.length,
      timestamp: Date.now()
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
'''

ROOT = os.path.dirname(os.path.abspath(__file__))
SYSTEM_ROOT = os.path.dirname(ROOT)

TARGET_FILES = [
    os.path.join(SYSTEM_ROOT, "step1_follower_harvester", "extension", "popup.js"),
    os.path.join(SYSTEM_ROOT, "fb_following_scraper", "popup.js")
]

for p in TARGET_FILES:
    with open(p, "w", encoding="utf-8") as f:
        f.write(POPUP_JS_CODE)
    print(f"Updated {p} ({len(POPUP_JS_CODE)} bytes)")

print("popup.js updated successfully!")
