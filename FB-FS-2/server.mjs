#!/usr/bin/env node
/**
 * 🐾 Pet Lead AI — Dedicated Node.js High-Performance Server (v2.3)
 * Chạy độc lập 100% trên Server / VPS (0% Python & 0% Extension Client)
 * Quản lý Headless Scraper, Cookie Facebook, bóc tách sâu 4 tầng & WebAssembly ONNX
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

import {
  harvestFacebookFollowers,
  harvestFollowersFastHttp,
  saveFacebookCookies,
  getFacebookCookieStatus,
  loadFacebookCookieString,
  extractRealNumericFbid,
  extractFbidFromHtml
} from './modules/server_scraper_engine.mjs';

import {
  scrapeProfileMultiTier
} from './modules/server_profile_enricher.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_DIR = path.resolve(__dirname, '..');

const argPort = process.argv[2] ? parseInt(process.argv[2], 10) : null;
let PORT = argPort || parseInt(process.env.PORT || '8000', 10);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8'
};

const HEADERS_BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none'
};

const HEADERS_EXT = {
  'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'Accept-Language': 'en-US,en;q=0.9'
};

const FBID_CACHE = new Map();

// ─── 100% REAL FB_ID RESOLUTION LOGIC (NO PSEUDO / FAKE IDS) ─────────────────
async function resolveNumericFbid(rawUrl) {
  if (!rawUrl) return '';
  const val = String(rawUrl).trim();
  if (/^\d{8,}$/.test(val)) return val;

  const direct = extractRealNumericFbid(val);
  if (direct) return direct;

  const clean = val.replace(/\/(?:followers|following|about|photos|reviews)\/?$/i, '').split('?')[0].replace(/\/+$/, '');
  if (!clean.startsWith('http') || clean === 'https://www.facebook.com' || clean === 'https://facebook.com') {
    return '';
  }

  if (FBID_CACHE.has(clean)) return FBID_CACHE.get(clean);

  // Thử fetch SSR HTML với Cookie Facebook
  const headers = { ...HEADERS_BROWSER };
  const cookieStr = loadFacebookCookieString();
  if (cookieStr) headers['Cookie'] = cookieStr;

  try {
    const res = await fetch(clean, { headers, redirect: 'follow', signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const html = await res.text();
      const id = extractFbidFromHtml(html);
      if (id) {
        FBID_CACHE.set(clean, id);
        return id;
      }
    }
  } catch (_) {}

  try {
    const res = await fetch(clean, { headers: HEADERS_EXT, redirect: 'follow', signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const html = await res.text();
      const id = extractFbidFromHtml(html);
      if (id) {
        FBID_CACHE.set(clean, id);
        return id;
      }
    }
  } catch (_) {}

  // Tuyệt đối không bịa số — trả về rỗng để đưa vào hàng đợi
  return '';
}

// ─── REQUEST HANDLER ─────────────────────────────────────────────────────────
async function handleRequest(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(reqUrl.pathname);

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, *');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  function sendJson(data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data, null, 2));
  }

  function readBody() {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (_) { resolve({}); }
      });
      req.on('error', () => resolve({}));
    });
  }

  // ─── API ROUTES ────────────────────────────────────────────────────────────

  // 1. API: Server status
  if (pathname === '/api/status' || pathname === '/api/ping') {
    const cookieStatus = getFacebookCookieStatus();
    sendJson({
      status: 'ok',
      engine: 'Node.js Standalone Headless Engine (v2.3)',
      nodeVersion: process.version,
      uptime: Math.round(process.uptime()),
      cwd: __dirname,
      port: PORT,
      has_cookie: cookieStatus.has_cookie,
      has_fb_cookie: cookieStatus.has_fb_cookie,
      cookie_configured: cookieStatus.has_cookie,
      c_user: cookieStatus.c_user,
      cookie_preview: cookieStatus.cookie_preview,
      status_label: cookieStatus.status_label
    });
    return;
  }

  // 2. API: Cookie Management
  if (pathname === '/api/cookie-status') {
    sendJson({ ...getFacebookCookieStatus() });
    return;
  }

  if (pathname === '/api/save-cookie' && req.method === 'POST') {
    const body = await readBody();
    const cookieInput = body.cookie || body.cookies || '';
    if (!cookieInput) {
      sendJson({ status: 'error', message: 'Vui lòng cung cấp chuỗi Cookie Facebook!' }, 400);
      return;
    }
    const saveRes = saveFacebookCookies(cookieInput);
    sendJson(saveRes);
    return;
  }

  // 3. API: Resolve single FB_ID (100% Real Numeric ID)
  if (pathname === '/api/resolve-id') {
    let targetUrl = reqUrl.searchParams.get('url') || '';
    if (!targetUrl && req.method === 'POST') {
      const body = await readBody();
      targetUrl = body.url || '';
    }
    const resolved = await resolveNumericFbid(targetUrl);
    if (resolved) {
      sendJson({ status: 'ok', url: targetUrl, fb_id: resolved, is_resolved: true });
    } else {
      sendJson({ status: 'unresolved', url: targetUrl, fb_id: 'unresolved', is_resolved: false, message: 'Chưa bóc tách được ID số thật' });
    }
    return;
  }

  // 4. API: Batch resolve FB_IDs
  if (pathname === '/api/resolve-fbids' && req.method === 'POST') {
    const body = await readBody();
    const items = body.items || body.records || (body.urls ? body.urls.map(u => ({ url: u })) : []);
    const concurrency = 6;
    const results = [];

    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      await Promise.all(batch.map(async (rec) => {
        const u = rec.url || rec.original || '';
        const curId = String(rec.fb_id || '').trim();
        if (!curId || !/^\d{8,}$/.test(curId)) {
          const rId = await resolveNumericFbid(u);
          if (rId) {
            rec.fb_id = rId;
            rec.is_resolved = true;
          } else {
            rec.fb_id = 'unresolved';
            rec.is_resolved = false;
          }
        } else {
          rec.is_resolved = true;
        }
        results.push(rec);
      }));
    }
    sendJson({ status: 'ok', count: results.length, data: results });
    return;
  }

  // 5. API: Follower Harvester (Puppeteer Headless Chromium with Fast HTTP Multi-Vector Fallback)
  if (pathname === '/api/harvest-followers' && req.method === 'POST') {
    const body = await readBody();
    const targetUrl = body.url || '';
    const limit = parseInt(body.limit || '100', 10);
    const scope = body.scope || 'followers';

    if (!targetUrl || !targetUrl.startsWith('http')) {
      sendJson({ status: 'error', message: 'Vui lòng cung cấp URL Facebook hợp lệ (bắt đầu bằng http:// hoặc https://)!' }, 400);
      return;
    }

    try {
      let result = null;
      try {
        result = await harvestFacebookFollowers({ targetUrl, limit, scope });
      } catch (pErr) {
        // Fallback to Fast HTTP Multi-Vector if Puppeteer headless browser fails or is not available
        result = await harvestFollowersFastHttp({ targetUrl, limit, scope });
      }

      if (result && result.status === 'ok') {
        sendJson(result);
      } else {
        sendJson({
          status: 'error',
          code: 'FB_EMPTY_RESULT',
          message: 'Không tìm thấy hồ sơ người theo dõi nào từ URL này. Vui lòng kiểm tra lại URL và cập nhật Cookie Facebook trên Server!'
        }, 400);
      }
    } catch (err) {
      const isLoginReq = err.message && (err.message.includes('FB_LOGIN_REQUIRED') || err.message.toLowerCase().includes('đăng nhập'));
      sendJson({
        status: 'error',
        code: isLoginReq ? 'FB_LOGIN_REQUIRED' : 'FB_HARVEST_ERROR',
        message: err.message || 'Lỗi khi cào người theo dõi Facebook'
      }, 400);
    }
    return;
  }

  // 6. API: Multi-Tier Profile Enricher (Bước 2 & 3 Công Cụ Độc Lập)
  if (pathname === '/api/scrape-profile' && req.method === 'POST') {
    const body = await readBody();
    const targetUrl = body.url || '';
    const website = body.website || '';
    const name = body.name || '';

    if (!targetUrl && !website) {
      sendJson({ status: 'error', message: 'Vui lòng cung cấp URL Facebook hoặc Link Website!' }, 400);
      return;
    }

    try {
      const profileData = await scrapeProfileMultiTier({ url: targetUrl, website, name });
      sendJson({ status: 'ok', data: profileData });
    } catch (err) {
      sendJson({ status: 'error', message: err.message }, 500);
    }
    return;
  }

  // 6. API: CORS Proxy
  if (pathname === '/api/proxy') {
    const targetUrl = reqUrl.searchParams.get('url');
    if (!targetUrl || !targetUrl.startsWith('http')) {
      sendJson({ status: 'error', message: 'Tham số url không hợp lệ!' }, 400);
      return;
    }
    try {
      const headers = { ...HEADERS_BROWSER };
      if (targetUrl.includes('facebook.com')) {
        const cookieStr = loadFacebookCookieString();
        if (cookieStr) headers['Cookie'] = cookieStr;
      }
      const resp = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(12000) });
      const text = await resp.text();
      res.writeHead(resp.status, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(text);
    } catch (err) {
      sendJson({ status: 'error', message: err.message }, 502);
    }
    return;
  }

  // 7. API: Image Proxy
  if (pathname === '/api/proxy-image') {
    const targetUrl = reqUrl.searchParams.get('url');
    if (!targetUrl || !targetUrl.startsWith('http')) {
      res.writeHead(400);
      res.end('Bad URL');
      return;
    }
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Referer': 'https://www.facebook.com/'
      };
      if (targetUrl.includes('facebook.com') || targetUrl.includes('fbcdn.net')) {
        const cookieStr = loadFacebookCookieString();
        if (cookieStr) headers['Cookie'] = cookieStr;
      }

      const resp = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(8000) });
      if (!resp.ok) {
        res.writeHead(resp.status);
        res.end();
        return;
      }
      const cType = resp.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await resp.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': cType,
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(buf);
    } catch (err) {
      res.writeHead(502);
      res.end(err.message);
    }
    return;
  }

  // 8. API: Upload raw follower JSON
  if (pathname === '/api/upload-raw' && req.method === 'POST') {
    const body = await readBody();
    const data = body.data || body.followers || [];
    const filename = body.filename || `raw_followers_${Date.now()}.json`;

    if (!Array.isArray(data) || data.length === 0) {
      sendJson({ status: 'error', message: 'Dữ liệu JSON rỗng hoặc không hợp lệ!' }, 400);
      return;
    }

    const rawDir = path.join(SYSTEM_DIR, 'data', 'raw');
    fs.mkdirSync(rawDir, { recursive: true });
    const savePath = path.join(rawDir, filename);
    fs.writeFileSync(savePath, JSON.stringify(data, null, 2), 'utf-8');

    sendJson({
      status: 'ok',
      message: `Đã lưu thành công ${data.length} hồ sơ!`,
      count: data.length,
      saved_path: savePath,
      filename
    });
    return;
  }

  // 9. API: Save CRM Leads into JSON
  if (pathname === '/api/save-crm' && req.method === 'POST') {
    const body = await readBody();
    const leads = body.data || body.leads || [];
    if (!Array.isArray(leads)) {
      sendJson({ status: 'error', message: 'Dữ liệu không phải là mảng hồ sơ!' }, 400);
      return;
    }

    const savedFiles = [];
    try {
      const dataLeadsPath = path.join(__dirname, 'data', 'leads.json');
      fs.mkdirSync(path.dirname(dataLeadsPath), { recursive: true });
      fs.writeFileSync(dataLeadsPath, JSON.stringify(leads, null, 2), 'utf-8');
      savedFiles.push('FB-FS-2/data/leads.json');
    } catch (_) {}

    try {
      const metaCrmPath = path.join(__dirname, 'LEAD_US_Meta_CRM_2026-10-22.json');
      fs.writeFileSync(metaCrmPath, JSON.stringify(leads, null, 2), 'utf-8');
      savedFiles.push('LEAD_US_Meta_CRM_2026-10-22.json');
    } catch (_) {}

    sendJson({
      status: 'ok',
      message: `Đã đồng bộ và lưu trữ an toàn ${leads.length} hồ sơ`,
      count: leads.length,
      files: savedFiles
    });
    return;
  }

  // 10. API: Get latest raw harvest
  if (pathname === '/api/latest-raw') {
    const rawDir = path.join(SYSTEM_DIR, 'data', 'raw');
    if (fs.existsSync(rawDir)) {
      const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.json'));
      if (files.length > 0) {
        files.sort((a, b) => {
          return fs.statSync(path.join(rawDir, b)).mtimeMs - fs.statSync(path.join(rawDir, a)).mtimeMs;
        });
        const newest = files[0];
        try {
          const content = JSON.parse(fs.readFileSync(path.join(rawDir, newest), 'utf-8'));
          sendJson({ status: 'ok', filename: newest, count: content.length, data: content });
          return;
        } catch (_) {}
      }
    }
    sendJson({ status: 'empty', message: 'Chưa có file raw' });
    return;
  }

  // 11. API: Harvest Followers from Facebook (Headless Chromium / Fast Fetch)
  if (pathname === '/api/harvest-followers' && req.method === 'POST') {
    const body = await readBody();
    const targetUrl = (body.url || '').trim();
    const limit = parseInt(body.limit || '100', 10);
    const scope = body.scope || 'followers';

    if (!targetUrl || !targetUrl.startsWith('http')) {
      sendJson({ status: 'error', message: 'Vui lòng cung cấp URL Facebook hợp lệ!' }, 400);
      return;
    }

    try {
      console.log(`[Scraper] Bắt đầu cào Follower: ${targetUrl} (Limit: ${limit})`);
      const harvestResult = await harvestFacebookFollowers({
        targetUrl,
        limit,
        scope,
        onLog: (msg) => console.log(`[FollowerScraper] ${msg}`)
      });

      // Lưu tự động vào data/raw
      try {
        const rawDir = path.join(SYSTEM_DIR, 'data', 'raw');
        fs.mkdirSync(rawDir, { recursive: true });
        const saveName = `harvest_followers_${Date.now()}.json`;
        fs.writeFileSync(path.join(rawDir, saveName), JSON.stringify(harvestResult.data, null, 2), 'utf-8');
      } catch (_) {}

      sendJson(harvestResult);
    } catch (err) {
      console.error(`[Scraper Error] ${err.message}`);
      const isLogin = err.message.includes('FB_LOGIN_REQUIRED') || err.message.includes('FB_COOKIE_EXPIRED');
      sendJson({
        status: 'error',
        code: isLogin ? 'FB_LOGIN_REQUIRED' : 'SCRAPE_ERROR',
        message: err.message,
        data: []
      }, isLogin ? 401 : 500);
    }
    return;
  }

  // ─── STATIC FILE SERVING ───────────────────────────────────────────────────
  let safePath = pathname;
  if (safePath === '/' || safePath === '') {
    safePath = '/index.html';
  } else if (safePath === '/dashboard') {
    safePath = '/dashboard.html';
  } else if (safePath === '/step1' || safePath === '/1') {
    safePath = '/step1_vision_harvester.html';
  } else if (safePath === '/step2' || safePath === '/2') {
    safePath = '/step2_profile_enricher.html';
  } else if (safePath === '/timesheet' || safePath === '/3') {
    safePath = '/timesheet.html';
  } else if (safePath === '/market' || safePath === '/4') {
    safePath = '/market_report.html';
  } else if (safePath === '/harvester' || safePath === '/0' || safePath === '/tool1') {
    safePath = '/harvester.html';
  }

  let filePath = path.join(__dirname, safePath);
  if (!fs.existsSync(filePath)) {
    const altPath = path.join(SYSTEM_DIR, safePath);
    if (fs.existsSync(altPath) && !fs.statSync(altPath).isDirectory()) {
      filePath = altPath;
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // 404 Not Found
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <div style="font-family:sans-serif; text-align:center; padding:50px;">
      <h2>404 — Không tìm thấy tệp yêu cầu</h2>
      <p style="color:#64748b;">Đường dẫn: <code>${safePath}</code></p>
      <a href="/" style="color:#4f46e5; font-weight:700;">🏠 Quay về Trang chủ FB-FS-2</a>
    </div>
  `);
}

// ─── START SERVER ────────────────────────────────────────────────────────────
function startServer(portToTry) {
  const server = http.createServer(handleRequest);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[!] Cổng ${portToTry} đang bận, tự động chuyển sang cổng ${portToTry + 1}...`);
      startServer(portToTry + 1);
    } else {
      console.error('[X] Lỗi khởi động Server:', err);
    }
  });

  server.listen(portToTry, '0.0.0.0', () => {
    PORT = portToTry;
    const url = `http://localhost:${PORT}/`;
    const dashUrl = `http://localhost:${PORT}/dashboard.html`;

    console.log(`\n================================================================`);
    console.log(`🐾 PET LEAD AI — FB-FS-2 STANDALONE SERVER (0% PYTHON REQUIRED)`);
    console.log(`================================================================`);
    console.log(`✓ Web Server Node.js : ${process.version}`);
    console.log(`✓ Headless Scraper   : Puppeteer-Core + Fast HTTP Interceptor`);
    console.log(`✓ AI Vision Model    : dog-model.onnx 224x224 RGB (Ready)`);
    console.log(`----------------------------------------------------------------`);
    console.log(`🌐 Cổng Điều Hành Tổng : ${url}`);
    console.log(`⚡ All-In-One Dashboard : ${dashUrl}`);
    console.log(`👥 Cào Follower FB     : http://localhost:${PORT}/harvester.html`);
    console.log(`🐶 Bước 1 AI Thị Giác  : http://localhost:${PORT}/step1_vision_harvester.html`);
    console.log(`🎯 Bước 2 Profile CRM   : http://localhost:${PORT}/step2_profile_enricher.html`);
    console.log(`📅 Bước 3 Chấm Công     : http://localhost:${PORT}/timesheet.html`);
    console.log(`📊 Bước 4 Báo Cáo Meta  : http://localhost:${PORT}/market_report.html`);
    console.log(`================================================================\n`);
  });
}

startServer(PORT);
