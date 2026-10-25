/**
 * 🐾 Pet Lead AI — Server Scraper Engine (Headless Browser & Fast Fetch)
 * Chạy 100% trên RAM Server, hỗ trợ Puppeteer-Core (Chrome/Edge tự động phát hiện)
 * Quản lý Cookie Facebook, chặn nạp media tiết kiệm 70% RAM, Singleton Browser Pool
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const COOKIE_TXT_PATH = path.join(DATA_DIR, 'fb_cookie.txt');
const COOKIE_JSON_PATH = path.join(DATA_DIR, 'fb_cookies.json');

export function getCookieFileLocations() {
  const list = [
    COOKIE_TXT_PATH,
    path.join(os.tmpdir(), 'fb_cookie.txt'),
    '/tmp/fb_cookie.txt'
  ];
  return [...new Set(list)];
}

let puppeteer = null;
try {
  const pModule = await import('puppeteer-core');
  puppeteer = pModule.default || pModule;
} catch (_) {
  try {
    const pModule = await import('puppeteer');
    puppeteer = pModule.default || pModule;
  } catch (err) {
    // Puppeteer not installed, will use Fast Fetch Engine
  }
}

// ─── BROWSER DETECTION ────────────────────────────────────────────────────────
function findChromeExecutable() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const isWindows = process.platform === 'win32';
  const isLinux = process.platform === 'linux';
  const isMac = process.platform === 'darwin';

  if (isWindows) {
    const winPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe'
    ];
    for (const p of winPaths) {
      if (p && fs.existsSync(p)) return p;
    }
  } else if (isLinux) {
    const linuxPaths = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    ];
    for (const p of linuxPaths) {
      if (fs.existsSync(p)) return p;
    }
  } else if (isMac) {
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ];
    for (const p of macPaths) {
      if (fs.existsSync(p)) return p;
    }
  }

  return null;
}

// ─── COOKIE STORAGE & MANAGEMENT ──────────────────────────────────────────────
export function saveFacebookCookies(cookieInput) {
  let cookieStr = '';
  let cookieArray = [];

  if (typeof cookieInput === 'string') {
    cookieStr = cookieInput.trim();
    // Try parse as JSON
    if (cookieStr.startsWith('[') && cookieStr.endsWith(']')) {
      try {
        cookieArray = JSON.parse(cookieStr);
        cookieStr = cookieArray.map(c => `${c.name}=${c.value}`).join('; ');
      } catch (_) {}
    } else {
      cookieArray = parseCookieStringToPuppeteer(cookieStr);
    }
  } else if (Array.isArray(cookieInput)) {
    cookieArray = cookieInput;
    cookieStr = cookieArray.map(c => `${c.name}=${c.value}`).join('; ');
  }

  // 1. Ghi vào data/fb_cookie.txt và data/fb_cookies.json
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(COOKIE_TXT_PATH, cookieStr, 'utf-8');
    fs.writeFileSync(COOKIE_JSON_PATH, JSON.stringify(cookieArray, null, 2), 'utf-8');
  } catch (_) {}

  // 2. Luôn ghi fallback vào os.tmpdir() và /tmp/ để vượt lỗi Permission Denied trên Linux VPS
  for (const p of getCookieFileLocations()) {
    try {
      const d = path.dirname(p);
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(p, cookieStr, 'utf-8');
    } catch (_) {}
  }

  const cUserMatch = cookieStr.match(/c_user[=:"\s]+(\d+)/i);
  const exists = cookieStr.length > 5;
  return {
    status: 'ok',
    has_cookie: exists,
    has_fb_cookie: exists,
    cookie_configured: exists,
    c_user: cUserMatch ? cUserMatch[1] : null,
    cookie_preview: cookieStr.substring(0, 35) + (cookieStr.length > 35 ? '...' : ''),
    status_label: exists ? ('✓ Đã có Cookie trên Server' + (cUserMatch ? ` (UID: ${cUserMatch[1]})` : '')) : '⚠️ Chưa có Cookie',
    message: 'Đã lưu Cookie Facebook lên Server thành công!',
    total_cookies: cookieArray.length,
    updated_at: new Date().toISOString()
  };
}

export function loadFacebookCookies() {
  if (fs.existsSync(COOKIE_JSON_PATH)) {
    try {
      const arr = JSON.parse(fs.readFileSync(COOKIE_JSON_PATH, 'utf-8'));
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch (_) {}
  }

  const str = loadFacebookCookieString();
  if (str) return parseCookieStringToPuppeteer(str);

  return [];
}

export function normalizeFacebookCookieString(raw) {
  if (!raw) return '';
  const str = String(raw).trim();
  if ((str.startsWith('[') && str.endsWith(']')) || (str.startsWith('{') && str.endsWith('}'))) {
    try {
      const parsed = JSON.parse(str);
      const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.cookies) ? parsed.cookies : null);
      if (items) {
        const parts = items.filter(c => c && (c.name || c.key) && c.value !== undefined).map(c => `${c.name || c.key}=${c.value}`);
        if (parts.length > 0) return parts.join('; ');
      } else if (typeof parsed === 'object') {
        const parts = Object.entries(parsed).filter(([k, v]) => k && typeof v !== 'object').map(([k, v]) => `${k}=${v}`);
        if (parts.length > 0) return parts.join('; ');
      }
    } catch (_) {}
  }
  return str;
}

export function unescapeFacebookCometHtml(html) {
  if (!html) return '';
  let s = html.replace(/\\\//g, '/');
  s = s.replace(/\\u0025/g, '%')
       .replace(/\\u0026/g, '&')
       .replace(/\\u003C/g, '<')
       .replace(/\\u003E/g, '>')
       .replace(/\\u003D/g, '=')
       .replace(/\\u003F/g, '?')
       .replace(/\\u0022/g, '"')
       .replace(/\\u0027/g, "'")
       .replace(/\\u002F/g, '/')
       .replace(/\\u005C/g, '\\')
       .replace(/&amp;/g, '&')
       .replace(/&quot;/g, '"');
  s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return s;
}

export function loadFacebookCookieString() {
  for (const p of getCookieFileLocations()) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8').trim();
        if (content.length > 0) return normalizeFacebookCookieString(content);
      }
    } catch (_) {}
  }
  return '';
}

export function getFacebookCookieStatus() {
  const cookieStr = loadFacebookCookieString();
  const cUserMatch = cookieStr.match(/c_user[=:"\s]+(\d+)/i);
  const xsMatch = cookieStr.match(/\bxs=([^;]+)/i);
  const exists = cookieStr.length > 5;

  let mtime = null;
  for (const p of getCookieFileLocations()) {
    try {
      if (fs.existsSync(p)) {
        mtime = fs.statSync(p).mtime.toISOString();
        break;
      }
    } catch (_) {}
  }

  return {
    status: 'ok',
    has_cookie: exists,
    has_fb_cookie: exists,
    cookie_configured: exists,
    c_user: cUserMatch ? cUserMatch[1] : null,
    has_xs: !!xsMatch,
    length: cookieStr.length,
    cookie_preview: cookieStr.substring(0, 35) + (cookieStr.length > 35 ? '...' : ''),
    status_label: exists ? ('✓ Đã có Cookie trên Server' + (cUserMatch ? ` (UID: ${cUserMatch[1]})` : '')) : '⚠️ Chưa có Cookie',
    updated_at: mtime
  };
}

function parseCookieStringToPuppeteer(cookieInput) {
  if (!cookieInput) return [];
  if (Array.isArray(cookieInput)) {
    return cookieInput.filter(c => c && c.name && c.value !== undefined).map(c => ({
      name: String(c.name).trim(),
      value: String(c.value).trim(),
      domain: c.domain || '.facebook.com',
      path: c.path || '/',
      httpOnly: c.httpOnly || c.name === 'xs' || c.name === 'fr',
      secure: c.secure !== undefined ? c.secure : true
    }));
  }
  const str = String(cookieInput).trim();
  if (str.startsWith('[') && str.endsWith(']')) {
    try {
      const arr = JSON.parse(str);
      if (Array.isArray(arr)) {
        return parseCookieStringToPuppeteer(arr);
      }
    } catch (_) {}
  }
  const list = [];
  const parts = str.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const name = trimmed.substring(0, eqIdx).trim();
      const value = trimmed.substring(eqIdx + 1).trim();
      list.push({
        name,
        value,
        domain: '.facebook.com',
        path: '/',
        httpOnly: name === 'xs' || name === 'fr',
        secure: true
      });
    }
  }
  return list;
}

// ─── SINGLETON BROWSER POOL ──────────────────────────────────────────────────
let browserInstance = null;
let browserIdleTimer = null;
let activePages = 0;
const MAX_CONCURRENT_PAGES = 3;

async function getBrowser() {
  if (!puppeteer) return null;

  if (browserInstance && browserInstance.isConnected()) {
    if (browserIdleTimer) clearTimeout(browserIdleTimer);
    return browserInstance;
  }

  const execPath = findChromeExecutable();
  if (!execPath) {
    console.warn('⚠️ [ServerScraper] Không tìm thấy executable Chrome/Edge trên Server!');
    return null;
  }

  console.log(`🚀 [ServerScraper] Khởi chạy Headless Chromium: ${execPath}`);
  browserInstance = await puppeteer.launch({
    executablePath: execPath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--mute-audio',
      '--no-first-run',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--window-size=1280,800'
    ]
  });

  browserInstance.on('disconnected', () => {
    browserInstance = null;
  });

  return browserInstance;
}

function scheduleBrowserIdleClose() {
  if (activePages <= 0) {
    if (browserIdleTimer) clearTimeout(browserIdleTimer);
    browserIdleTimer = setTimeout(async () => {
      if (activePages <= 0 && browserInstance && browserInstance.isConnected()) {
        console.log('💤 [ServerScraper] Đóng Browser Singleton sau 5 phút không có tác vụ để giải phóng RAM');
        try { await browserInstance.close(); } catch (_) {}
        browserInstance = null;
      }
    }, 5 * 60 * 1000);
  }
}

// ─── REAL NUMERIC FB_ID EXTRACTION ───────────────────────────────────────────
export function extractRealNumericFbid(input) {
  if (!input) return '';
  const s = String(input).trim();
  if (/^\d{8,}$/.test(s)) return s;

  const mSet = s.match(/set=(?:pb|a|ecnf|pcb)\.(\d{8,})/i);
  if (mSet) return mSet[1];
  const mId = s.match(/[?&]id=(\d{8,})/i);
  if (mId) return mId[1];
  const mProf = s.match(/profile\.php\?id=(\d{8,})/i);
  if (mProf) return mProf[1];
  const mPpl = s.match(/facebook\.com\/people\/[^/]+\/(\d{8,})/i);
  if (mPpl) return mPpl[1];
  const mP = s.match(/facebook\.com\/p\/[^/]+-(\d{8,})/i);
  if (mP) return mP[1];
  const mNum = s.match(/facebook\.com\/(\d{10,})\/?(?:\?|$)/i);
  if (mNum) return mNum[1];
  const mFb = s.match(/fb:\/\/(?:profile|page)\/(\d{8,})/i);
  if (mFb) return mFb[1];
  return '';
}

export function extractFbidFromHtml(html) {
  if (!html) return '';
  const direct = extractRealNumericFbid(html);
  if (direct) return direct;

  const mMeta = html.match(/<meta[^>]+content=["']fb:\/\/(?:page|profile)\/(\d{8,})["']/i);
  if (mMeta) return mMeta[1];

  const rxJson = /"(?:page_id|entity_id|userID|delegate_page_id|target_id)"\s*:\s*"?(\d{8,})"?/g;
  let match;
  while ((match = rxJson.exec(html)) !== null) {
    if (match[1] && match[1] !== '0' && match[1].length >= 8) return match[1];
  }
  return '';
}

// ─── HARVEST FOLLOWERS (HEADLESS CHROMIUM + GRAPHQL + SCROLL) ────────────────
export async function harvestFacebookFollowers({
  targetUrl,
  limit = 100,
  scope = 'followers',
  onLog = () => {}
}) {
  const cleanTarget = String(targetUrl || '').trim();
  if (!cleanTarget.startsWith('http')) {
    throw new Error('Vui lòng cung cấp URL Facebook hợp lệ (bắt đầu bằng http/https)!');
  }

  const cookieStatus = getFacebookCookieStatus();
  const cookies = loadFacebookCookies();

  onLog(`🌐 Chuẩn bị cào: ${cleanTarget}`);
  onLog(`🔑 Trạng thái Cookie Server: ${cookieStatus.status_label}`);

  const browser = await getBrowser();
  if (!browser) {
    onLog('⚡ Không có Headless Chrome, chuyển sang Fast HTTP Fetch Engine...');
    return harvestFollowersFastHttp({ targetUrl: cleanTarget, limit, scope, onLog });
  }

  if (activePages >= MAX_CONCURRENT_PAGES) {
    throw new Error(`Server đang xử lý ${activePages} tác vụ cào. Vui lòng thử lại sau giây lát!`);
  }

  activePages++;
  let page = null;
  const results = [];
  const seenIds = new Set();
  const seenUrls = new Set();
  let hostTitle = '';

  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // 1. Chặn media để tiết kiệm 70% RAM
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const rType = req.resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(rType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // 2. Lắng nghe GraphQL response của Facebook
    page.on('response', async (res) => {
      try {
        const u = res.url();
        if (u.includes('/api/graphql/') || u.includes('/graphql')) {
          const contentType = res.headers()['content-type'] || '';
          if (contentType.includes('json') || contentType.includes('javascript') || contentType.includes('text')) {
            const text = await res.text();
            parseFacebookGraphqlPayload(text, results, seenIds, seenUrls, limit, hostTitle, scope);
          }
        }
      } catch (_) {}
    });

    // 3. Nạp Cookie Facebook
    if (cookies.length > 0) {
      await page.setCookie(...cookies);
      onLog(`🍪 Đã nạp ${cookies.length} cookie Facebook vào phiên Headless`);
    }

    // 4. Mở trang mục tiêu
    onLog(`🚀 Đang tải trang: ${cleanTarget}`);
    await page.goto(cleanTarget, { waitUntil: 'domcontentloaded', timeout: 35000 });

    const currentUrl = page.url();
    hostTitle = await page.title();
    hostTitle = hostTitle.replace(/\s*\|\s*Facebook.*$/i, '').trim();
    onLog(`📄 Tiêu đề trang nguồn: "${hostTitle}"`);

    if (currentUrl.includes('/login') || currentUrl.includes('checkpoint') || /log in|đăng nhập/i.test(hostTitle)) {
      if (!cookieStatus.has_cookie) {
        throw new Error('FB_LOGIN_REQUIRED: Facebook yêu cầu đăng nhập. Vui lòng dán Cookie Facebook vào ô "🔑 Cấu hình Cookie Facebook trên Server" trên giao diện!');
      } else {
        throw new Error('FB_COOKIE_EXPIRED: Cookie Facebook trên Server đã hết hạn. Vui lòng cập nhật Cookie mới!');
      }
    }

    // Chờ 2 giây để nạp khung danh sách ban đầu
    await new Promise(r => setTimeout(r, 2000));

    // 5. Vòng lặp tự động cuộn trang và đọc DOM
    let noNewCount = 0;
    let lastCount = 0;
    const maxScrolls = Math.max(15, Math.ceil(limit / 5));

    for (let i = 1; i <= maxScrolls; i++) {
      if (limit > 0 && results.length >= limit) break;

      // Đọc DOM trực tiếp trong trang
      const domProfiles = await page.evaluate(() => {
        const items = [];
        const scopeContainer = document.querySelector('div[role="dialog"]') || document.querySelector('div[role="main"]') || document.body;
        const anchors = scopeContainer.querySelectorAll('a[role="link"], a[href*="facebook.com/"], a[href^="/"]');

        for (const a of anchors) {
          const href = a.getAttribute('href') || '';
          if (!href || href === '#' || href.startsWith('javascript:')) continue;
          const fullUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
          const cleanU = fullUrl.split('?')[0].replace(/\/+$/, '');
          if (cleanU === 'https://www.facebook.com' || cleanU === 'http://www.facebook.com') continue;
          if (/(?:stories|posts|watch|groups|pages|events|photo|hashtag|share|policies|login|recover|reg|privacy|help|about|feed)\b/i.test(href)) {
            continue;
          }

          const text = (a.innerText || a.textContent || '').trim();
          if (/^(Facebook|Go to Feed|Bảng feed|Log In|Sign Up|Đăng nhập|Đăng ký|Home|Trang chủ|Menu)$/i.test(text)) continue;
          if (text.length > 1 && text.length < 70 && !text.includes('\n')) {
            // Thử tìm avatar trong thẻ cha
            let avatar = '';
            const parentCard = a.closest('div[data-visualcompletion="ignore-dynamic-snippet"]') || a.closest('div[role="listitem"]') || a.parentElement;
            if (parentCard) {
              const img = parentCard.querySelector('img, svg image');
              if (img) avatar = img.getAttribute('src') || img.getAttribute('xlink:href') || '';
            }

            items.push({
              name: text,
              url: fullUrl.split('?')[0],
              raw_href: fullUrl,
              avatar_url: avatar
            });
          }
        }
        return items;
      });

      // Bổ sung các profile tìm được từ DOM
      for (const p of domProfiles) {
        if (limit > 0 && results.length >= limit) break;
        const cleanUrl = p.url.replace(/\/+$/, '');
        if (seenUrls.has(cleanUrl)) continue;

        const numId = extractRealNumericFbid(p.raw_href) || extractRealNumericFbid(p.url);
        if (numId && seenIds.has(numId)) continue;

        seenUrls.add(cleanUrl);
        if (numId) seenIds.add(numId);

        results.push({
          stt: results.length + 1,
          name: p.name,
          fb_id: numId || 'unresolved',
          url: cleanUrl,
          avatar_url: p.avatar_url || (numId ? `https://graph.facebook.com/${numId}/picture?type=large` : ''),
          subtitle: scope === 'following' ? 'Đang theo dõi' : 'Người theo dõi',
          bio: `Facebook follower from ${hostTitle || cleanTarget}`,
          category: 'Dog Breeder / Commercial Kennel',
          keywords_found: ['dog', 'breeder', 'puppy'],
          scraped_at: new Date().toISOString()
        });
      }

      onLog(`⏳ Cuộn trang lần ${i}/${maxScrolls} — Đã thu thập: ${results.length}/${limit} hồ sơ`);

      if (results.length === lastCount) {
        noNewCount++;
        if (noNewCount >= 4) {
          onLog('ℹ️ Đã cuộn hết danh sách người theo dõi hoặc không nạp thêm.');
          break;
        }
      } else {
        noNewCount = 0;
        lastCount = results.length;
      }

      // Cuộn trang
      await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (dialog) {
          dialog.scrollBy(0, 900);
        } else {
          window.scrollBy(0, 900);
        }
      });

      await new Promise(r => setTimeout(r, 1000 + Math.floor(Math.random() * 800)));
    }

    onLog(`✅ Hoàn thành cào Headless: Đạt ${results.length} hồ sơ thực tế!`);
    return {
      status: 'ok',
      count: results.length,
      data: results,
      host_title: hostTitle,
      engine: 'Puppeteer Headless Chromium Network/DOM'
    };

  } finally {
    activePages--;
    if (page) {
      try { await page.close(); } catch (_) {}
    }
    scheduleBrowserIdleClose();
  }
}

// ─── PARSE FACEBOOK GRAPHQL JSON PAYLOAD ──────────────────────────────────────
function parseFacebookGraphqlPayload(text, results, seenIds, seenUrls, limit, hostTitle, scope) {
  if (!text) return;
  try {
    // Trích xuất các đối tượng user từ text phản hồi GraphQL
    const userRegex = /"id"\s*:\s*"(\d{8,})"[^}]*?"name"\s*:\s*"([^"]+)"/g;
    let m;
    while ((m = userRegex.exec(text)) !== null) {
      if (limit > 0 && results.length >= limit) break;
      const fbid = m[1];
      const name = m[2];
      if (fbid && !seenIds.has(fbid)) {
        seenIds.add(fbid);
        const profileUrl = `https://www.facebook.com/${fbid}`;
        seenUrls.add(profileUrl);

        results.push({
          stt: results.length + 1,
          name: name.replace(/\\u[\dA-F]{4}/gi, (match) => String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16))),
          fb_id: fbid,
          url: profileUrl,
          avatar_url: `https://graph.facebook.com/${fbid}/picture?type=large`,
          subtitle: scope === 'following' ? 'Đang theo dõi' : 'Người theo dõi',
          bio: `Facebook follower from ${hostTitle || 'Facebook'}`,
          category: 'Dog Breeder / Commercial Kennel',
          keywords_found: ['dog', 'breeder', 'puppy'],
          scraped_at: new Date().toISOString()
        });
      }
    }
  } catch (_) {}
}

// ─── FAST HTTP SCRAPER (FALLBACK CHO SERVER KHÔNG CHẠY ĐƯỢC CHROME) ───────────
export async function harvestFollowersFastHttp({ targetUrl, limit = 100, scope = 'followers', onLog = () => {} }) {
  const cookieStr = loadFacebookCookieString();
  const cUserMatch = cookieStr.match(/c_user[=:"\s]+(\d+)/i);
  const selfCUser = cUserMatch ? cUserMatch[1] : '';

  // Bóc tách slug hoặc profile ID từ target URL
  let cleanSlug = '';
  let hostNumericId = '';
  const mProfId = targetUrl.match(/facebook\.com\/profile\.php\?id=(\d+)/i);
  if (mProfId) {
    cleanSlug = `profile.php?id=${mProfId[1]}`;
    hostNumericId = mProfId[1];
  } else {
    const mSlug = targetUrl.match(/facebook\.com\/([a-zA-Z0-9.\-_]+)/i);
    if (mSlug) cleanSlug = mSlug[1];
  }

  const vParam = scope === 'following' ? 'following' : 'followers';
  const urlsToFetch = [targetUrl];
  if (cleanSlug) {
    if (cleanSlug.includes('profile.php')) {
      urlsToFetch.push(`https://mbasic.facebook.com/${cleanSlug}&v=${vParam}`);
    } else {
      urlsToFetch.push(`https://mbasic.facebook.com/${cleanSlug}?v=${vParam}`);
      urlsToFetch.push(`https://mbasic.facebook.com/${cleanSlug}/${vParam}`);
    }
    const mainDesk = targetUrl.replace(/\/(followers|following)\/?$/i, '');
    if (mainDesk !== targetUrl) {
      urlsToFetch.push(mainDesk);
    }
  }

  const headersDesktop = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none'
  };
  if (cookieStr) headersDesktop['Cookie'] = cookieStr;

  const headersMobile = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8'
  };
  if (cookieStr) headersMobile['Cookie'] = cookieStr;

  onLog(`[*] Bắt đầu Fast Fetch song song ${urlsToFetch.length} kênh (Desktop Comet + Mobile mbasic)...`);

  const fetchPromises = [...new Set(urlsToFetch)].map(async (u) => {
    try {
      const isMobile = u.includes('mbasic.facebook.com');
      const res = await fetch(u, {
        headers: isMobile ? headersMobile : headersDesktop,
        redirect: 'follow',
        signal: AbortSignal.timeout(18000)
      });
      const html = await res.text();
      return { url: res.url || u, html };
    } catch (_) {
      return null;
    }
  });

  const settled = await Promise.allSettled(fetchPromises);
  const pages = settled.filter(s => s.status === 'fulfilled' && s.value).map(s => s.value);

  const results = [];
  const seenIds = new Set();
  const seenUrls = new Set();
  let hostTitle = '';

  const addProfile = (rawId, vanity, name, url) => {
    if (limit > 0 && results.length >= limit) return;
    const id = String(rawId || '').trim();
    const van = String(vanity || '').trim();
    let nm = String(name || '').trim();
    let u = String(url || '').trim();

    if (id && (id === selfCUser || id === hostNumericId)) return;
    if (van && van.toLowerCase() === hostNumericId.toLowerCase()) return;

    if (/^(stories|posts|watch|groups|pages|events|photo|hashtag|share|policies|login|recover|reg|privacy|help|about|friends|followers|following|notifications|feed|home|menu)$/i.test(van)) return;
    if (/^(Facebook|Meta|Log In|Sign Up|Đăng nhập|Đăng ký|Bảng feed|Go to Feed|Notifications|Menu|Trang chủ)$/i.test(nm)) return;

    let finalId = id;
    if (!finalId && u) {
      finalId = extractRealNumericFbid(u);
    }
    if (!u) {
      u = finalId ? `https://www.facebook.com/profile.php?id=${finalId}` : (van ? `https://www.facebook.com/${van}` : '');
    }
    if (!u) return;

    const cleanUrl = u.split('?')[0].replace(/\/+$/, '');
    const idKey = finalId || van || cleanUrl;

    if (seenIds.has(idKey) || seenUrls.has(cleanUrl)) return;
    seenIds.add(idKey);
    seenUrls.add(cleanUrl);

    if (!nm) {
      nm = van ? van.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : (finalId ? `Facebook User ${finalId.slice(-4)}` : 'Facebook Follower');
    }

    results.push({
      stt: results.length + 1,
      name: nm,
      fb_id: finalId || 'unresolved',
      url: cleanUrl,
      avatar_url: finalId && finalId !== 'unresolved' ? `https://graph.facebook.com/${finalId}/picture?type=large` : '',
      subtitle: scope === 'following' ? 'Đang theo dõi' : 'Người theo dõi',
      bio: `Facebook follower from ${hostTitle || 'Facebook Page'}`,
      category: 'Dog Breeder / Commercial Kennel',
      keywords_found: ['dog', 'breeder', 'puppy'],
      scraped_at: new Date().toISOString()
    });
  };

  for (const page of pages) {
    const raw = page.html;
    if (!hostTitle) {
      const tm = raw.match(/<title[^>]*>(.*?)<\/title>/i);
      if (tm) hostTitle = tm[1].replace(/\s*\|\s*Facebook.*$/i, '').trim();
    }

    // BƯỚC 1: Giải mã escape HTML & Unicode
    const clean = unescapeFacebookCometHtml(raw);

    // VECTOR A: Relay JSON Entity Nodes ("id":"\d+","name":"...")
    const regNode1 = /"(?:user|profile|page|actor)"\s*:\s*\{"id"\s*:\s*"(\d{8,20})"[^}]*?"name"\s*:\s*"([^"\\]{2,80})"/gi;
    let mA1;
    while ((mA1 = regNode1.exec(clean)) !== null) {
      addProfile(mA1[1], '', mA1[2], `https://www.facebook.com/profile.php?id=${mA1[1]}`);
    }

    const regNode2 = /"id"\s*:\s*"(\d{8,20})"\s*,\s*"name"\s*:\s*"([^"\\]{2,80})"/gi;
    let mA2;
    while ((mA2 = regNode2.exec(clean)) !== null) {
      addProfile(mA2[1], '', mA2[2], `https://www.facebook.com/profile.php?id=${mA2[1]}`);
    }

    const regNode3 = /"name"\s*:\s*"([^"\\]{2,80})"\s*,\s*"id"\s*:\s*"(\d{8,20})"/gi;
    let mA3;
    while ((mA3 = regNode3.exec(clean)) !== null) {
      addProfile(mA3[2], '', mA3[1], `https://www.facebook.com/profile.php?id=${mA3[2]}`);
    }

    // VECTOR B: Collection Title/URL ("title":{"text":"..."} ... "url":"https://...")
    const regColl1 = /"title"\s*:\s*\{\s*"text"\s*:\s*"([^"]{2,80})"\s*\}.*?"url"\s*:\s*"(https?:\/\/(?:www\.|m\.)?facebook\.com\/[^"]+)"/gis;
    let mB1;
    while ((mB1 = regColl1.exec(clean)) !== null) {
      addProfile('', '', mB1[1], mB1[2]);
    }

    const regColl2 = /"url"\s*:\s*"(https?:\/\/(?:www\.|m\.)?facebook\.com\/[^"]+)".*?"title"\s*:\s*\{\s*"text"\s*:\s*"([^"]{2,80})"\s*\}/gis;
    let mB2;
    while ((mB2 = regColl2.exec(clean)) !== null) {
      addProfile('', '', mB2[2], mB2[1]);
    }

    // VECTOR C: DOM & mbasic Anchors
    const regAnchor1 = /href="(?:https?:\/\/(?:www\.|m\.|mbasic\.)?facebook\.com)?\/(?:profile\.php\?id=(\d+)|([a-zA-Z0-9.\-_]{5,}))[^"]*"[^>]*>([^<]{2,80})<\/a>/gi;
    let mC1;
    while ((mC1 = regAnchor1.exec(clean)) !== null) {
      addProfile(mC1[1], mC1[2], mC1[3].replace(/<[^>]+>/g, '').trim(), '');
    }

    const regAnchor2 = /href="(?:https?:\/\/(?:www\.|m\.|mbasic\.)?facebook\.com)?\/(?:profile\.php\?id=(\d+)|([a-zA-Z0-9.\-_]{5,}))[^"]*"/gi;
    let mC2;
    while ((mC2 = regAnchor2.exec(clean)) !== null) {
      addProfile(mC2[1], mC2[2], '', '');
    }
  }

  if (results.length === 0) {
    throw new Error('FB_EMPTY_RESULT: Không tìm thấy hồ sơ người theo dõi nào từ URL này. Vui lòng kiểm tra lại URL (phải là đường dẫn trang cá nhân hoặc fanpage có đuôi /followers hoặc /following) và cập nhật Cookie Facebook!');
  }

  return {
    status: 'ok',
    count: results.length,
    data: results,
    host_title: hostTitle,
    engine: 'Fast Multi-Vector Comet & mbasic Engine'
  };
}
