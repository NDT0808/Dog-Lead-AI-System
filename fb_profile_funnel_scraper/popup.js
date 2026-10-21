const $ = (id) => document.getElementById(id);

let state = {};
let currentLang = 'vi'; // 'vi' hoặc 'zh'

// Các phần tử DOM
const langViBtn = $('langVi');
const langZhBtn = $('langZh');

const appTitle = $('appTitle');
const modeBadge = $('modeBadge');
const txtUrlListLabel = $('txtUrlListLabel');
const linkCountText = $('linkCountText');
const btnQuickPaste = $('btnQuickPaste');
const txtBtnQuickPaste = $('txtBtnQuickPaste');
const btnOpenDashboard = $('btnOpenDashboard');
const txtBtnOpenDashboard = $('txtBtnOpenDashboard');
const urlListText = $('urlList');

const txtFromLine = $('txtFromLine');
const fromLineInput = $('fromLine');
const txtToLine = $('txtToLine');
const toLineInput = $('toLine');
const txtRangeHint = $('txtRangeHint');

const currentStatusTitle = $('currentStatusTitle');
const progressPercent = $('progressPercent');
const progressBar = $('progressBar');
const txtScrapedPrefix = $('txtScrapedPrefix');
const currentCount = $('currentCount');
const txtScrapedSuffix = $('txtScrapedSuffix');
const statusText = $('statusText');

const btnAutoStart = $('btnAutoStart');
const txtBtnAutoStart = $('txtBtnAutoStart');
const btnResume = $('btnResume');
const txtBtnResume = $('txtBtnResume');
const btnPause = $('btnPause');
const txtBtnPause = $('txtBtnPause');
const btnExportPriority8 = $('btnExportPriority8');
const txtBtnPriority8 = $('txtBtnPriority8');
const btnExportJson = $('btnExportJson');
const txtBtnExportJson = $('txtBtnExportJson');
const btnExport = $('btnExport');
const txtBtnExportCsv = $('txtBtnExportCsv');
const btnClear = $('btnClear');
const txtBtnClear = $('txtBtnClear');
const txtFooter = $('txtFooter');

// ============================ TỪ ĐIỂN SONG NGỮ (VI / ZH) ============================
const I18N = {
  vi: {
    appTitle: "🕒 FB Profile Funnel & Lead Scraper",
    modeBadge: "Full Intro + Chủ Trại + Ngày Đăng",
    btnOpenDashboard: "🖥️ MỞ DASHBOARD BÓC TÁCH CRM TOÀN MÀN HÌNH",
    urlListLabel: "Danh sách link Facebook:",
    btnQuickPaste: "Dán từ Clipboard",
    urlPlaceholder: "Dán danh sách link vào đây (mỗi dòng 1 link, không giới hạn số lượng)\nhttps://www.facebook.com/page1\nhttps://www.facebook.com/profile2...",
    fromLine: "Từ dòng:",
    toLine: "Đến dòng:",
    toLinePlaceholderEnd: "Hết",
    toLinePlaceholderTotal: (tot) => `Hết (${tot})`,
    rangeHint: "💡 Chạy đoạn tùy chọn: ví dụ từ dòng <b>200</b> đến <b>300</b>. Chạy 1 link cụ thể: từ <b>200</b> đến <b>200</b>.",
    
    statusReady: "Trạng thái: Sẵn sàng",
    statusRunning: (cur, tot) => `Đang chạy (Dòng ${cur}/${tot})`,
    statusPaused: (cur) => `Đã tạm dừng (Vị trí dòng ${cur})`,
    statusFinished: "Đã hoàn tất!",
    
    scrapedPrefix: "Đã cào:",
    scrapedSuffix: "kết quả",
    
    hintDefault: "Dán link, chọn khoảng chạy rồi ấn Bắt đầu.",
    hintPaused: (cur) => `Đã dừng ở link ${cur}. Bấm Tiếp tục để chạy tiếp hoặc Xuất file.`,
    hintProcessing: (cur) => `Đang xử lý link dòng ${cur}...`,
    
    btnStart: "Bắt đầu cào",
    btnStartNew: "▶ Bắt đầu cào mới (Từ đầu)",
    btnResume: (cur) => `Tiếp tục cào (từ dòng ${cur})`,
    btnPause: "Tạm dừng & Lưu vị trí",
    btnPriority8: "Xuất Excel Priority Data 8 (37 Cột Giao Sếp)",
    btnExportJson: "Xuất JSON LEAD-US (Chuẩn Meta RAG)",
    btnExportCsv: "Xuất file CSV gốc",
    btnClear: "Xóa dữ liệu & Làm mới",
    footer: "Tự động lưu vị trí • Tiếp tục cào bất cứ lúc nào • 100% chuẩn xác",
    
    linkCountEmpty: "0 link",
    linkCountVal: (cnt) => `${cnt} link (Không giới hạn)`,
    
    alertEmptyUrls: "Vui lòng nhập ít nhất 1 link Facebook.",
    alertStartOverTotal: (start, tot) => `Dòng bắt đầu (${start}) vượt quá tổng số link (${tot})!`,
    alertStartGreaterThanEnd: (start, end) => `Dòng bắt đầu (${start}) không thể lớn hơn dòng kết thúc (${end})!`,
    alertNoTab: "Không tìm thấy tab trình duyệt đang hoạt động.",
    alertConfirmClear: "Bạn có chắc muốn xóa sạch toàn bộ dữ liệu cào và danh sách đang lưu trong bộ nhớ?",
    
    clipboardEmpty: "Clipboard đang trống hoặc không có văn bản!",
    clipboardConfirmNonFb: "Văn bản trong clipboard dường như không chứa link facebook.com. Bạn vẫn muốn dán vào?",
    clipboardPastedSuccess: (cnt) => `✅ Đã dán thành công ${cnt} link Facebook từ Clipboard!`,
    clipboardManualHint: "Không thể đọc Clipboard tự động. Hãy click vào ô và bấm phím Ctrl+V để dán."
  },
  zh: {
    appTitle: "🕒 FB 主页详情与潜客漏斗采集器",
    modeBadge: "完整简介 + 主理人 + 发帖时间",
    btnOpenDashboard: "🖥️ 打开全屏漏斗与潜客CRM工作台",
    urlListLabel: "Facebook 链接列表:",
    btnQuickPaste: "从剪贴板粘贴",
    urlPlaceholder: "在此粘贴主页链接（每行一个链接，数量不限）\nhttps://www.facebook.com/page1\nhttps://www.facebook.com/profile2...",
    fromLine: "起始行:",
    toLine: "结束行:",
    toLinePlaceholderEnd: "末尾",
    toLinePlaceholderTotal: (tot) => `末尾 (${tot})`,
    rangeHint: "💡 支持自定义分段：例如第 <b>200</b> 行至 <b>300</b> 行。单链接测试：从 <b>200</b> 到 <b>200</b>。",
    
    statusReady: "状态：就绪",
    statusRunning: (cur, tot) => `运行中（第 ${cur}/${tot} 行）`,
    statusPaused: (cur) => `已暂停（当前位于第 ${cur} 行）`,
    statusFinished: "采集已完成！",
    
    scrapedPrefix: "已采集：",
    scrapedSuffix: "条结果",
    
    hintDefault: "请粘贴主页链接，设置运行范围后点击开始。",
    hintPaused: (cur) => `已暂停在第 ${cur} 个链接。点击“继续采集”可断点续爬，或点击导出。`,
    hintProcessing: (cur) => `正在处理第 ${cur} 行的主页链接...`,
    
    btnStart: "开始采集",
    btnStartNew: "▶ 开始新采集（从头开始）",
    btnResume: (cur) => `继续采集（从第 ${cur} 行开始）`,
    btnPause: "暂停并保存进度",
    btnPriority8: "导出 Priority Data 8 (37列管理报表)",
    btnExportJson: "导出 LEAD-US JSON 数据",
    btnExportCsv: "导出原始 CSV 数据",
    btnClear: "清空数据并重置",
    footer: "自动保存进度 • 随时断点续爬 • 100% 精确",
    
    linkCountEmpty: "0 个链接",
    linkCountVal: (cnt) => `${cnt} 个链接（不限数量）`,
    
    alertEmptyUrls: "请输入至少 1 个 Facebook 链接。",
    alertStartOverTotal: (start, tot) => `起始行 (${start}) 超过了链接总数 (${tot})！`,
    alertStartGreaterThanEnd: (start, end) => `起始行 (${start}) 不能大于结束行 (${end})！`,
    alertNoTab: "未找到当前活动的浏览器标签页。",
    alertConfirmClear: "确定清空所有已采集的数据和内存中的链接列表吗？",
    
    clipboardEmpty: "剪贴板为空或不包含文本！",
    clipboardConfirmNonFb: "剪贴板内容似乎不包含 facebook.com 链接，是否仍要粘贴？",
    clipboardPastedSuccess: (cnt) => `✅ 已成功从剪贴板粘贴 ${cnt} 个 Facebook 链接！`,
    clipboardManualHint: "无法自动读取剪贴板，请点击输入框并按 Ctrl+V 粘贴。"
  }
};

const isVi = () => currentLang === 'vi';
const t = () => I18N[currentLang];

function setLanguage(lang) {
  currentLang = lang;
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ fb_funnel_lang: lang });
  } else {
    try { localStorage.setItem('fb_funnel_lang', lang); } catch (e) {}
  }

  langViBtn.classList.toggle('active', lang === 'vi');
  langZhBtn.classList.toggle('active', lang === 'zh');

  const dict = t();
  appTitle.textContent = dict.appTitle;
  modeBadge.textContent = dict.modeBadge;
  txtUrlListLabel.textContent = dict.urlListLabel;
  txtBtnQuickPaste.textContent = dict.btnQuickPaste;
  urlListText.placeholder = dict.urlPlaceholder;

  txtFromLine.textContent = dict.fromLine;
  txtToLine.textContent = dict.toLine;
  txtRangeHint.innerHTML = dict.rangeHint;

  txtScrapedPrefix.textContent = dict.scrapedPrefix;
  txtScrapedSuffix.textContent = dict.scrapedSuffix;

  txtBtnPriority8.textContent = dict.btnPriority8;
  if (txtBtnExportJson) txtBtnExportJson.textContent = dict.btnExportJson;
  txtBtnExportCsv.textContent = dict.btnExportCsv;
  txtBtnClear.textContent = dict.btnClear;
  if (txtBtnOpenDashboard) txtBtnOpenDashboard.textContent = dict.btnOpenDashboard;
  txtFooter.textContent = dict.footer;

  updateLinkCount();
  render();
}

langViBtn.addEventListener('click', () => setLanguage('vi'));
langZhBtn.addEventListener('click', () => setLanguage('zh'));

// Khởi tạo ngôn ngữ đã lưu
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['fb_funnel_lang'], (res) => {
    if (res && res.fb_funnel_lang) {
      setLanguage(res.fb_funnel_lang);
    } else {
      setLanguage('vi');
    }
  });
} else {
  try {
    const saved = localStorage.getItem('fb_funnel_lang');
    setLanguage(saved || 'vi');
  } catch (e) {
    setLanguage('vi');
  }
}

function getValidUrls(text) {
  if (!text) return [];
  return text.split('\n')
    .map(u => u.trim())
    .filter(u => u.length > 0);
}

function updateLinkCount() {
  const dict = t();
  const urls = getValidUrls(urlListText.value);
  if (urls.length === 0) {
    linkCountText.textContent = dict.linkCountEmpty;
    toLineInput.placeholder = dict.toLinePlaceholderEnd;
  } else {
    linkCountText.textContent = dict.linkCountVal(urls.length.toLocaleString(isVi() ? 'vi-VN' : 'zh-CN'));
    if (!toLineInput.value && !state.isAutoRunning) {
      toLineInput.placeholder = dict.toLinePlaceholderTotal(urls.length.toLocaleString(isVi() ? 'vi-VN' : 'zh-CN'));
    }
  }
}

function render() {
  const dict = t();
  const urls = getValidUrls(urlListText.value);
  currentCount.textContent = state.allData ? state.allData.length.toLocaleString(isVi() ? 'vi-VN' : 'zh-CN') : '0';

  let totalRange = 1;
  let doneCount = 0;
  if (state.urlList && state.urlList.length > 0) {
    let start = state.startIndex || 0;
    let end = (state.endIndex !== undefined && state.endIndex >= 0) ? state.endIndex : (state.urlList.length - 1);
    totalRange = Math.max(1, end - start + 1);
    let cur = state.currentIndex !== undefined ? state.currentIndex : start;
    doneCount = Math.max(0, cur - start);
  }

  let pct = Math.min(100, Math.round((doneCount / totalRange) * 100));
  if (state.isAutoRunning) {
    progressBar.style.width = `${pct}%`;
    progressPercent.textContent = `${pct}%`;
    currentStatusTitle.textContent = dict.statusRunning(state.currentIndex + 1, (state.endIndex !== undefined ? state.endIndex + 1 : state.urlList.length));
    statusText.textContent = state.statusMessage || dict.hintProcessing(state.currentIndex + 1);

    btnAutoStart.style.display = 'none';
    btnResume.style.display = 'none';
    btnPause.style.display = 'flex';
    txtBtnPause.textContent = dict.btnPause;

    urlListText.disabled = true;
    fromLineInput.disabled = true;
    toLineInput.disabled = true;
    btnQuickPaste.disabled = true;
  } else {
    urlListText.disabled = false;
    fromLineInput.disabled = false;
    toLineInput.disabled = false;
    btnQuickPaste.disabled = false;
    btnPause.style.display = 'none';

    if (state.isPaused) {
      progressBar.style.width = `${pct}%`;
      progressPercent.textContent = `${pct}%`;
      currentStatusTitle.textContent = dict.statusPaused(state.currentIndex + 1);
      statusText.textContent = state.statusMessage || dict.hintPaused(state.currentIndex + 1);

      btnAutoStart.style.display = 'flex';
      txtBtnAutoStart.textContent = dict.btnStartNew;
      btnResume.style.display = 'flex';
      txtBtnResume.textContent = dict.btnResume(state.currentIndex + 1);
    } else {
      btnAutoStart.style.display = 'flex';
      txtBtnAutoStart.textContent = dict.btnStart;
      btnResume.style.display = 'none';

      if (state.statusMessage && (state.statusMessage.includes('hoàn thành') || state.statusMessage.includes('完成'))) {
        progressBar.style.width = '100%';
        progressPercent.textContent = '100%';
        currentStatusTitle.textContent = dict.statusFinished;
        statusText.textContent = state.statusMessage;
      } else {
        currentStatusTitle.textContent = dict.statusReady;
        statusText.textContent = state.statusMessage || dict.hintDefault;
      }
    }
  }
}

function updateState() {
  chrome.runtime.sendMessage({ action: 'GET_STATE' }, (res) => {
    if (res) {
      state = res;

      // Điền textarea nếu đang trống và state có danh sách
      if (!state.isAutoRunning && state.urlList && state.urlList.length > 0 && urlListText.value === '') {
        urlListText.value = state.urlList.join('\n');
      }

      // Điền khoảng range
      if (!state.isAutoRunning) {
        if (state.startIndex !== undefined && document.activeElement !== fromLineInput && !fromLineInput.value) {
          fromLineInput.value = state.startIndex + 1;
        }
        if (state.endIndex !== undefined && state.endIndex >= 0 && document.activeElement !== toLineInput && !toLineInput.value) {
          toLineInput.value = state.endIndex + 1;
        }
      }

      updateLinkCount();
      render();
    }
  });
}

urlListText.addEventListener('input', () => {
  updateLinkCount();
});

// ============================ DÁN TỪ CLIPBOARD ============================
btnQuickPaste.addEventListener('click', async () => {
  const dict = t();
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      return alert(dict.clipboardEmpty);
    }

    const rawUrls = text.split(/\r?\n/).map(u => u.trim()).filter(Boolean);
    const fbUrls = rawUrls.filter(u => /facebook\.com/i.test(u));

    if (fbUrls.length === 0) {
      if (!confirm(dict.clipboardConfirmNonFb)) return;
    }

    const toPaste = fbUrls.length > 0 ? fbUrls.join('\n') : rawUrls.join('\n');
    const cur = urlListText.value.trim();
    if (cur) {
      urlListText.value = cur + '\n' + toPaste;
    } else {
      urlListText.value = toPaste;
    }

    updateLinkCount();
    alert(dict.clipboardPastedSuccess((fbUrls.length || rawUrls.length).toLocaleString()));
  } catch (err) {
    // Fallback hướng dẫn bấm Ctrl+V
    alert(dict.clipboardManualHint);
    urlListText.focus();
  }
});

// ============================ MỞ DASHBOARD TOÀN MÀN HÌNH ============================
if (btnOpenDashboard) {
  btnOpenDashboard.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });
}

// ============================ BẮT ĐẦU CÀO MỚI ============================
btnAutoStart.addEventListener('click', () => {
  const dict = t();
  const text = urlListText.value;
  const urls = getValidUrls(text);
  if (urls.length === 0) return alert(dict.alertEmptyUrls);

  let fromVal = parseInt(fromLineInput.value, 10);
  if (isNaN(fromVal) || fromVal < 1) fromVal = 1;

  let toVal = parseInt(toLineInput.value, 10);
  if (isNaN(toVal) || toVal > urls.length) toVal = urls.length;

  if (fromVal > urls.length) {
    return alert(dict.alertStartOverTotal(fromVal, urls.length));
  }
  if (fromVal > toVal) {
    return alert(dict.alertStartGreaterThanEnd(fromVal, toVal));
  }

  const startIdx = fromVal - 1;
  const endIdx = toVal - 1;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return alert(dict.alertNoTab);
    chrome.runtime.sendMessage({
      action: 'START_AUTO',
      urls: urls,
      startIndex: startIdx,
      endIndex: endIdx,
      tabId: tabs[0].id
    }, () => {
      updateState();
    });
  });
});

btnResume.addEventListener('click', () => {
  const dict = t();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return alert(dict.alertNoTab);
    chrome.runtime.sendMessage({
      action: 'RESUME_AUTO',
      tabId: tabs[0].id
    }, () => {
      updateState();
    });
  });
});

btnPause.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'STOP_AUTO' }, () => {
    updateState();
  });
});

// ============================ XUẤT PRIORITY DATA 8 (37 CỘT GIAO SẾP) ============================
if (btnExportPriority8) {
  btnExportPriority8.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'EXPORT_PRIORITY_DATA_8' });
  });
}

// ============================ XUẤT JSON LEAD-US (CHUYÊN BIỆT META RAG) ============================
if (btnExportJson) {
  btnExportJson.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'EXPORT_JSON_LEAD_US' });
  });
}

btnExport.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'EXPORT_DATA' });
});

btnClear.addEventListener('click', () => {
  const dict = t();
  if (confirm(dict.alertConfirmClear)) {
    chrome.runtime.sendMessage({ action: 'CLEAR_DATA' }, () => {
      fromLineInput.value = '1';
      toLineInput.value = '';
      updateState();
    });
  }
});

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'STATE_UPDATED') {
      state = msg.state;
      render();
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
  updateState();
  setInterval(updateState, 1000);
}
