import os
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
SYSTEM_ROOT = os.path.dirname(ROOT)

INDEX_PATH = os.path.join(SYSTEM_ROOT, "web_dashboard", "index.html")

with open(INDEX_PATH, "r", encoding="utf-8") as f:
    lines = f.readlines()

html_head = lines[:976]
script_lines = lines[977:2543]
html_tail = lines[2544:]

clean_html_head = []
for l in html_head:
    l_mod = l
    l_mod = l_mod.replace(' onclick="switchTab(1)"', '')
    l_mod = l_mod.replace(' onclick="switchTab(2)"', '')
    l_mod = l_mod.replace(' onclick="setAppLang(\'vi\')"', '')
    l_mod = l_mod.replace(' onclick="setAppLang(\'zh\')"', '')
    clean_html_head.append(l_mod)

script_text = "".join(script_lines)

# Fix API_BASE
old_api_base = """    const API_BASE = (window.location.protocol.startsWith('http') && window.location.port !== '8000')
      ? 'http://127.0.0.1:8000'
      : '';"""

new_api_base = """    // Auto-detect Python Server API Base across Extension, Live Server, and Server (8000)
    const API_BASE = (window.location.protocol.startsWith('http') && window.location.port === '8000')
      ? ''
      : 'http://127.0.0.1:8000';"""

if old_api_base in script_text:
    script_text = script_text.replace(old_api_base, new_api_base)
    print("Replaced API_BASE successfully")
else:
    print("Warning: old_api_base not exact match")

# Add Server Connection Checker & Helper Banner
server_helper_code = """
    // =========================================================================
    // 0. SERVER STATUS MONITOR & NOTIFICATION BANNER
    // =========================================================================
    let isServerConnected = false;

    function renderServerBanner() {
      let banner = document.getElementById('serverOfflineBanner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'serverOfflineBanner';
        banner.style.cssText = 'background: linear-gradient(90deg, #1e293b, #0f172a); border-bottom: 2px solid #f59e0b; padding: 12px 24px; color: #f8fafc; display: none; align-items: center; justify-content: space-between; gap: 16px; font-size: 13px; z-index: 9999; position: sticky; top: 0; box-shadow: 0 4px 16px rgba(0,0,0,0.4);';
        banner.innerHTML = `
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:22px;">⚠️</span>
            <div>
              <span id="bannerTitle" style="font-weight:700; color:#fbbf24;">Máy chủ Python (Port 8000) chưa được kết nối!</span>
              <span id="bannerDesc" style="color:#cbd5e1; margin-left:8px;">Để sử dụng Lọc AI Thị Giác YOLOv8, Lọc khuôn mặt và Làm giàu hồ sơ CRM, vui lòng mở file <strong>CHAY_GIAO_DIEN_WEB.bat</strong> trong thư mục dự án. (Dữ liệu quét từ Facebook vẫn hiển thị và xem được đầy đủ bên dưới).</span>
            </div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button id="btnRetryServerConn" style="background:#f59e0b; color:#0f172a; font-weight:700; border:none; border-radius:6px; padding:6px 14px; cursor:pointer; font-size:12px; transition:all 0.2s;">🔄 Thử kết nối lại (Retry)</button>
          </div>
        `;
        document.body.insertBefore(banner, document.body.firstChild);
      }
      return banner;
    }

    async function checkServerConnection() {
      const banner = renderServerBanner();
      try {
        const resp = await fetch(`${API_BASE}/api/system-status`, { signal: AbortSignal.timeout(1800) });
        if (resp.ok) {
          isServerConnected = true;
          banner.style.display = 'none';
          return true;
        }
      } catch (e) {
        try {
          const resp2 = await fetch(`${API_BASE}/`, { method: 'HEAD', signal: AbortSignal.timeout(1200) });
          isServerConnected = true;
          banner.style.display = 'none';
          return true;
        } catch (e2) {}
      }
      isServerConnected = false;
      banner.style.display = 'flex';
      return false;
    }

    async function retryServerConnection() {
      const btn = document.getElementById('btnRetryServerConn');
      if (btn) btn.textContent = '⏳ Đang kiểm tra...';
      const ok = await checkServerConnection();
      if (ok) {
        showToast(currentLang === 'zh' ? '✓ 已成功连接Python后端服务器 (Port 8000)！' : '✓ Đã kết nối máy chủ Python (Port 8000) thành công!');
        appendTerminalLog('✓ [KẾT NỐI THÀNH CÔNG] Đã kết nối với máy chủ Python Port 8000.');
        loadDefaultData();
      } else {
        showToast(currentLang === 'zh' ? '❌ 无法连接到 127.0.0.1:8000，请先运行 CHAY_GIAO_DIEN_WEB.bat' : '❌ Chưa tìm thấy máy chủ 127.0.0.1:8000. Vui lòng chạy file CHAY_GIAO_DIEN_WEB.bat');
        if (btn) btn.textContent = '🔄 Thử kết nối lại (Retry)';
      }
    }
"""

# Event delegation for CSP-compliant click handling
event_delegation_code = """
    // =========================================================================
    // CSP-COMPLIANT EVENT DELEGATION
    // =========================================================================
    document.addEventListener('click', (e) => {
      if (e.target.closest('#tabBtn1')) { switchTab(1); return; }
      if (e.target.closest('#tabBtn2')) { switchTab(2); return; }
      if (e.target.closest('#btnAppLangVi')) { setAppLang('vi'); return; }
      if (e.target.closest('#btnAppLangZh')) { setAppLang('zh'); return; }
      if (e.target.closest('#btnRetryServerConn')) { retryServerConnection(); return; }

      const copyEl = e.target.closest('[data-copy-id]');
      if (copyEl) {
        copyText(copyEl.getAttribute('data-copy-id'));
        return;
      }
      const openEl = e.target.closest('[data-open-url]');
      if (openEl) {
        const u = openEl.getAttribute('data-open-url');
        if (u && u !== '#') window.open(u, '_blank');
        return;
      }
    });
"""

# Storage check in loadDefaultData
storage_fallback_snippet = """      // Check chrome.storage.local for auto-fill from extension
      if (window.chrome && chrome.storage && chrome.storage.local) {
        try {
          const st = await chrome.storage.local.get(['scrapedFollowers', 'lastHarvestFile']);
          if (st.scrapedFollowers && Array.isArray(st.scrapedFollowers) && st.scrapedFollowers.length > 0 && (!rawFollowers || rawFollowers.length === 0)) {
            appendTerminalLog(`✓ [TỰ ĐỘNG NẠP TỪ EXTENSION] Nhận ${st.scrapedFollowers.length} hồ sơ từ Extension Storage (${st.lastHarvestFile || 'chrome.storage'})!`);
            loadRawRecords(st.scrapedFollowers, st.lastHarvestFile || 'extension_storage.json');
            hasAutoloaded = true;
            showToast(currentLang === 'zh' ? `已从插件自动同步 ${st.scrapedFollowers.length} 份档案！` : `Đã tự động nạp ${st.scrapedFollowers.length} hồ sơ từ Extension!`);
          }
        } catch (stErr) {
          console.warn("Storage read error:", stErr);
        }
      }
"""

# Replace in loadDefaultData
target_in_loaddata = "      // 3. Check URL parameters for Auto-Fill from Extension"
if target_in_loaddata in script_text:
    script_text = script_text.replace(target_in_loaddata, storage_fallback_snippet + "\n" + target_in_loaddata)
    print("Added storage fallback into loadDefaultData")

# Also add checkServerConnection() call at the beginning of loadDefaultData
target_loaddata_start = "    async function loadDefaultData() {\n      // 1. Set bilingual UI from storage"
replacement_loaddata_start = "    async function loadDefaultData() {\n      checkServerConnection();\n      // 1. Set bilingual UI from storage"
if target_loaddata_start in script_text:
    script_text = script_text.replace(target_loaddata_start, replacement_loaddata_start)
    print("Added checkServerConnection call in loadDefaultData")

# Combine script
final_script = server_helper_code + "\n" + script_text + "\n" + event_delegation_code

# Assemble final HTML
final_html = "".join(clean_html_head) + "  <script src=\"dashboard.js\"></script>\n" + "".join(html_tail)

# Write dashboard.js and index.html / dashboard.html to target directories
TARGETS = [
    os.path.join(SYSTEM_ROOT, "web_dashboard"),
    os.path.join(SYSTEM_ROOT, "step1_follower_harvester", "extension"),
    os.path.join(SYSTEM_ROOT, "fb_following_scraper"),
]

for t in TARGETS:
    os.makedirs(t, exist_ok=True)
    # Write dashboard.js
    js_path = os.path.join(t, "dashboard.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(final_script)
    print(f"Wrote {js_path} ({len(final_script)} bytes)")

    # Write HTML file
    if t.endswith("web_dashboard"):
        h_path = os.path.join(t, "index.html")
    else:
        h_path = os.path.join(t, "dashboard.html")
    with open(h_path, "w", encoding="utf-8") as f:
        f.write(final_html)
    print(f"Wrote {h_path} ({len(final_html)} bytes)")

print("All dashboard files successfully generated!")
