// Pet Lead AI - Tool 1: FB Multi-Link Harvester Controller (v3.3)
// Quản lý cào danh sách link Facebook đa tab, nạp trực tiếp vào Tool 2 AI Vision

let currentLang = 'vi';
let isHarvesting = false;
let isPaused = false;
let harvestedRecords = [];
let queueList = [];
let currentQueueIndex = -1;
let activeTabIds = [];
let queueTimer = null;

// Từ điển Song Ngữ Việt - Trung (VI / ZH)
const I18N = {
  vi: {
    brandTitle: "Pet Lead AI • Multi-Link Harvester",
    brandDesc: "Bộ cào người theo dõi Facebook đa liên kết & chuẩn hóa dữ liệu đầu vào",
    extReady: "Tiện ích đang sẵn sàng",
    extRunning: "Đang cào dữ liệu...",
    extPaused: "Đã tạm dừng cào",
    extDone: "Đã hoàn thành tất cả link",
    kpiLinks: "Tổng link đã nạp",
    kpiScraped: "Đã cào được",
    kpiAvatars: "Có Avatar HD",
    kpiNumeric: "Có FB_ID số",
    panelLinksTitle: "Danh sách Link Facebook",
    urlFormatHint: "Đuôi /followers hoặc /following",
    urlPlaceholder: "Dán danh sách link Facebook vào đây (Mỗi dòng 1 link)\nVí dụ:\nhttps://www.facebook.com/officialgooddog/followers\nhttps://www.facebook.com/Cavicajunkennels/followers",
    quickSample: "Link mẫu:",
    modeTitle: "Chế độ cào đa link",
    modeDesc: "Mở tuần tự từng tab hoặc cào song song",
    modeSequential: "Tuần tự từng link (Khuyên dùng)",
    modeMulti2: "Mở song song 2 tab",
    modeMulti3: "Mở song song 3 tab",
    btnStart: "Bắt đầu cào tất cả link",
    btnPause: "Tạm dừng",
    btnResume: "Tiếp tục",
    btnStop: "Dừng & Lưu",
    queueHeader: "HÀNG ĐỢI XỬ LÝ (QUEUE)",
    queueEmpty: "Chưa có link nào trong hàng đợi. Hãy dán link và bấm Bắt đầu.",
    tableTitle: "Danh sách Người theo dõi vừa cào",
    tableSearchPlaceholder: "Tìm theo tên, ID số, link...",
    thAvatar: "Avatar",
    thName: "Tên chủ nuôi / Trại chó",
    thLink: "Facebook Link",
    thId: "FB_ID Số",
    thSource: "Trang nguồn",
    thType: "Phân loại",
    emptyTableMsg: "Chưa có dữ liệu. Dán danh sách link bên trái và bấm 'Bắt đầu cào tất cả link'.",
    btnExportTool2: "Xuất file JSON cho Tool 2 (AI Vision)",
    btnExportExcel: "Xuất Excel (XLSX)",
    btnClearTrash: "Dọn sạch dữ liệu",
    toastCopied: "Đã sao chép liên kết!",
    toastExportedTool2: "✓ Đã xuất file JSON thành công cho Tool 2!",
    toastExportedExcel: "✓ Đã xuất file Excel thành công!",
    toastCleared: "✓ Đã dọn sạch dữ liệu!",
    statusPending: "Chờ chạy",
    statusActive: "Đang cào",
    statusDone: "Hoàn tất",
    statusError: "Lỗi / Bỏ qua"
  },
  zh: {
    brandTitle: "Pet Lead AI • 多链接粉丝采集器",
    brandDesc: "Facebook 多链接粉丝与正在关注批量采集及标准化输入工具",
    extReady: "插件已就绪",
    extRunning: "正在采集数据...",
    extPaused: "已暂停采集",
    extDone: "所有链接采集完成",
    kpiLinks: "总输入链接数",
    kpiScraped: "已采集数量",
    kpiAvatars: "含高清头像",
    kpiNumeric: "含数字 UID",
    panelLinksTitle: "Facebook 链接列表",
    urlFormatHint: "需包含 /followers 或 /following",
    urlPlaceholder: "请粘贴 Facebook 链接（每行一个链接）\n例如：\nhttps://www.facebook.com/officialgooddog/followers\nhttps://www.facebook.com/Cavicajunkennels/followers",
    quickSample: "示例链接：",
    modeTitle: "多链接采集模式",
    modeDesc: "依次采集或多标签并行",
    modeSequential: "顺序依次采集（推荐）",
    modeMulti2: "并行开启 2 个标签页",
    modeMulti3: "并行开启 3 个标签页",
    btnStart: "开始采集所有链接",
    btnPause: "暂停",
    btnResume: "继续",
    btnStop: "停止并保存",
    queueHeader: "任务队列 (QUEUE)",
    queueEmpty: "队列为空。请在上方输入链接后点击开始采集。",
    tableTitle: "实时采集粉丝列表",
    tableSearchPlaceholder: "按名字、UID、链接搜索...",
    thAvatar: "头像",
    thName: "犬舍 / 宠主名称",
    thLink: "Facebook 主页",
    thId: "数字 UID",
    thSource: "来源主页",
    thType: "客户类型",
    emptyTableMsg: "暂无数据。请在左侧粘贴 Facebook 粉丝链接并点击“开始采集所有链接”。",
    btnExportTool2: "导出 JSON 给 Tool 2 (AI 视觉模型)",
    btnExportExcel: "导出 Excel (XLSX)",
    btnClearTrash: "清空采集数据",
    toastCopied: "链接已复制！",
    toastExportedTool2: "✓ 已成功导出给 Tool 2 的 JSON 数据！",
    toastExportedExcel: "✓ 已成功导出 Excel 报表！",
    toastCleared: "✓ 数据已成功清空！",
    statusPending: "等待中",
    statusActive: "采集中",
    statusDone: "已完成",
    statusError: "错误 / 跳过"
  }
};

// Cập nhật giao diện theo ngôn ngữ
function updateI18nUI() {
  const t = I18N[currentLang];
  document.getElementById('txtBrandTitle').textContent = t.brandTitle;
  document.getElementById('txtBrandDesc').textContent = t.brandDesc;
  document.getElementById('lblKpiLinks').textContent = t.kpiLinks;
  document.getElementById('lblKpiScraped').textContent = t.kpiScraped;
  document.getElementById('lblKpiAvatars').textContent = t.kpiAvatars;
  document.getElementById('lblKpiNumeric').textContent = t.kpiNumeric;
  document.getElementById('txtPanelLinksTitle').textContent = t.panelLinksTitle;
  document.getElementById('txtUrlFormatHint').textContent = t.urlFormatHint;
  document.getElementById('urlInputTextarea').placeholder = t.urlPlaceholder;
  document.getElementById('lblQuickSample').textContent = t.quickSample;
  document.getElementById('txtModeTitle').textContent = t.modeTitle;
  document.getElementById('txtModeDesc').textContent = t.modeDesc;
  
  const modeSelect = document.getElementById('crawlModeSelect');
  modeSelect.options[0].textContent = t.modeSequential;
  modeSelect.options[1].textContent = t.modeMulti2;
  modeSelect.options[2].textContent = t.modeMulti3;

  document.getElementById('txtBtnStart').textContent = t.btnStart;
  document.getElementById('txtBtnPause').textContent = isPaused ? t.btnResume : t.btnPause;
  document.getElementById('txtBtnStop').textContent = t.btnStop;
  document.getElementById('txtQueueHeader').textContent = t.queueHeader;

  document.getElementById('txtTableTitle').textContent = t.tableTitle;
  document.getElementById('tableSearchInput').placeholder = t.tableSearchPlaceholder;
  document.getElementById('thAvatar').textContent = t.thAvatar;
  document.getElementById('thName').textContent = t.thName;
  document.getElementById('thLink').textContent = t.thLink;
  document.getElementById('thId').textContent = t.thId;
  document.getElementById('thSource').textContent = t.thSource;
  document.getElementById('thType').textContent = t.thType;

  document.getElementById('txtBtnExportTool2').textContent = t.btnExportTool2;
  document.getElementById('txtBtnExportExcel').textContent = t.btnExportExcel;
  document.getElementById('txtBtnClearTrash').textContent = t.btnClearTrash;

  renderQueue();
  renderTable();
}

// Khởi tạo trang
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Tải ngôn ngữ đã lưu
  try {
    const st = await chrome.storage.local.get(['lang', 'scrapedFollowers']);
    if (st.lang) currentLang = st.lang;
    if (st.scrapedFollowers && Array.isArray(st.scrapedFollowers)) {
      harvestedRecords = st.scrapedFollowers;
    }
  } catch (e) {
    const saved = localStorage.getItem('pet_lead_tool1_lang');
    if (saved) currentLang = saved;
  }

  // Cập nhật nút active ngôn ngữ
  document.getElementById('btnLangVi').classList.toggle('active', currentLang === 'vi');
  document.getElementById('btnLangZh').classList.toggle('active', currentLang === 'zh');
  updateI18nUI();
  updateKPIs();

  // 2. Lắng nghe nút đổi ngôn ngữ
  document.getElementById('btnLangVi').addEventListener('click', () => {
    currentLang = 'vi';
    document.getElementById('btnLangVi').classList.add('active');
    document.getElementById('btnLangZh').classList.remove('active');
    try { chrome.storage.local.set({ lang: 'vi' }); } catch(e){}
    localStorage.setItem('pet_lead_tool1_lang', 'vi');
    updateI18nUI();
  });

  document.getElementById('btnLangZh').addEventListener('click', () => {
    currentLang = 'zh';
    document.getElementById('btnLangZh').classList.add('active');
    document.getElementById('btnLangVi').classList.remove('active');
    try { chrome.storage.local.set({ lang: 'zh' }); } catch(e){}
    localStorage.setItem('pet_lead_tool1_lang', 'zh');
    updateI18nUI();
  });

  // 3. Link mẫu nhanh
  document.getElementById('chipGooddog').addEventListener('click', () => {
    addSampleUrl('https://www.facebook.com/officialgooddog/followers');
  });
  document.getElementById('chipCavicajun').addEventListener('click', () => {
    addSampleUrl('https://www.facebook.com/Cavicajunkennels/followers');
  });
  document.getElementById('chipClearInput').addEventListener('click', () => {
    document.getElementById('urlInputTextarea').value = '';
    parseUrlsFromTextarea();
  });

  // 4. Lắng nghe thay đổi textarea URL
  document.getElementById('urlInputTextarea').addEventListener('input', parseUrlsFromTextarea);

  // 5. Nút điều khiển
  document.getElementById('btnStartHarvest').addEventListener('click', startQueueHarvest);
  document.getElementById('btnPauseHarvest').addEventListener('click', togglePauseHarvest);
  document.getElementById('btnStopHarvest').addEventListener('click', stopQueueHarvest);

  // 6. Nút xuất file
  document.getElementById('btnExportForTool2').addEventListener('click', exportForTool2);
  document.getElementById('btnExportExcel').addEventListener('click', exportToExcel);
  document.getElementById('btnClearTrash').addEventListener('click', clearAllHarvestedData);

  // 7. Tìm kiếm bảng
  document.getElementById('tableSearchInput').addEventListener('input', renderTable);

  // 8. Lắng nghe dữ liệu real-time từ Extension Content Script
  setupRealtimeListeners();
});

// Thêm link mẫu vào textarea
function addSampleUrl(url) {
  const ta = document.getElementById('urlInputTextarea');
  const current = ta.value.trim();
  if (current.includes(url)) return;
  ta.value = current ? current + '\n' + url : url;
  parseUrlsFromTextarea();
}

// Bóc tách danh sách URL hợp lệ
function parseUrlsFromTextarea() {
  const ta = document.getElementById('urlInputTextarea');
  const lines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
  const cleanList = [];

  for (let l of lines) {
    if (!l.startsWith('http')) {
      l = 'https://' + l.replace(/^www\./, 'www.');
    }
    try {
      const u = new URL(l);
      if (u.hostname.includes('facebook.com')) {
        let p = u.pathname.replace(/\/$/, '');
        // Đảm bảo có đuôi followers hoặc following
        if (!p.endsWith('/followers') && !p.endsWith('/following')) {
          p = p + '/followers';
        }
        cleanList.push(`https://www.facebook.com${p}`);
      }
    } catch (e) {}
  }

  // Deduplicate
  const uniqueUrls = Array.from(new Set(cleanList));
  document.getElementById('kpiTotalLinks').textContent = uniqueUrls.length;

  // Cập nhật queueList
  queueList = uniqueUrls.map(url => {
    const existing = queueList.find(q => q.url === url);
    return existing || { url, status: 'pending', count: 0 };
  });

  renderQueue();
}

// Hiển thị danh sách hàng đợi (Queue UI)
function renderQueue() {
  const container = document.getElementById('queueListContainer');
  const t = I18N[currentLang];
  document.getElementById('txtQueueCount').textContent = `${queueList.length} link`;

  if (queueList.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 11px; padding: 12px;">${t.queueEmpty}</div>`;
    return;
  }

  container.innerHTML = queueList.map((item, index) => {
    let badgeClass = 'badge-pending';
    let statusLabel = t.statusPending;

    if (item.status === 'active') {
      badgeClass = 'badge-active';
      statusLabel = `${t.statusActive} (${item.count})`;
    } else if (item.status === 'done') {
      badgeClass = 'badge-done';
      statusLabel = `${t.statusDone} (+${item.count})`;
    } else if (item.status === 'error') {
      badgeClass = 'badge-pending';
      statusLabel = t.statusError;
    }

    return `
      <div class="queue-item">
        <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
          <span style="font-weight: 800; font-size: 11px; color: var(--text-muted); width: 18px;">#${index + 1}</span>
          <span class="queue-url" title="${item.url}">${item.url.replace('https://www.facebook.com/', '')}</span>
        </div>
        <span class="queue-status-badge ${badgeClass}">${statusLabel}</span>
      </div>
    `;
  }).join('');
}

// Lắng nghe dữ liệu realtime
function setupRealtimeListeners() {
  // 1. Chrome runtime message từ extension content script
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.action === 'NEW_FOLLOWERS_BATCH') {
        mergeIncomingFollowers(msg.data || []);
      }
    });
  } catch (e) {}

  // 2. BroadcastChannel đồng bộ liên tab
  try {
    const bc = new BroadcastChannel('PET_LEAD_CHANNEL');
    bc.onmessage = (event) => {
      if (event.data && event.data.type === 'NEW_HARVESTED_FOLLOWERS') {
        mergeIncomingFollowers(event.data.data || []);
      }
    };
  } catch (e) {}

  // 3. Chrome storage onChange
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.scrapedFollowers) {
        harvestedRecords = changes.scrapedFollowers.newValue || [];
        updateKPIs();
        renderTable();
      }
    });
  } catch (e) {}
}

// Trộn dữ liệu mới vào bảng và chống trùng lặp
function mergeIncomingFollowers(newItems) {
  if (!newItems || newItems.length === 0) return;
  const map = new Map();
  harvestedRecords.forEach(r => {
    const k = r.fb_id || r.url;
    if (k) map.set(k, r);
  });

  let newlyAdded = 0;
  newItems.forEach(r => {
    const k = r.fb_id || r.url;
    if (k) {
      if (!map.has(k)) {
        map.set(k, r);
        newlyAdded++;
      } else {
        map.set(k, { ...map.get(k), ...r });
      }
    }
  });

  harvestedRecords = Array.from(map.values());
  
  // Cập nhật số đếm của task đang active trong queue
  if (currentQueueIndex >= 0 && currentQueueIndex < queueList.length) {
    queueList[currentQueueIndex].count += newlyAdded;
    renderQueue();
  }

  try {
    chrome.storage.local.set({ scrapedFollowers: harvestedRecords });
  } catch (e) {
    localStorage.setItem('pet_lead_tool1_data', JSON.stringify(harvestedRecords));
  }

  updateKPIs();
  renderTable();
}

// Cập nhật các thẻ KPI trên đầu trang
function updateKPIs() {
  const total = harvestedRecords.length;
  const withAvatars = harvestedRecords.filter(r => r.avatar_url && (r.avatar_url.includes('fbcdn.net') || r.avatar_url.includes('scontent') || r.avatar_url.startsWith('http'))).length;
  const withNumericId = harvestedRecords.filter(r => r.fb_id && /^\d+$/.test(r.fb_id)).length;

  document.getElementById('kpiTotalScraped').textContent = total;
  document.getElementById('kpiTotalAvatars').textContent = withAvatars;
  document.getElementById('kpiTotalNumericId').textContent = withNumericId;
  document.getElementById('txtLiveCount').textContent = `(${total} hồ sơ)`;
}

// Hiển thị bảng dữ liệu
function renderTable() {
  const tbody = document.getElementById('harvesterTableBody');
  const t = I18N[currentLang];
  const query = (document.getElementById('tableSearchInput').value || '').trim().toLowerCase();

  let filtered = harvestedRecords;
  if (query) {
    filtered = filtered.filter(r => 
      (r.name && r.name.toLowerCase().includes(query)) ||
      (r.fb_id && r.fb_id.includes(query)) ||
      (r.url && r.url.toLowerCase().includes(query)) ||
      (r.source_page && r.source_page.toLowerCase().includes(query))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-table">
          <div class="empty-icon">📥</div>
          <div>${harvestedRecords.length === 0 ? t.emptyTableMsg : 'Không tìm thấy kết quả phù hợp.'}</div>
        </td>
      </tr>
    `;
    return;
  }

  // Render 150 bản ghi gần nhất để giữ DOM mượt mà
  const displayRows = filtered.slice(-150).reverse();

  tbody.innerHTML = displayRows.map((r, i) => {
    const isBreeder = r.audience_type === 'BREEDER_PRO';
    const typeLabel = isBreeder 
      ? (currentLang === 'vi' ? 'Trại chó / Breeder' : '专业犬舍 (Breeder)') 
      : (currentLang === 'vi' ? 'Người yêu chó' : '爱犬人士');
    const badgeClass = isBreeder ? 'badge-breeder' : 'badge-lover';
    const avatar = r.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.name || 'User')}&background=4f46e5&color=fff`;
    const sourceClean = (r.source_page || '').replace('https://www.facebook.com/', '').replace(/\/followers.*/, '');

    return `
      <tr>
        <td style="color: var(--text-muted); font-size: 11.5px; font-weight: 700;">#${i + 1}</td>
        <td>
          <div class="avatar-cell">
            <img src="${avatar}" onerror="this.src='https://ui-avatars.com/api/?name=User&background=4f46e5&color=fff'" />
          </div>
        </td>
        <td>
          <div class="profile-name">${r.name || 'Facebook User'}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${r.subtitle || ''}</div>
        </td>
        <td>
          <a href="${r.url || '#'}" target="_blank" class="profile-link">
            <span>🔗</span>
            <span>${(r.url || '').replace('https://www.facebook.com/', '')}</span>
          </a>
        </td>
        <td>
          ${r.fb_id ? `<span class="numeric-id-tag">${r.fb_id}</span>` : '<span style="color:var(--text-light);font-size:11px;">Chưa có</span>'}
        </td>
        <td style="font-size: 11.5px; font-weight: 600; color: var(--text-muted);">
          ${sourceClean || 'Facebook'}
        </td>
        <td>
          <span class="audience-badge ${badgeClass}">${typeLabel}</span>
        </td>
      </tr>
    `;
  }).join('');
}

// Bắt đầu cào theo Queue
async function startQueueHarvest() {
  parseUrlsFromTextarea();
  if (queueList.length === 0) {
    alert(currentLang === 'vi' ? 'Vui lòng dán ít nhất 1 link Facebook hợp lệ!' : '请先粘贴至少一个有效的 Facebook 链接！');
    return;
  }

  isHarvesting = true;
  isPaused = false;
  document.getElementById('btnStartHarvest').disabled = true;
  document.getElementById('btnPauseHarvest').disabled = false;
  document.getElementById('btnStopHarvest').disabled = false;
  document.getElementById('txtExtStatus').textContent = I18N[currentLang].extRunning;

  currentQueueIndex = 0;
  executeNextInQueue();
}

// Thực thi link tiếp theo trong Queue
async function executeNextInQueue() {
  if (!isHarvesting || isPaused) return;

  if (currentQueueIndex >= queueList.length) {
    // Hoàn tất tất cả
    isHarvesting = false;
    document.getElementById('btnStartHarvest').disabled = false;
    document.getElementById('btnPauseHarvest').disabled = true;
    document.getElementById('btnStopHarvest').disabled = true;
    document.getElementById('txtExtStatus').textContent = I18N[currentLang].extDone;
    showToast(I18N[currentLang].extDone);
    return;
  }

  const task = queueList[currentQueueIndex];
  task.status = 'active';
  renderQueue();

  console.log(`🐾 [Tool 1] Đang xử lý Queue #${currentQueueIndex + 1}: ${task.url}`);

  try {
    // Mở tab Facebook cào dữ liệu qua Chrome API
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      const tab = await chrome.tabs.create({ url: task.url, active: false });
      activeTabIds.push(tab.id);

      // Đợi tab load xong và kích hoạt cào
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
      }, 4000);

      // Chạy cào link này trong 45 giây trước khi chuyển sang link tiếp theo
      queueTimer = setTimeout(() => {
        task.status = 'done';
        renderQueue();
        
        // Đóng tab cũ để nhẹ RAM
        try { chrome.tabs.remove(tab.id); } catch (e) {}
        
        currentQueueIndex++;
        executeNextInQueue();
      }, 45000);

    } else {
      // Chạy ở chế độ mở popup bình thường nếu không có tabs permission
      window.open(task.url, '_blank');
      task.status = 'done';
      renderQueue();
    }
  } catch (err) {
    console.error("Queue execution error:", err);
    task.status = 'error';
    renderQueue();
    currentQueueIndex++;
    executeNextInQueue();
  }
}

// Tạm dừng
function togglePauseHarvest() {
  isPaused = !isPaused;
  document.getElementById('txtBtnPause').textContent = isPaused ? I18N[currentLang].btnResume : I18N[currentLang].btnPause;
  document.getElementById('txtExtStatus').textContent = isPaused ? I18N[currentLang].extPaused : I18N[currentLang].extRunning;

  if (isPaused) {
    if (queueTimer) clearTimeout(queueTimer);
  } else {
    executeNextInQueue();
  }
}

// Dừng hoàn toàn
function stopQueueHarvest() {
  isHarvesting = false;
  isPaused = false;
  if (queueTimer) clearTimeout(queueTimer);

  // Đóng các tab đang chạy
  activeTabIds.forEach(tid => {
    try { chrome.tabs.remove(tid); } catch (e) {}
  });
  activeTabIds = [];

  document.getElementById('btnStartHarvest').disabled = false;
  document.getElementById('btnPauseHarvest').disabled = true;
  document.getElementById('btnStopHarvest').disabled = true;
  document.getElementById('txtExtStatus').textContent = I18N[currentLang].extReady;

  if (currentQueueIndex >= 0 && currentQueueIndex < queueList.length) {
    queueList[currentQueueIndex].status = 'done';
  }
  renderQueue();
}

// Xuất file JSON chuẩn cho Tool 2 (AI Vision & Dog Classifier)
function exportForTool2() {
  if (harvestedRecords.length === 0) {
    alert(currentLang === 'vi' ? 'Chưa có dữ liệu để xuất!' : '暂无数据可导出！');
    return;
  }

  const exportData = harvestedRecords.map((item, idx) => ({
    index: idx + 1,
    fb_id: item.fb_id || '',
    name: item.name || '',
    url: item.url || '',
    raw_url: item.raw_url || item.url || '',
    avatar_url: item.avatar_url || '',
    subtitle: item.subtitle || '',
    bio: item.bio || '',
    matched_keywords: item.matched_keywords || [],
    photo_urls: item.photo_urls || [item.avatar_url].filter(Boolean),
    source_page: item.source_page || '',
    audience_type: item.audience_type || 'DOG_LOVER_AUDIENCE',
    scraped_at: item.scraped_at || new Date().toISOString()
  }));

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const filename = `step1_followers_raw_${new Date().toISOString().slice(0, 10)}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showToast(I18N[currentLang].toastExportedTool2);
}

// Xuất Excel (.xlsx)
async function exportToExcel() {
  if (harvestedRecords.length === 0) {
    alert(currentLang === 'vi' ? 'Chưa có dữ liệu để xuất!' : '暂无数据可导出！');
    return;
  }

  if (typeof ExcelJS === 'undefined') {
    alert("ExcelJS library is loading, please try again.");
    return;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('FB_Followers_Raw');

  ws.columns = [
    { header: 'STT', key: 'index', width: 8 },
    { header: 'Họ tên / Trang cá nhân', key: 'name', width: 30 },
    { header: 'FB_ID Số', key: 'fb_id', width: 22 },
    { header: 'Facebook URL', key: 'url', width: 45 },
    { header: 'Avatar URL', key: 'avatar_url', width: 45 },
    { header: 'Vị trí / Giới thiệu', key: 'subtitle', width: 28 },
    { header: 'Trang nguồn', key: 'source_page', width: 40 },
    { header: 'Phân loại', key: 'audience_type', width: 20 },
    { header: 'Thời gian cào', key: 'scraped_at', width: 24 }
  ];

  // Header styling
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };

  harvestedRecords.forEach((r, i) => {
    ws.addRow({
      index: i + 1,
      name: r.name || '',
      fb_id: r.fb_id || '',
      url: r.url || '',
      avatar_url: r.avatar_url || '',
      subtitle: r.subtitle || '',
      source_page: r.source_page || '',
      audience_type: r.audience_type || '',
      scraped_at: r.scraped_at || ''
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `FB_Followers_Tool1_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showToast(I18N[currentLang].toastExportedExcel);
}

// Xóa sạch dữ liệu
function clearAllHarvestedData() {
  if (!confirm(currentLang === 'vi' ? 'Bạn có chắc chắn muốn dọn sạch dữ liệu vừa cào không?' : '确定要清空已采集的数据吗？')) {
    return;
  }
  harvestedRecords = [];
  try {
    chrome.storage.local.remove(['scrapedFollowers']);
  } catch (e) {
    localStorage.removeItem('pet_lead_tool1_data');
  }

  updateKPIs();
  renderTable();
  showToast(I18N[currentLang].toastCleared);
}

// Toast thông báo
function showToast(msg) {
  const t = document.getElementById('toastNotice');
  t.textContent = msg;
  t.style.display = 'flex';
  setTimeout(() => {
    t.style.display = 'none';
  }, 2800);
}
