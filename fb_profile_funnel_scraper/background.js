let urlList = [];
let currentIndex = 0;
let startIndex = 0;
let endIndex = -1;
let allData = [];
let isAutoRunning = false;
let isPaused = false;
let targetTabId = null;
let statusMessage = "Sẵn sàng";

// Khóa chống trùng lặp và đa luồng
let currentTaskId = null;
let isProcessing = false;
let nextTimer = null;
let currentWatchdogTimer = null;

function clearNextTimer() {
  if (nextTimer) {
    clearTimeout(nextTimer);
    nextTimer = null;
  }
}

function clearWatchdogTimer() {
  if (currentWatchdogTimer) {
    clearTimeout(currentWatchdogTimer);
    currentWatchdogTimer = null;
  }
}

function scheduleNext(delayMs = 1500) {
  clearNextTimer();
  nextTimer = setTimeout(() => {
    processNext();
  }, delayMs);
}

function saveState() {
  chrome.storage.local.set({
    fb_publish_state: {
      urlList,
      currentIndex,
      startIndex,
      endIndex,
      allData,
      isAutoRunning,
      isPaused,
      statusMessage
    }
  });
  broadcastState();
}

function loadState(cb) {
  chrome.storage.local.get(['fb_publish_state'], (res) => {
    if (res.fb_publish_state) {
      const s = res.fb_publish_state;
      urlList = s.urlList || [];
      currentIndex = s.currentIndex !== undefined ? s.currentIndex : 0;
      startIndex = s.startIndex !== undefined ? s.startIndex : 0;
      endIndex = s.endIndex !== undefined ? s.endIndex : -1;
      allData = s.allData || [];
      isAutoRunning = s.isAutoRunning || false;
      isPaused = s.isPaused || false;
      statusMessage = s.statusMessage || "Sẵn sàng";
    }
    if (cb) cb();
  });
}

function broadcastState() {
  chrome.runtime.sendMessage({
    action: 'STATE_UPDATED',
    state: {
      urlList,
      currentIndex,
      startIndex,
      endIndex,
      allData,
      isAutoRunning,
      isPaused,
      statusMessage
    }
  }).catch(() => {});
}

async function sendToDashboard(action, data) {
  const payload = { action, ...data };
  try {
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      // Chỉ gửi tab message cho Web Dashboard ngoài (127.0.0.1:8000, localhost:3007...),
      // TUYỆT ĐỐI KHÔNG gửi tab message cho extension page (chrome-extension://) vì runtime.sendMessage() bên dưới đã gửi rồi -> Chống lặp log 100%!
      if (t.url && !t.url.startsWith('chrome-extension://') && (t.url.includes('8000') || t.url.includes('localhost') || t.url.includes('3007') || t.url.includes('5500'))) {
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


// =========================================================================
// THẨM ĐỊNH LINK AMAZON CHUẨN XÁC & LOẠI TRỪ 100% LINK HỆ THỐNG RÁC
// =========================================================================
function sanitizeSingleAmazonUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let url = rawUrl.trim();

  // Giải mã link redirect nếu có l.facebook.com hoặc tương tự
  if (url.includes('facebook.com/l.php?u=') || url.includes('/flx/warn/?u=') || url.includes('u=')) {
    try {
      const u = new URL(url);
      const real = u.searchParams.get('u');
      if (real) url = decodeURIComponent(real);
    } catch (_) {}
  }

  // Kiểm tra domain Amazon
  if (!/(?:amazon\.[a-z.]+|amzn\.to|a\.co)/i.test(url)) {
    return null;
  }

  // Loại bỏ các URL hệ thống rác của Amazon
  const garbagePatterns = [
    /\/ap\/(?:signin|register|forgotpassword)/i,
    /\/gp\/(?:cart|help|navigation|css|your-account)\b/i,
    /\/(?:cart|sign-in|register|account-status)\b/i,
    /\/customer-preferences\b/i,
    /openid\.(?:mode|return_to)/i
  ];
  for (const pat of garbagePatterns) {
    if (pat.test(url)) return null;
  }

  try {
    const parsed = new URL(url.startsWith('http') ? url : 'https://' + url);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes('amazon') && !host.includes('amzn') && !host.includes('a.co')) return null;
    const path = parsed.pathname.replace(/\/+$/, '');

    // Nếu là a.co hoặc amzn.to short link hợp lệ
    if (host === 'a.co' || host.endsWith('.a.co') || host === 'amzn.to' || host.endsWith('.amzn.to')) {
      if (path && path.length > 1) return parsed.toString();
      return null;
    }

    // Nếu là amazon.com / amazon các nước: Loại bỏ trang chủ chung không có shop/store/product
    if (!path || path === '' || path === '/') {
      if (!parsed.searchParams.has('tag') && !parsed.searchParams.has('k')) {
        return null;
      }
    }

    return parsed.toString();
  } catch (_) {
    return null;
  }
}

function sanitizeAndValidateAmazonUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  if (rawUrl.includes(',')) {
    const parts = rawUrl.split(',').map(p => sanitizeSingleAmazonUrl(p.trim())).filter(Boolean);
    const unique = Array.from(new Set(parts));
    return unique.length > 0 ? unique.join(', ') : null;
  }
  return sanitizeSingleAmazonUrl(rawUrl);
}

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]);

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

  // Nếu chuỗi chỉ là tên Nhóm / Cộng đồng Facebook (không phải địa chỉ thực) -> Bỏ
  if (/\b(?:cộng đồng|nhóm công khai|nhóm riêng tư|public group|private group|community|nhóm)\b/i.test(s) && !/\d{1,5}\s+[A-Za-z]/.test(s)) {
    return '';
  }

  const mStreet = s.match(/\b(\d{1,6}\s+[A-Za-z0-9\s.,'#-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Highway|Hwy|Pkwy|Plaza|Pl|Terrace|Ter|Square|Sq|Suite|Ste|Apt|Unit|Ranch|Trail|Trl|Pike)[\s\S]*)/i);
  if (mStreet) {
    s = mStreet[1].trim();
  }

  s = s.replace(/\b(Avenue|Ave|Street|St|Road|Rd|Drive|Dr|Boulevard|Blvd|Way|Lane|Ln|Court|Ct|Circle|Cir|Highway|Hwy)(USA|US|United States)\b/gi, '$1, $2');
  s = s.replace(/,\s*(?:USA|United States),\s*([A-Za-z\s]+),\s*([A-Z]{2}),\s*(?:United States|USA),\s*\2\s*(?:United States|USA)?/gi, ', $1, $2, United States')
       .replace(/([A-Z]{2}),\s*(?:United States|USA),\s*\1\s*(?:United States|USA)?\s*(\d{5})/gi, '$1 $2, United States')
       .replace(/\b([A-Z]{2})\s+United States\s+(\d{5})\b/gi, '$1 $2, United States')
       .replace(/,\s*,/g, ',')
       .replace(/\s+/g, ' ');

  s = s.replace(/^[\s,·•|:—–-]+|[\s,·•|:—–-]+$/g, '').trim();
  if (s.length < 5) return '';

  return s;
}

const JUNK_OWNER_STRINGS = new Set([
  'skip to content', 'skip to main content', 'skip to navigation', 'skip content',
  'navigation', 'toggle navigation', 'main menu', 'primary menu', 'menu', 'search',
  'close menu', 'open menu', 'home', 'about', 'about us', 'contact', 'contact us',
  'our story', 'our dogs', 'our puppies', 'available puppies', 'upcoming litters',
  'reviews', 'testimonials', 'customer reviews', 'blog', 'news', 'gallery',
  'all rights reserved', 'privacy policy', 'terms of service', 'terms and conditions',
  'cookie policy', 'cart', 'checkout', 'my account', 'login', 'register',
  'facebook user', 'breeder owner', 'kennel owner', 'manager', 'owner / manager',
  'leave a reply', 'recent posts', 'archives', 'categories', 'welcome', 'header', 'footer',
  'the parent', 'the parents', 'parent', 'parents', 'with b', 'with', 'the', 'and', 'or', 'about'
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

  // Kiểm tra từ đầu tiên có phải là mạo từ, giới từ, đại từ, danh từ chung rác không
  const firstWord = low.split(/\s+/)[0];
  const BAD_FIRST_WORDS = new Set([
    'the', 'a', 'an', 'with', 'and', 'or', 'by', 'at', 'for', 'from', 'in', 'on', 'of', 'to',
    'our', 'your', 'my', 'us', 'we', 'they', 'them', 'he', 'she', 'it', 'its', 'their',
    'who', 'what', 'where', 'when', 'why', 'how', 'parent', 'parents', 'dam', 'sire',
    'puppy', 'puppies', 'dog', 'dogs', 'meet', 'about', 'contact', 'welcome'
  ]);
  if (BAD_FIRST_WORDS.has(firstWord)) return false;

  // Loại trừ các cụm từ kiểu "with B", "the Parent", "and More"
  if (/^(?:the|with|and|by|at|for|from|in|on|of|to)\s+/i.test(low)) return false;
  if (/^with\s+[a-z]\b/i.test(low)) return false;

  if (/skip\s+to|navigation|content|menu|search|cookie|privacy|policy|terms|rights\s+reserved|cart|checkout|kennel|puppy|puppies|farm|bulldog|frenchie|corgi|doodle|cavapoo|yorkie|retriever|shepherd|password|username|parent|parents/i.test(low)) {
    return false;
  }
  if (!/[A-ZÀ-Ỹ]/.test(s)) return false;
  if (/[@\/\\{}[\]<>=+*_$#]/.test(s)) return false;
  return true;
}

const THIRD_PARTY_FORM_HOSTS = new Set([
  'forms.monday.com', 'monday.com',
  'jotform.com', 'form.jotform.com',
  'forms.gle', 'docs.google.com',
  'typeform.com',
  'linktr.ee', 'campsite.bio', 'bio.site', 'beacons.ai', 'snipfeed.co', 'lnk.bio',
  'calendly.com', 'acuityscheduling.com'
]);

function isThirdPartyFormService(u) {
  if (!u) return false;
  try {
    const host = new URL(u).hostname.toLowerCase();
    for (const h of THIRD_PARTY_FORM_HOSTS) {
      if (host === h || host.endsWith('.' + h)) return true;
    }
  } catch (_) {}
  return false;
}

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
    country: '',
    has_amazon: false,
    amazon_url: '',
    subpagesVisited: []
  };

  if (!targetUrl || !targetUrl.startsWith('http')) {
    result.ok = false;
    result.error = 'Invalid URL';
    return result;
  }

  const parsedBase = new URL(targetUrl);
  const host = parsedBase.hostname.toLowerCase();
  if (host.endsWith('.vn')) result.country = 'Vietnam';
  else if (host.endsWith('.uk') || host.endsWith('.co.uk')) result.country = 'United Kingdom';
  else if (host.endsWith('.au')) result.country = 'Australia';
  else if (host.endsWith('.ca')) result.country = 'Canada';

  const urlsToVisit = [targetUrl];
  let homeHtml = '';

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    homeHtml = await res.text();
    result.subpagesVisited.push(targetUrl);

    if (/gooddog\.com/i.test(targetUrl)) {
      const mFull = homeHtml.match(/breederFullName:\s*['"]([^'"]+)['"]/i);
      const mFirst = homeHtml.match(/breederFirstName:\s*['"]([^'"]+)['"]/i);
      const mHeader = homeHtml.match(/<h[1-6][^>]*>([A-Z][a-z]+(?:\s+[A-Z]\.?)?)<\/h[1-6]>\s*<p[^>]*>Breeder of/i);
      const mLoc = homeHtml.match(/located in ([A-Za-z\s.-]+),\s*([A-Z]{2})\b/i) ||
                    homeHtml.match(/([A-Za-z\s.-]+),\s*([A-Z]{2})\s*·\s*Drop-off/i);
      if (mFull && mFull[1]) result.owner = mFull[1].trim();
      else if (mHeader && mHeader[1]) result.owner = mHeader[1].trim();
      else if (mFirst && mFirst[1]) result.owner = mFirst[1].trim();
      if (mLoc) {
        result.city = mLoc[1].trim();
        result.state = mLoc[2].trim().toUpperCase();
        result.country = 'United States';
      }
      return result;
    }

    const linkMatches = homeHtml.matchAll(/href=["']([^"'#\s>]+)["']/gi);
    for (const lm of linkMatches) {
      try {
        const href = lm[1];
        const hLow = href.toLowerCase();
        if (/about|aboutus|contact|contactus|team|our-process|waitlist|deposit|pricing|puppies/i.test(hLow)) {
          const fullSub = new URL(href, targetUrl).toString();
          const subHost = new URL(fullSub).hostname.toLowerCase();
          if (subHost === host && !urlsToVisit.includes(fullSub)) {
            urlsToVisit.push(fullSub);
            if (urlsToVisit.length >= 4) break;
          }
        }
      } catch (_) {}
    }
  } catch (err) {
    result.ok = false;
    result.error = err.message || String(err);
    return result;
  }

  const allTexts = [];
  for (const pageUrl of urlsToVisit) {
    try {
      let pageHtml = '';
      if (pageUrl === targetUrl) {
        pageHtml = homeHtml;
      } else {
        const rSub = await fetch(pageUrl, {
          method: 'GET',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (rSub.ok) {
          pageHtml = await rSub.text();
          result.subpagesVisited.push(pageUrl);
        }
      }

      if (pageHtml) {
        // Quét tìm link Amazon trên trang web hoặc trang Bio aggregator (linktr.ee, hoo.be, direct.me)
        if (!result.amazon_url) {
          const amzHrefMatches = pageHtml.matchAll(/href=["']([^"']*(?:amazon\.[a-z.]+|amzn\.to|a\.co)[^"']*)["']/gi);
          for (const am of amzHrefMatches) {
            const cleanA = sanitizeAndValidateAmazonUrl(am[1]);
            if (cleanA) {
              result.amazon_url = cleanA;
              result.has_amazon = true;
              break;
            }
          }
          if (!result.amazon_url) {
            const rawAmzInText = pageHtml.match(/(?:https?:)?\/\/(?:www\.)?(?:amazon\.[a-z.]+|amzn\.to|a\.co)\/[^\s"'>]+/gi) || [];
            for (const rf of rawAmzInText) {
              const cleanA = sanitizeAndValidateAmazonUrl(rf);
              if (cleanA) {
                result.amazon_url = cleanA;
                result.has_amazon = true;
                break;
              }
            }
          }
        }

        const cfMatches = pageHtml.matchAll(/data-cfemail=["']([a-f0-9]+)["']/gi);
        for (const cf of cfMatches) {
          const dec = decodeCfEmail(cf[1]);
          if (dec && dec.includes('@') && !result.email) {
            result.email = dec.toLowerCase().trim();
          }
        }

        if (!result.email) {
          const mailtoMatches = pageHtml.matchAll(/href=["']mailto:([^"?']+)["']/gi);
          for (const mm of mailtoMatches) {
            const em = mm[1].trim().toLowerCase();
            if (em.includes('@') && em.includes('.') && !em.includes('sentry') && !em.includes('example')) {
              result.email = em;
              break;
            }
          }
        }

        if (!result.phone) {
          const telMatches = pageHtml.matchAll(/href=["']tel:([^"']+)["']/gi);
          for (const tm of telMatches) {
            const cp = cleanPhone(tm[1]);
            if (cp) { result.phone = cp; break; }
          }
        }

        if (!result.owner) {
          const jsonLdMatches = pageHtml.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
          for (const jm of jsonLdMatches) {
            try {
              const ld = JSON.parse(jm[1]);
              function findPerson(o) {
                if (!o) return null;
                if (typeof o === 'object') {
                  if (o['@type'] === 'Person' && o.name) return String(o.name).trim();
                  for (const k of ['founder', 'owner', 'author', 'creator']) {
                    if (o[k] && typeof o[k] === 'object' && o[k].name) return String(o[k].name).trim();
                    if (typeof o[k] === 'string') return o[k].trim();
                  }
                  for (const val of Object.values(o)) {
                    const resP = findPerson(val);
                    if (resP) return resP;
                  }
                }
                return null;
              }
              const p = findPerson(ld);
              if (p && !/kennel|puppy|doodle|cavapoo/i.test(p)) {
                result.owner = p;
                break;
              }
            } catch (_) {}
          }
        }

        const cleanText = pageHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
                                  .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
                                  .replace(/<[^>]+>/g, ' ')
                                  .replace(/&amp;/gi, '&')
                                  .replace(/&#160;|&nbsp;/gi, ' ')
                                  .replace(/\s+/g, ' ');
        allTexts.push(cleanText);

        if (!result.owner) {
          const mRev = cleanText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+|\s*&\s*[A-Z][a-z]+)?),\s*(?:Owner\s*&\s*Breeder|Owner|Breeder|Founder|Director|Manager)\b/);
          if (mRev && isValidOwnerCandidate(mRev[1])) {
            result.owner = mRev[1].trim();
          }
        }

        if (!result.owner) {
          const mHeadings = pageHtml.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi);
          for (const mh of mHeadings) {
            const hRaw = mh[1].replace(/<[^>]+>/g, '').replace(/&amp;/gi, '&').trim();
            if (isValidOwnerCandidate(hRaw)) {
              const isBreederContext = /^(?:meet|about|hi,?\s+i'm)\s+/i.test(hRaw) || /breeder|founder|owner/i.test(mh[0]);
              const isCleanPerson = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}$/.test(hRaw);
              if (isBreederContext || isCleanPerson) {
                const cName = hRaw.replace(/^(?:meet|about|hi,?\s+i'm)\s+/i, '').replace(/[:\-–].*$/, '').trim();
                if (isValidOwnerCandidate(cName)) {
                  result.owner = cName;
                  break;
                }
              }
            }
          }
        }

        if (!result.owner) {
          const mVn = cleanText.match(/(?:Người\s+sáng\s+lập|Giám\s+đốc|Chủ\s+trại|Chủ\s+sở\s+hữu|Liên\s+hệ)\s*[:\-–]?\s*([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,3})/);
          if (mVn && isValidOwnerCandidate(mVn[1])) {
            result.owner = mVn[1].trim();
          }
        }

        if (!result.owner) {
          const mEn = cleanText.match(/(?:Founder\s+&\s+Director|Founder|Owner|Head\s+Breeder|Owned\s+by|Breeder\s+is|Breeder|Call\s+me|Contact)\s*[:\-–]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/i);
          if (mEn && isValidOwnerCandidate(mEn[1])) {
            result.owner = mEn[1].trim();
          }
        }

        if (!result.phone) {
          const usPhones = cleanText.match(/(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-](\d{3})[\s.-](\d{4})\b/g) || [];
          for (const up of usPhones) {
            const cp = cleanPhone(up);
            if (cp) { result.phone = cp; break; }
          }
          if (!result.phone) {
            const intlPhones = cleanText.match(/(?:\+(?:84|61|\d{1,3})[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-])?\d{3,4}[\s.-]\d{3,4}\b|\b0[2-9]\d{1,2}[\s.-]\d{3}[\s.-]\d{3,4}\b/g) || [];
            for (const ip of intlPhones) {
              const cp = cleanPhone(ip);
              if (cp) { result.phone = cp; break; }
            }
          }
        }

        if (!result.email) {
          const tEmails = cleanText.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g) || [];
          for (const te of tEmails) {
            const teLow = te.toLowerCase().trim();
            if (!/sentry|example|\.png|\.jpg|\.webp|\.js|@facebook\.com|@w3\.org/i.test(teLow)) {
              result.email = teLow;
              break;
            }
          }
        }
      }
    } catch (_) {}
  }

  const combined = allTexts.join(' ');
  if (result.country === 'Australia' || /Melbourne|Australia/i.test(combined) || (result.phone && result.phone.startsWith('61'))) {
    result.country = 'Australia';
    if (/Melbourne/i.test(combined)) {
      result.city = 'Melbourne';
      result.state = 'Victoria';
    }
  } else if (/Vietnam|Việt Nam|Hồ Chí Minh|Bình Dương|Hà Nội/i.test(combined) || (result.phone && result.phone.startsWith('84')) || result.country === 'Vietnam') {
    result.country = 'Vietnam';
    if (/Hồ Chí Minh|HCMC|Saigon|Him Lam|Tân Hưng/i.test(combined)) {
      result.city = 'Hồ Chí Minh';
      result.state = 'Hồ Chí Minh';
    } else if (/Bình Dương|Binh Duong/i.test(combined)) {
      result.city = 'Bình Dương';
      result.state = 'Bình Dương';
    }
    const mZipVn = combined.match(/\b(7\d{5}|1\d{5})\b/);
    if (mZipVn) result.zip = mZipVn[1];
  } else if (result.country === 'United Kingdom' || host.endsWith('.uk') || host.includes('.co.uk')) {
    result.country = 'United Kingdom';
  } else {
    const mUs = combined.match(/\b([A-Z][a-zA-Z\s.-]{2,20}),\s*([A-Z]{2})\b(?:\s*(\d{5}))?/);
    if (mUs && US_STATE_CODES.has(mUs[2].toUpperCase())) {
      let cName = mUs[1].replace(/^(?:Down\s+South\s+Pups|About|Contact|Visit)\s+/i, '').trim();
      result.city = cName;
      result.state = mUs[2].toUpperCase();
      if (mUs[3]) result.zip = mUs[3];
      result.country = 'United States';
    } else if (!result.country) {
      result.country = 'United States';
    }
  }

  if (result.address) result.address = cleanAddressText(result.address);
  if (result.owner && !isValidOwnerCandidate(result.owner)) result.owner = '';

  return result;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'GET_STATE') {
    sendResponse({
      urlList,
      currentIndex,
      startIndex,
      endIndex,
      allData,
      isAutoRunning,
      isPaused,
      statusMessage
    });
  }
  else if (msg.action === 'START_AUTO_FROM_DASHBOARD') {
    clearNextTimer();
    isProcessing = false;
    currentTaskId = null;

    urlList = msg.urls || [];
    startIndex = (msg.options && msg.options.startIndex !== undefined) ? msg.options.startIndex : 0;
    endIndex = (msg.options && msg.options.endIndex !== undefined && msg.options.endIndex >= 0 && msg.options.endIndex < urlList.length)
      ? msg.options.endIndex
      : (urlList.length - 1);

    currentIndex = startIndex;
    if (msg.options && msg.options.resetData === true) {
      allData = [];
    }
    isAutoRunning = true;
    isPaused = false;
    statusMessage = `Đang bắt đầu cào từ dòng ${startIndex + 1} đến ${endIndex + 1}...`;
    saveState();

    sendToDashboard('STEP2_LOG', {
      log: {
        stage: 'KHỞI ĐỘNG',
        text: `🚀 Kích hoạt bộ cào bóc tách trực tiếp: Từ dòng ${startIndex + 1} đến ${endIndex + 1} (Tổng: ${endIndex - startIndex + 1} hồ sơ)...`,
        level: 'info'
      }
    });

    // Mở worker tab ngầm (active: false) để Facebook load DOM sống mà không chiếm tab Dashboard
    chrome.tabs.create({ url: 'about:blank', active: false }, (newTab) => {
      targetTabId = newTab ? newTab.id : null;
      sendResponse({ status: 'started' });
      processNext();
    });
    return true;
  }
  else if (msg.action === 'START_AUTO') {
    clearNextTimer();
    isProcessing = false;
    currentTaskId = null;

    urlList = msg.urls;
    startIndex = (msg.startIndex !== undefined && msg.startIndex >= 0) ? msg.startIndex : 0;
    endIndex = (msg.endIndex !== undefined && msg.endIndex >= 0 && msg.endIndex < urlList.length)
      ? msg.endIndex
      : (urlList.length - 1);

    currentIndex = startIndex;
    if (msg.resetData === true) {
      allData = []; // Chỉ reset khi được yêu cầu rõ ràng
    }
    isAutoRunning = true;
    isPaused = false;
    statusMessage = `Đang bắt đầu cào từ dòng ${startIndex + 1} đến ${endIndex + 1}...`;
    saveState();
    sendResponse({ status: 'ok' });

    (async () => {
      await ensureWorkerTab();
      processNext();
    })();
    return true;
  }
  else if (msg.action === 'RESUME_AUTO') {
    clearNextTimer();
    isProcessing = false;
    currentTaskId = null;

    if (endIndex < 0 || endIndex >= urlList.length) {
      endIndex = urlList.length - 1;
    }

    if (currentIndex > endIndex || currentIndex >= urlList.length) {
      statusMessage = "Danh sách đã cào xong. Vui lòng chọn khoảng mới hoặc Bắt đầu cào mới.";
      isAutoRunning = false;
      isPaused = false;
      saveState();
      sendResponse({ status: 'finished' });
      return;
    }

    isAutoRunning = true;
    isPaused = false;
    statusMessage = `Tiếp tục chạy từ dòng ${currentIndex + 1} đến ${endIndex + 1}...`;
    saveState();
    sendResponse({ status: 'ok' });

    (async () => {
      await ensureWorkerTab();
      processNext();
    })();
    return true;
  }
  else if (msg.action === 'STOP_AUTO') {
    clearNextTimer();
    clearWatchdogTimer();
    isProcessing = false;
    currentTaskId = null;
    isAutoRunning = false;
    isPaused = true;
    statusMessage = `Đã tạm dừng tại dòng ${currentIndex + 1}/${urlList.length}. Bấm "Tiếp tục" để chạy từ dòng ${currentIndex + 1} hoặc "Xuất file CSV".`;
    saveState();
    sendResponse({ status: 'ok' });
  }
  else if (msg.action === 'CLEAR_DATA') {
    clearNextTimer();
    clearWatchdogTimer();
    isProcessing = false;
    currentTaskId = null;
    allData = [];
    currentIndex = 0;
    startIndex = 0;
    endIndex = -1;
    isAutoRunning = false;
    isPaused = false;
    statusMessage = "Đã làm mới dữ liệu.";
    saveState();
    sendResponse({ status: 'ok' });
  }
  else if (msg.action === 'EXPORT_DATA') {
    exportCSV(true);
    sendResponse({ status: 'ok' });
  }
  else if (msg.action === 'EXPORT_PRIORITY_DATA_8') {
    exportPriorityData8();
    sendResponse({ status: 'ok' });
  }
  else if (msg.action === 'EXPORT_JSON_LEAD_US') {
    exportJsonLeadUs();
    sendResponse({ status: 'ok' });
  }
  else if (msg.action === 'UPDATE_LEAD') {
    const updated = msg.lead;
    if (updated) {
      const idx = allData.findIndex(x => (x.stt && x.stt === updated.stt) || (x.lead_id && x.lead_id === updated.lead_id) || (x.fb_id && x.fb_id === updated.fb_id) || (x.url && x.url === updated.url));
      if (idx !== -1) {
        allData[idx] = { ...allData[idx], ...updated };
      } else {
        allData.push(updated);
      }
      saveState();
      sendResponse({ status: 'ok', allData });
    } else {
      sendResponse({ status: 'error', message: 'No lead provided' });
    }
    return true;
  }
  else if (msg.action === 'DELETE_LEAD') {
    const key = msg.key;
    if (key !== undefined) {
      allData = allData.filter((x, i) => x.stt !== key && x.lead_id !== key && x.fb_id !== key && String(i) !== String(key));
      saveState();
      sendResponse({ status: 'ok', allData });
    } else {
      sendResponse({ status: 'error' });
    }
    return true;
  }
  else if (msg.action === 'SET_ALL_DATA') {
    if (Array.isArray(msg.allData)) {
      allData = msg.allData;
      saveState();
      sendResponse({ status: 'ok', count: allData.length });
    } else {
      sendResponse({ status: 'error' });
    }
    return true;
  }
  else if (msg.action === 'FETCH_EXTERNAL_URL') {
    const targetUrl = msg.url;
    if (!targetUrl) {
      sendResponse({ ok: false, error: 'Không có URL' });
      return true;
    }

    handleDeepWebsiteScrape(targetUrl)
      .then(res => {
        sendResponse({
          ok: true,
          breederName: res.owner,
          owner: res.owner,
          phone: res.phone,
          email: res.email,
          address: res.address,
          city: res.city,
          state: res.state,
          zip: res.zip,
          country: res.country,
          has_amazon: Boolean(res.has_amazon),
          amazon_url: res.amazon_url || '',
          subpagesVisited: res.subpagesVisited
        });
      })
      .catch(err => {
        sendResponse({ ok: false, error: err.message || String(err) });
      });
    return true;
  }
  else if (msg.action === 'PROFILE_RESULT') {
    if (isAutoRunning) {
      let item = msg.data || {};

      // KHÓA CHỐNG TRÙNG LẶP #1: Chỉ chấp nhận tin nhắn khớp đúng currentTaskId hiện tại
      if (!currentTaskId || item.taskId !== currentTaskId) {
        console.warn(`[BG] Bỏ qua kết quả trùng lặp/quá hạn (item: ${item.taskId}, current: ${currentTaskId})`);
        sendResponse({ status: 'ignored' });
        return;
      }

      currentTaskId = null;
      isProcessing = false;

      // YÊU CẦU 1: CHUẨN HÓA LOGIC WEBSITE VÀ AMAZON_URL (SỬA RACE CONDITION & ĐẢO CHỖ)
      // Nếu website trên Facebook là link Amazon Storefront / Wishlist / Product
      if (/(?:amazon\.[a-z.]+|amzn\.to|a\.co)\//i.test(item.website)) {
        const validAmzFromWeb = sanitizeAndValidateAmazonUrl(item.website);
        if (validAmzFromWeb) {
          if (!item.amazon_url) {
            item.amazon_url = validAmzFromWeb;
          } else if (!item.amazon_url.includes(validAmzFromWeb)) {
            item.amazon_url = `${validAmzFromWeb}, ${item.amazon_url}`;
          }
          item.has_amazon = true;
          item.amazon_channel = 'Selling on Amazon (Target)';
          item.amz_cat = 'Pet Toys / Artificial Grass / Pet Toilets';
        }
      }

      // Blacklist website: Bỏ gmail.com, mail.google.com, facebook.com
      if (/^(?:https?:\/\/)?(?:www\.)?(?:gmail\.com|mail\.google\.com|facebook\.com|fb\.com|instagram\.com)\/?$/i.test(item.website)) {
        item.website = '';
      }

      // YÊU CẦU 2 & 4: LÀM SẠCH VÀ CHUẨN HÓA CÁC BIẾN AMAZON Ở ĐẦU MỖI TASKID ĐỂ TRÁNH BLEED DATA (STT 68 -> STT 69)
      const sanitizedAmz = sanitizeAndValidateAmazonUrl(item.amazon_url);
      item.amazon_url = sanitizedAmz || '';
      item.has_amazon = Boolean(sanitizedAmz);
      item.amazon_channel = item.has_amazon ? 'Selling on Amazon (Target)' : 'Amazon link not found';
      item.amz_cat = item.has_amazon ? 'Pet Toys / Artificial Grass / Pet Toilets' : 'Chưa phát hiện link Amazon';

      const rawWeb = (item.website || '').trim();
      // TUYỆT ĐỐI KHÔNG mở trang Amazon trong Website Inspector để tránh dính "0 Cart We're showing you items that ship to Vietnam..."
      const hasExternalWebsite = rawWeb.startsWith('http') && !/facebook\.com|fb\.com|instagram\.com|amazon\.[a-z.]+|amzn\.to|a\.co/i.test(rawWeb);

      // Nếu có Website ngoài: Chuyển hướng trực tiếp tab trình duyệt vào trang web của họ để quét tên chủ trại
      if (hasExternalWebsite && !item.websiteInspected) {
        statusMessage = `[Dòng ${currentIndex + 1}] Phát hiện Website ${rawWeb} -> Đang mở trình duyệt vào xem trực tiếp tìm chủ trại...`;
        saveState();

        sendToDashboard('STEP2_LOG', {
          log: {
            stage: 'WEBSITE',
            text: `[Dòng ${currentIndex + 1}] Phát hiện Website ${rawWeb} -> Đang mở trình duyệt vào xem trực tiếp tìm chủ trại...`,
            level: 'web'
          }
        });

        (async () => {
          try {
            const inspectRes = await inspectWebsiteVisually(
              targetTabId,
              rawWeb,
              item.name,
              item.email,
              item.amazon_url
            );

            if (inspectRes && inspectRes.owner && isValidOwnerCandidate(inspectRes.owner)) {
              item.owner = inspectRes.owner;
              item.ownerConfidence = inspectRes.confidence || 'Tier 1 - Website Verified';
              sendToDashboard('STEP2_LOG', {
                log: {
                  stage: 'CHỦ TRẠI WEB',
                  text: `[Dòng ${currentIndex + 1}] 🎯 Đã tìm thấy chủ trại từ website: ${item.owner} (${item.ownerConfidence})`,
                  level: 'success'
                }
              });
            }
            const checkedInspectAmz = sanitizeAndValidateAmazonUrl(inspectRes?.amazon_url);
            if (checkedInspectAmz) {
              item.has_amazon = true;
              item.amazon_url = checkedInspectAmz;
              item.amazon_channel = 'Selling on Amazon (Target)';
              item.amz_cat = inspectRes.amz_cat || 'Pet Toys / Artificial Grass / Pet Toilets';
              sendToDashboard('STEP2_LOG', {
                log: {
                  stage: 'KÊNH AMAZON',
                  text: `[Dòng ${currentIndex + 1}] 🛒 Phát hiện gian hàng/sản phẩm Amazon từ Website: ${item.amazon_url}`,
                  level: 'ai'
                }
              });
            } else if (!item.amazon_url) {
              // Chỉ đặt về false khi cả website và Facebook Bio đều không có link Amazon
              item.has_amazon = false;
              item.amazon_url = '';
              item.amazon_channel = 'Amazon link not found';
              item.amz_cat = 'Chưa phát hiện link Amazon';
              sendToDashboard('STEP2_LOG', {
                log: {
                  stage: 'KÊNH AMAZON',
                  text: `[Dòng ${currentIndex + 1}] 🛒 Kiểm tra kênh Amazon: Amazon link not found`,
                  level: 'info'
                }
              });
            }
            if (inspectRes && inspectRes.phone && !item.phone) item.phone = cleanPhone(inspectRes.phone);
            if (inspectRes && inspectRes.email && !item.email) item.email = inspectRes.email;
            if (inspectRes && inspectRes.address && !item.address) {
              const cleanA = cleanAddressText(inspectRes.address);
              if (cleanA && !/cart|ship to vietnam|snoozed|live website inspector|quick add|recommendations|imdb/i.test(cleanA)) {
                item.address = cleanA;
              }
            }
            if (inspectRes && inspectRes.city && !item.city && !/cart|imdb|movies|recommendations|running and playing/i.test(inspectRes.city)) {
              item.city = inspectRes.city;
            }
            if (inspectRes && inspectRes.state && !item.state && !/^(?:TV|SV|DM|HU|VI|00)$/i.test(inspectRes.state)) {
              item.state = inspectRes.state;
            }
            if (inspectRes && inspectRes.zip && !item.zip && !/^12345|00000$/.test(inspectRes.zip)) {
              item.zip = inspectRes.zip;
            }
            if (inspectRes && inspectRes.country && (!item.country || item.country === 'United States')) {
              if (inspectRes.country !== 'Vietnam') {
                item.country = inspectRes.country;
              }
            }
          } catch (err) {
            console.warn('[BG] Lỗi inspect website:', err);
          } finally {
            item.websiteInspected = true;
            finishProfileItem(item);
          }
        })();
      } else {
        finishProfileItem(item);
      }
    }
    sendResponse({ status: 'ok' });
  }
  return true;
});

function processNext() {
  if (!isAutoRunning) {
    isProcessing = false;
    return;
  }

  if (currentIndex > endIndex || currentIndex >= urlList.length) {
    isAutoRunning = false;
    isPaused = false;
    isProcessing = false;
    currentTaskId = null;
    statusMessage = `Đã hoàn thành! Đã cào xong ${allData.length} link.`;
    saveState();
    sendToDashboard('STEP2_ALL_DONE', { total: allData.length });
    sendToDashboard('STEP2_LOG', {
      log: {
        stage: 'HỆ THỐNG',
        text: `🎉 TOÀN BỘ QUÁ TRÌNH BÓC TÁCH BƯỚC 2 ĐÃ HOÀN TẤT THÀNH CÔNG! Đã cập nhật đầy đủ 30 trường Meta CRM cho ${allData.length} hồ sơ.`,
        level: 'success'
      }
    });
    exportCSV(false);
    return;
  }

  // Khóa chống nhiều luồng chạy cùng lúc
  if (isProcessing) {
    console.warn("[BG] Đang xử lý link khác, bỏ qua gọi processNext trùng.");
    return;
  }
  isProcessing = true;

  let targetUrl = urlList[currentIndex];
  let taskId = `${currentIndex}_${Date.now()}`;
  currentTaskId = taskId;

  clearWatchdogTimer();
  // WATCHDOG TIMER (22 GIÂY): Chống treo tiến trình 100%. Nếu tab FB bị chậm, dính checkpoint hoặc lỗi mạng, tự động skip an toàn sang hồ sơ tiếp theo!
  currentWatchdogTimer = setTimeout(() => {
    if (isAutoRunning && currentTaskId === taskId) {
      console.warn(`[BG Watchdog] ⚠️ Hồ sơ STT ${currentIndex + 1} (${targetUrl}) xử lý quá lâu (> 22s). Tự động bỏ qua để tiến trình không bị đứng!`);
      sendToDashboard('STEP2_LOG', {
        log: {
          stage: 'CẢNH BÁO',
          text: `[Dòng ${currentIndex + 1}] ⚠️ Hồ sơ phản hồi quá lâu (> 22s), tự động lưu kết quả an toàn và tiếp tục dòng kế tiếp...`,
          level: 'warn'
        }
      });
      const timeoutItem = {
        stt: currentIndex + 1,
        url: targetUrl,
        name: 'Trang phản hồi chậm',
        publishTime: 'Chưa bóc tách (Timeout)',
        publishTimestamp: '',
        relativeTime: ''
      };
      currentTaskId = null;
      isProcessing = false;
      finishProfileItem(timeoutItem);
    }
  }, 22000);

  statusMessage = `Đang mở dòng ${currentIndex + 1}/${endIndex + 1}: ${targetUrl}`;
  saveState();

  sendToDashboard('STEP2_PROGRESS', {
    current: currentIndex - startIndex + 1,
    total: endIndex - startIndex + 1,
    percent: Math.round(((currentIndex - startIndex) / Math.max(1, endIndex - startIndex + 1)) * 100),
    status: `Đang mở dòng ${currentIndex + 1}/${endIndex + 1}: ${targetUrl}`
  });

  sendToDashboard('STEP2_LOG', {
    log: {
      stage: 'TIẾN ĐỘ',
      text: `Đang mở dòng ${currentIndex + 1}/${endIndex + 1}: ${targetUrl}`,
      level: 'info'
    }
  });

  (async () => {
    // Đảm bảo targetTabId là một tab ngầm (active: false), không bao giờ dùng tab Dashboard
    await ensureWorkerTab();
    // Điều hướng tab tới profile Facebook và đợi nạp xong hoàn toàn (luôn chạy ngầm, không cướp tab)
    await navigateTabAndWait(targetTabId, targetUrl, 30000);

    if (!isAutoRunning || currentTaskId !== taskId) {
      isProcessing = false;
      return;
    }

    // Gửi lệnh START_SCRAPE tới content.js
    chrome.tabs.sendMessage(targetTabId, {
      action: 'START_SCRAPE',
      stt: currentIndex + 1,
      targetUrl: targetUrl,
      taskId: taskId
    }, (res) => {
      if (chrome.runtime.lastError) {
        console.log("Tab chưa sẵn sàng, thử inject script an toàn...");
        chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          files: ['content.js']
        }, () => {
          setTimeout(() => {
            if (!isAutoRunning || currentTaskId !== taskId) {
              isProcessing = false;
              return;
            }

            chrome.tabs.sendMessage(targetTabId, {
              action: 'START_SCRAPE',
              stt: currentIndex + 1,
              targetUrl: targetUrl,
              taskId: taskId
            }).catch(() => {
              if (currentTaskId === taskId) {
                currentTaskId = null;
                isProcessing = false;

                allData.push({
                  stt: currentIndex + 1,
                  url: targetUrl,
                  name: 'Lỗi nạp trang',
                  publishTime: 'Không thể truy cập',
                  publishTimestamp: '',
                  relativeTime: ''
                });
                currentIndex++;
                saveState();
                scheduleNext(1500);
              }
            });
          }, 800);
        });
      }
    });
  })();
}

function exportCSV(isPartial = false) {
  if (!allData || allData.length === 0) return;

  let headers = [
    'STT',
    'FB_ID',
    'Tên Profile/Fanpage',
    'Chủ Sở Hữu (Owner/Breeder)',
    'Độ Tin Cậy Chủ Sở Hữu',
    'Số Điện Thoại (Phone)',
    'Email',
    'Website Chính Thức',
    'Instagram URL',
    'Thành Phố (City)',
    'Bang (State)',
    'Mã Zip (Zip Code)',
    'Địa Chỉ (Address)',
    'Giới Thiệu (Bio/Intro)',
    'Thời Gian Đăng (Publish Time)',
    'Timestamp',
    'Thời Gian Tương Đối',
    'URL Profile'
  ];
  let csvRows = ["\uFEFF" + headers.join(',')];

  allData.forEach((row, idx) => {
    let stt = row.stt !== undefined ? row.stt : (idx + 1);
    let vals = [
      `"${String(stt).replace(/"/g, '""')}"`,
      `"${String(row.fb_id || '').replace(/"/g, '""')}"`,
      `"${String(row.name || '').replace(/"/g, '""')}"`,
      `"${String(row.owner || '').replace(/"/g, '""')}"`,
      `"${String(row.ownerConfidence || '').replace(/"/g, '""')}"`,
      `"${String(row.phone || '').replace(/"/g, '""')}"`,
      `"${String(row.email || '').replace(/"/g, '""')}"`,
      `"${String(row.website || '').replace(/"/g, '""')}"`,
      `"${String(row.instagram || '').replace(/"/g, '""')}"`,
      `"${String(row.city || '').replace(/"/g, '""')}"`,
      `"${String(row.state || '').replace(/"/g, '""')}"`,
      `"${String(row.zip || '').replace(/"/g, '""')}"`,
      `"${String(row.address || '').replace(/"/g, '""')}"`,
      `"${String(row.bio || '').replace(/"/g, '""')}"`,
      `"${String(row.publishTime || '').replace(/"/g, '""')}"`,
      `"${String(row.publishTimestamp || '').replace(/"/g, '""')}"`,
      `"${String(row.relativeTime || '').replace(/"/g, '""')}"`,
      `"${String(row.url || '').replace(/"/g, '""')}"`
    ];
    csvRows.push(vals.join(','));
  });

  let csvContent = csvRows.join('\r\n');
  let base64Content = btoa(unescape(encodeURIComponent(csvContent)));
  let dataUrl = 'data:text/csv;charset=utf-8;base64,' + base64Content;
  let filename = `FB_Profile_Funnel_CRM_${isPartial ? 'Part_' : ''}${Date.now()}.csv`;

  if (chrome.downloads && chrome.downloads.download) {
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    }).catch(() => {
      if (targetTabId) {
        chrome.tabs.sendMessage(targetTabId, { action: 'TRIGGER_DOWNLOAD', data: allData, isPartial }).catch(() => {});
      }
    });
  } else if (targetTabId) {
    chrome.tabs.sendMessage(targetTabId, { action: 'TRIGGER_DOWNLOAD', data: allData, isPartial }).catch(() => {});
  }
}

function exportPriorityData8() {
  if (!allData || allData.length === 0) return;

  const headers = [
    '邮箱地址', '邮箱地址状态', '名字', '姓氏', '全名', '用户社交', 'LinkedIn', '工作职位',
    '国家', '地址', '行业', '添加日期', '公司名称', '公司网址', '公司社交', '公司规模',
    '公司所处国家', '公司位置', '州', '城市', '公司所在行业', '总部电话', '电话', '背调链接',
    '测试打开次数', '客户等级', '打开网页', '营销更新', '回复次数', '营销打开次数',
    '营销邮件次数', '营销邮件数量', '年级/班级', '班级', '休眠原因', 'remark', 'CRM NO.'
  ];

  let csvRows = ["\uFEFF" + headers.join(',')];

  allData.forEach((row, idx) => {
    let email = row.email || '';
    let emailStatus = email ? 'valid' : 'unknown';
    let fullName = row.full_name || row.owner || '';
    let firstName = row.first_name || (fullName ? fullName.split(' ')[0] : '');
    let lastName = row.last_name || (fullName && fullName.split(' ').length > 1 ? fullName.split(' ').slice(1).join(' ') : '');
    let userSocial = row.user_social || row.url || '';
    let jobTitle = row.job_title || '创始人兼繁育人 (Breeder & Owner)';
    let country = row.country || '美国 (United States)';
    let address = row.address || '';
    let industry = row.industry || '宠物繁育 / 狗舍 (Dog Breeder)';
    let dateAdded = row.date_added || (new Date().toISOString().replace('T', ' ').substring(0, 19));
    let companyName = row.company_name || row.name || '';
    let companyWebsite = row.company_website || row.website || '';
    let companySocial = row.company_social || userSocial;
    let companySize = row.company_size || '1-10人';
    let companyCountry = row.company_country || country;
    let city = row.city || '';
    let state = row.state || '';
    let companyLocation = row.company_location || ((city && state) ? `${city}, ${state}, USA` : address);
    let companyIndustry = row.company_industry || industry;
    let phone = row.phone || '';
    let hqPhone = row.hq_phone || phone;
    let bgCheckLink = row.bg_check_link || `https://www.google.com/search?q=${encodeURIComponent(userSocial || row.url || '')}`;

    let vals = [
      `"${String(email).replace(/"/g, '""')}"`,
      `"${String(emailStatus).replace(/"/g, '""')}"`,
      `"${String(firstName).replace(/"/g, '""')}"`,
      `"${String(lastName).replace(/"/g, '""')}"`,
      `"${String(fullName).replace(/"/g, '""')}"`,
      `"${String(userSocial).replace(/"/g, '""')}"`,
      `""`, // LinkedIn
      `"${String(jobTitle).replace(/"/g, '""')}"`,
      `"${String(country).replace(/"/g, '""')}"`,
      `"${String(address).replace(/"/g, '""')}"`,
      `"${String(industry).replace(/"/g, '""')}"`,
      `"${String(dateAdded).replace(/"/g, '""')}"`,
      `"${String(companyName).replace(/"/g, '""')}"`,
      `"${String(companyWebsite).replace(/"/g, '""')}"`,
      `"${String(companySocial).replace(/"/g, '""')}"`,
      `"${String(companySize).replace(/"/g, '""')}"`,
      `"${String(companyCountry).replace(/"/g, '""')}"`,
      `"${String(companyLocation).replace(/"/g, '""')}"`,
      `"${String(state).replace(/"/g, '""')}"`,
      `"${String(city).replace(/"/g, '""')}"`,
      `"${String(companyIndustry).replace(/"/g, '""')}"`,
      `"${String(hqPhone).replace(/"/g, '""')}"`,
      `"${String(phone).replace(/"/g, '""')}"`,
      `"${String(bgCheckLink).replace(/"/g, '""')}"`,
      `""`, `""`, `""`, `""`, `""`, `""`, `""`, `""`, `""`, `""`, `""`, `""`, `""`
    ];
    csvRows.push(vals.join(','));
  });

  let csvContent = csvRows.join('\r\n');
  let base64Content = btoa(unescape(encodeURIComponent(csvContent)));
  let dataUrl = 'data:text/csv;charset=utf-8;base64,' + base64Content;
  let filename = `priority-data-8-${new Date().toISOString().slice(0, 10)}.csv`;

  if (chrome.downloads && chrome.downloads.download) {
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    });
  }
}

function generateNumericFbIdFromSlug(slugOrUrl) {
  if (!slugOrUrl) return '1000' + Math.floor(10000000000 + Math.random() * 90000000000);
  let slug = String(slugOrUrl).split('?')[0].split('#')[0].replace(/\/+$/, '');
  const parts = slug.split('/');
  slug = parts[parts.length - 1] || slug;
  if (/^\d{6,24}$/.test(slug)) return slug;
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash) + slug.charCodeAt(i);
    hash = hash & 0xFFFFFFFF;
  }
  const positiveHash = Math.abs(hash);
  const suffix = String(positiveHash).padStart(10, '0').slice(-10);
  return `615${suffix}88`; // 15 chữ số thuần số nguyên
}

/**
 * Xuất file JSON chuẩn LEAD-US (Meta RAG Database) chứa toàn bộ 28 trường dữ liệu chuẩn xác
 * Tham chiếu trực tiếp schema: FB-FS-2/data/leads_16_10_2026.json
 */
function exportJsonLeadUs() {
  if (!allData || allData.length === 0) return;

  const jsonRecords = allData.map((row, idx) => {
    const rawStt = row.stt !== undefined ? row.stt : (idx + 1);
    const stt = typeof rawStt === 'string' && rawStt.startsWith('LEAD-US-')
      ? rawStt
      : `LEAD-US-${String(rawStt).padStart(6, '0')}`;

    let fbId = row.fb_id || '';
    if (!fbId || !/^\d{6,24}$/.test(fbId)) {
      fbId = generateNumericFbIdFromSlug(row.url);
    }

    const name = row.name || 'Facebook User';
    let avatarUrl = row.avatar || row.avatar_url || '';
    if (!avatarUrl || avatarUrl.includes('unavatar.io') || avatarUrl.includes('blank_profile') || avatarUrl.includes('t1.30497-1') || avatarUrl.includes('453178253_471506465671661') || avatarUrl.includes('rsrc.php')) {
      const fallbackName = encodeURIComponent(row.owner || name);
      avatarUrl = `https://ui-avatars.com/api/?name=${fallbackName}&background=0284c7&color=fff&size=128&bold=true`;
    }

    return {
      stt: stt,
      name: name,
      owner: row.owner || 'Chủ trại / Quản lý chuồng trại (Breeder Owner / Kennel Manager)',
      url: row.url || (fbId ? `https://www.facebook.com/${fbId}` : ''),
      website: row.website || '',
      phone: cleanPhone(row.phone || ''),
      email: row.email || '',
      address: (row.address && row.address !== '5.0(100+)') ? row.address : ([row.city, row.state].filter(Boolean).join(', ') || row.country || ''),
      city: row.city || '',
      state: row.state || '',
      zip: row.zip || '',
      country: row.country || 'United States',
      cat: row.cat || 'Dog Breeder / Commercial Kennel (B2B)',
      cat_code: row.cat_code || 'breeder',
      amz_cat: row.amz_cat || 'Selling pet toys + Artificial grass/Pet toilets (TARGET)',
      amz_link: row.amz_link || '',
      product_fit: row.product_fit || 'Puppy Starter Kit V2/V3 (Cỏ thoát nước + Khay Potty + Đồ chơi in logo)',
      score: row.score || 85,
      rank_tier: row.rank_tier || 'Tier S',
      is_prio: row.is_prio !== undefined ? Boolean(row.is_prio) : true,
      sales_action: row.sales_action || '🔥 TELESALE: Gọi chốt Take-Home Kit in logo độc quyền ngay trong ngày',
      fb_id: fbId,
      avatar: avatarUrl,
      avatar_url: avatarUrl,
      image: avatarUrl,
      img: avatarUrl,
      photo: avatarUrl,
      logo: avatarUrl,
      publishTime: row.publishTime || 'Không tìm thấy bài viết',
      publishTimestamp: row.publishTimestamp || '',
      relativeTime: row.relativeTime || ''
    };
  });

  const jsonStr = JSON.stringify(jsonRecords, null, 2);
  const base64Content = btoa(unescape(encodeURIComponent(jsonStr)));
  const dataUrl = 'data:application/json;charset=utf-8;base64,' + base64Content;
  const filename = `leads_us_funnel_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}.json`;

  if (chrome.downloads && chrome.downloads.download) {
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    });
  } else if (targetTabId) {
    chrome.tabs.sendMessage(targetTabId, {
      action: 'TRIGGER_DIRECT_FILE_DOWNLOAD',
      content: jsonStr,
      filename: filename
    }).catch(() => {});
  }
}

function finishProfileItem(item) {
  clearWatchdogTimer();
  if (!item.owner || !isValidOwnerCandidate(item.owner) || item.owner.includes('Manager') || item.owner === 'Kennel Owner' || item.owner === 'Breeder Owner') {
    const emailOwner = extractOwnerFromEmailPrefix(item.email);
    if (emailOwner && isValidOwnerCandidate(emailOwner)) {
      item.owner = emailOwner;
      item.ownerConfidence = 'Tier 2 - Email Prefix Fallback';
    } else {
      item.owner = item.name || 'Facebook User';
      item.ownerConfidence = 'Tier 3 - Facebook Page Fallback';
    }
  }

  item.address = cleanAddressText(item.address || '');

  item.stt = currentIndex + 1;
  const existingIdx = allData.findIndex(x => 
    (item.fb_id && x.fb_id && String(x.fb_id).trim() === String(item.fb_id).trim()) ||
    (item.url && x.url && String(x.url).trim().toLowerCase() === String(item.url).trim().toLowerCase()) ||
    (x.stt && item.stt && String(x.stt) === String(item.stt))
  );
  if (existingIdx !== -1) {
    allData[existingIdx] = { ...allData[existingIdx], ...item };
  } else {
    allData.push(item);
  }

  let timePreview = item.publishTime
    ? `${item.publishTime} (${item.relativeTime || ''})`
    : 'Không tìm thấy bài viết';
  let contactPreview = [item.owner, item.phone, item.email, item.website].filter(Boolean).join(' | ');
  statusMessage = `[Dòng ${currentIndex + 1}] ${item.name || 'Profile'}: ${timePreview}${contactPreview ? ' | ' + contactPreview : ''}`;

  // Tính điểm và xếp hạng cho hồ sơ
  let score = 55;
  if (item.owner && item.owner !== 'Facebook User' && !item.owner.includes('Manager')) score += 15;
  if (item.phone) score += 10;
  if (item.website) score += 10;
  if (item.email) score += 5;
  if (item.has_amazon) score += 10;
  score = Math.min(score, 98);
  const tier = score >= 75 ? 'Tier S' : (score >= 60 ? 'Tier A' : 'Tier B');

  const leadNum = String(currentIndex + 1).padStart(5, '0');
  const leadId = `LEAD-US-${leadNum}`;

  const cleanId = item.fb_id ? String(item.fb_id).trim() : '';
  const cleanUrl = item.url ? String(item.url).trim().toLowerCase() : '';
  let resolvedAvatar = '';

  // 1. Kiểm tra nếu avatar từ DOM hợp lệ và không phải rác
  if (item.avatar_url && !item.avatar_url.includes('unavatar.io') && !item.avatar_url.includes('blank_profile') && !item.avatar_url.includes('graph.facebook.com') && !item.avatar_url.includes('rsrc.php') && !item.avatar_url.includes('t1.30497-1') && !item.avatar_url.includes('453178253_471506465671661')) {
    resolvedAvatar = item.avatar_url;
  }

  // 2. Fallback UI Avatars
  if (!resolvedAvatar) {
    const fallbackInitials = encodeURIComponent((item.owner && item.owner !== 'Facebook User') ? item.owner : (item.name || 'Dog Breeder'));
    resolvedAvatar = `https://ui-avatars.com/api/?name=${fallbackInitials}&background=0284c7&color=fff&size=128&bold=true`;
  }

  let pubIso = '';
  if (item.publishTimestamp) {
    try {
      pubIso = new Date(Number(item.publishTimestamp) * 1000).toISOString();
    } catch (_) {}
  }
  const isPerson = isValidOwnerCandidate(item.owner);
  const cleanOwner = item.owner || (isPerson ? item.name : (item.name ? `Team ${item.name}` : 'There'));

  const leadRecord = {
    stt: leadId,
    taskId: item.taskId || `task_${currentIndex + 1}`,
    lead_id: leadId,
    fb_id: item.fb_id || '',
    name: item.name || 'Facebook User',
    url: item.url || '',
    avatar: resolvedAvatar,
    bio: item.bio || '',
    owner: cleanOwner,
    owner_is_person: isPerson,
    owner_confidence: item.ownerConfidence || (isPerson ? 'Tier 1 - Verified' : 'Default Fallback'),
    address: item.address || '',
    city: item.city || '',
    state: item.state || '',
    zip: item.zip || '',
    country: item.country || 'United States',
    phone: cleanPhone(item.phone || ''),
    email: item.email || '',
    website: item.website || (item.amazon_url ? item.amazon_url.split(',')[0].trim() : ''),
    websiteInspected: Boolean(item.website && !/(?:amazon\.[a-z.]+|amzn\.to|a\.co)/i.test(item.website)),
    instagram: item.instagram || '',
    has_amazon: Boolean(item.has_amazon && item.amazon_url),
    amazon_url: item.amazon_url || '',
    amazon_channel: (item.has_amazon && item.amazon_url) ? 'Selling on Amazon (Target)' : 'Amazon link not found',
    amz_cat: (item.has_amazon && item.amazon_url) ? 'Pet Toys / Artificial Grass / Pet Toilets' : 'Chưa phát hiện link Amazon',
    publishTimestamp: item.publishTimestamp || '',
    publishTime: item.publishTime || '',
    publishTimeISO: pubIso,
    activity_status: item.activityStatus || '✓ TÍCH CỰC (Trại đang hoạt động)',
    relativeTime: item.relativeTime || '',
    score: score,
    rank_tier: tier,
    sales_action: (item.has_amazon && item.amazon_url) ? 'Khai thác ngách phụ kiện/cỏ trên Amazon' : 'Telesale: Gửi catalogue Take-Home Kit in logo độc quyền',
    product_fit: (item.has_amazon && item.amazon_url) ? 'B2B Wholesale: Thảm Cỏ Huấn Luyện + Pet Potty + Toys Bundle' : 'Take-Home Puppy Starter Kit V2/V3'
  };

  sendToDashboard('STEP2_LEAD_DONE', { lead: leadRecord });
  sendToDashboard('STEP2_LOG', {
    log: {
      stage: 'HOÀN TẤT HỒ SƠ',
      text: `🎉 [${leadId}] ${leadRecord.name} | Chủ: ${leadRecord.owner} | Ngày đăng: ${leadRecord.publish_time} (${leadRecord.relative_time}) | Điểm: ${score}đ ➔ ĐÃ CẬP NHẬT CRM`,
      level: 'success'
    }
  });

  currentIndex++;
  saveState();
  scheduleNext(1500);
}

const POPULAR_US_FIRST_NAMES = [
  'amanda', 'lisa', 'sarah', 'jessica', 'ashley', 'emily', 'hannah', 'katie', 'megan', 'rachel',
  'lauren', 'nicole', 'amber', 'stephanie', 'heather', 'melissa', 'rebecca', 'brittany', 'amy',
  'michelle', 'kristen', 'kelly', 'kimberly', 'erin', 'angela', 'tiffany', 'christina', 'julie',
  'shannon', 'courtney', 'mary', 'patricia', 'jennifer', 'elizabeth', 'linda', 'barbara', 'susan',
  'margaret', 'dorothy', 'nancy', 'karen', 'betty', 'helen', 'sandra', 'donna', 'carol', 'ruth',
  'sharon', 'laura', 'cynthia', 'debbie', 'debra', 'john', 'robert', 'michael', 'james', 'david',
  'richard', 'charles', 'joseph', 'thomas', 'daniel', 'matthew', 'christopher', 'mark', 'donald',
  'paul', 'steven', 'andrew', 'kenneth', 'joshua', 'kevin', 'brian', 'george', 'edward', 'ronald',
  'timothy', 'jason', 'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas', 'eric', 'stephen', 'jonathan',
  'larry', 'justin', 'scott', 'brandon', 'frank', 'benjamin', 'gregory', 'samuel', 'raymond', 'patrick',
  'alexander', 'jack', 'dennis', 'jerry', 'tyler', 'aaron', 'henry', 'douglas', 'peter', 'adam',
  'nathan', 'zachary', 'walter', 'kyle', 'harold', 'carl', 'jeremy', 'keith', 'roger', 'gerald',
  'ethan', 'arthur', 'terry', 'christian', 'sean', 'lawrence', 'austin', 'joe', 'noah', 'jesse',
  'albert', 'bryan', 'billy', 'bruce', 'willie', 'jordan', 'dylan', 'alan', 'ralph', 'gabriel',
  'roy', 'juan', 'wayne', 'eugene', 'logan', 'randy', 'vincent', 'russell', 'louis', 'philip',
  'bobby', 'johnny', 'clyde', 'max', 'charlie', 'ollie', 'charlotte', 'agnes', 'esther', 'mildred', 'stella'
];

function extractOwnerFromEmailPrefix(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return null;
  const rawPrefix = email.split('@')[0].trim().toLowerCase();
  if (/^(info|sales|contact|support|hello|admin|office|team|puppy|puppies|help|service|inquiry|inquiries|mail|marketing|billing|custserv)$/i.test(rawPrefix)) {
    return null;
  }
  const mSep = rawPrefix.match(/^([a-z]{2,20})[._-]([a-z]{2,20})(?:\d+)?$/);
  if (mSep) {
    const first = mSep[1].charAt(0).toUpperCase() + mSep[1].slice(1);
    const last = mSep[2].charAt(0).toUpperCase() + mSep[2].slice(1);
    return `${first} ${last}`;
  }
  let clean = rawPrefix.replace(/\d+$/, '');
  for (const fn of POPULAR_US_FIRST_NAMES) {
    if (clean.startsWith(fn) && clean.length > fn.length + 2) {
      let remainder = clean.slice(fn.length);
      remainder = remainder.replace(/(ab|tx|usa|kennel|dogs|puppy|puppies|\d+)$/i, '').trim();
      const firstCap = fn.charAt(0).toUpperCase() + fn.slice(1);
      if (remainder.length >= 2) {
        const remCap = remainder.charAt(0).toUpperCase() + remainder.slice(1);
        return `${firstCap} ${remCap}`;
      }
      return firstCap;
    }
  }
  const cleanSpaced = clean.replace(/(yorkies|kennel|dogs|puppies|puppy|doodles|frenchies|corgis)/i, m => ' ' + m)
                           .replace(/[._-]/g, ' ')
                           .replace(/\s+/g, ' ')
                           .replace(/\b\w/g, l => l.toUpperCase())
                           .trim();
  if (cleanSpaced.length >= 3) {
    return cleanSpaced;
  }
  return null;
}

function waitForTabComplete(tabId, timeoutMs = 25000) {
  return new Promise((resolve) => {
    let timer = null;
    let finished = false;

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        if (!finished) {
          finished = true;
          cleanup();
          resolve(true);
        }
      }
    };

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
    };

    timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        cleanup();
        resolve(false);
      }
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function ensureWorkerTab() {
  if (targetTabId) {
    try {
      const t = await chrome.tabs.get(targetTabId);
      if (t && t.id) {
        const u = (t.url || '').toLowerCase();
        if (!u.includes('dashboard.html') && !u.includes('popup.html') && !u.includes(':8000') && !u.includes('localhost')) {
          return targetTabId;
        }
      }
    } catch (_) {}
  }
  try {
    const newTab = await chrome.tabs.create({ url: 'about:blank', active: false });
    targetTabId = newTab ? newTab.id : null;
  } catch (e) {
    console.warn('[BG] Lỗi tạo worker tab ngầm:', e);
  }
  return targetTabId;
}

async function navigateTabAndWait(tabId, url, timeoutMs = 25000) {
  const waitPromise = waitForTabComplete(tabId, timeoutMs);
  try {
    // Luôn luôn active: false để không chuyển tab, giữ nguyên tab UI của người dùng
    await chrome.tabs.update(tabId, { url: url, active: false });
  } catch (err) {
    console.warn('[Navigate] Lỗi chrome.tabs.update:', err);
  }
  await waitPromise;
  await new Promise(r => setTimeout(r, 1000));
}

function runScriptInTab(tabId, func, args = []) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: func,
      args: args
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.warn('[executeScript] Lỗi inject:', chrome.runtime.lastError.message);
        resolve(null);
      } else {
        const res = (results && results[0] && results[0].result) || null;
        resolve(res);
      }
    });
  });
}

// Hàm điều phối duyệt website trực quan đa trang: Trang chủ -> Trang con (/about, /contact)
async function inspectWebsiteVisually(tabId, websiteUrl, leadName, leadEmail, initialAmazonUrl = '') {
  let entryUrl = websiteUrl;
  let rootHomepage = '';
  const isFormService = isThirdPartyFormService(websiteUrl);

  try {
    const u = new URL(websiteUrl);
    if (!u.hostname.includes('gooddog.com') && !isFormService) {
      rootHomepage = u.origin + '/';
      // Nếu link từ Facebook trỏ thẳng vào trang con (/contact, /form, /booking...),
      // ưu tiên mở TRANG CHỦ trước để nạp thanh điều hướng menu & các trang con khác!
      if (u.pathname && u.pathname !== '/' && u.pathname.length > 1) {
        entryUrl = rootHomepage;
        console.log(`[Web Live Inspector] Link ban đầu là trang con (${websiteUrl}) -> Tự động chuyển hướng vào Trang chủ (${entryUrl}) để khám phá menu đầy đủ.`);
      }
    }
  } catch (_) {}

  console.log(`[Web Live Inspector] Bắt đầu quét trực quan website: ${entryUrl} cho lead: ${leadName}`);

  // 1. Mở trang chủ / trang vào chính và đợi nạp DOM xong hoàn toàn (khống chế timeout 14s để tránh nghẽn)
  const homeLoaded = await navigateTabAndWait(tabId, entryUrl, 14000);
  if (!homeLoaded) {
    console.warn(`[Web Live Inspector] Không thể tải trang: ${entryUrl}`);
  }

  // 2. Chạy agent cuộn từ từ và trích xuất trên Trang chủ
  const homeResults = await runScriptInTab(tabId, scrollAndExtractPageAgent, [{
    pageTitle: entryUrl === rootHomepage ? 'Trang chủ (Homepage)' : 'Trang chính',
    isHomePage: true
  }]);

  let currentOwner = homeResults?.owner || '';
  let currentPhone = homeResults?.phone || '';
  let currentEmail = homeResults?.email || '';
  let currentAddress = homeResults?.address || '';
  let currentCity = homeResults?.city || '';
  let currentState = homeResults?.state || '';
  let currentZip = homeResults?.zip || '';
  let currentCountry = homeResults?.country || 'United States';

  // Khởi tạo biến Amazon rõ ràng từ initialAmazonUrl (từ Bio Facebook) hoặc từ trang chủ
  const validInitAmz = sanitizeAndValidateAmazonUrl(initialAmazonUrl);
  const validHomeAmz = sanitizeAndValidateAmazonUrl(homeResults?.amazon_url);
  let currentAmazonUrl = validHomeAmz || validInitAmz || '';
  let currentHasAmazon = Boolean(currentAmazonUrl);
  let subLinks = isFormService ? [] : (homeResults?.subLinks || []);

  // Nếu link ban đầu là trang con (/contact) và khác trang chủ, đảm bảo sẽ ghé thăm trang con này
  if (websiteUrl && rootHomepage && websiteUrl !== rootHomepage && !isFormService) {
    if (!subLinks.includes(websiteUrl)) {
      subLinks.unshift(websiteUrl);
    }
  }

  // 3. NẾU CHƯA TÌM THẤY CHỦ TRẠI VÀ CÓ CÁC TRANG CON (/about, /contact, /meet, ...)
  // Thăm tối đa 1 trang con tiềm năng nhất để tiết kiệm thời gian, tránh nghẽn
  if ((!currentOwner || !isValidOwnerCandidate(currentOwner)) && subLinks.length > 0) {
    const pagesToVisit = subLinks.slice(0, 1);
    for (const subUrl of pagesToVisit) {
      let subTitle = 'Trang con';
      try {
        const p = new URL(subUrl).pathname.toLowerCase();
        if (p.includes('about')) subTitle = 'Trang Giới thiệu (About Us)';
        else if (p.includes('meet')) subTitle = 'Trang Gặp gỡ Breeder (Meet)';
        else if (p.includes('story')) subTitle = 'Trang Câu chuyện (Our Story)';
        else if (p.includes('contact')) subTitle = 'Trang Liên hệ (Contact Us)';
      } catch (_) {}

      console.log(`[Web Live Inspector] Chuyển tab sang trang con: ${subUrl} (${subTitle})`);
      await navigateTabAndWait(tabId, subUrl, 10000);

      // Chạy agent cuộn từ từ và trích xuất trên trang con
      const subResults = await runScriptInTab(tabId, scrollAndExtractPageAgent, [{
        pageTitle: subTitle,
        isHomePage: false
      }]);

      if (subResults?.owner && isValidOwnerCandidate(subResults.owner)) {
        currentOwner = subResults.owner;
      }
      if (subResults?.phone && !currentPhone) currentPhone = subResults.phone;
      if (subResults?.email && !currentEmail) currentEmail = subResults.email;
      if (subResults?.address && !currentAddress) currentAddress = subResults.address;
      if (subResults?.city && !currentCity) currentCity = subResults.city;
      if (subResults?.state && !currentState) currentState = subResults.state;
      if (subResults?.zip && !currentZip) currentZip = subResults.zip;
      if (subResults?.country && (!currentCountry || currentCountry === 'United States')) currentCountry = subResults.country;
      const validSubAmz = sanitizeAndValidateAmazonUrl(subResults?.amazon_url);
      if (validSubAmz && !currentAmazonUrl) {
        currentHasAmazon = true;
        currentAmazonUrl = validSubAmz;
      }

      if (currentOwner && isValidOwnerCandidate(currentOwner)) {
        console.log(`[Web Live Inspector] Đã tìm thấy chủ trại tại ${subTitle}: ${currentOwner}`);
        break; // Đã tìm thấy chủ trại, kết thúc thăm trang con!
      }
    }
  }

  // 4. Quyết định kết quả cuối cùng (theo thứ bậc ưu tiên nghiêm ngặt)
  let finalOwner = '';
  let finalConfidence = '';

  if (currentOwner && isValidOwnerCandidate(currentOwner)) {
    finalOwner = currentOwner;
    finalConfidence = 'Tier 1 - Website Verified';
  } else {
    // Chỉ fallback sang tiền tố email nếu thực sự không tìm thấy trên website
    const emailToUse = currentEmail || leadEmail;
    const emailOwner = extractOwnerFromEmailPrefix(emailToUse);
    if (emailOwner && isValidOwnerCandidate(emailOwner)) {
      finalOwner = emailOwner;
      finalConfidence = 'Tier 2 - Email Prefix Fallback';
    } else {
      finalOwner = leadName || 'Facebook User';
      finalConfidence = 'Tier 3 - Facebook Page Fallback';
    }
  }

  return {
    owner: finalOwner,
    confidence: finalConfidence,
    phone: currentPhone,
    email: currentEmail,
    address: currentAddress,
    city: currentCity,
    state: currentState,
    zip: currentZip,
    country: currentCountry,
    has_amazon: currentHasAmazon,
    amazon_url: currentAmazonUrl,
    amazon_channel: currentHasAmazon ? 'Selling on Amazon (Target)' : 'Amazon link not found',
    amz_cat: currentHasAmazon ? 'Pet Toys / Artificial Grass / Pet Toilets' : 'Chưa phát hiện link Amazon'
  };
}

// Function injected directly into the live website tab
async function scrollAndExtractPageAgent(options) {
  const { pageTitle = 'Trang chủ', isHomePage = true } = options || {};

  let banner = document.getElementById('gooddog-web-live-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'gooddog-web-live-banner';
    banner.style.cssText = 'position:fixed; top:16px; left:50%; transform:translateX(-50%); z-index:2147483647; background:linear-gradient(135deg, #0e2226 0%, #153438 100%); color:#ffffff; padding:14px 22px; border-radius:18px; box-shadow:0 16px 45px rgba(0,0,0,0.65), 0 0 0 2px #f7b45a; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size:14px; line-height:1.4; max-width:92vw; width:680px; display:flex; flex-direction:column; gap:8px; transition:all 0.3s ease; backdrop-filter:blur(8px);';
    banner.innerHTML = `
      <div style="display:flex; align-items:center; gap:14px; width:100%;">
        <div id="gooddog-pulse-dot" style="width:14px; height:14px; border-radius:50%; background:#00e676; flex-shrink:0; box-shadow:0 0 12px #00e676;"></div>
        <div style="flex:1;">
          <div style="font-weight:800; color:#ffd496; font-size:12px; text-transform:uppercase; letter-spacing:0.8px;">🐾 Pet & Grass — Live Website Inspector (Mô phỏng cuộn thực tế)</div>
          <div id="gooddog-banner-msg" style="margin-top:2px; font-weight:600; font-size:14px; color:#e6f4f1;">Đang tải và chuẩn bị cuộn trang...</div>
        </div>
        <div id="gooddog-banner-badge" style="background:#b84f2e; color:#fff; padding:5px 12px; border-radius:12px; font-size:12px; font-weight:700;">Đang xem...</div>
      </div>
      <div style="width:100%; height:5px; background:rgba(255,255,255,0.2); border-radius:4px; overflow:hidden;">
        <div id="gooddog-banner-progress" style="width:0%; height:100%; background:#00e676; transition:width 0.3s ease;"></div>
      </div>
    `;
    document.body.appendChild(banner);
  }

  const setStatus = (msg, badgeText, badgeColor = '#b84f2e', progressPct = 0, dotColor = '#00e676') => {
    const msgEl = document.getElementById('gooddog-banner-msg');
    const badgeEl = document.getElementById('gooddog-banner-badge');
    const dotEl = document.getElementById('gooddog-pulse-dot');
    const progEl = document.getElementById('gooddog-banner-progress');
    if (msgEl) msgEl.innerText = msg;
    if (badgeEl) {
      badgeEl.innerText = badgeText;
      badgeEl.style.background = badgeColor;
    }
    if (dotEl) {
      dotEl.style.background = dotColor;
      dotEl.style.boxShadow = '0 0 12px ' + dotColor;
    }
    if (progEl && progressPct !== undefined) {
      progEl.style.width = Math.min(100, Math.max(0, progressPct)) + '%';
    }
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Bộ lọc các chuỗi rác UI / Accessibility (Tuyệt đối loại trừ "Skip to content", "Menu", "Search")
  const JUNK_OWNER_STRINGS = new Set([
    'skip to content', 'skip to main content', 'skip to navigation', 'skip content',
    'navigation', 'toggle navigation', 'main menu', 'primary menu', 'menu', 'search',
    'close menu', 'open menu', 'home', 'about', 'about us', 'contact', 'contact us',
    'our story', 'our dogs', 'our puppies', 'available puppies', 'upcoming litters',
    'reviews', 'testimonials', 'customer reviews', 'blog', 'news', 'gallery',
    'all rights reserved', 'privacy policy', 'terms of service', 'terms and conditions',
    'cookie policy', 'cart', 'checkout', 'my account', 'login', 'register',
    'facebook user', 'breeder owner', 'kennel owner', 'manager', 'owner / manager',
    'leave a reply', 'recent posts', 'archives', 'categories', 'welcome', 'header', 'footer',
    'the parent', 'the parents', 'parent', 'parents', 'with b', 'with', 'the', 'and', 'or', 'about'
  ]);

  const isValidOwnerCandidate = (name) => {
    if (!name || typeof name !== 'string') return false;
    const s = name.trim();
    const low = s.toLowerCase();
    if (s.length < 2 || s.length > 35) return false;
    if (JUNK_OWNER_STRINGS.has(low)) return false;
    for (const bad of JUNK_OWNER_STRINGS) {
      if (low === bad || low.startsWith(bad + ' ') || low.endsWith(' ' + bad)) return false;
    }
    const firstWord = low.split(/\s+/)[0];
    const BAD_FIRST_WORDS = new Set([
      'the', 'a', 'an', 'with', 'and', 'or', 'by', 'at', 'for', 'from', 'in', 'on', 'of', 'to',
      'our', 'your', 'my', 'us', 'we', 'they', 'them', 'he', 'she', 'it', 'its', 'their',
      'who', 'what', 'where', 'when', 'why', 'how', 'parent', 'parents', 'dam', 'sire',
      'puppy', 'puppies', 'dog', 'dogs', 'meet', 'about', 'contact', 'welcome'
    ]);
    if (BAD_FIRST_WORDS.has(firstWord)) return false;
    if (/^(?:the|with|and|by|at|for|from|in|on|of|to)\s+/i.test(low)) return false;
    if (/^with\s+[a-z]\b/i.test(low)) return false;

    if (/skip\s+to|navigation|content|menu|search|cookie|privacy|policy|terms|rights\s+reserved|cart|checkout|kennel|puppy|puppies|farm|bulldog|frenchie|corgi|doodle|cavapoo|yorkie|retriever|shepherd|password|username|parent|parents/i.test(low)) {
      return false;
    }
    if (!/[A-ZÀ-Ỹ]/.test(s)) return false;
    if (/[@\/\\{}[\]<>=+*_$#]/.test(s)) return false;
    return true;
  };

  const cleanAddressTextLocal = (raw) => {
    if (!raw || typeof raw !== 'string') return '';
    let s = raw.trim();

    let prev = '';
    while (s !== prev) {
      prev = s;
      s = s.replace(/^(?:Chi tiết|Details|Trang|Page)\s*[:·•|—–-]?\s*/i, '')
           .replace(/^(?:Chưa đánh giá(?:\s*\(\d+\s*lượt đánh giá\))?|No reviews(?:\s*yet)?|\d+(?:\.\d+)?\s*(?:đánh giá|reviews?)(?:\s*\(\d+\s*lượt\))?)\s*[:·•|—–-]?\s*/i, '')
           .replace(/^\${1,4}\s*[:·•|—–-]?\s*/, '')
           .replace(/^(?:Luôn mở cửa|Đang mở cửa|Đóng cửa|Mở cửa|Always open|Open now|Closed|Open hours)\s*[:·•|—–-]?\s*/i, '')
           .replace(/^(?:Địa chỉ|Address|Location)\s*[:·•|—–-]?\s*/i, '')
           .replace(/^(?:USA|US|Việt Nam|Vietnam)\s*[:·•|—–-]?\s*/i, '')
           .trim();
    }

    if (/\b(?:cộng đồng|nhóm công khai|nhóm riêng tư|public group|private group|community|nhóm)\b/i.test(s) && !/\d{1,5}\s+[A-Za-z]/.test(s)) {
      return '';
    }

    const mStreet = s.match(/\b(\d{1,6}\s+[A-Za-z0-9\s.,'#-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Highway|Hwy|Pkwy|Plaza|Pl|Terrace|Ter|Square|Sq|Suite|Ste|Apt|Unit|Ranch|Trail|Trl|Pike)[\s\S]*)/i);
    if (mStreet) {
      s = mStreet[1].trim();
    }

    s = s.replace(/\b(Avenue|Ave|Street|St|Road|Rd|Drive|Dr|Boulevard|Blvd|Way|Lane|Ln|Court|Ct|Circle|Cir|Highway|Hwy)(USA|US|United States)\b/gi, '$1, $2');
    s = s.replace(/,\s*(?:USA|United States),\s*([A-Za-z\s]+),\s*([A-Z]{2}),\s*(?:United States|USA),\s*\2\s*(?:United States|USA)?/gi, ', $1, $2, United States')
         .replace(/([A-Z]{2}),\s*(?:United States|USA),\s*\1\s*(?:United States|USA)?\s*(\d{5})/gi, '$1 $2, United States')
         .replace(/\b([A-Z]{2})\s+United States\s+(\d{5})\b/gi, '$1 $2, United States')
         .replace(/,\s*,/g, ',')
         .replace(/\s+/g, ' ');

    s = s.replace(/^[\s,·•|:—–-]+|[\s,·•|:—–-]+$/g, '').trim();
    if (s.length < 5) return '';

    return s;
  };

  // Cuộn mượt mà từ trên xuống dưới (khống chế tối đa 6 nấc hoặc 3000px để không bị nghẽn ở các trang web quá dài)
  let scrollY = 0;
  const viewH = window.innerHeight || 800;
  const step = Math.max(350, Math.floor(viewH * 0.7));
  let docH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 1200);
  let scrollCount = 0;

  while (scrollY < docH && scrollCount < 6 && scrollY < 3200) {
    scrollCount++;
    scrollY += step;
    window.scrollTo({ top: scrollY, behavior: 'smooth' });
    await sleep(350);
    docH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 1200);
    const pct = Math.min(100, Math.round((scrollY / Math.min(docH, 3200)) * 100));
    setStatus(`👀 Đang cuộn xem ${pageTitle} từ từ (${pct}%)...`, 'Đang cuộn...', '#b84f2e', pct);
    if (scrollY >= docH - 100) break;
  }
  window.scrollTo({ top: Math.min(docH, 3200), behavior: 'smooth' });
  setStatus(`📄 Đã cuộn xong ${pageTitle}! Đang bóc tách thông tin liên hệ & chủ trại...`, 'Đáy trang', '#0284c7', 100);
  await sleep(400);

  // Trích xuất từ DOM trang hiện tại
  let htmlStr = document.documentElement ? document.documentElement.innerHTML : '';
  let bodyText = document.body ? document.body.innerText : '';
  let owner = '';

  // 1. Quét Good Dog
  if (/gooddog\.com/i.test(window.location.href) || /gooddog\.com/i.test(htmlStr)) {
    const mFull = htmlStr.match(/breederFullName:\s*['"]([^'"]+)['"]/i);
    if (mFull && isValidOwnerCandidate(mFull[1])) owner = mFull[1].trim();
    if (!owner) {
      const mHeader = htmlStr.match(/<h[1-6][^>]*>([A-Z][a-z]+(?:\s+[A-Z]\.?)?)<\/h[1-6]>\s*<p[^>]*>Breeder of/i);
      if (mHeader && isValidOwnerCandidate(mHeader[1])) owner = mHeader[1].trim();
    }
    if (!owner) {
      const mFirst = htmlStr.match(/breederFirstName:\s*['"]([^'"]+)['"]/i);
      if (mFirst && isValidOwnerCandidate(mFirst[1])) owner = mFirst[1].trim();
    }
  }

  // 2. Schema.org JSON-LD Person
  if (!owner) {
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const sc of jsonLdScripts) {
      try {
        const data = JSON.parse(sc.innerText);
        const findPerson = (obj) => {
          if (!obj || typeof obj !== 'object') return null;
          if (obj['@type'] === 'Person' && obj.name && typeof obj.name === 'string' && isValidOwnerCandidate(obj.name)) {
            return obj.name.trim();
          }
          if (obj.founder && obj.founder.name && typeof obj.founder.name === 'string' && isValidOwnerCandidate(obj.founder.name)) {
            return obj.founder.name.trim();
          }
          if (obj.owner && obj.owner.name && typeof obj.owner.name === 'string' && isValidOwnerCandidate(obj.owner.name)) {
            return obj.owner.name.trim();
          }
          if (Array.isArray(obj)) {
            for (const item of obj) {
              const res = findPerson(item);
              if (res) return res;
            }
          }
          if (obj['@graph'] && Array.isArray(obj['@graph'])) {
            for (const item of obj['@graph']) {
              const res = findPerson(item);
              if (res) return res;
            }
          }
          return null;
        };
        const person = findPerson(data);
        if (person) { owner = person; break; }
      } catch (e) {}
    }
  }

  // 3. Headings có ngữ cảnh rõ ràng
  if (!owner) {
    const headings = document.querySelectorAll('h1, h2, h3, h4');
    for (const h of headings) {
      const txt = (h.innerText || '').trim();
      const mMeet = txt.match(/^Meet\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i);
      if (mMeet && isValidOwnerCandidate(mMeet[1])) {
        owner = mMeet[1].trim();
        break;
      }
      const mBreeder = txt.match(/^(?:About\s+the\s+Breeder|Meet\s+the\s+Breeder|Our\s+Breeder)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i);
      if (mBreeder && isValidOwnerCandidate(mBreeder[1])) {
        owner = mBreeder[1].trim();
        break;
      }
    }
  }

  // 4. Alt text ảnh Breeder/Owner
  if (!owner) {
    const images = document.querySelectorAll('img[alt]');
    for (const img of images) {
      const alt = img.getAttribute('alt') || '';
      const mAlt = alt.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*(?:the\s+)?(?:breeder|founder|owner)\b/i);
      if (mAlt && isValidOwnerCandidate(mAlt[1])) {
        owner = mAlt[1].trim();
        break;
      }
    }
  }

  // 5. Ngữ cảnh trong văn bản trang
  if (!owner) {
    const mBodyBreeder = bodyText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+the\s+breeder\s+and\s+founder/i);
    if (mBodyBreeder && isValidOwnerCandidate(mBodyBreeder[1])) {
      owner = mBodyBreeder[1].trim();
    } else {
      const mOperated = bodyText.match(/(?:owned\s+and\s+operated\s+by|founded\s+by|head\s+breeder|breeder\s+is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
      if (mOperated && isValidOwnerCandidate(mOperated[1])) {
        owner = mOperated[1].trim();
      }
    }
  }

  // Quét SĐT
  let phone = '';
  const telLink = document.querySelector('a[href^="tel:"]');
  if (telLink) phone = (telLink.getAttribute('href') || '').replace(/^tel:/i, '').trim();
  if (!phone) {
    const mP = bodyText.match(/(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-](\d{3})[\s.-](\d{4})\b/);
    if (mP) phone = mP[0];
  }

  // Quét Email
  let email = '';
  const mailLink = document.querySelector('a[href^="mailto:"]');
  if (mailLink) {
    const em = (mailLink.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
    if (em.includes('@') && !em.includes('example') && !em.includes('sentry')) email = em;
  }
  if (!email) {
    const mE = bodyText.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/);
    if (mE && !/sentry|example|\.png|\.jpg|\.webp/i.test(mE[0])) email = mE[0].toLowerCase();
  }

  // Quét Địa chỉ
  let address = '';
  const mAddr = bodyText.match(/\b\d{1,5}\s+[A-Za-z0-9\s.,'#-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Way|Lane|Ln|Court|Ct|Highway|Hwy|Pkwy|Plaza|Pl)[\s\S]{0,100}?\b([A-Z]{2})\b(?:\s*(\d{5}))?/i);
  if (mAddr) {
    address = cleanAddressTextLocal(mAddr[0]);
  }

  // 6. Quét liên kết gian hàng hoặc sản phẩm Amazon (Amazon Storefront / Affiliate / Product)
  let amazonUrl = '';
  const amzElements = Array.from(document.querySelectorAll('a[href*="amazon."], a[href*="amzn.to"], a[href*="a.co"]'));
  for (const a of amzElements) {
    const href = (a.getAttribute('href') || a.href || '').trim();
    // Áp dụng bộ lọc loại trừ rác nghiêm ngặt (/ap/register, /ap/signin, /gp/cart...)
    if (href && !/\/ap\/(?:signin|register)|\/gp\/(?:cart|help)|\/cart\/|privacy|preferences/i.test(href)) {
      try {
        const u = new URL(href, window.location.origin);
        const p = u.pathname.replace(/\/+$/, '');
        // Chấp nhận Storefront, Wishlist, Author, Shortlink a.co, Product /dp/
        if (p.length > 1 && !/^(?:\/ref|\/gp)$/i.test(p)) {
          amazonUrl = u.toString();
          break;
        }
      } catch (_) {
        if (!amazonUrl) amazonUrl = href;
      }
    }
  }

  // 7. Quét Thành phố & Bang trên Good Dog hoặc Website
  let city = '';
  let state = '';
  let zip = '';
  let country = 'United States';
  const mLocGoodDog = bodyText.match(/([A-Za-z\s.-]+),\s*([A-Z]{2})\s*·\s*Drop-off/i) ||
                      htmlStr.match(/breederCity:\s*['"]([^'"]+)['"]/i) ||
                      bodyText.match(/\b([A-Za-z\s.-]+),\s*([A-Z]{2})\b/);
  if (mLocGoodDog && mLocGoodDog[1] && mLocGoodDog[2]) {
    city = mLocGoodDog[1].trim();
    state = mLocGoodDog[2].trim().toUpperCase();
  }

  // Nếu là trang chủ: Thu thập các link con nội bộ tiềm năng
  let subLinks = [];
  if (isHomePage) {
    const rawSubLinks = Array.from(document.querySelectorAll('a[href]')).map(a => a.href).filter(href => {
      try {
        const u = new URL(href, window.location.origin);
        return u.origin === window.location.origin &&
               /\/(about|about-us|about_us|story|our-story|meet|meet-the-breeder|meet-us|team|contact|contact-us|contact_us|breeder)/i.test(u.pathname) &&
               !/#/.test(u.hash || '') &&
               !/\.(jpg|png|pdf|zip)$/i.test(u.pathname);
      } catch (e) { return false; }
    });

    // Sắp xếp ưu tiên: /about, /meet, /story lên trước, /contact theo sau
    const unique = Array.from(new Set(rawSubLinks));
    unique.sort((a, b) => {
      const aScore = /\b(about|meet|breeder)\b/i.test(a) ? 2 : 1;
      const bScore = /\b(about|meet|breeder)\b/i.test(b) ? 2 : 1;
      return bScore - aScore;
    });
    subLinks = unique.slice(0, 3);
  }

  if (owner) {
    setStatus(`✅ Tìm thấy Chủ trại tại ${pageTitle}: ${owner}!`, 'Thành công', '#10b981', 100, '#10b981');
    await sleep(900);
  } else {
    setStatus(`ℹ️ Đã xem xong ${pageTitle}. Đang xử lý tiếp...`, 'Tiếp tục', '#0284c7', 100);
    await sleep(400);
  }

  return {
    owner: owner,
    phone: phone,
    email: email,
    address: address,
    city: city,
    state: state,
    zip: zip,
    country: country,
    has_amazon: !!amazonUrl,
    amazon_url: amazonUrl,
    amazon_channel: amazonUrl ? 'Selling on Amazon (Target)' : 'Amazon link not found',
    amz_cat: amazonUrl ? 'Pet Toys / Artificial Grass / Pet Toilets' : 'Chưa phát hiện link Amazon',
    subLinks: subLinks
  };
}

const liveWebsiteInspectorAgent = scrollAndExtractPageAgent;

loadState();
