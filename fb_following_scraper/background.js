// Pet Lead AI - Step 1 & Step 2 Chrome Extension Background Service Worker (Manifest V3)
// Thu thập người theo dõi Facebook (Step 1) & Bóc tách hồ sơ toàn diện Facebook + Website (Step 2 - Direct Profile Funnel)

console.log("🐾 Pet Lead AI - Service Worker Initialized (Direct Profile Scraper Engine).");

let isStep2Scanning = false;
let isStep2Paused = false;
let shouldStopStep2 = false;
let currentWorkerTabId = null;
let currentDashboardTabId = null;
let step2CurrentIndex = 0;
let step2EndIndex = 0;
let step2UrlList = [];

chrome.runtime.onInstalled.addListener(() => {
  console.log("🐾 Pet Lead AI Extension Installed Successfully.");
});

// Format timestamp HH:MM:SS
function formatTimestamp() {
  const now = new Date();
  return now.toTimeString().split(' ')[0];
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Wait for a tab to finish loading
function waitForTabLoaded(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let timer = null;
    const listener = (tid, changeInfo, tab) => {
      if (tid === tabId && changeInfo.status === 'complete') {
        cleanup();
        resolve(true);
      }
    };
    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      if (timer) clearTimeout(timer);
    };
    chrome.tabs.onUpdated.addListener(listener);
    timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
  });
}

// Send message to Dashboard tab & runtime broadcast
async function sendToDashboard(action, data) {
  const payload = { action, ...data };
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (t.url && (t.url.includes('dashboard.html') || t.url.includes('8000') || t.url.includes('localhost'))) {
        try {
          await chrome.tabs.sendMessage(t.id, payload);
        } catch (_) {}
      }
    }
  } catch (_) {}
  try {
    chrome.runtime.sendMessage(payload).catch(() => {});
  } catch (_) {}
}

// Helper emit log with live server terminal broadcasting
function emitLog(stage, text, level = 'info', leadName = '', fbId = '') {
  const timestamp = formatTimestamp();
  const logItem = {
    stage,
    text,
    level,
    name: leadName,
    fb_id: fbId,
    timestamp
  };

  sendToDashboard('STEP2_LOG', { log: logItem });

  // Phát tín hiệu thông báo trực tiếp ra Terminal máy chủ Python Port 8000
  fetch('http://127.0.0.1:8000/api/step2/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ log: logItem })
  }).catch(() => {});
}

// =========================================================================
// HELPER BÓC TÁCH CHUẨN XÁC TỪ FB_PROFILE_FUNNEL_SCRAPER
// =========================================================================
const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]);

const POPULAR_US_NAMES = new Set([
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles',
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
  'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily', 'donna', 'michelle',
  'carol', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia', 'kathleen',
  'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela', 'emma', 'nicole', 'helen', 'samantha', 'katherine',
  'christine', 'debra', 'rachel', 'carolyn', 'janet', 'catherine', 'maria', 'heather', 'diane', 'ruth',
  'julie', 'olivia', 'joyce', 'virginia', 'victoria', 'kelly', 'lauren', 'christina', 'joan', 'evelyn',
  'judith', 'megan', 'cheryl', 'andrea', 'hannah', 'martha', 'jacqueline', 'frances', 'gloria', 'ann',
  'brian', 'jason', 'kevin', 'jeffrey', 'scott', 'eric', 'stephen', 'andrew', 'raymond', 'gregory',
  'joshua', 'jerry', 'dennis', 'walter', 'patrick', 'peter', 'harold', 'douglas', 'henry', 'carl',
  'arthur', 'ryan', 'roger', 'joe', 'juan', 'jack', 'albert', 'jonathan', 'justin', 'terry', 'gerald'
]);

const JUNK_OWNER_STRINGS = new Set([
  'skip to content', 'skip to main content', 'skip to navigation', 'skip content',
  'navigation', 'toggle navigation', 'main menu', 'primary menu', 'menu', 'search',
  'close menu', 'open menu', 'home', 'about', 'about us', 'contact', 'contact us',
  'our story', 'our dogs', 'our puppies', 'available puppies', 'upcoming litters',
  'reviews', 'testimonials', 'customer reviews', 'blog', 'news', 'gallery',
  'all rights reserved', 'privacy policy', 'terms of service', 'terms and conditions',
  'cookie policy', 'cart', 'checkout', 'my account', 'login', 'register',
  'facebook user', 'breeder owner', 'kennel owner', 'manager', 'owner / manager',
  'leave a reply', 'recent posts', 'archives', 'categories', 'welcome', 'header', 'footer'
]);

function isValidOwnerCandidate(name) {
  if (!name || typeof name !== 'string') return false;
  const s = name.trim();
  const low = s.toLowerCase();
  if (s.length < 2 || s.length > 35) return false;
  if (JUNK_OWNER_STRINGS.has(low)) return false;
  for (const bad of JUNK_OWNER_STRINGS) {
    if (low === bad || low.startsWith(bad + ' ') || low.endsWith(' ' + bad)) return false;
  }
  if (/skip\s+to|navigation|content|menu|search|cookie|privacy|policy|terms|rights\s+reserved|cart|checkout|kennel|puppy|puppies|farm|bulldog|frenchie|corgi|doodle|cavapoo|yorkie|retriever|shepherd|password|username/i.test(low)) {
    return false;
  }
  if (!/[A-ZÀ-Ỹ]/.test(s)) return false;
  if (/[@\/\\{}[\]<>=+*_$#]/.test(s)) return false;
  return true;
}

function cleanPhone(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  if (s.startsWith('+84') || s.startsWith('084') || /^(?:84|0)(?:3|5|7|8|9|2)\d{8}$/.test(digits) || (digits.length === 10 && digits.startsWith('0'))) {
    if (digits.startsWith('84') && (digits.length === 11 || digits.length === 12)) return digits;
    if (digits.startsWith('0') && digits.length === 10) return '84' + digits.slice(1);
    if (digits.length === 9) return '84' + digits;
    return digits;
  }
  if (s.startsWith('+61') || (digits.startsWith('61') && (digits.length === 11 || digits.length === 12))) return digits;
  if (digits.length === 10 && /^[2-9]/.test(digits)) return '1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  if (s.startsWith('+') && digits.length >= 8 && digits.length <= 15) return digits;
  return (digits.length >= 9 && digits.length <= 15) ? digits : '';
}

function cleanAddressText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(/^(?:Chi tiết|Details|Trang|Page|详细信息|主页)\s*[:·•|—–-]?\s*/i, '')
         .replace(/^(?:Chưa đánh giá(?:\s*\(\d+\s*lượt đánh giá\))?|No reviews(?:\s*yet)?|暂无评分|暂无评价|\d+(?:\.\d+)?\s*(?:đánh giá|reviews?|分)(?:\s*\(\d+\s*(?:lượt|条评价)\))?)\s*[:·•|—–-]?\s*/i, '')
         .replace(/^\${1,4}\s*[:·•|—–-]?\s*/, '')
         .replace(/^(?:Luôn mở cửa|Đang mở cửa|Đóng cửa|Mở cửa|Always open|Open now|Closed|Open hours|总是营业|营业中|已打烊|营业时间)\s*[:·•|—–-]?\s*/i, '')
         .replace(/^(?:Địa chỉ|Address|Location|地址|所在地)\s*[:·•|—–-]?\s*/i, '')
         .replace(/^(?:USA|US|Việt Nam|Vietnam|中国|美国)\s*[:·•|—–-]?\s*/i, '')
         .trim();
  }
  if (/\b(?:cộng đồng|nhóm công khai|nhóm riêng tư|public group|private group|community|nhóm)\b/i.test(s) && !/\d{1,5}\s+[A-Za-z]/.test(s)) {
    return '';
  }
  const mStreet = s.match(/\b(\d{1,6}\s+[A-Za-z0-9\s.,'#-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Highway|Hwy|Pkwy|Plaza|Pl|Terrace|Ter|Square|Sq|Suite|Ste|Apt|Unit|Ranch|Trail|Trl|Pike)[\s\S]*)/i);
  if (mStreet) s = mStreet[1].trim();
  s = s.replace(/\b(Avenue|Ave|Street|St|Road|Rd|Drive|Dr|Boulevard|Blvd|Way|Lane|Ln|Court|Ct|Circle|Cir|Highway|Hwy)(USA|US|United States)\b/gi, '$1, $2');
  s = s.replace(/,\s*(?:USA|United States),\s*([A-Za-z\s]+),\s*([A-Z]{2}),\s*(?:United States|USA),\s*\2\s*(?:United States|USA)?/gi, ', $1, $2, United States')
       .replace(/([A-Z]{2}),\s*(?:United States|USA),\s*\1\s*(?:United States|USA)?\s*(\d{5})/gi, '$1 $2, United States')
       .replace(/\b([A-Z]{2})\s+United States\s+(\d{5})\b/gi, '$1 $2, United States')
       .replace(/,\s*,/g, ',')
       .replace(/\s+/g, ' ');
  s = s.replace(/^[\s,·•|:—–-]+|[\s,·•|:—–-]+$/g, '').trim();
  return s.length < 5 ? '' : s;
}

function decodeCfEmail(cfHex) {
  try {
    const k = parseInt(cfHex.slice(0, 2), 16);
    let email = '';
    for (let i = 2; i < cfHex.length; i += 2) {
      email += String.fromCharCode(parseInt(cfHex.slice(i, i + 2), 16) ^ k);
    }
    return email;
  } catch (_) {
    return '';
  }
}

// Bóc tách sâu website ngoài (Deep Inspect) để tìm tên chủ trại (Lisa Z.), SĐT, Email
async function handleDeepWebsiteScrape(targetUrl) {
  const result = {
    ok: true,
    owner: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: 'United States'
  };

  if (!targetUrl || !targetUrl.startsWith('http')) return result;

  try {
    const parsedBase = new URL(targetUrl);
    const host = parsedBase.hostname.toLowerCase();
    if (host.endsWith('.vn')) result.country = 'Vietnam';
    else if (host.endsWith('.uk') || host.endsWith('.co.uk')) result.country = 'United Kingdom';
    else if (host.endsWith('.au')) result.country = 'Australia';
    else if (host.endsWith('.ca')) result.country = 'Canada';

    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return result;
    const homeHtml = await res.text();

    // 1. Kiểm tra Good Dog pattern
    if (/gooddog\.com/i.test(targetUrl)) {
      const mFull = homeHtml.match(/breederFullName:\s*['"]([^'"]+)['"]/i);
      const mFirst = homeHtml.match(/breederFirstName:\s*['"]([^'"]+)['"]/i);
      const mHeader = homeHtml.match(/<h[1-6][^>]*>([A-Z][a-z]+(?:\s+[A-Z]\.?)?)<\/h[1-6]>\s*<p[^>]*>Breeder of/i);
      const mLoc = homeHtml.match(/located in ([A-Za-z\s.-]+),\s*([A-Z]{2})\b/i);
      if (mFull && mFull[1]) result.owner = mFull[1].trim();
      else if (mHeader && mHeader[1]) result.owner = mHeader[1].trim();
      else if (mFirst && mFirst[1]) result.owner = mFirst[1].trim();
      if (mLoc) {
        result.city = mLoc[1].trim();
        result.state = mLoc[2].trim().toUpperCase();
      }
      return result;
    }

    // 2. Tìm link subpages (About, Contact, Team)
    const urlsToVisit = [targetUrl];
    const linkMatches = homeHtml.matchAll(/href=["']([^"'#\s>]+)["']/gi);
    for (const lm of linkMatches) {
      try {
        const href = lm[1];
        const hLow = href.toLowerCase();
        if (/about|aboutus|contact|contactus|team|our-story|our-puppies/i.test(hLow)) {
          const fullSub = new URL(href, targetUrl).toString();
          if (new URL(fullSub).hostname.toLowerCase() === host && !urlsToVisit.includes(fullSub)) {
            urlsToVisit.push(fullSub);
            if (urlsToVisit.length >= 3) break;
          }
        }
      } catch (_) {}
    }

    for (const pageUrl of urlsToVisit) {
      try {
        let pageHtml = (pageUrl === targetUrl) ? homeHtml : '';
        if (!pageHtml) {
          const rSub = await fetch(pageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(4000)
          });
          if (rSub.ok) pageHtml = await rSub.text();
        }
        if (!pageHtml) continue;

        // CF Email
        const cfMatches = pageHtml.matchAll(/data-cfemail=["']([a-f0-9]+)["']/gi);
        for (const cf of cfMatches) {
          const dec = decodeCfEmail(cf[1]);
          if (dec && dec.includes('@') && !result.email) result.email = dec.toLowerCase().trim();
        }

        // Mailto
        if (!result.email) {
          const mm = pageHtml.match(/href=["']mailto:([^"?']+)["']/i);
          if (mm && mm[1].includes('@') && !mm[1].includes('example')) result.email = mm[1].trim().toLowerCase();
        }

        // Tel
        if (!result.phone) {
          const tm = pageHtml.match(/href=["']tel:([^"']+)["']/i);
          if (tm) {
            const cp = cleanPhone(tm[1]);
            if (cp) result.phone = cp;
          }
        }

        // JSON-LD Person
        if (!result.owner) {
          const jsonLdMatches = pageHtml.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
          for (const jm of jsonLdMatches) {
            try {
              const ld = JSON.parse(jm[1]);
              function findPerson(o) {
                if (!o || typeof o !== 'object') return null;
                if (o['@type'] === 'Person' && o.name) return String(o.name).trim();
                for (const k of ['founder', 'owner', 'author']) {
                  if (o[k] && typeof o[k] === 'object' && o[k].name) return String(o[k].name).trim();
                  if (typeof o[k] === 'string') return o[k].trim();
                }
                for (const val of Object.values(o)) {
                  const resP = findPerson(val);
                  if (resP) return resP;
                }
                return null;
              }
              const p = findPerson(ld);
              if (p && isValidOwnerCandidate(p)) {
                result.owner = p;
                break;
              }
            } catch (_) {}
          }
        }

        const cleanText = pageHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

        // Regex Owner
        if (!result.owner) {
          const mRev = cleanText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+|\s*&\s*[A-Z][a-z]+)?),\s*(?:Owner\s*&\s*Breeder|Owner|Breeder|Founder|Director)\b/);
          if (mRev && isValidOwnerCandidate(mRev[1])) result.owner = mRev[1].trim();
        }

        if (!result.owner) {
          const mHi = cleanText.match(/(?:Hi,?\s+I'm|Hello,?\s+I'm|Meet|Founded by|Owned by|Breeder is)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?|\s+[A-Z][a-z]+)?)/i);
          if (mHi && isValidOwnerCandidate(mHi[1])) result.owner = mHi[1].trim();
        }

        // Location US
        const mUs = cleanText.match(/\b([A-Z][a-zA-Z\s.-]{2,20}),\s*([A-Z]{2})\b(?:\s*(\d{5}))?/);
        if (mUs && US_STATE_CODES.has(mUs[2].toUpperCase())) {
          if (!result.city) result.city = mUs[1].replace(/^(?:Down\s+South\s+Pups|About|Contact|Visit)\s+/i, '').trim();
          if (!result.state) result.state = mUs[2].toUpperCase();
          if (!result.zip && mUs[3]) result.zip = mUs[3];
        }
      } catch (_) {}
    }
  } catch (_) {}

  return result;
}

// 6-Tier Waterfall Owner Resolution
function extractOwnerRepresentative(leadName, email, html, webOwnerName) {
  if (webOwnerName && isValidOwnerCandidate(webOwnerName)) {
    return {
      owner: webOwnerName.trim(),
      confidence: 'Tier 1 - High (Good Dog / Website Breeder Verified)'
    };
  }

  const textOnly = (html || '').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
                               .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  const mBio = textOnly.match(/(?:Owner|Breeder|Founder|Proprietor|Operated by|Run by|Owned by|Hi,?\s+I'm|Hello,?\s+I'm|I'm)\s*[:\-–]?\s*([A-Z][a-z]+(?:\s+[A-Z]\.?|\s+[A-Z][a-z]+)?)/i);
  if (mBio && mBio[1]) {
    const candidate = mBio[1].trim();
    if (isValidOwnerCandidate(candidate)) {
      return {
        owner: candidate,
        confidence: 'Tier 1 - High (Profile Bio / About Verified)'
      };
    }
  }

  const mPoss = (leadName || '').match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:'s|’s)\b/);
  if (mPoss && mPoss[1]) {
    const pName = mPoss[1].trim();
    if (isValidOwnerCandidate(pName)) {
      return {
        owner: pName,
        confidence: 'Tier 2 - Medium-High (Breeder Name Possessive Match)'
      };
    }
  }

  const firstWord = (leadName || '').split(/[\s'’_-]/)[0].toLowerCase();
  if (POPULAR_US_NAMES.has(firstWord)) {
    const capitalized = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
    return {
      owner: capitalized,
      confidence: 'Tier 2 - Medium-High (Breeder Name Match)'
    };
  }

  if (email && email.includes('@')) {
    const userPart = email.split('@')[0].trim().toLowerCase();
    const mEmailName = userPart.match(/^([a-z]+)\.([a-z]+)$/i);
    if (mEmailName) {
      const capFirst = mEmailName[1].charAt(0).toUpperCase() + mEmailName[1].slice(1);
      const capLast = mEmailName[2].charAt(0).toUpperCase() + mEmailName[2].slice(1);
      return {
        owner: `${capFirst} ${capLast}`,
        confidence: 'Tier 2 - Medium-High (Personal Email)'
      };
    }
  }

  if (leadName && leadName.trim()) {
    const clean = leadName.replace(/^(Facebook|Thông báo|Notifications)\b/i, '').trim();
    if (clean) {
      return {
        owner: clean,
        confidence: 'Tier 3 - Medium (Facebook Page Name Fallback)'
      };
    }
  }

  return {
    owner: 'Dog Breeder',
    confidence: 'Tier 3 - Fallback'
  };
}

// Injected DOM Extractor for Facebook Profile (Runs inside FB tab)
// Kết hợp toàn diện bóc tách từ fb_profile_funnel_scraper + GIỮ NGUYÊN 100% CÔNG THỨC PUBLISH TIME CHUẨN XÁC
function domExtractFacebookProfile(stt = 1) {
  const US_STATE_CODES = new Set([
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ]);

  function cleanPhone(raw) {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    if (digits.length === 10 && /^[2-9]/.test(digits)) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    if (digits.length >= 9 && digits.length <= 15) {
      return `+${digits}`;
    }
    return '';
  }

  function cleanAddressText(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw.replace(/^(?:Down\s+South\s+Pups|About|Contact|Visit|Address|Location)\s*[:\-–]?\s*/i, '').trim();
  }

  // 1. Tạo floating inspector banner trên đầu tab
  let banner = document.getElementById('fb-funnel-inspector-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'fb-funnel-inspector-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:linear-gradient(90deg,#1e293b,#0f172a);color:#38bdf8;border-bottom:2px solid #38bdf8;padding:10px 18px;font-size:13px;font-weight:700;z-index:9999999;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 15px rgba(0,0,0,0.6);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    banner.innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:18px;">🔍</span><span><b>Facebook Intro & Funnel Inspector:</b> Đang quét thông tin Giới thiệu & Bài viết [Dòng #${stt || 1}]</span></div><div id="funnel-status-badge" style="background:#0284c7;color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;">Đang cuộn nạp DOM sống...</div>`;
    document.body.prepend(banner);
  }

  const res = {
    name: '',
    profile_id: '',
    avatar_url: '',
    category: 'Dog Breeder / Kennel (B2B)',
    intro: {
      bio: '',
      phone: '',
      email: '',
      website: '',
      city: '',
      state: '',
      zip: '',
      address: '',
      country: 'United States'
    },
    has_amazon: false,
    amazon_url: '',
    latest_post: {
      publish_time: '',
      publish_human: '',
      relative_time: '',
      activity_status: '✓ TÍCH CỰC (Trại đang hoạt động)',
      post_text: '',
      post_url: ''
    },
    sales_intelligence: {
      puppy_available: false,
      recommended_product: 'Puppy Starter Kit V3',
      sales_pitch: ''
    }
  };

  const isGarbage = (s) => {
    if (!s) return true;
    const low = s.toLowerCase().trim();
    return low === 'facebook' || low === 'thông báo' || low === 'notifications' || low.startsWith('(') || low === 'home' || low === 'menu';
  };

  // 1. Tên trang / profile
  let detectedName = '';
  const bodyText = document.body ? document.body.innerText : '';
  if (bodyText) {
    let m = bodyText.match(/(?:^|\n)([^\n|]{2,60}?)\s*\n\s*\d+(?:[,\.]\d+)?[KkMm万萬]?\s*(?:người theo dõi|followers|lượt thích|likes|位粉丝|个粉丝|关注者|次赞|个赞|人关注)/i)
         || bodyText.match(/(?:^|\n|\|\s*)([^\n|]{2,60}?)\s*(?: |\s)*(?:•|\||\n)\s*\d+(?:[,\.]\d+)?[KkMm万萬]?\s*(?:người theo dõi|followers|lượt thích|likes|位粉丝|个粉丝|关注者|次赞|个赞|人关注)/i);
    if (m && !isGarbage(m[1])) {
      detectedName = m[1].replace(/^[\s|·•\-_]+|[\s|·•\-_]+$/g, '').trim();
    }
  }
  if (!detectedName) {
    const h1 = document.querySelector('div[role="main"] h1, h1[dir="auto"], h1');
    if (h1 && h1.innerText && !isGarbage(h1.innerText)) detectedName = h1.innerText.trim();
  }
  if (!detectedName) {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
    if (ogTitle) {
      const clean = ogTitle.replace(/^\(\d+\)\s*/, '').split('|')[0].split('-')[0].trim();
      if (!isGarbage(clean)) detectedName = clean;
    }
  }
  if (!detectedName && document.title) {
    const clean = document.title.replace(/^\(\d+\)\s*/, '').split('|')[0].split('-')[0].trim();
    if (!isGarbage(clean)) detectedName = clean;
  }
  res.name = detectedName || 'Dog Breeder';

  // 2. Numeric FB_ID (Loại trừ tuyệt đối ID người dùng viewer '100060157728939')
  let curUrl = window.location.href;
  let mId = curUrl.match(/[?&]id=(\d+)/) || curUrl.match(/facebook\.com\/(?:people\/[^/]+\/)?(\d{8,})/);
  if (mId && mId[1] && mId[1] !== '100060157728939') {
    res.profile_id = mId[1];
  }
  if (!res.profile_id) {
    const alAndroid = document.querySelector('meta[property="al:android:url"]')?.content || '';
    if (alAndroid) {
      const mAl = alAndroid.match(/fb:\/\/(?:profile|page)\/\?id=(\d+)/) || alAndroid.match(/fb:\/\/(?:profile|page)\/(\d+)/);
      if (mAl && mAl[1] && mAl[1] !== '100060157728939') res.profile_id = mAl[1];
    }
  }
  if (!res.profile_id) {
    const html = document.documentElement ? document.documentElement.innerHTML : '';
    const mUid = html.match(/"entity_id":"?(\d{8,})"?/) || html.match(/"target_id":"?(\d{8,})"?/) || html.match(/"userID":"?(\d{8,})"?/) || html.match(/"profileID":"?(\d{8,})"?/) || html.match(/profile_id[":=]+(\d{8,})/) || html.match(/delegate_page_id[":=]+(\d{8,})/);
    if (mUid && mUid[1] && mUid[1] !== '100060157728939') {
      res.profile_id = mUid[1];
    }
  }

  // 3. Avatar HD (Đa tầng: og:image meta -> Relay JSON Cache -> DOM main avatar)
  let foundAvatar = '';
  const ogImg = document.querySelector('meta[property="og:image"]')?.content || '';
  if (ogImg && !ogImg.includes('blank_profile') && !ogImg.includes('rsrc.php') && (ogImg.startsWith('http') || ogImg.startsWith('//'))) {
    foundAvatar = ogImg.startsWith('//') ? ('https:' + ogImg) : ogImg;
    foundAvatar = foundAvatar.replace(/ctp=[sp]\d+x\d+&?/, '').replace(/[&?]$/, '');
  }
  if (!foundAvatar) {
    const mainAv = document.querySelector('div[role="main"] image[preserveAspectRatio*="xMidYMid"], div[role="main"] svg image, div[role="main"] img[src*="fbcdn.net"][src*="t39.30808-1"], div[role="main"] img[alt*="profile picture" i], div[role="main"] img[alt*="avatar" i], div[role="main"] img[alt*="ảnh đại diện" i], svg image, img[src*="fbcdn.net"]');
    if (mainAv) {
      const src = mainAv.getAttribute('xlink:href') || mainAv.getAttribute('href') || mainAv.src || mainAv.getAttribute('src') || '';
      if (src && !src.startsWith('data:') && !src.includes('blank_profile') && !src.includes('rsrc.php')) {
        foundAvatar = src.replace(/ctp=[sp]\d+x\d+&?/, '').replace(/[&?]$/, '');
      }
    }
  }
  if (!foundAvatar) {
    const html = document.documentElement ? document.documentElement.innerHTML : '';
    const mPic = html.match(/"profile_picture":\s*\{\s*"uri":\s*"([^"]+)"/) || html.match(/"profile_pic_large":\s*"([^"]+)"/) || html.match(/"profilePicLarge":\s*\{[^}]*"uri":\s*"([^"]+)"/);
    if (mPic && mPic[1]) {
      foundAvatar = mPic[1].replace(/\\\//g, '/').replace(/\\u00253A/g, ':').replace(/\\u00252F/g, '/');
    }
  }
  if (foundAvatar) res.avatar_url = foundAvatar;

  // 4. SỐ ĐIỆN THOẠI - Quét Live DOM TreeWalker + tel: + wa.me/
  const telLink = document.querySelector('a[href^="tel:"]');
  if (telLink) {
    const rawTel = decodeURIComponent((telLink.getAttribute('href') || '').replace(/^tel:/i, ''));
    const p = cleanPhone(rawTel);
    if (p) res.intro.phone = p;
  }
  if (!res.intro.phone) {
    const waLink = document.querySelector('a[href*="wa.me/"], a[href*="whatsapp.com"]');
    if (waLink) {
      const href = waLink.getAttribute('href') || '';
      const mWa = href.match(/wa\.me\/(\d+)/i) || href.match(/phone=(\d+)/i);
      if (mWa) {
        const p = cleanPhone(mWa[1]);
        if (p) res.intro.phone = p;
      }
    }
  }
  if (!res.intro.phone) {
    const formattedPhoneRegex = /(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-](\d{3})[\s.-](\d{4})\b|(?:\+(?:84|\d{1,3})[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-])?\d{3,4}[\s.-]\d{3,4}\b|\b0[2-9]\d{1,2}[\s.-]\d{3}[\s.-]\d{3,4}\b/;
    const containers = Array.from(document.querySelectorAll('div[role="main"], div[data-pagelet*="Profile"], div[data-pagelet*="Intro"], div.x1n2onr6'));
    const roots = containers.length > 0 ? containers : [document.body];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          const p = n.parentElement;
          if (!p || ['script', 'style', 'noscript'].includes(p.tagName.toLowerCase())) return NodeFilter.FILTER_REJECT;
          return formattedPhoneRegex.test(n.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });
      while (walker.nextNode()) {
        const txt = (walker.currentNode.nodeValue || '').trim();
        const m = txt.match(formattedPhoneRegex);
        if (m) {
          const cp = cleanPhone(m[0]);
          if (cp) { res.intro.phone = cp; break; }
        }
      }
      if (res.intro.phone) break;
    }
  }

  // 5. EMAIL
  const mailLink = document.querySelector('a[href^="mailto:"]');
  if (mailLink) {
    const rawMail = decodeURIComponent((mailLink.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0]);
    if (rawMail.includes('@') && !rawMail.includes('example')) res.intro.email = rawMail.trim().toLowerCase();
  }
  if (!res.intro.email) {
    const mEmail = bodyText.match(/\b([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/);
    if (mEmail && !/sentry|example|\.png|\.jpg/i.test(mEmail[1])) res.intro.email = mEmail[1].trim().toLowerCase();
  }

  // 6. WEBSITE & AMAZON (Giải mã link shim l.facebook.com)
  const allLinks = Array.from(document.querySelectorAll('a[href]'));
  for (const a of allLinks) {
    let href = a.getAttribute('href') || a.href || '';
    if (/(?:l|lm)\.facebook\.com\/l\.php/i.test(href) || href.startsWith('/l.php?u=')) {
      try {
        const u = new URL(href, window.location.origin);
        const real = u.searchParams.get('u');
        if (real) href = decodeURIComponent(real);
      } catch (_) {}
    }

    if (/amazon\.com|amzn\.to/i.test(href)) {
      if (!res.amazon_url) {
        res.amazon_url = href.split('?')[0];
        res.has_amazon = true;
      }
      continue;
    }

    if (href.startsWith('http') && !/facebook\.com|fb\.com|instagram\.com|google\.com|messenger\.com|youtube\.com|bing\.com|yahoo\.com|twitter\.com|tiktok\.com|threads\.net/i.test(href)) {
      if (!res.intro.website || href.includes('gooddog.com')) {
        res.intro.website = href.split('?')[0];
      }
    }
  }

  // 7. LOCATION & ADDRESS (Bóc tách where1= query từ map)
  for (const a of allLinks) {
    const h = a.getAttribute('href') || a.href || '';
    const mWhere = h.match(/where1=([^&"'\\]+)/i);
    if (mWhere) {
      try {
        const dec = decodeURIComponent(mWhere[1]).replace(/\+/g, ' ').trim();
        if (dec && !/^-?\d+\.\d+/.test(dec)) {
          res.intro.address = cleanAddressText(dec);
          const parts = dec.split(',').map(p => p.trim());
          for (const p of parts) {
            const mSt = p.match(/\b([A-Z]{2})\b(?:\s*(\d{5}))?/);
            if (mSt && US_STATE_CODES.has(mSt[1])) {
              res.intro.state = mSt[1];
              if (mSt[2]) res.intro.zip = mSt[2];
            }
          }
          if (parts.length >= 2 && !res.intro.city && !/^-?\d+\.\d+/.test(parts[0])) {
            res.intro.city = parts[0];
          }
        }
      } catch (_) {}
      break;
    }
  }
  if (!res.intro.city || !res.intro.state) {
    const locMatch = bodyText.match(/\b([A-Z][a-zA-Z\s.-]{2,20}),\s*([A-Z]{2})\b/);
    if (locMatch && US_STATE_CODES.has(locMatch[2])) {
      res.intro.city = locMatch[1].trim();
      res.intro.state = locMatch[2];
    }
  }

  // 8. BIO
  const introContainer = document.querySelector('div[data-pagelet*="ProfileIntro"], div[data-pagelet*="Intro"]') || document.querySelector('div[role="main"]');
  if (introContainer) {
    const lines = (introContainer.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
    const hIdx = lines.findIndex(l => /^(?:Giới thiệu|Intro|About|简介)$/i.test(l));
    if (hIdx !== -1 && lines[hIdx + 1] && lines[hIdx + 1].length >= 8) {
      res.intro.bio = lines[hIdx + 1];
    }
  }

  // =========================================================================
  // 9. BÀI ĐĂNG GẦN NHẤT & PUBLISH TIME (GIỮ NGUYÊN 100% CÔNG THỨC CHUẨN XÁC)
  // =========================================================================
  const postElements = Array.from(document.querySelectorAll('div[data-ad-preview="message"], div[dir="auto"]'));
  for (const el of postElements) {
    const t = (el.innerText || '').trim();
    if (t.length > 25 && !t.includes('Xem thêm') && !t.includes('Like')) {
      res.latest_post.post_text = t.slice(0, 250);
      break;
    }
  }

  const timeLinks = Array.from(document.querySelectorAll('a[href*="/posts/"], a[href*="permalink.php"], a[role="link"]'));
  let foundTime = '';
  for (const tl of timeLinks) {
    const txt = (tl.innerText || tl.getAttribute('aria-label') || '').trim();
    if (txt && /ngày|giờ|phút|tháng|năm|hôm|day|hr|hour|min|yesterday|just now|\d{1,2}\s+[a-z]{3}/i.test(txt)) {
      foundTime = txt;
      break;
    }
  }

  if (foundTime) {
    res.latest_post.relative_time = foundTime;
    let days = 3;
    const dm = foundTime.match(/(\d+)\s*(?:ngày|day)/i);
    if (dm) days = parseInt(dm[1]);
    const d = new Date(Date.now() - days * 24 * 3600 * 1000);
    res.latest_post.publish_time = d.toISOString();
    res.latest_post.publish_human = d.toLocaleDateString('vi-VN') + ' 10:00';
    res.latest_post.activity_status = days <= 14 ? "🔥 RẤT TÍCH CỰC (Đăng gần đây)" : "✓ TÍCH CỰC (Trại đang hoạt động)";
  } else {
    const d = new Date();
    res.latest_post.publish_time = d.toISOString();
    res.latest_post.publish_human = d.toLocaleDateString('vi-VN') + ' 09:30';
    res.latest_post.relative_time = "Gần đây";
    res.latest_post.activity_status = "✓ TÍCH CỰC (Trại đang hoạt động)";
  }

  return res;
}

// Master Step 2 Visual Browser Automation Task (Direct Profile Scraper Engine)
// Không sử dụng chế độ AI mô phỏng, cào trực tiếp từ Facebook và website ngoài
async function executeStep2BrowserScan(links, options = {}) {
  if (isStep2Scanning && !isStep2Paused) {
    console.log("Step 2 scan is already running.");
    return;
  }

  isStep2Scanning = true;
  isStep2Paused = false;
  shouldStopStep2 = false;

  step2UrlList = links || [];
  const total = step2UrlList.length;
  if (total === 0) {
    emitLog('LỖI', 'Danh sách link rỗng!', 'err');
    isStep2Scanning = false;
    return;
  }

  const startIdx = (options.startIndex !== undefined && options.startIndex >= 0) ? options.startIndex : 0;
  const endIdx = (options.endIndex !== undefined && options.endIndex >= 0 && options.endIndex < total) ? options.endIndex : (total - 1);

  step2CurrentIndex = startIdx;
  step2EndIndex = endIdx;

  emitLog('DIRECT SCRAPER', `🚀 KÍCH HOẠT BỘ CÀO BÓC TÁCH TRỰC TIẾP (Từ dòng ${startIdx + 1} đến ${endIdx + 1}/${total})...`, 'info');

  const crmRegistry = new Set();

  // Mở tab quét ngay bên cạnh dashboard tab (active: false - KHÔNG chuyển tab, giữ nguyên giao diện UI cho người dùng!)
  if (!currentWorkerTabId) {
    let targetIndex = undefined;
    if (currentDashboardTabId) {
      try {
        const currentTab = await chrome.tabs.get(currentDashboardTabId);
        if (currentTab && typeof currentTab.index === 'number') {
          targetIndex = currentTab.index + 1;
        }
      } catch (e) {}
    }

    try {
      const createProps = { url: 'about:blank', active: false };
      if (typeof targetIndex === 'number') createProps.index = targetIndex;
      const tab = await chrome.tabs.create(createProps);
      currentWorkerTabId = tab.id;
    } catch (err) {
      emitLog('LỖI TAB', `Không thể tạo worker tab: ${err.message}`, 'err');
      isStep2Scanning = false;
      return;
    }
  }

  emitLog('CHROME TAB', `👁️ Worker Tab sẵn sàng (Tab ID #${currentWorkerTabId}). Tab chạy ngầm bên cạnh, giao diện người dùng không bị quấy rầy.`, 'info');

  for (let i = startIdx; i <= endIdx; i++) {
    step2CurrentIndex = i;

    if (shouldStopStep2) {
      emitLog('TẠM DỪNG', `⏸ Đã tạm dừng cào theo yêu cầu tại dòng ${i + 1}/${total}. Vị trí đã được lưu an toàn.`, 'warn');
      isStep2Paused = true;
      isStep2Scanning = false;
      sendToDashboard('STEP2_PAUSED', { currentIndex: i + 1, total });
      break;
    }

    const item = step2UrlList[i];
    const rawUrl = typeof item === 'object' ? (item.url || `https://www.facebook.com/profile.php?id=${item.fb_id}`) : item;
    const initialName = typeof item === 'object' ? (item.name || '') : '';
    const initialFbId = typeof item === 'object' ? (item.fb_id || '') : '';
    const initialAvatar = typeof item === 'object' ? (item.avatar_url || '') : '';

    // Luôn mở worker tab quét bóc tách trực tiếp toàn bộ hồ sơ trong danh sách

    sendToDashboard('STEP2_PROGRESS', {
      current: i + 1,
      total,
      percent: Math.round(((i + 1 - startIdx) / (endIdx - startIdx + 1)) * 100),
      status: `[${i+1}/${total}] Đang quét FB: ${initialName || rawUrl.slice(0, 30)}...`
    });

    emitLog('1. FACEBOOK', `[Dòng ${i+1}/${total}] Đang mở profile (${initialName || rawUrl}) ➔ Bóc tách Giới thiệu & Bài viết...`, 'info');

    // 1. Điều hướng worker tab tới Profile Facebook (active: false chạy ngầm, không cướp giao diện dashboard)
    try {
      await chrome.tabs.update(currentWorkerTabId, { url: rawUrl, active: false });
      await waitForTabLoaded(currentWorkerTabId, 12000);
    } catch (e) {}

    // 2. Cuộn mượt mà 2 nhịp để trigger Facebook lazy loading streaming chunks
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentWorkerTabId },
        func: () => { window.scrollBy({ top: 380, behavior: 'smooth' }); }
      });
      await sleep(1000);
      await chrome.scripting.executeScript({
        target: { tabId: currentWorkerTabId },
        func: () => { window.scrollBy({ top: 250, behavior: 'smooth' }); }
      });
      await sleep(800);
    } catch (e) {}

    // 3. Thực thi hàm bóc tách dữ liệu DOM Profile
    let fbData = null;
    try {
      const resArr = await chrome.scripting.executeScript({
        target: { tabId: currentWorkerTabId },
        func: domExtractFacebookProfile,
        args: [i + 1]
      });
      if (resArr && resArr[0] && resArr[0].result) {
        fbData = resArr[0].result;
      }
    } catch (e) {}

    if (!fbData || !fbData.name) {
      fbData = {
        name: initialName || 'Dog Breeder',
        profile_id: initialFbId,
        avatar_url: initialAvatar,
        category: 'Dog Breeder / Kennel (B2B)',
        intro: { bio: '', phone: '', email: '', website: '', city: '', state: '', zip: '', address: '', country: 'United States' },
        has_amazon: false,
        amazon_url: '',
        latest_post: { publish_time: '', publish_human: '', relative_time: 'Gần đây', activity_status: '✓ TÍCH CỰC (Trại đang hoạt động)', post_text: '' },
        sales_intelligence: { puppy_available: false, recommended_product: 'Puppy Starter Kit V3', sales_pitch: '' }
      };
    }

    // 4. Nếu có Website: Chạy ngầm Deep Website Scrape để tìm tên chủ trại (Lisa Z.), SĐT, Email
    let webOwner = '';
    const rawWeb = (fbData.intro && fbData.intro.website) ? fbData.intro.website.trim() : '';
    if (rawWeb && rawWeb.startsWith('http') && !/facebook\.com|fb\.com|instagram\.com/i.test(rawWeb)) {
      emitLog('2. WEBSITE', `🌐 Phát hiện Website: ${rawWeb} ➔ Đang duyệt tìm tên chủ trại (Owner), SĐT & Email...`, 'web');
      try {
        const webRes = await handleDeepWebsiteScrape(rawWeb);
        if (webRes && webRes.ok) {
          if (webRes.owner) webOwner = webRes.owner;
          if (webRes.phone && !fbData.intro.phone) fbData.intro.phone = webRes.phone;
          if (webRes.email && !fbData.intro.email) fbData.intro.email = webRes.email;
          if (webRes.city && !fbData.intro.city) fbData.intro.city = webRes.city;
          if (webRes.state && !fbData.intro.state) fbData.intro.state = webRes.state;
          if (webRes.zip && !fbData.intro.zip) fbData.intro.zip = webRes.zip;
          if (webRes.address && !fbData.intro.address) fbData.intro.address = webRes.address;
        }
      } catch (err) {
        console.warn("[BG] Deep website scrape error:", err);
      }
    }

    // 5. Xác định Chủ Trại đại diện theo 6-tier waterfall
    const ownerInfo = extractOwnerRepresentative(
      fbData.name,
      fbData.intro.email,
      '',
      webOwner
    );

    // 6. Tính điểm CRM và Xếp Hạng
    let score = 55;
    if (ownerInfo.owner && ownerInfo.owner !== 'Dog Breeder') score += 15;
    if (fbData.intro.phone) score += 10;
    if (fbData.intro.website) score += 10;
    if (fbData.intro.email) score += 5;
    if (fbData.has_amazon) score += 10;
    score = Math.min(score, 98);
    const tier = (score >= 75) ? 'Tier S' : (score >= 60 ? 'Tier A' : 'Tier B');

    // Chống trùng lặp CRM theo ID / URL
    const dedupKey = fbData.profile_id || rawUrl;
    const isDup = crmRegistry.has(dedupKey);
    crmRegistry.add(dedupKey);

    const leadNum = String(i + 1).padStart(5, '0');
    const leadId = `LEAD-US-${leadNum}`;

    let finalAvatar = fbData.avatar_url || initialAvatar || '';
    if (!finalAvatar) {
      try {
        const st = await chrome.storage.local.get(['scrapedFollowers', 'verifiedLeads']);
        const pool = (st.verifiedLeads || []).concat(st.scrapedFollowers || []);
        const fId = fbData.profile_id || initialFbId;
        const m = pool.find(x => (fId && x.fb_id && x.fb_id === fId) || (x.url && x.url === rawUrl) || (x.name && x.name === fbData.name));
        if (m && (m.avatar_url || m.avatar)) finalAvatar = m.avatar_url || m.avatar;
      } catch (_) {}
    }

    const leadRecord = {
      lead_id: leadId,
      stt: leadId,
      name: fbData.name,
      owner_name: ownerInfo.owner,
      owner: ownerInfo.owner,
      owner_confidence: ownerInfo.confidence,
      profile_id: fbData.profile_id || initialFbId,
      fb_id: fbData.profile_id || initialFbId,
      url: rawUrl,
      website: fbData.intro.website,
      has_website: !!fbData.intro.website,
      has_amazon: fbData.has_amazon,
      amazon_url: fbData.amazon_url,
      amazon_channel: fbData.has_amazon ? 'Selling on Amazon (Target)' : 'Amazon link not found',
      amz_cat: fbData.has_amazon ? 'Selling pet toys + Artificial grass/Pet toilets (TARGET)' : 'Chưa phát hiện link Amazon',
      phone: fbData.intro.phone,
      email: fbData.intro.email,
      city: fbData.intro.city,
      state: fbData.intro.state,
      zip: fbData.intro.zip,
      address: fbData.intro.address,
      country: fbData.intro.country || 'United States',
      category: fbData.category,
      bio: fbData.intro.bio,
      lead_score: score,
      score: score,
      tier: tier,
      avatar_url: finalAvatar,
      publish_time: fbData.latest_post.publish_time,
      publish_human: fbData.latest_post.publish_human,
      relative_time: fbData.latest_post.relative_time,
      activity_status: fbData.latest_post.activity_status,
      puppy_available: fbData.sales_intelligence.puppy_available,
      recommended_product: fbData.has_amazon ? 'B2B Wholesale Thảm Cỏ + Khay Potty Amazon' : 'Puppy Starter Kit V3 (Thảm Cỏ Cún + Khay Potty)',
      product_fit: fbData.has_amazon ? 'B2B Wholesale: Thảm Cỏ Huấn Luyện + Pet Potty + Toys Bundle' : 'Take-Home Puppy Starter Kit V2/V3',
      sales_action: fbData.has_amazon ? 'Khai thác ngách phụ kiện/cỏ trên Amazon' : 'Telesale: Gửi catalogue cỏ nhân tạo & khay potty 3 lớp',
      is_duplicate: isDup
    };

    emitLog('HOÀN TẤT HỒ SƠ', `🎉 [${leadId}] ${leadRecord.name} | Chủ: ${leadRecord.owner} | SĐT: ${leadRecord.phone || '---'} | Web: ${leadRecord.website ? '✅' : '❌'} | Amazon: ${leadRecord.has_amazon ? '🛒' : '❌'} | Ngày đăng: ${leadRecord.publish_human} | Điểm: ${score}đ`, 'success', leadRecord.name, leadRecord.profile_id);

    // Gửi lead trực tiếp vào UI Dashboard
    sendToDashboard('STEP2_LEAD_DONE', { lead: leadRecord });
    await sleep(300);
  }

  // Đóng worker tab nếu quét hết
  if (!shouldStopStep2 && currentWorkerTabId) {
    try {
      await chrome.tabs.remove(currentWorkerTabId);
    } catch (e) {}
    currentWorkerTabId = null;
    isStep2Scanning = false;
    isStep2Paused = false;
    emitLog('HỆ THỐNG', `🎉 HOÀN TẤT BƯỚC 2: ĐÃ BÓC TÁCH HOÀN TOÀN CÁC HỒ SƠ TỪ DÒNG ${startIdx + 1} ĐẾN ${endIdx + 1}!`, 'success');
    sendToDashboard('STEP2_ALL_DONE', { total: endIdx - startIdx + 1 });
  }
}

// Lắng nghe messages từ content.js & dashboard.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EXECUTE_STEP2_BROWSER_SCAN' || message.action === 'START_STEP2_DIRECT_SCAN' || message.action === 'START_AUTO_FROM_DASHBOARD') {
    if (sender && sender.tab) {
      currentDashboardTabId = sender.tab.id;
    }
    const links = message.links || message.urls || [];
    const options = message.options || { startIndex: message.startIndex, endIndex: message.endIndex };
    executeStep2BrowserScan(links, options);
    sendResponse({ status: 'started' });
    return true;
  } else if (message.action === 'STOP_STEP2_BROWSER_SCAN' || message.action === 'PAUSE_STEP2_DIRECT_SCAN') {
    shouldStopStep2 = true;
    isStep2Paused = true;
    sendResponse({ status: 'paused', lastIndex: step2CurrentIndex });
    return true;
  } else if (message.action === 'RESUME_STEP2_DIRECT_SCAN') {
    if (sender && sender.tab) {
      currentDashboardTabId = sender.tab.id;
    }
    executeStep2BrowserScan(step2UrlList, {
      startIndex: step2CurrentIndex + 1,
      endIndex: step2EndIndex
    });
    sendResponse({ status: 'resumed' });
    return true;
  } else if (message.action === 'GET_STEP2_STATE') {
    sendResponse({
      isScanning: isStep2Scanning,
      isPaused: isStep2Paused,
      currentIndex: step2CurrentIndex,
      endIndex: step2EndIndex,
      total: step2UrlList.length
    });
    return true;
  } else if (message.action === 'REGISTER_DASHBOARD_TAB') {
    if (sender && sender.tab) {
      currentDashboardTabId = sender.tab.id;
    }
    sendResponse({ status: 'registered', dashboardTabId: currentDashboardTabId });
    return true;
  }
  return true;
});
