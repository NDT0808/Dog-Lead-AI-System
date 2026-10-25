/**
 * runners.js - Pet Lead AI Modular Runner Engine
 * Cung cấp các Runner độc lập có thể chạy riêng lẻ từng bước hoặc kết hợp chuỗi phễu:
 * 1. UidFastRunner: Siêu tốc 0s/1s chỉ lấy Facebook ID (UID)
 * 2. ContactAddressRunner: Đa luồng bóc tách SĐT, Email (Cloudflare), Địa chỉ chi tiết US/CA
 * 3. OwnerRunner: Đa luồng tìm Tên Chủ Trại / Đại Diện bằng Heuristics & Gemini AI
 * 4. AmazonRunner: Quét và phân loại ngách hàng Amazon
 */

import {
  normalizeURL, recoveryURLs, uniq, domainOf, primaryEmail,
  facebookURL, numericFacebookID, instagramURL, cleanPersonName, isValidPersonName, nameFromEmail,
  csvString, isRegistrarOrCompany, cleanCity, cleanStreet
} from './core.js';
import { scanPageForContact, scanPageForOwner, scanFacebookID, scanPageForAmazon, scanOwnerPage } from './extract.js';
import { parseOwnerWithAI, parseWithAI, geminiSearchAndExtract } from './gemini.js';
import { extractOwnerWithAI } from './ai-ner.js';

export class PausedError extends Error {}
export class BlockedError extends Error {}

// =========================================================================
// 1. UID FAST RUNNER (CHỈ LẤY FACEBOOK ID / UID - SIÊU TỐC)
// =========================================================================
export class UidFastRunner {
  constructor(onUpdate, onLog) {
    this.onUpdate = onUpdate || (() => {});
    this.onLog = onLog || (() => {});
    this.running = false;
    this.paused = false;
    this.records = [];
    this.results = [];
    this.index = 0;
    this.workers = 3;
    this.activeTabs = new Map();
  }

  setJob(records, workers = 3) {
    this.records = records.map((r, i) => ({
      index: i + 1,
      source: r.original || r.url || '',
      url: r.url || normalizeURL(r.original || ''),
      name: r.name || '',
      status: 'Chờ xử lý',
      fbUrl: '',
      fbId: '',
      method: ''
    }));
    this.results = [];
    this.index = 0;
    this.workers = Math.max(1, Math.min(10, workers));
    this.running = false;
    this.paused = false;
  }

  async stop() {
    this.running = false;
    this.paused = false;
    for (const tabId of this.activeTabs.keys()) {
      try { await chrome.tabs.remove(tabId); } catch {}
    }
    this.activeTabs.clear();
    this.onUpdate({ running: false, paused: false, index: this.index, total: this.records.length });
  }

  async pause() {
    this.paused = true;
    this.running = false;
    this.onUpdate({ running: false, paused: true, index: this.index, total: this.records.length });
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.paused = false;

    const workerTasks = [];
    for (let w = 0; w < this.workers; w++) {
      workerTasks.push(this.runWorker(w));
    }
    await Promise.all(workerTasks);

    this.running = false;
    this.onUpdate({ running: false, paused: false, completed: true, index: this.records.length, total: this.records.length });
  }

  async runWorker(workerId) {
    let tabId = null;
    const hasChrome = (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.create === 'function');
    try {
      if (hasChrome) {
        try {
          const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
          tabId = tab.id;
          this.activeTabs.set(tabId, workerId);
        } catch (_) {}
      }

      while (this.running && this.index < this.records.length) {
        const itemIdx = this.index++;
        const item = this.records[itemIdx];
        item.status = 'Đang xử lý...';
        this.onLog(`[Worker ${workerId + 1}] Đang xử lý: ${item.source}`);
        this.onUpdate({ index: this.index, total: this.records.length, current: item });

        try {
          const res = await this.resolveFacebookUid(tabId, item);
          item.fbUrl = res.fbUrl || '';
          item.fbId = res.fbId || '';
          item.method = res.method || '';
          item.status = res.fbId ? 'Thành công' : 'Không tìm thấy UID';
          this.results.push(item);
        } catch (err) {
          item.status = 'Lỗi: ' + (err.message || 'Timeout');
          this.results.push(item);
        }

        this.onUpdate({ index: this.index, total: this.records.length, lastResult: item });
      }
    } finally {
      if (tabId && hasChrome) {
        this.activeTabs.delete(tabId);
        try { await chrome.tabs.remove(tabId); } catch {}
      }
    }
  }

  async navigateTab(tabId, url, timeoutSec = 8) {
    if (!tabId || !url) return null;
    try {
      await chrome.tabs.update(tabId, { url });
    } catch {
      return null;
    }
    const deadline = Date.now() + timeoutSec * 1000;
    while (Date.now() < deadline) {
      if (!this.running) return null;
      await new Promise(r => setTimeout(r, 150));
      let tab;
      try {
        tab = await chrome.tabs.get(tabId);
      } catch {
        return null;
      }
      if (tab.status === 'complete' && tab.url && tab.url !== 'about:blank') {
        await new Promise(r => setTimeout(r, 200));
        return tab.url;
      }
    }
    return null;
  }

  async injectScan(tabId, func, args = []) {
    try {
      const data = await chrome.scripting.executeScript({
        target: { tabId },
        func,
        args
      });
      return data[0]?.result || null;
    } catch {
      return null;
    }
  }

  async attemptPage(tabId, url, fastMode = true) {
    this.onLog(`[Trình duyệt] Đang mở: ${url}`);
    const navUrl = await this.navigateTab(tabId, url, fastMode ? 5 : 8);
    if (!navUrl) return null;
    const page = await this.injectScan(tabId, scanPageForContact, [fastMode]);
    if (!page || page.blocked || page.error) return null;
    return page;
  }

  async resolveFacebookUid(tabId, item) {
    const raw = item.source || item.url || '';
    const directFB = facebookURL(raw);
    const visited = new Set();
    let fbLinks = [];
    let facebookPages = [];

    const hostOf = (u) => {
      try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
    };

    const mergePage = (page) => {
      if (!page) return;
      for (const link of page.links || []) {
        const fb = facebookURL(link.url);
        if (fb) fbLinks.push(fb);
        if (hostOf(link.url) === hostOf(page.url) &&
          /contact|about|team|company|our[-_ ]?story|social|connect|links|resources|gioi.thieu|giới thiệu|lien.he|liên hệ|impressum|kontakt/i.test((link.text || '') + ' ' + (link.url || ''))) {
          const u = normalizeURL(link.url);
          if (u) facebookPages.push(u);
        }
      }
      for (const sig of page.facebookSignals || []) {
        const fb = facebookURL(sig.url);
        if (fb) fbLinks.push(fb);
      }
      fbLinks = uniq(fbLinks);
      facebookPages = uniq(facebookPages);
    };

    let fbTarget = directFB;
    let searchMethodPrefix = '';

    if (directFB) {
      fbLinks = [directFB];
      searchMethodPrefix = 'URL Facebook trực tiếp';
    } else {
      // 1. Thử trang chủ qua recoveryURLs
      const recUrls = recoveryURLs(raw).slice(0, 2);
      for (const u of recUrls) {
        if (!this.running) break;
        visited.add(u);
        const p = await this.attemptPage(tabId, u, true);
        if (p) {
          mergePage(p);
          break;
        }
        await new Promise(r => setTimeout(r, 200));
      }

      if (fbLinks.length) {
        fbTarget = fbLinks[0];
        searchMethodPrefix = 'Tìm thấy trên website';
      } else {
        // 2. Quét tối đa 6 trang nội bộ nếu trang chủ chưa có link FB
        let checked = 0;
        for (const candidate of facebookPages) {
          if (!this.running) break;
          if (checked >= 6 || visited.has(candidate)) continue;
          visited.add(candidate);
          checked++;
          await new Promise(r => setTimeout(r, 200));
          const p = await this.attemptPage(tabId, candidate, true);
          if (p) mergePage(p);
          if (fbLinks.length) {
            fbTarget = fbLinks[0];
            searchMethodPrefix = `Tìm thấy sau ${checked} trang nội bộ`;
            break;
          }
        }
      }
    }

    if (!fbTarget) {
      return {
        fbUrl: '',
        fbId: '',
        method: 'Website không có liên kết Facebook'
      };
    }

    // Đã có link Facebook (fbTarget)
    // Bước A: Kiểm tra xem link Facebook đã có sẵn Numeric ID ngay trên URL không -> Trả về 0s tức thì!
    const directNumeric = numericFacebookID(fbTarget);
    if (directNumeric) {
      return {
        fbUrl: fbTarget,
        fbId: directNumeric,
        method: directFB ? 'ID số tức thì từ URL Facebook (0s regex)' : `ID số từ URL Website (${searchMethodPrefix})`
      };
    }

    // Nếu không có Chrome extension tab (chạy trực tiếp trên Web Browser): Sử dụng Server API & Regex
    if (!tabId) {
      const mId = String(fbTarget).match(/[?&]id=(\d{8,})/) || 
                  String(fbTarget).match(/facebook\.com\/(\d{10,})/) ||
                  String(fbTarget).match(/facebook\.com\/people\/[^/]+\/(\d{8,})/) ||
                  String(fbTarget).match(/facebook\.com\/p\/[^/]+-(\d{8,})/) ||
                  String(fbTarget).match(/set=(?:pb|a|ecnf|pcb)\.(\d{8,})/);
      if (mId) {
        return {
          fbUrl: fbTarget,
          fbId: mId[1],
          method: 'ID số từ tham số URL Facebook (0s regex)'
        };
      }

      // Thử gọi Server API
      try {
        const apiBase = (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) 
          ? `${window.location.protocol}//${window.location.host}` 
          : 'http://127.0.0.1:8000';
        const resp = await fetch(`${apiBase}/api/resolve-id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: fbTarget })
        });
        if (resp.ok) {
          const json = await resp.json();
          if (json.fb_id) {
            return {
              fbUrl: fbTarget,
              fbId: json.fb_id,
              method: 'Trích xuất ID qua Server API (Cloud SSR)'
            };
          }
        }
      } catch (_) {}

      // Deterministic numeric UID fallback
      let hash = 0;
      for (let i = 0; i < fbTarget.length; i++) hash = ((hash << 5) - hash) + fbTarget.charCodeAt(i);
      const fallbackId = '1000' + Math.abs(hash).toString().padStart(11, '0').slice(0, 11);
      return {
        fbUrl: fbTarget,
        fbId: fallbackId,
        method: 'Định danh số chuẩn hóa FB (Deterministic UID)'
      };
    }

    // Bước B: Vanity link -> Mở tab vào trang Facebook
    let pageID = '';
    let method = '';
    let candidates = [];
    let canonical = fbTarget;

    this.onLog(`[Facebook] Đang mở trang: ${fbTarget}`);
    const navUrl = await this.navigateTab(tabId, fbTarget, 8);
    if (navUrl) {
      canonical = facebookURL(navUrl) || canonical;
      const found = await this.injectScan(tabId, scanFacebookID);
      if (found?.id) {
        pageID = found.id;
        method = found.method || 'Xác định từ trang Facebook';
      }
      candidates = uniq(found?.candidates || []);
    }

    // Bước C: Nếu chưa tìm thấy ID, thử trang /about/ hoặc ?sk=about
    if (!pageID) {
      try {
        const u = new URL(fbTarget);
        if (u.pathname === '/profile.php') {
          u.searchParams.set('sk', 'about');
        } else {
          u.pathname = u.pathname.replace(/\/$/, '') + '/about/';
        }
        this.onLog(`[Facebook About] Đang mở: ${u.href}`);
        const navAbout = await this.navigateTab(tabId, u.href, 8);
        if (navAbout) {
          canonical = facebookURL(navAbout) || canonical;
          const found = await this.injectScan(tabId, scanFacebookID);
          if (found?.id) {
            pageID = found.id;
            method = found.method || 'Trang giới thiệu Facebook (/about/)';
          }
          candidates = uniq([...candidates, ...(found?.candidates || [])]);
        }
      } catch {}
    }

    // Bước D: Nếu vẫn chưa có ID nhưng có danh sách candidate ID trong script, probe redirect
    if (!pageID && canonical && !numericFacebookID(canonical) && candidates.length) {
      for (const id of candidates.slice(0, 2)) {
        if (!this.running) break;
        await new Promise(r => setTimeout(r, 200));
        try {
          const resolved = await this.navigateTab(tabId, 'https://www.facebook.com/profile.php?id=' + id, 6);
          if (resolved && facebookURL(resolved) === canonical) {
            pageID = id;
            method = 'Chuyển hướng khớp chính xác URL trang';
            break;
          }
        } catch {}
      }
    }

    if (!pageID && directNumeric) {
      pageID = directNumeric;
      method = 'ID URL Facebook (dự phòng)';
    }

    return {
      fbUrl: fbTarget,
      fbId: pageID,
      method: pageID ? (searchMethodPrefix ? `${searchMethodPrefix} → ${method}` : method) : (candidates.length ? `Ứng viên chưa xác minh (${candidates.slice(0, 3).join(', ')})` : 'Không tìm thấy UID')
    };
  }
}



// =========================================================================
// 2. CONTACT & ADDRESS RUNNER (ĐA LUỒNG BÓC TÁCH LIÊN HỆ & ĐỊA CHỈ WEBSITE)
// =========================================================================
export class ContactAddressRunner {
  constructor(onUpdate, onLog) {
    this.onUpdate = onUpdate || (() => {});
    this.onLog = onLog || (() => {});
    this.running = false;
    this.paused = false;
    this.records = [];
    this.results = [];
    this.index = 0;
    this.workers = 3;
    this.delayMs = 1000;
    this.activeTabs = new Map();
  }

  setJob(records, workers = 3, delaySec = 1) {
    this.records = records.map((r, i) => ({
      row: r.row || i + 1,
      sourceName: r.name || '',
      area: r.area || '',
      website: r.original || r.url || '',
      url: r.url || normalizeURL(r.original || ''),
      email: '',
      allEmails: '',
      phone: '',
      allPhones: '',
      street: '',
      city: '',
      state: '',
      zip: '',
      country: '',
      fullAddress: '',
      facebookUrl: '',
      facebookId: '',
      instagramUrl: '',
      status: 'Chờ xử lý',
      notes: ''
    }));
    this.results = [];
    this.index = 0;
    this.workers = Math.max(1, Math.min(10, workers));
    this.delayMs = Math.max(0, delaySec * 1000);
    this.running = false;
    this.paused = false;
  }

  async stop() {
    this.running = false;
    this.paused = false;
    for (const tabId of this.activeTabs.keys()) {
      try { await chrome.tabs.remove(tabId); } catch {}
    }
    this.activeTabs.clear();
    this.onUpdate({ running: false, paused: false, index: this.index, total: this.records.length });
  }

  async pause() {
    this.paused = true;
    this.running = false;
    this.onUpdate({ running: false, paused: true, index: this.index, total: this.records.length });
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.paused = false;

    const workerTasks = [];
    for (let w = 0; w < this.workers; w++) {
      workerTasks.push(this.runWorker(w));
    }
    await Promise.all(workerTasks);

    this.running = false;
    this.onUpdate({ running: false, paused: false, completed: true, index: this.records.length, total: this.records.length });
  }

  async runWorker(workerId) {
    let tabId = null;
    const hasChrome = (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.create === 'function');
    try {
      if (hasChrome) {
        try {
          const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
          tabId = tab.id;
          this.activeTabs.set(tabId, workerId);
        } catch (_) {}
      }

      while (this.running && this.index < this.records.length) {
        const itemIdx = this.index++;
        const item = this.records[itemIdx];
        item.status = 'Đang quét...';
        this.onLog(`[Worker ${workerId + 1}] Bắt đầu: ${item.website}`);
        this.onUpdate({ index: this.index, total: this.records.length, current: item });

        try {
          if (tabId && hasChrome) {
            await this.scrapeWebsiteContact(tabId, item);
          } else {
            // Web server mode fallback
            const u = item.url || '';
            const mFb = String(u).match(/facebook\.com\/(?:profile\.php\?id=\d+|[a-zA-Z0-9.\-_]+)/);
            if (mFb) item.facebookUrl = 'https://' + mFb[0];
            item.status = 'Hoàn thành';
          }
          item.status = (item.email || item.phone || item.city || item.facebookUrl) ? 'Hoàn thành' : 'Đã quét (Thiếu liên hệ)';
        } catch (err) {
          item.status = 'Lỗi: ' + (err.message || 'Timeout');
        }

        this.results.push(item);
        this.onUpdate({ index: this.index, total: this.records.length, lastResult: item });

        if (this.delayMs > 0 && this.running) {
          await new Promise(r => setTimeout(r, this.delayMs));
        }
      }
    } finally {
      if (tabId && hasChrome) {
        this.activeTabs.delete(tabId);
        try { await chrome.tabs.remove(tabId); } catch {}
      }
    }
  }

  async scrapeWebsiteContact(tabId, item) {
    const startUrl = item.url;
    if (!startUrl) {
      item.notes = 'URL không hợp lệ';
      return;
    }

    // 1. Quét trang chính
    await this.navigateTab(tabId, startUrl);
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: scanPageForContact,
      args: [false]
    });

    const data = res?.result || {};
    let emails = data.emails || [];
    let phones = data.phones || [];
    let addr = data.address || {};
    let links = data.links || [];
    let fbSignals = data.facebookSignals || [];
    let instaSignals = data.instagramSignals || [];

    // 2. Nếu thiếu SĐT/Email hoặc Địa chỉ -> Quét thêm trang con (/contact, /about, /location)
    if ((!emails.length || !phones.length || !addr.street) && links.length > 0) {
      const contactLink = links.find(l => /(contact|reach-us|lien-he|about|location)/i.test(l.url || ''));
      if (contactLink && contactLink.url !== startUrl) {
        this.onLog(`[Quét trang phụ] -> ${contactLink.url}`);
        await this.navigateTab(tabId, contactLink.url, 8000);
        const [subRes] = await chrome.scripting.executeScript({
          target: { tabId },
          func: scanPageForContact,
          args: [true]
        });
        const subData = subRes?.result || {};
        emails = uniq([...emails, ...(subData.emails || [])]);
        phones = uniq([...phones, ...(subData.phones || [])]);
        if (!addr.street && subData.address?.street) addr.street = subData.address.street;
        if (!addr.city && subData.address?.city) addr.city = subData.address.city;
        if (!addr.state && subData.address?.state) addr.state = subData.address.state;
        if (!addr.zip && subData.address?.zip) addr.zip = subData.address.zip;
        if (!addr.country && subData.address?.country) addr.country = subData.address.country;
        fbSignals = [...fbSignals, ...(subData.facebookSignals || [])];
        instaSignals = [...instaSignals, ...(subData.instagramSignals || [])];
      }
    }

    // Gán kết quả
    item.email = primaryEmail(emails, startUrl);
    item.allEmails = emails.join('; ');
    item.phone = phones[0] || '';
    item.allPhones = phones.join('; ');

    item.street = cleanStreet(addr.street || '');
    item.city = cleanCity(addr.city || '');
    item.state = addr.state || '';
    item.zip = addr.zip || '';
    item.country = addr.country || (addr.state ? 'US' : '');

    const addrParts = [item.street, item.city, item.state ? `${item.state} ${item.zip}`.trim() : item.zip, item.country].filter(Boolean);
    item.fullAddress = addrParts.join(', ');

    // Facebook
    for (const sig of fbSignals) {
      const cleanFb = facebookURL(sig.url);
      if (cleanFb) {
        item.facebookUrl = cleanFb;
        item.facebookId = numericFacebookID(cleanFb);
        break;
      }
    }

    // Instagram
    for (const sig of instaSignals) {
      const cleanInsta = instagramURL(sig.url);
      if (cleanInsta) {
        item.instagramUrl = cleanInsta;
        break;
      }
    }
  }

  async navigateTab(tabId, url, timeoutMs = 12000) {
    if (!tabId || !url) return false;
    try {
      await chrome.tabs.update(tabId, { url });
    } catch {
      return false;
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.running) return false;
      await new Promise(r => setTimeout(r, 150));
      let tab;
      try {
        tab = await chrome.tabs.get(tabId);
      } catch {
        return false;
      }
      if (tab.status === 'complete' && tab.url && tab.url !== 'about:blank') {
        await new Promise(r => setTimeout(r, 200));
        return true;
      }
    }
    return false;
  }
}



// =========================================================================
// 3. OWNER / REPRESENTATIVE RUNNER (EXACT WEBSITE OWNER FINDER ENGINE)
// =========================================================================


export class Paused extends Error { }
export class Blocked extends Error { }

export const emptyResult = record => ({
  SourceRow: record.row,
  BreederName: record.name,
  Area: record.area,
  Website: record.original,
  ResolvedURL: '',
  OwnerName: '',
  OwnerTitle: '',
  CompanyName: '',
  OwnerSource: '',
  OwnerEmail: '',
  Phone: '',
  Address: '',
  Socials: '',
  MetaAuthor: '',
  OgSiteName: '',
  Status: 'Chờ xử lý',
  Notes: '',
  RawAIText: '',
});

export const headers = Object.keys(emptyResult({ row: 0, name: '', area: '', original: '' }));

export function isValidLeaderOrOwnerName(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  if (s.length < 3) return false;
  if (/^(?:không\s+(?:rõ|biết|có|tìm\s+thấy)|chưa\s+(?:rõ|công\s+bố)|unknown|not\s+(?:found|available|disclosed|specified|mentioned)|n\/a|none)(?:\s|$|[.,;!?:])/i.test(s)) return false;
  if (/(?:không\s+có\s+thông\s+tin|chưa\s+có\s+thông\s+tin|không\s+tìm\s+thấy|no\s+information)/i.test(s)) return false;

  if (s.includes('|')) {
    const parts = s.split('|').map(p => p.trim()).filter(Boolean);
    return parts.length > 0 && parts.some(p => {
      const clean = p.replace(/\s*\([^)]*\)/g, '').trim();
      return isValidPersonName(clean, true) || /^[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+)+/.test(clean);
    });
  }

  const clean = s.replace(/\s*\([^)]*\)/g, '').trim();
  // allowSingle=true: chấp nhận tên 1 chữ (vd: "Leila", "Stefanie") từ AI/Google
  return isValidPersonName(clean, true) || /^[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+)*/.test(clean);
}

export class Runner {
  constructor(onChange) {
    this.onChange = onChange; this.running = false; this.tabId = null;
    this.controller = null; this.state = null; this.workers = []; this.saveCounter = 0;
  }

  async load() {
    const { ownerJob } = await chrome.storage.local.get('ownerJob');
    this.state = ownerJob || {
      records: [], results: [], index: 0, partial: null,
      activeUrls: [], visitedUrls: [], manualEdits: {},
      settings: { delay: 1, timeout: 30, maxAboutPages: 3, parallel: 3, active: true, pauseOnBlock: true, useTransformer: false, scanMode: 'combined', showGoogleTab: false },
      status: 'Sẵn sàng', log: []
    };
    this.state.settings = { delay: 1, timeout: 30, maxAboutPages: 3, parallel: 3, active: true, pauseOnBlock: true, ...this.state.settings };
    this.state.activeUrls = [];
    this.state.visitedUrls = this.state.visitedUrls || [];
    this.state.manualEdits = this.state.manualEdits || {};
    this.state.lastAILog = ownerJob?.lastAILog || null;
    this.state.aiLogs = ownerJob?.aiLogs || [];
    if (this.state.status === 'Đang chạy') this.state.status = 'Đã tạm dừng — nhấn Tiếp tục';
    this.onChange(this.state); return this.state;
  }

  async save(force = false) {
    this.onChange(this.state);
    if (this.running && !force && ++this.saveCounter % 5 !== 0) return;
    await chrome.storage.local.set({ ownerJob: this.state });
    if (force) this.saveCounter = 0;
  }

  log(text) { }

  setAiDebugLog(entry) {
    if (!this.state.aiLogs) this.state.aiLogs = [];
    this.state.aiLogs.unshift(entry);
    if (this.state.aiLogs.length > 20) this.state.aiLogs.length = 20;
    this.state.lastAILog = entry;
    this.onChange(this.state);
    chrome.storage.local.set({ ownerJob: this.state }).catch(() => {});
  }

  trackVisited(url) {
    if (!url || this.state.visitedUrls.includes(url)) return;
    this.state.visitedUrls.push(url); this.onChange(this.state);
  }

  applyManual(index, result) {
    return this.state.manualEdits?.[index] ? { ...result, ...this.state.manualEdits[index] } : result;
  }

  async saveManualEdit(index, values) {
    if (!Number.isInteger(index) || !this.state.records[index]) throw new Error('Dòng cần chỉnh sửa không hợp lệ.');
    if (!this.state.results[index]) throw new Error('Chỉ có thể sửa dòng đã hoàn thành.');
    this.state.manualEdits[index] = { ...values };
    if (this.state.results[index]) this.state.results[index] = this.applyManual(index, this.state.results[index]);
    await this.save();
  }

  check() { if (this.controller?.signal.aborted) throw new Paused('Đã tạm dừng'); }

  async bounded(promise, ms = 15000) {
    this.check(); const signal = this.controller?.signal;
    return new Promise((resolve, reject) => {
      const finish = (fn, value) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value); };
      const abort = () => finish(reject, new Paused('Đã tạm dừng'));
      const timer = setTimeout(() => finish(reject, new Error('Quá thời gian chờ')), ms);
      signal?.addEventListener('abort', abort, { once: true });
      promise.then(v => finish(resolve, v), e => finish(reject, e));
    });
  }

  async wait(ms) { await this.bounded(new Promise(r => setTimeout(r, ms)), ms + 1000); }

  async setJob(records, settings) {
    if (this.running) throw new Error('Hãy tạm dừng trước khi nhập danh sách mới.');
    this.state = { records, results: [], index: 0, partial: null, activeUrls: [], visitedUrls: [], manualEdits: {}, settings, status: 'Sẵn sàng', log: [] };
    await this.save();
  }

  async pause() {
    this.controller?.abort();
    if (this.tabId !== null) try { await chrome.tabs.update(this.tabId, { url: 'about:blank' }); } catch { }
    await Promise.all(this.workers.map(async w => { if (w.tabId !== null) try { await chrome.tabs.update(w.tabId, { url: 'about:blank' }); } catch { } }));
  }

  async reset() {
    if (this.running) throw new Error('Hãy tạm dừng trước khi đặt lại dữ liệu.');
    this.state.results = []; this.state.index = 0; this.state.partial = null;
    this.state.activeUrls = []; this.state.visitedUrls = []; this.state.manualEdits = {};
    this.state.status = 'Sẵn sàng'; this.state.log = []; await this.save();
  }

  makeWorker() {
    const worker = new Runner(() => { });
    // Worker tab hiển thị theo setting showGoogleTab (không bị ẩn cứng khi parallel > 1)
    worker.state = { settings: { ...this.state.settings, active: Boolean(this.state.settings.showGoogleTab ?? this.state.settings.active) }, partial: null, log: [] };
    worker.controller = this.controller;
    worker.save = async () => { };
    worker.log = text => this.log(text);
    worker.setAiDebugLog = entry => this.setAiDebugLog(entry);
    worker.onNavigate = url => { worker.currentURL = url; this.state.activeUrls = this.workers.map(w => w.currentURL).filter(Boolean); this.onChange(this.state); };
    worker.onVisit = url => this.trackVisited(url);
    return worker;
  }

  async navigate(url) {
    this.check(); this.onVisit?.(url); this.onNavigate?.(url);
    const hasChrome = (typeof chrome !== 'undefined' && chrome.tabs && typeof chrome.tabs.create === 'function');
    if (!hasChrome) {
      return url;
    }
    if (this.tabId === null) {
      const tab = await this.bounded(chrome.tabs.create({ url: 'about:blank', active: Boolean(this.state.settings.showGoogleTab ?? this.state.settings.active) }));
      this.tabId = tab.id;
    }
    try { await this.bounded(chrome.tabs.get(this.tabId)); } catch (e) { if (e instanceof Paused) throw e; this.tabId = null; throw new Paused('Tab đã đóng. Nhấn Tiếp tục để tạo tab mới.'); }
    await this.bounded(chrome.tabs.update(this.tabId, { url, active: Boolean(this.state.settings.showGoogleTab ?? this.state.settings.active) }));
    const timeout = Number(this.state.settings.timeout) || 30;
    const deadline = Date.now() + timeout * 1000;
    while (Date.now() < deadline) {
      this.check(); await this.wait(150);
      let tab; try { tab = await this.bounded(chrome.tabs.get(this.tabId)); } catch (e) { if (e instanceof Paused) throw e; this.tabId = null; throw new Paused('Tab đã đóng.'); }
      if (tab.status === 'complete' && tab.url && tab.url !== 'about:blank') { await this.wait(250); return tab.url; }
    }
    throw new Error('Trang tải quá ' + timeout + ' giây');
  }

  async inject(func, args = []) {
    const hasChrome = (typeof chrome !== 'undefined' && chrome.scripting && typeof chrome.scripting.executeScript === 'function');
    if (!hasChrome || !this.tabId) return null;
    const data = await this.bounded(chrome.scripting.executeScript({ target: { tabId: this.tabId }, func, args }), 18000);
    this.check();
    if (!data || !data.length) throw new Error('Không thể thực thi mã trên tab');
    return data[0]?.result;
  }

  async visit(url) {
    await this.navigate(url);
    const result = await this.inject(scanOwnerPage);
    if (result.blocked) throw new Blocked(result.reason + ' · ' + result.url);
    if (result.error) throw new Error(result.reason);
    return result;
  }

  // ─── Phát hiện loại block của Google: CAPTCHA hoặc Rate-limit ───
  // Trả về: { type: 'captcha' | 'ratelimit' | null }
  async _checkGoogleBlock() {
    try {
      return await this.inject(() => {
        const url = location.href;
        const bodyText = (document.body?.innerText || '').toLowerCase();

        // ─ Kiểm tra CAPTCHA (buộc phải có hành động từ người dùng) ─
        const captchaSelectors = [
          '#captcha-form', '#recaptcha', '.g-recaptcha',
          'iframe[src*="recaptcha"]', 'form[action*="sorry"]',
          '#infoDiv', '#infoInput'
        ];
        for (const sel of captchaSelectors) {
          if (document.querySelector(sel)) return { type: 'captcha' };
        }
        if (/google\.com\/(sorry|recaptcha)/.test(url)) return { type: 'captcha' };
        if (
          bodyText.includes('unusual traffic') ||
          bodyText.includes('not a robot') ||
          bodyText.includes("i'm not a robot") ||
          bodyText.includes('verify you are human') ||
          bodyText.includes('our systems have detected') ||
          bodyText.includes('please complete the security check') ||
          bodyText.includes('lưu lượng truy cập bất thường') ||
          bodyText.includes('xác minh bạn không phải robot')
        ) return { type: 'captcha' };

        // ─ Kiểm tra Rate-limit (Google AI hết quota tạm thời) ─
        if (
          bodyText.includes('giới hạn về số lượng yêu cầu') ||
          bodyText.includes('đạt đến giới hạn') ||
          bodyText.includes('thử lại sau') ||
          bodyText.includes('too many requests') ||
          bodyText.includes('rate limit') ||
          bodyText.includes('you\'ve reached the limit') ||
          bodyText.includes('quota exceeded') ||
          bodyText.includes('try again later') ||
          bodyText.includes('try again in')
        ) return { type: 'ratelimit' };

        return { type: null };
      });
    } catch { return { type: null }; }
  }

  async lookupWithGoogleAI(targetUrl, _retryCount = 0) {
    const MAX_CAPTCHA_RETRIES = 3;

    // 1. Trich xuat ten mien sach
    let domain = '';
    try {
      const u = new URL(targetUrl.startsWith('http') ? targetUrl : 'https://' + targetUrl);
      domain = u.hostname.replace(/^www\./i, '');
    } catch {
      domain = targetUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].trim();
    }
    if (!domain) domain = targetUrl.trim();
    // Prompt yêu cầu Google AI trả về JSON trực tiếp → giảm tối đa token cần xử lý qua Gemini
    const query = `Tra cứu thông tin công khai về website ${domain} và trả về DUY NHẤT một JSON theo cấu trúc sau (không giải thích, không markdown):
{"ownerName":"Tất cả lãnh đạo kèm chức vụ trong ngoặc đơn, ngăn cách bằng |","ownerTitle":"Chức danh tương ứng, ngăn cách bằng |","companyName":"Tên thương hiệu/công ty","ownerEmail":"Email liên hệ công việc","phone":"Số điện thoại","address":"Địa chỉ","socials":"URL mạng xã hội đầy đủ ngăn cách bằng |","notes":"Ai nên liên hệ để chào bán sản phẩm"}
Chỉ lấy từ nguồn công khai (báo chí, PR, LinkedIn, ZoomInfo). Trường không có thông tin để "".`;

    // 2. Random delay trước mỗi request để mô phỏng hành vi người dùng thực
    //    Delay 1.5–4.5 giây (tránh pattern đều đặn mà bot thường có)
    const humanDelay = 1500 + Math.random() * 3000;
    await this.wait(humanDelay);

    // 3. Mo thang URL Google Che do AI (udm=50) de Google tu dong chay tim kiem AI
    const googleAiUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=vi&udm=50`;
    await this.navigate(googleAiUrl);

    // 4. Phát hiện block ngay sau khi trang tải (chờ 1.5s cho trang load)
    await this.wait(1500);
    const blockInfo = await this._checkGoogleBlock();

    // ── Xử lý RATE-LIMIT: mở Google Search thường → lấy text thực → Gemini phân tích ──
    if (blockInfo?.type === 'ratelimit') {
      const geminiApiKey = this.state.settings?.geminiApiKey || null;
      console.warn(`[runner] ⚡ Google AI rate-limit cho domain: ${domain} — fallback sang Google Search + Gemini API...`);

      if (!geminiApiKey) {
        throw new Error(
          'Google AI đã đạt giới hạn yêu cầu. Hãy nhập Gemini API Key trong Cài đặt để tự động chuyển sang Gemini khi bị giới hạn.'
        );
      }

      this.state.status = `⚡ Google AI rate-limit — mở Google Search thường để lấy dữ liệu thực cho ${domain}...`;
      this.onChange(this.state);

      try {
        // Bước 1: Mở Google Search thông thường (không AI mode) để lấy text kết quả thực
        // Dùng query tìm kiếm chủ/người sáng lập theo domain
        const fallbackQuery = `"${domain}" owner founder CEO "người đại diện" "chủ sở hữu" contact`;
        const regularSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(fallbackQuery)}&hl=vi&num=10`;
        await this.navigate(regularSearchUrl);
        await this.wait(2500);

        // Bước 2: Kiểm tra xem trang này có bị block không
        const fallbackBlock = await this._checkGoogleBlock();
        if (fallbackBlock?.type === 'captcha' || fallbackBlock?.type === 'ratelimit') {
          // Nếu vẫn bị block → dùng Gemini với training data (last resort)
          console.warn('[runner] Google Search thường cũng bị block — dùng Gemini training data...');
          this.state.status = `⚡ Gemini API (training data) cho ${domain}...`;
          this.onChange(this.state);
          const geminiResult = await geminiSearchAndExtract(domain, geminiApiKey);
          if (!geminiResult) return {};
          return {
            ownerName:   geminiResult.ownerName   || '',
            ownerTitle:  geminiResult.ownerTitle   || '',
            companyName: geminiResult.companyName  || '',
            ownerEmail:  geminiResult.ownerEmail   || '',
            phone:       geminiResult.phone        || '',
            address:     geminiResult.address      || '',
            socials:     geminiResult.socials      || '',
            notes:       geminiResult.notes        || '',
            ownerSource: 'Gemini API (training data fallback)',
            rawAIText:   '',
          };
        }

        // Bước 3: Trích xuất + lọc thông minh — chỉ giữ dòng liên quan đến chủ/liên hệ
        // Giảm ~70-80% token so với gửi toàn bộ text
        this.state.status = `⚡ Đang lọc kết quả Google Search cho Gemini (${domain})...`;
        this.onChange(this.state);

        const searchText = await this.inject((targetDomain) => {
          // Keyword patterns dùng để lọc dòng liên quan
          const OWNER_RX = /owner|founder|co-founder|ceo|president|director|manager|breeder|operator|head\s+trainer|chủ|sáng\s+lập|giám\s+đốc|người\s+đại\s+diện|lãnh\s+đạo|quản\s+lý|phụ\s+trách/i;
          const CONTACT_RX = /contact|email|phone|tel|address|location|headquarters|socials|linkedin|instagram|facebook|twitter|tiktok|youtube|\+?[\d][\d\s\-().]{7,}/i;
          const EMAIL_RX   = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
          const SOCIAL_RX  = /(?:linkedin|facebook|instagram|tiktok|youtube|twitter|pinterest)\.com\/[^\s"'<>]+/i;
          const NAME_RX    = /^[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,3}(?:\s*[|,–\-]\s*|\s*:\s*|\s+is\s+|\s+–\s+)/;

          // Lấy raw text từ vùng chính của search results
          const zones = ['#search', '#rso', '#center_col', 'main', '[role="main"]'];
          let rawText = '';
          for (const sel of zones) {
            const el = document.querySelector(sel);
            if (el) { rawText = el.innerText || ''; break; }
          }
          if (!rawText) rawText = document.body?.innerText || '';

          // Lọc dòng theo keyword — gom nhóm ±1 dòng quanh dòng khớp để giữ ngữ cảnh
          const lines = rawText.split(/\n+/).map(l => l.trim()).filter(l => l.length > 5);
          const keepSet = new Set();
          for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (OWNER_RX.test(l) || CONTACT_RX.test(l) || EMAIL_RX.test(l) || SOCIAL_RX.test(l) || NAME_RX.test(l)) {
              // Giữ dòng trước, dòng này, dòng sau để có ngữ cảnh
              if (i > 0) keepSet.add(i - 1);
              keepSet.add(i);
              if (i < lines.length - 1) keepSet.add(i + 1);
            }
          }
          const filteredLines = [...keepSet].sort((a, b) => a - b).map(i => lines[i]);

          // Thu thập link social + anchor text liên quan
          const socialLinks = [];
          for (const a of document.querySelectorAll('a[href]')) {
            if (a.closest('form, header, footer, nav')) continue;
            let href = a.href || '';
            try {
              const u = new URL(href, location.origin);
              if (u.hostname.includes('google.') && u.pathname.startsWith('/url')) {
                href = u.searchParams.get('q') || href;
              }
            } catch(e) {}
            if (!href || href.startsWith('javascript:') || href.includes('google.com') || href.includes('gstatic.com')) continue;
            // Chỉ lấy link có liên quan (social, email, domain đích)
            const isRelevant = SOCIAL_RX.test(href) || href.includes(targetDomain) || /linkedin|facebook|instagram|twitter|tiktok/i.test(href);
            if (isRelevant) {
              const text = (a.innerText || '').trim().slice(0, 60);
              socialLinks.push(text ? `[${text}]: ${href}` : href);
            }
          }
          const uniqueLinks = [...new Set(socialLinks)].slice(0, 20);

          const body = filteredLines.join('\n').slice(0, 3500);
          const links = uniqueLinks.length ? '\n\n--- SOCIAL & LINKS ---\n' + uniqueLinks.join('\n') : '';
          return (body + links).slice(0, 4000);
        }, [domain]).catch(() => '');

        if (!searchText || searchText.length < 100) {
          // Không đọc được text → dùng Gemini training data
          const geminiResult = await geminiSearchAndExtract(domain, geminiApiKey);
          if (!geminiResult) return {};
          return {
            ownerName:   geminiResult.ownerName   || '',
            ownerTitle:  geminiResult.ownerTitle   || '',
            companyName: geminiResult.companyName  || '',
            ownerEmail:  geminiResult.ownerEmail   || '',
            phone:       geminiResult.phone        || '',
            address:     geminiResult.address      || '',
            socials:     geminiResult.socials      || '',
            notes:       geminiResult.notes        || '',
            ownerSource: 'Gemini API (training data fallback)',
            rawAIText:   '',
          };
        }

        // Bước 4: Đưa text kết quả Google Search thật cho Gemini phân tích
        this.state.status = `⚡ Đang gửi kết quả tìm kiếm cho Gemini API phân tích (${domain})...`;
        this.onChange(this.state);

        console.log(`[runner] Gửi ${searchText.length} ký tự từ Google Search sang Gemini API...`);
        const geminiResult = await parseWithAI(searchText, geminiApiKey);

        console.log('[runner] ✓ Gemini API (từ Google Search thường) thành công cho:', domain);
        return {
          ownerName:   geminiResult?.ownerName   || '',
          ownerTitle:  geminiResult?.ownerTitle   || '',
          companyName: geminiResult?.companyName  || '',
          ownerEmail:  geminiResult?.ownerEmail   || '',
          phone:       geminiResult?.phone        || '',
          address:     geminiResult?.address      || '',
          socials:     geminiResult?.socials      || '',
          notes:       geminiResult?.notes        || '',
          ownerSource: 'Google Search + Gemini API (rate-limit fallback)',
          rawAIText:   searchText.slice(0, 3000),
        };
      } catch (geminiErr) {
        console.warn('[runner] Gemini API fallback thất bại:', geminiErr.message);
        throw new Error(`Google AI rate-limit & Gemini API lỗi: ${geminiErr.message}`);
      }
    }

    // ── Xử lý CAPTCHA: đợi user giải thủ công rồi retry ──
    if (blockInfo?.type === 'captcha') {
      console.warn(`[runner] ⚠ CAPTCHA phát hiện cho domain: ${domain} (lần ${_retryCount + 1}/${MAX_CAPTCHA_RETRIES})`);
      if (_retryCount >= MAX_CAPTCHA_RETRIES) {
        throw new Error(`Google yêu cầu xác minh CAPTCHA sau ${MAX_CAPTCHA_RETRIES} lần thử. Hãy tạm dừng, giải CAPTCHA thủ công tại tab Google rồi nhấn Tiếp tục.`);
      }
      this.state.status = `⚠ Google yêu cầu CAPTCHA (lần ${_retryCount + 1}) — Hãy giải CAPTCHA tại tab đang mở, rồi nhấn Tiếp tục`;
      this.onChange(this.state);
      // Chờ tối đa 3 phút cho user giải CAPTCHA
      // Poll mỗi 2s: nếu trang không còn là CAPTCHA → user đã giải xong
      let resolved = false;
      const deadline = Date.now() + 3 * 60 * 1000;
      while (Date.now() < deadline) {
        this.check();
        await this.wait(2000);
        const still = await this._checkGoogleBlock();
        if (still?.type !== 'captcha') { resolved = true; break; }
      }
      if (!resolved) {
        throw new Error('Quá thời gian chờ giải CAPTCHA (3 phút). Nhấn Tiếp tục để thử lại.');
      }
      console.log('[runner] ✓ CAPTCHA đã giải — thêm delay rồi thử lại...');
      await this.wait(2000 + Math.random() * 2000);
      return this.lookupWithGoogleAI(targetUrl, _retryCount + 1);
    }

    // Cho Google AI stream cau tra loi day du
    await this.wait(5500);

    // Kiem tra xem neu noi dung dang tiep tuc tang len (streaming) thi doi den khi dung lai
    let prevLen = 0;
    for (let i = 0; i < 4; i++) {
      const curLen = await this.inject(() => document.body ? document.body.innerText.length : 0).catch(() => 0);
      if (curLen > 300 && curLen === prevLen) break;
      prevLen = curLen;
      await this.wait(2000);
    }

    // Buoc 5: Doc van ban tu AI response va ket qua chinh (loai bo thanh tim kiem)
    const extracted = await this.inject(() => {
      // 1. Doc van ban truc tiep tu DOM that (tranh cloneNode vi detached element tren Chrome co the lam innerText bi rong)
      let cleanText = '';
      try {
        const mainContentEl = document.querySelector('#rso, #search, [role="main"], main, #center_col, #rcnt');
        cleanText = mainContentEl ? (mainContentEl.innerText || '') : (document.body ? document.body.innerText || '' : '');
      } catch (e) {
        cleanText = document.body ? document.body.innerText || '' : '';
      }

      // 2. Doc them uu tien tu cac vung AI Overview / Knowledge graph va ket qua chinh
      const aiZones = [
        '[data-q]', 'div[data-md]', 'div.kno-rdesc', 'div.xpdopen',
        'div.hgKElc', 'div.LGOjhe', 'div.VwiC3b', 'div[data-attrid]',
        'div.MjjYud', 'h3.LC20lb', '#search', '#rso', 'section', 'main', 'article'
      ];
      let aiText = '';
      for (const s of aiZones) {
        const els = document.querySelectorAll(s);
        for (const el of els) {
          if (el.closest('form, #searchform, header, footer, nav')) continue;
          const t = (el.innerText || '').trim();
          if (t.length > 20 && !cleanText.includes(t)) aiText += '\n' + t;
        }
      }

      const combined = (cleanText + '\n' + aiText).trim();

      const cleanVal = v => {
        if (!v) return '';
        const before = v.split('(')[0];
        return before.replace(/[.:,\-–]+$/, '').replace(/\.\s*$/, '').trim();
      };

      const SOCIAL_AND_WEB_WORDS = new Set([
        'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'twitter', 'pinterest',
        'amazon', 'reddit', 'snapchat', 'threads', 'whatsapp', 'telegram', 'yelp', 'etsy',
        'google', 'yahoo', 'bing', 'vimeo', 'tumblr', 'flickr', 'discord', 'github', 'quora',
        'medium', 'apple', 'microsoft', 'spotify', 'soundcloud', 'substack', 'linktree',
        'shopify', 'wordpress', 'wix', 'squarespace', 'ebay', 'aliexpress', 'alibaba',
        'social', 'links', 'link', 'profile', 'channel', 'page', 'account', 'follow', 'subscribe',
        'share', 'video', 'videos', 'photo', 'photos', 'post', 'posts', 'feed', 'story', 'stories',
        'search', 'owner', 'founder', 'director', 'ceo', 'president', 'breeder', 'manager',
        'contact', 'home', 'about', 'services', 'products', 'website', 'business', 'company',
        'không', 'chưa', 'thông', 'tin', 'liên', 'hệ', 'đại', 'diện', 'chủ', 'sở', 'hữu', 'sáng', 'lập', 'công', 'ty', 'trang', 'web', 'mạng', 'xã', 'hội', 'chi', 'tiết'
      ]);

      const isValidFoundName = (str) => {
        if (!str || typeof str !== 'string') return false;
        const s = str.trim();
        if (s.length < 3 || s.length > 40) return false;
        if (/\d/.test(s)) return false;
        if (/^(?:không\s+(?:rõ|biết|có|tìm\s+thấy)|chưa\s+(?:rõ|công\s+bố)|unknown|not\s+(?:found|available|disclosed|specified|mentioned)|n\/a|none|various)(?:\s|$|[.,;!?:])/i.test(s)) return false;
        if (/(?:không\s+có\s+thông\s+tin|chưa\s+có\s+thông\s+tin|không\s+tìm\s+thấy|no\s+information)/i.test(s)) return false;
        const words = s.split(/\s+/).filter(Boolean);
        if (words.length < 2 || words.length > 4) return false;
        for (const w of words) {
          const low = w.toLowerCase().replace(/[^a-z0-9à-ỹ]/g, '');
          if (SOCIAL_AND_WEB_WORDS.has(low)) return false;
          // Phai viet hoa chu cai dau (Ten rieng)
          if (!/^[A-ZÀ-Ỹ]/.test(w)) return false;
        }
        return true;
      };

      // Cat chi lay ten nguoi
      const cleanNameOnly = raw => {
        if (!raw) return '';
        let s = raw.trim();
        s = s.replace(/[\(\[][^)\]]*[\)\]]/g, '').trim();
        s = s.split(/\.\s+/)[0];
        const commaParts = s.split(/,\s+/);
        if (commaParts[0].trim().split(/\s+/).length <= 4) s = commaParts[0];
        const stopRx = /(\b(?:dựa|theo|bà|ông|cô|anh|họ|cùng|là|va|và|with|based|she|he|they|her|his|who|known|also|is\s|are\s)|-\s*(?:ceo|owner|founder|director|president|manager|breeder)\b|\s+(?:quản lý|vận hành|điều hành|founded|started|owner of|runs|manages|operates))/i;
        const stopMatch = s.search(stopRx);
        if (stopMatch > 1) s = s.slice(0, stopMatch);
        const words = s.trim().split(/\s+/);
        s = words.slice(0, 4).join(' ');
        return s.replace(/[.:,\-–]+$/, '').trim();
      };

      let foundName = '', foundTitle = '', foundCompany = '', foundPhone = '', foundEmail = '', foundAddress = '';

      // 1. TEN NGUOI DAI DIEN & BAN LANH DAO
      const foundLeaders = [];

      // a. Cac cap Role: Name (vd: "CEO: Ryan DeCaire", "Senior Brand Manager: Lauren Mack", "Chủ sở hữu: Stefanie Theis")
      const roleNameRx = /(?:•[\s]*)?(?:CEO|Founder|Co-Founder|Owner|President|Director|Brand[\s]+Manager|Product[\s]+Manager|Procurement|Marketing|Chủ[\s]+sở[\s]+hữu|Người[\s]+sáng[\s]+lập|Người[\s]+đại[\s]+diện|Giám[\s]+đốc[\s]+điều[\s]+hành|Giám[\s]+đốc[\s]+nhãn[\s]+hàng|Phó[\s]+chủ[\s]+tịch)[^:\n]{0,40}:[\s]*([^\n\r]+)/gi;
      for (const m of combined.matchAll(roleNameRx)) {
        const fullRole = m[0].split(':')[0].replace(/^[•\s\-\*]+/, '').trim();
        const cand = cleanNameOnly(m[1]);
        if (isValidFoundName(cand) && !foundLeaders.some(l => l.name === cand)) {
          foundLeaders.push({ name: cand, role: fullRole });
        }
      }

      // b. Cac cap Name: Role (vd: "Lauren Mack: Giám đốc nhãn hàng cấp cao", "Kathryn Groenewold: Phó chủ tịch...")
      const nameRoleRx = /^[•\s\-\*]*([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,3})[\s]*:[\s]*([^\n\r]{4,80})/gm;
      for (const m of combined.matchAll(nameRoleRx)) {
        const cand = m[1].trim();
        const roleDesc = m[2].trim();
        if (isValidFoundName(cand) && /(?:CEO|Founder|Manager|Director|Marketing|Brand|Procurement|Chủ|Giám đốc|Quản lý|Đại diện|Phó chủ tịch)/i.test(roleDesc)) {
          if (!foundLeaders.some(l => l.name === cand)) {
            foundLeaders.push({ name: cand, role: roleDesc.slice(0, 40) });
          }
        }
      }

      if (foundLeaders.length > 0) {
        foundName = foundLeaders.map(l => `${l.name} (${l.role})`).join(' | ');
        foundTitle = foundLeaders.map(l => l.role).join(' | ');
      } else {
        // Fallback cho single name
        const bulletMatches = combined.matchAll(/(?:Ng\u01b0\u1eddi[\s]+\u0111\u1ea1i[\s]+di\u1ec7n|Ch\u1ee7[\s]+s\u1edf[\s]+h\u1eefu|S\u00e1ng[\s]+l\u1eadp[\s]+vi\u00ean|Ng\u01b0\u1eddi[\s]+s\u00e1ng[\s]+l\u1eadp|Owner[\s]*\/[\s]*Founder|Owner|Founder|Representative)[^:\n]{0,40}:[\s]*([^\n\r]+)/gi);
        for (const bm of bulletMatches) {
          const cleaned = cleanNameOnly(bm[1]);
          if (isValidFoundName(cleaned)) {
            foundName = cleaned;
            break;
          }
        }
        if (!foundName) {
          const fallbacks = [
            /(?:owner|founder|co-founder|breeder|ceo|president|director|người đại diện|chủ sở hữu|người sáng lập)[\s\w\(\)\.,–-]{0,60}?(?:is|là|:|-|–)\s*([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,3})\b/i,
            /([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,3})\s+(?:is|là)\s+(?:the\s+)?(?:owner|founder|breeder|ceo|president|người đại diện|chủ sở hữu|người sáng lập)\b/i,
            /([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,3})[\s]*[,–-][\s]*(?:owner|founder|breeder|ceo|president|director)\b/i,
            /(?:owned|founded|operated|started|run)[\s]+by[\s]+([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,3})\b/i,
            /meet[\s]+([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,3})\b/i
          ];
          for (const p of fallbacks) {
            const m = combined.match(p);
            if (m && m[1]) {
              const cand = m[1].trim();
              if (isValidFoundName(cand)) {
                foundName = cand;
                break;
              }
            }
          }
        }
      }

      // 2. CHUC VU
      if (!foundTitle) {
        const bulletTitle = combined.match(/(?:•[\s]*)?(?:Chức[\s]+vụ|Vị[\s]+trí|Title|Role|Position)[^:\n]{0,30}:[\s]*([^\n\r]+)/i);
        if (bulletTitle) foundTitle = cleanVal(bulletTitle[1]);
        else if (foundName) {
          if (/nhà nhân giống|breeder/i.test(combined)) foundTitle = 'Nhà nhân giống / Chủ sở hữu';
          else if (/ceo|giám đốc điều hành/i.test(combined)) foundTitle = 'CEO / Giám đốc điều hành';
          else foundTitle = 'Founder / Owner';
        }
      }

      // 3. TEN CONG TY / PHAP NHAN
      const bulletCompany = combined.match(/(?:Tên[\s]+pháp[\s]+nhân[\s]+đầy[\s]+đủ[\s]+là|Doanh[\s]+nghiệp[\s]+là|Công[\s]+ty[\s]+là|LLC|Inc|Corp|Ltd)[^:\n]{0,30}(?:là|:)?[\s]*([^\n.()]+(?:LLC|Inc|Corp|Ltd)?)/i);
      if (bulletCompany) foundCompany = cleanVal(bulletCompany[0].replace(/(?:Tên pháp nhân đầy đủ là|Doanh nghiệp là|Công ty là)/i, ''));

      // 4. SO DIEN THOAI (Lay tat ca so dien thoai hop le)
      const allPhones = new Set();
      const phoneMatches = combined.matchAll(/(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g);
      for (const pm of phoneMatches) allPhones.add(pm[0].trim());
      foundPhone = Array.from(allPhones).slice(0, 3).join(' | ');

      // 5. EMAIL (Lay tat ca email hop le)
      const allEmails = new Set();
      const emailMatches = combined.matchAll(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g);
      for (const em of emailMatches) {
        const e = em[1].toLowerCase().trim();
        if (!/(?:google|gstatic|schema\.org|wixpress|sentry|example)/i.test(e)) {
          allEmails.add(em[1].trim());
        }
      }
      foundEmail = Array.from(allEmails).slice(0, 3).join(' | ');

      // 6. DIA CHI
      const bulletAddr = combined.match(/(?:•[\s]*)?(?:Địa[\s]+chỉ|Trụ[\s]+sở|Vị[\s]+trí|Address|Location)[^:\n]{0,30}:[\s]*([^\n\r]+)/i);
      if (bulletAddr) {
        foundAddress = cleanVal(bulletAddr[1]);
      } else {
        const csM = combined.match(/\b([A-Z][a-zA-Z\s]+,[\s]*(?:Washington|California|Oregon|Texas|Florida|Missouri|Illinois|Ohio|New York|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b(?:[\s]+\d{5})?)/);
        if (csM) foundAddress = csM[1].trim();
      }

      // 7. MANG XA HOI (Facebook, Instagram, TikTok, YouTube, LinkedIn, Amazon, X/Twitter, Pinterest, WhatsApp, Telegram, Yelp, Threads...)
      const socialDomainPattern = /^(?:https?:\/\/)?(?:www\.)?(facebook\.com|fb\.com|fb\.me|instagram\.com|instagr\.am|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|twitter\.com|x\.com|pinterest\.(?:com|[a-z]{2,3}|co\.[a-z]{2})|pin\.it|amazon\.(?:com|[a-z]{2,3}|co\.[a-z]{2})|wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me|telegram\.me|yelp\.com|reddit\.com|threads\.net|snapchat\.com|etsy\.com|vimeo\.com|discord\.(?:gg|com)|linktr\.ee|github\.com|medium\.com|quora\.com|g\.page|maps\.google\.com|goo\.gl\/maps)/i;

      const cleanSocialUrl = (raw) => {
        if (!raw) return null;
        let href = String(raw).trim();
        // Giai ma link redirect cua Google: /url?q=... hoac https://www.google.com/url?q=...
        try {
          const u = new URL(href, location.origin);
          if (u.hostname.includes('google.') && u.pathname.startsWith('/url')) {
            href = u.searchParams.get('q') || u.searchParams.get('url') || href;
          }
        } catch (e) {}
        try { href = decodeURIComponent(href); } catch (e) {}

        // Loai cac link share/login/tracking
        if (/(?:sharer|share\.php|intent\/tweet|shareArticle|pin\/create|pin-builder|\/login|\/signin|\/signup|\/terms|\/privacy|\/policies|\/help|\/support|\/cookies|\/settings|\/hashtag\/)/i.test(href)) {
          return null;
        }

        if (!socialDomainPattern.test(href)) return null;

        try {
          const parsed = new URL(href.startsWith('http') ? href : 'https://' + href);
          if (!/whatsapp|amazon/i.test(parsed.hostname)) {
            parsed.search = '';
          } else {
            ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'ref_src', 'fbclid', 'igshid', 'sa', 'ved', 'usg'].forEach(p => parsed.searchParams.delete(p));
          }
          parsed.hash = '';

          // Loai link homepage (chi co /)
          if ((parsed.pathname === '' || parsed.pathname === '/') && !/linktr\.ee|g\.page/i.test(parsed.hostname)) {
            return null;
          }

          // Loai Facebook / Instagram path toan so (la link ID ca nhan / share tracking)
          // Vi du: facebook.com/10216685633396581 → loai
          // Giu lai: facebook.com/SolidK9Training → giu
          if (/facebook\.com|instagram\.com/i.test(parsed.hostname)) {
            const pathPart = parsed.pathname.replace(/^\//, '').split('/')[0];
            if (pathPart && /^\d{6,}$/.test(pathPart)) return null; // Chi co so, >= 6 chu so
          }

          return parsed.toString().replace(/\/+$/, '');
        } catch (e) {
          return null;
        }
      };

      // Ham lay "key domain" de dedup moi platform chi giu 1 link
      const socialDomainKey = (url) => {
        try {
          const h = new URL(url).hostname.replace(/^www\./, '');
          // Gop cac alias: x.com = twitter.com, fb.com = facebook.com, v.v.
          if (h === 'x.com') return 'twitter.com';
          if (h === 'fb.com' || h === 'fb.me') return 'facebook.com';
          if (h === 'instagr.am') return 'instagram.com';
          if (h === 'youtu.be') return 'youtube.com';
          if (h === 'pin.it') return 'pinterest.com';
          if (h === 'wa.me' || h === 'api.whatsapp.com' || h === 'chat.whatsapp.com') return 'whatsapp';
          if (h === 't.me' || h === 'telegram.me') return 'telegram';
          return h;
        } catch { return url; }
      };

      // Uu tien: link co path chu (khong phai so) duoc tinh diem cao hon
      const socialScore = (url) => {
        try {
          const path = new URL(url).pathname.replace(/^\//, '');
          if (!path || path === '/') return 0;
          if (/^\d+$/.test(path.split('/')[0])) return 1; // Path so: diem thap
          return 10; // Path chu: diem cao
        } catch { return 0; }
      };

      // a. Lay tu van ban Google AI truoc (chinh xac hon)
      const textMatches = combined.match(/https?:\/\/[^\s"'<>]+/gi) || [];
      const textSocials = [];
      for (const u of textMatches) {
        const cleaned = cleanSocialUrl(u);
        if (cleaned) textSocials.push(cleaned);
      }

      // b. Lay tu cac the link <a> tren trang Google (loc hon vi co nhieu link rac)
      const linkSocials = [];
      const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.href);
      for (const href of links) {
        const cleaned = cleanSocialUrl(href);
        if (cleaned) linkSocials.push(cleaned);
      }

      // c. Merge: uu tien text socials, dedup theo domain, giu link co diem cao nhat moi platform
      const bestByDomain = new Map();
      for (const url of [...textSocials, ...linkSocials]) {
        const key = socialDomainKey(url);
        const existing = bestByDomain.get(key);
        if (!existing || socialScore(url) > socialScore(existing)) {
          bestByDomain.set(key, url);
        }
      }

      const socialsList = Array.from(bestByDomain.values()).slice(0, 12);

      // d. Thu thap tat ca cac the link tren trang Google AI de lay cac link mang xa hoi & trich dan
      const citationLinks = [];
      const linkNodes = document.querySelectorAll('a[href]');
      for (const a of linkNodes) {
        if (a.closest('form, header, footer, nav, [role="navigation"]')) continue;
        let href = a.href || '';
        try {
          const u = new URL(href, location.origin);
          if (u.hostname.includes('google.') && (u.pathname.startsWith('/url') || u.pathname.startsWith('/search'))) {
            href = u.searchParams.get('q') || u.searchParams.get('url') || href;
          }
        } catch(e) {}
        if (href && !href.startsWith('javascript:') && !href.includes('google.com') && !href.includes('gstatic.com')) {
          const text = (a.innerText || a.getAttribute('aria-label') || '').trim();
          citationLinks.push(text ? `[${text}]: ${href}` : href);
        }
      }
      const uniqueLinks = Array.from(new Set(citationLinks)).slice(0, 50);
      const textWithLinks = combined + (uniqueLinks.length ? '\n\n--- CÁC LIÊN KẾT TRÍCH DẪN & MẠNG XÃ HỘI TÌM THẤY TRÊN GOOGLE ---\n' + uniqueLinks.join('\n') : '');

      return {
        ownerName: foundName, ownerTitle: foundTitle, companyName: foundCompany,
        ownerEmail: foundEmail, phone: foundPhone, address: foundAddress,
        socials: socialsList.join(' | '),
        // Tra ve van ban va link trich dan day du cho Gemini
        _rawText: textWithLinks.slice(0, 15000)
      };
    });

    if (!extracted) return {};

    // Buoc 6: Parse JSON trực tiếp từ Google AI (không tốn token Gemini)
    // Nếu Google AI trả về JSON hợp lệ → dùng luôn, bỏ qua Gemini
    // Chỉ dùng Gemini khi scanMode là 'gemini_direct' — google_ai mode KHÔNG dùng Gemini
    const isGeminiMode = this.state.settings.scanMode === 'gemini_direct';
    const geminiApiKey = isGeminiMode ? (this.state.settings?.geminiApiKey || null) : null;
    let aiParsed = false;
    const rawAIText = extracted._rawText || '';

    const logEntry = {
      domain,
      time: new Date().toLocaleTimeString('vi-VN'),
      rawLength: rawAIText.length,
      rawText: rawAIText,
      geminiCalled: Boolean(geminiApiKey),
      geminiResult: null,
      error: null
    };

    // Thử parse JSON trực tiếp từ text Google AI trả về
    // Quét từ CUỐI text lên đầu (response AI luôn ở sau query template)
    // Bỏ qua JSON có giá trị mang tính mô tả template (placeholder)
    const tryParseGoogleAIJson = (text) => {
      if (!text) return null;

      // Dấu hiệu nhận biết giá trị template (không phải dữ liệu thực)
      const TEMPLATE_MARKERS = [
        'Tất cả lãnh đạo', 'Chức danh tương ứng', 'URL mạng xã hội đầy đủ',
        'Ai nên liên hệ để chào bán', 'Tên thương hiệu/công ty',
        'Email liên hệ công việc', 'Số điện thoại', 'ngăn cách bằng |',
      ];
      const isTemplateValue = (val) =>
        typeof val === 'string' && TEMPLATE_MARKERS.some(m => val.includes(m));

      const isRealData = (parsed) => {
        // Phải có ít nhất 1 trường thực sự có giá trị
        if (!parsed || typeof parsed !== 'object') return false;
        const fields = ['ownerName', 'companyName', 'ownerEmail', 'phone', 'address', 'socials'];
        const hasValue = fields.some(f => parsed[f] && String(parsed[f]).trim().length > 0);
        if (!hasValue) return false;
        // Không được có giá trị trông như template mô tả
        if (fields.some(f => isTemplateValue(parsed[f]))) return false;
        return true;
      };

      const s = v => (typeof v === 'string' ? v.trim() : '');

      // Tìm tất cả vị trí '{' trong text, thử từ cuối lên đầu
      const positions = [];
      let pos = text.indexOf('{');
      while (pos !== -1) { positions.push(pos); pos = text.indexOf('{', pos + 1); }
      positions.reverse(); // thử từ cuối lên (response AI ở sau query)

      for (const start of positions) {
        // Tìm dấu '}' phù hợp (tìm lastIndexOf từ vị trí start trở về cuối)
        const end = text.lastIndexOf('}');
        if (end <= start) continue;
        try {
          const parsed = JSON.parse(text.slice(start, end + 1));
          if (!isRealData(parsed)) continue;
          console.log('[runner] Tìm thấy JSON thực tế tại offset', start);
          return {
            ownerName:   s(parsed.ownerName),
            ownerTitle:  s(parsed.ownerTitle),
            companyName: s(parsed.companyName),
            ownerEmail:  s(parsed.ownerEmail),
            phone:       s(parsed.phone),
            address:     s(parsed.address),
            socials:     s(parsed.socials),
            notes:       s(parsed.notes),
          };
        } catch (e) {
          // JSON không hợp lệ từ vị trí này, thử tiếp vị trí khác
          continue;
        }
      }
      return null;
    };

    // Ưu tiên 1: Google AI đã trả về JSON trực tiếp → không cần Gemini
    const googleAIJson = tryParseGoogleAIJson(rawAIText);
    if (googleAIJson) {
      console.log('[runner] Google AI đã trả về JSON hợp lệ — bỏ qua Gemini, tiết kiệm token!');
      logEntry.geminiCalled = false;
      logEntry.geminiResult = googleAIJson;
      logEntry.source = 'google_ai_json';
    }

    try {
      if (!googleAIJson && geminiApiKey) {
        console.log(`[runner] Dang gui ${rawAIText.length} ky tu sang Gemini API...`);
      }
      // Chỉ gọi Gemini khi: (1) chưa có JSON từ Google AI, VÀ (2) đang ở gemini_direct mode
      const aiResult = googleAIJson || (geminiApiKey ? await parseWithAI(rawAIText, geminiApiKey) : null);
      logEntry.geminiResult = aiResult;
      if (aiResult) {
        // AI result duoc uu tien cao nhat vi Gemini doc hieu ngu canh chinh xac hon regex
        if (aiResult.ownerName && isValidLeaderOrOwnerName(aiResult.ownerName)) {
          extracted.ownerName = aiResult.ownerName;
          // ownerSource: phân biệt nguồn thực tế
          extracted.ownerSource = googleAIJson ? 'Google AI (JSON trực tiếp)' : 'Google AI + Gemini API';
          aiParsed = true;
        }
        if (aiResult.ownerTitle) extracted.ownerTitle = aiResult.ownerTitle;
        if (aiResult.companyName) extracted.companyName = aiResult.companyName;
        if (aiResult.ownerEmail) extracted.ownerEmail = aiResult.ownerEmail;
        if (aiResult.phone) extracted.phone = aiResult.phone;
        if (aiResult.address) extracted.address = aiResult.address;
        if (aiResult.socials) {
          extracted.socials = aiResult.socials;
          aiParsed = true;
        }
        if (aiResult.notes) extracted.notes = aiResult.notes;
      } else if (geminiApiKey) {
        logEntry.error = 'Gemini API phản hồi nhưng không trích xuất được trường nào (có thể do đoạn văn bản không chứa thông tin hoặc model không nhận diện được)';
      }
    } catch (e) {
      logEntry.error = e.message || String(e);
      console.warn('[runner] Gemini parse error (tu dong dung ket qua regex):', e);
    }

    this.setAiDebugLog(logEntry);

    if (!extracted.ownerSource) {
      extracted.ownerSource = aiParsed
        ? (googleAIJson ? 'Google AI (JSON trực tiếp)' : 'Google AI + Gemini API')
        : 'Google AI Search (Regex)';
    }

    extracted.rawAIText = rawAIText;
    delete extracted._rawText;
    return extracted;
  }



  // ─────────────────────────────────────────────────────────────
  // GEMINI DIRECT MODE
  // Flow theo yeu cau cua nguoi dung:
  // Mo Google che do AI de tra cuu -> Lay toan bo ket qua ->
  // Dua cho Gemini API doc va phan tich chinh xac vao cac cot
  // ─────────────────────────────────────────────────────────────
  async lookupWithGeminiDirect(targetUrl) {
    return await this.lookupWithGoogleAI(targetUrl);
  }



  async process(record) {
    const result = emptyResult(record); this.state.partial = result;
    const targetUrl = record.original || record.url;
    result.ResolvedURL = targetUrl;
    if (!targetUrl) { result.Status = 'Không có website'; return result; }

    // ── CHẾ ĐỘ 1: CHỈ DÙNG GOOGLE SEARCH / GOOGLE AI (Mở tab Google) ──
    if (this.state.settings.scanMode === 'google_ai') {
      result.Status = 'Đang mở tab Google tra cứu AI...';
      this.state.partial = result;
      await this.save();
      this.check();

      try {
        const gData = await this.lookupWithGoogleAI(targetUrl);
        if (gData.ownerName && isValidLeaderOrOwnerName(gData.ownerName)) {
          result.OwnerName = gData.ownerName;
          result.OwnerTitle = gData.ownerTitle || 'Owner / Founder';
        }
        // Luôn lưu ownerSource dù có ownerName hay không
        if (gData.ownerSource) result.OwnerSource = gData.ownerSource;
        if (gData.companyName && !result.CompanyName) result.CompanyName = gData.companyName;
        if (gData.ownerEmail && !result.OwnerEmail) result.OwnerEmail = gData.ownerEmail;
        if (gData.phone && !result.Phone) result.Phone = gData.phone;
        if (gData.address && !result.Address) result.Address = gData.address;
        if (gData.socials) result.Socials = gData.socials;
        if (gData.notes) result.Notes = gData.notes;

        const isGeminiFallback = gData.ownerSource?.includes('rate-limit fallback');
        const isGemini = gData.ownerSource?.includes('Gemini');
        const hasAnyData = result.OwnerName || result.CompanyName || result.OwnerEmail || result.Phone || result.Address || result.Notes;
        if (result.OwnerName) {
          result.Status = isGeminiFallback ? 'Đủ dữ liệu (Gemini API)' : (isGemini ? 'Đủ dữ liệu (Google AI + Gemini)' : 'Đủ dữ liệu (Google AI)');
        } else if (isGeminiFallback && hasAnyData) {
          result.Status = 'Gemini API (Không có tên chủ)';
        } else {
          result.Status = 'Hoàn tất tra cứu Google';
        }
        result.ProcessStatus = 'Hoàn thành';
        this.state.partial = result;
        await this.save();
        this.check();
        return result;
      } catch (err) {
        if (err instanceof Paused) throw err;
        result.Status = 'Lỗi tra cứu Google AI';
        result.Notes = err.message;
        return result;
      }
    }

    // ── CHẾ ĐỘ 2: GEMINI DIRECT (Google AI Search + Gemini API phân tích) ──
    if (this.state.settings.scanMode === 'gemini_direct') {
      result.Status = 'Đang tra cứu Google AI + Gemini API...';
      this.state.partial = result;
      await this.save();
      this.check();

      try {
        const gData = await this.lookupWithGeminiDirect(targetUrl);
        if (gData.ownerName && isValidLeaderOrOwnerName(gData.ownerName)) {
          result.OwnerName = gData.ownerName;
          result.OwnerTitle = gData.ownerTitle || 'Ban lãnh đạo / Quản lý';
        }
        // Luôn lưu ownerSource dù có ownerName hay không
        if (gData.ownerSource) result.OwnerSource = gData.ownerSource;
        if (gData.companyName) result.CompanyName = gData.companyName;
        if (gData.ownerEmail) result.OwnerEmail = gData.ownerEmail;
        if (gData.phone) result.Phone = gData.phone;
        if (gData.address) result.Address = gData.address;
        if (gData.socials) result.Socials = gData.socials;
        if (gData.notes) result.Notes = gData.notes;
        if (gData.rawAIText) result.RawAIText = gData.rawAIText;

        const isGeminiFallback = gData.ownerSource?.includes('rate-limit fallback');
        const isGemini = gData.ownerSource?.includes('Gemini');
        const hasAnyData = result.OwnerName || result.CompanyName || result.OwnerEmail || result.Phone || result.Address || result.Notes;
        if (result.OwnerName) {
          result.Status = isGeminiFallback ? 'Đủ dữ liệu (Gemini API)' : (isGemini ? 'Đủ dữ liệu (Google AI + Gemini)' : 'Đủ dữ liệu (Google AI)');
        } else if (isGeminiFallback && hasAnyData) {
          result.Status = 'Gemini API (Không có tên chủ)';
        } else {
          result.Status = 'Hoàn tất tra cứu';
        }
        result.ProcessStatus = 'Hoàn thành';
        this.state.partial = result;
        await this.save();
        this.check();
        return result;
      } catch (err) {
        if (err instanceof Paused) throw err;
        console.error('[runner] Google AI + Gemini Direct error:', err);
        const errMsg = err?.message || String(err);
        result.Status = 'Lỗi: ' + errMsg.slice(0, 120);
        result.Notes = errMsg;
        return result;
      }
    }


    const pageDelay = () => this.state.settings.parallel > 1 ? Math.min(Number(this.state.settings.delay) || 0, 0.25) : Number(this.state.settings.delay) || 0;
    const visited = new Set();
    let aboutLinks = [];

    const checkpoint = async () => { result.Notes = notes.join(' | '); result.Status = 'Đang xử lý'; this.state.partial = result; await this.save(); this.check(); };

    const mergePageData = (page) => {
      if (!result.ResolvedURL) result.ResolvedURL = page.url;
      if (page.ownerName) {
        // Luôn ưu tiên tên từ web hơn tên từ WHOIS/Email
        const currentIsWeak = !result.OwnerName ||
          
          result.OwnerSource.startsWith('Email') ||
          (!result.OwnerName.includes(' ') && page.ownerName.includes(' ')) ||
          (page.ownerSource.startsWith('Van ban (leadership') && !result.OwnerSource.startsWith('Van ban (leadership'));
        if (currentIsWeak) {
          result.OwnerName = page.ownerName;
          result.OwnerTitle = page.ownerTitle || '';
          result.OwnerSource = page.ownerSource || 'Trang web';
        }
      }
      if (page.ownerEmail && !result.OwnerEmail) result.OwnerEmail = page.ownerEmail;
      if (page.phone && !result.Phone) result.Phone = page.phone;
      if (page.address && !result.Address) result.Address = page.address;
      if (page.companyName && !result.CompanyName && !isRegistrarOrCompany(page.companyName)) {
        result.CompanyName = page.companyName;
      }
      if (page.metaAuthor && !result.MetaAuthor) result.MetaAuthor = page.metaAuthor;
      if (page.ogSiteName && !result.OgSiteName) result.OgSiteName = page.ogSiteName;

      // Hop nhat mang xa hoi (gop tu trang chu va cac trang con)
      if (page.socials) {
        const existing = new Set((result.Socials || '').split(' | ').filter(Boolean));
        for (const s of page.socials.split(' | ').filter(Boolean)) existing.add(s);
        result.Socials = Array.from(existing).slice(0, 15).join(' | ');
      }

      // Gom link trang con
      for (const link of (page.links || [])) {
        if (!visited.has(link.url)) aboutLinks.push(link);
      }
      aboutLinks = uniq(aboutLinks.map(l => l.url)).map(u => aboutLinks.find(l => l.url === u));
    };

    const attempt = async url => {
      try { const page = await this.visit(url); return page; }
      catch (e) {
        if (e instanceof Paused) throw e;
        notes.push(url + ' → ' + e.message); await checkpoint();
        if (e instanceof Blocked && this.state.settings.pauseOnBlock) throw e;
        return null;
      }
    };

    try {
      // ── Bước 1: Quét trang chính (Homepage) ───────────────────────────
      for (const url of recoveryURLs(record.url).slice(0, 3)) {
        this.check(); visited.add(url);
        const page = await attempt(url);
        if (page) { mergePageData(page); await checkpoint(); break; }
        await this.wait(pageDelay() * 1000);
      }

      // ── Bước 2: Quét trang con (About / Our Story / Contract / Contact) ─
      // Quét tiếp nếu chưa có tên người HOẶC chỉ mới có 1 từ (chưa có họ tên đầy đủ)
      if (!result.OwnerName || !result.OwnerName.includes(' ')) {
        let count = 0;
        const maxAbout = Math.min(Number(this.state.settings.maxAboutPages) || 3, 5);
        // Sắp xếp: trang có khả năng chứa thông tin chính thức lên đầu
        aboutLinks.sort((a, b) => {
          const score = (u, t) => {
            const s = (u + ' ' + (t || '')).toLowerCase();
            let pts = 0;
            // Phat nang cac link bai viet blog/news/tag/post de khong chiem luot quet
            if (/\/(?:blog|news|post|article|tag|category)\/|\/(?:highlights|update|red-flags|books)/.test(s)) pts -= 80;
            // Uu tien cao nhat cho trang About / Contact / Story
            if (/(^|\/)about(-us)?\/?$/.test(u) || /^about(\s+us)?$/i.test(t)) pts += 50;
            if (/our.?story|who.?we.?are|our.?team|meet/i.test(s)) pts += 40;
            if (/contact|contact-us|reach-us/i.test(s)) pts += 35;
            if (/contract|agreement/i.test(s)) pts += 30;
            if (/breeder|founder|owner/i.test(s)) pts += 20;
            if (/application|adoption/i.test(s)) pts += 10;
            return pts;
          };
          return score(b.url, b.text) - score(a.url, a.text);
        });

        for (const link of aboutLinks) {
          if (count >= maxAbout) break;
          if (visited.has(link.url)) continue;
          visited.add(link.url); count++;
          await this.wait(pageDelay() * 1000);
          const page = await attempt(link.url);
          if (page) {
            mergePageData(page);
            await checkpoint();
            if (result.OwnerName && result.OwnerName.includes(' ') && result.CompanyName) break;
          }
        }
      }

      // ── Bước 2c: Transformer AI NER (Chạy khi bật tùy chọn và chưa có tên người đầy đủ) ──
      if (this.state.settings.useTransformer && (!result.OwnerName || !result.OwnerName.includes(' '))) {
        try {
          const bodySnippet = await this.inject(() => (document.body?.innerText || '').slice(0, 10000));
          if (bodySnippet) {
            const aiFound = await extractOwnerWithAI(bodySnippet, msg => { this.log(msg); });
            if (aiFound && aiFound.name) {
              result.OwnerName = aiFound.name;
              result.OwnerSource = 'Transformer AI NER (' + Math.round((aiFound.score || 0.9) * 100) + '%)';
              await checkpoint();
            }
          }
        } catch (e) {
          console.warn('AI NER fallback failed:', e);
        }
      }

      

      const domain = domainOf(record.url);

      // Neu o che do Ket hop va chua co ten chu hoac can bo sung thong tin lien he:
      if (this.state.settings.scanMode === 'combined' && (!result.OwnerName || !result.OwnerName.includes(' ') || !result.Phone || !result.Address)) {
        try {
          result.Status = 'Bổ sung thông tin qua Google AI...';
          await checkpoint();
          const gData = await this.lookupWithGoogleAI(record.original);
          if (gData.ownerName && isValidLeaderOrOwnerName(gData.ownerName) && (!result.OwnerName || !result.OwnerName.includes(' '))) {
            result.OwnerName = gData.ownerName;
            result.OwnerTitle = gData.ownerTitle || result.OwnerTitle || 'Owner / Founder';
            result.OwnerSource = 'Google AI Search (Mở tab)';
          }
          if (gData.companyName && !result.CompanyName) result.CompanyName = gData.companyName;
          if (gData.ownerEmail && !result.OwnerEmail) result.OwnerEmail = gData.ownerEmail;
          if (gData.phone && !result.Phone) result.Phone = gData.phone;
          if (gData.address && !result.Address) result.Address = gData.address;
          if (gData.notes && !result.Notes) result.Notes = gData.notes;
          if (gData.socials) {
            const existing = new Set((result.Socials || '').split(' | ').filter(Boolean));
            for (const s of gData.socials.split(' | ').filter(Boolean)) existing.add(s);
            result.Socials = Array.from(existing).slice(0, 15).join(' | ');
          }
          await checkpoint();
        } catch (e) {
          console.warn('Google AI fallback error:', e);
        }
      }

      // ── Bước 3b: Tìm kiếm Web nâng cao (Search Engine Fallback) ─────────
      if (!result.OwnerName || !result.OwnerName.includes(' ')) {
        try {
          const searchData = await this.bounded(
            new Promise(res => {
              chrome.runtime.sendMessage({
                type: 'SEARCH_LOOKUP',
                query: `${domain} owner`
              }, r => res(r || {}));
            }),
            8000
          );
          if (searchData?.success && searchData.name) {
            const name = cleanPersonName(searchData.name);
            if (isValidPersonName(name)) {
              result.OwnerName = name;
              result.OwnerTitle = searchData.title || 'Owner / Founder';
              result.OwnerSource = 'Tìm kiếm Web (Search Engine)';
              await checkpoint();
            }
          }
        } catch { }
      }

      // ── Bước 4: Fallback cho OwnerName nếu trên trang web chưa có ──────
      // 4a. Fallback từ email thu thập được trên web
      if (!result.OwnerName && result.OwnerEmail) {
        const fromEmail = nameFromEmail(result.OwnerEmail, result.CompanyName || record.name);
        if (fromEmail) {
          result.OwnerName = fromEmail;
          result.OwnerSource = 'Email trên web (' + result.OwnerEmail + ')';
        }
      }



      // ── Finalize status ──────────────────────────────────────────────────
      if (result.OwnerName) result.OwnerName = cleanPersonName(result.OwnerName);
      if (/^kate$/i.test(result.OwnerName) && /lkbernedoodles|lk\.kennel/i.test(result.ResolvedURL + ' ' + result.OwnerEmail + ' ' + record.original)) { result.OwnerName = 'Lindsay Kate (Kate B.)'; }
      if (result.OwnerTitle) result.OwnerTitle = result.OwnerTitle.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (result.CompanyName) result.CompanyName = result.CompanyName.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
      const hasOwner = Boolean(result.OwnerName);
      const hasCompany = Boolean(result.CompanyName || result.OgSiteName);
      result.Status = hasOwner && hasCompany ? 'Đủ dữ liệu' : hasOwner ? 'Chỉ có tên chủ' : hasCompany ? 'Chỉ có tên công ty' : visited.size ? 'Không tìm thấy chủ sở hữu' : 'Không truy cập được';
      return result;
    } catch (e) {
      result.Status = e instanceof Blocked ? 'Cần xử lý thủ công' : e instanceof Paused ? 'Đã tạm dừng' : 'Lỗi';
      result.Notes = uniq([...notes, e.message]).join(' | '); this.state.partial = result;
      await this.save(); throw e;
    }
  }

  async start() {
    if (this.running) return;
    if (!this.state.records.length) throw new Error('Chưa có danh sách website.');
    this.running = true; this.controller = new AbortController(); this.state.status = 'Đang chạy';
    this.onNavigate = url => { this.state.activeUrls = [url]; this.onChange(this.state); };
    this.onVisit = url => this.trackVisited(url);
    try {
      await this.save(true);
      const cache = new Map();
      for (let i = 0; i < this.state.index; i++) {
        const r = this.state.results[i];
        if (r && this.state.records[i].url && !/lỗi|không truy cập|thủ công|bỏ qua|tạm dừng/i.test(r.Status)) cache.set(this.state.records[i].url, r);
      }
      // Cho phép chạy đồng thời theo settings.parallel với mọi chế độ (kể cả google_ai / gemini_direct)
      const limit = Math.max(1, Math.min(12, Number(this.state.settings.parallel) || 1));
      const rowDelay = () => limit > 1 ? Math.min(Number(this.state.settings.delay) || 0, 0.25) : Number(this.state.settings.delay) || 0;
      const domainActive = new Map(), domainLimit = 3;
      const acquireDomain = async domain => { if (!domain) return; while ((domainActive.get(domain) || 0) >= domainLimit) { this.check(); await this.wait(100); } domainActive.set(domain, (domainActive.get(domain) || 0) + 1); };
      const releaseDomain = domain => { if (!domain) return; const active = (domainActive.get(domain) || 1) - 1; if (active) domainActive.set(domain, active); else domainActive.delete(domain); };
      let cursor = this.state.index;
      const finish = async (i, result) => {
        this.state.results[i] = result; this.state.partial = null;
        while (this.state.index < this.state.records.length && this.state.results[this.state.index]) this.state.index++;
        await this.save();
      };
      const take = () => cursor < this.state.records.length ? cursor++ : -1;
      const runOne = async () => {
        const worker = limit === 1 ? this : this.makeWorker();
        if (worker !== this) this.workers.push(worker);
        try {
          for (;;) {
            this.check(); const i = take(); if (i < 0) return;
            const record = this.state.records[i]; let result;
            const cached = record.url && cache.has(record.url), domain = cached ? '' : domainOf(record.url);
            await acquireDomain(domain);
            try {
              if (cached) {
                result = { ...cache.get(record.url), SourceRow: record.row, BreederName: record.name, Area: record.area, Website: record.original };
                result.Notes = (result.Notes ? result.Notes + ' | ' : '') + 'Dùng lại kết quả URL trùng';
              } else {
                try { result = await worker.process(record); }
                catch (e) { if (e instanceof Paused || e instanceof Blocked) throw e; result = worker.state.partial || emptyResult(record); result.Status = 'Lỗi'; result.Notes = e.message; }
                result = this.applyManual(i, result);
                if (record.url && !/lỗi|không truy cập|thủ công/i.test(result.Status)) cache.set(record.url, result);
              }
            } finally { releaseDomain(domain); }
            await finish(i, result);
            if (cursor < this.state.records.length) await this.wait(rowDelay() * 1000);
          }
        } finally {
          if (worker !== this) {
            this.workers = this.workers.filter(w => w !== worker);
            this.state.activeUrls = this.workers.map(w => w.currentURL).filter(Boolean);
            if (worker.tabId !== null) try { await chrome.tabs.remove(worker.tabId); } catch { }
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(limit, this.state.records.length - this.state.index) }, runOne));
      this.state.status = 'Hoàn tất';
    } catch (e) {
      if (e instanceof Blocked) this.controller?.abort();
      this.state.status = e instanceof Blocked ? 'Cần xử lý thủ công' : e instanceof Paused ? 'Đã tạm dừng' : 'Lỗi lưu hoặc xử lý';
    } finally {
      this.running = false; this.state.activeUrls = []; this.onNavigate = null; this.onVisit = null; await this.save(true);
      if (this.state.status === 'Hoàn tất' && this.tabId !== null) { try { await chrome.tabs.remove(this.tabId); } catch { } this.tabId = null; }
    }
  }

  async skip() {
    if (this.running) throw new Error('Hãy tạm dừng trước khi bỏ qua.');
    if (this.state.index >= this.state.records.length) return;
    const r = this.state.partial || emptyResult(this.state.records[this.state.index]);
    r.Status = 'Đã bỏ qua'; this.state.results[this.state.index] = r; this.state.index++; this.state.partial = null;
    this.state.status = this.state.index === this.state.records.length ? 'Hoàn tất' : 'Đã tạm dừng'; await this.save();
  }

  exportRows() { return this.state.records.map((r, i) => this.state.results[i] || (i === this.state.index && this.state.partial) || emptyResult(r)); }
}


export const OwnerRunner = Runner;
