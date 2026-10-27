if (window.location.origin.includes('127.0.0.1') || window.location.origin.includes('localhost') || window.location.origin.includes('43.156.237.143') || window.location.href.includes('step2') || window.location.href.includes('dashboard') || window.location.href.includes('2.html')) {
  const announceReady = () => {
    window.postMessage({ type: 'PET_LEAD_EXT_READY', tool: 'fb_profile_funnel_scraper', version: '2.0.0' }, '*');
  };
  announceReady();
  setInterval(announceReady, 1500);

  // Relay scan requests from Web Dashboard to background.js
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'START_STEP2_SCAN_VIA_EXTENSION' || event.data.type === 'START_AUTO') {
      chrome.runtime.sendMessage({
        action: 'START_AUTO',
        urls: event.data.urls || event.data.links,
        startIndex: event.data.startIndex !== undefined ? event.data.startIndex : (event.data.options ? event.data.options.fromIndex : 0),
        endIndex: event.data.endIndex !== undefined ? event.data.endIndex : (event.data.options ? event.data.options.toIndex : 0),
        maxParallel: event.data.maxParallel !== undefined ? event.data.maxParallel : (event.data.options ? event.data.options.maxParallel : 1),
        tabId: null
      });
    } else if (event.data.type === 'STOP_STEP2_SCAN_VIA_EXTENSION' || event.data.type === 'STOP_AUTO') {
      chrome.runtime.sendMessage({ action: 'STOP_AUTO' });
    } else if (event.data.type === 'RESUME_STEP2_SCAN_VIA_EXTENSION' || event.data.type === 'RESUME_AUTO') {
      chrome.runtime.sendMessage({ action: 'RESUME_AUTO' });
    }
  });

  // Relay scan events from background.js to Web Dashboard
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action && (msg.action.startsWith('STEP2_') || msg.action === 'STATE_UPDATED')) {
      window.postMessage({ type: 'PET_LEAD_STEP2_EVENT', payload: msg }, '*');
    }
    return true;
  });
}

if (!window.__FB_SCRAPER_LOADED__) {
  window.__FB_SCRAPER_LOADED__ = true;
  let currentActiveTaskId = null;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'PING') {
      sendResponse({ status: 'pong', url: window.location.href });
      return true;
    }
    if (msg.action === 'START_SCRAPE') {
      if (currentActiveTaskId && currentActiveTaskId === msg.taskId) {
        console.log("[FB Scraper] Dang cao dung taskId nay, bo qua goi lap lai.");
        sendResponse({ status: 'already_running' });
        return true;
      }
      currentActiveTaskId = msg.taskId;
      sendResponse({ status: 'started' });
      scrapePublishTime(msg.targetUrl, msg.stt, msg.taskId)
        .catch(err => console.warn('[FB Scraper] Loi scrapePublishTime:', err))
        .finally(() => {
          if (currentActiveTaskId === msg.taskId) {
            currentActiveTaskId = null;
          }
        });
      return true;
    }
    else if (msg.action === 'TRIGGER_DOWNLOAD') {
      downloadCSV(msg.data, msg.isPartial);
      sendResponse({ status: 'ok' });
      return true;
    }
    else if (msg.action === 'TRIGGER_DIRECT_FILE_DOWNLOAD' && msg.content) {
      const blob = new Blob([msg.content], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = msg.filename || 'export.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
      sendResponse({ status: 'ok' });
      return true;
    }
  });
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }


// =========================================================================
// THẨM ĐỊNH LINK AMAZON CHUẨN VÀ PHÁT HIỆN LINK BIO TỔNG HỢP (DEEP BIO SCRAPING)
// =========================================================================
const BIO_LINK_REGEX = /https?:\/\/(?:www\.)?(linktr\.ee|hoo\.be|direct\.me|msha\.ke|beacons\.ai|stan\.store|taplink\.cc|campsite\.bio|lnk\.bio)\/[a-zA-Z0-9_.-]+/gi;

function extractBioAggregatorLinks(str) {
  if (!str || typeof str !== 'string') return [];
  const matches = str.match(BIO_LINK_REGEX) || [];
  return Array.from(new Set(matches.map(m => m.trim())));
}

function sanitizeAndValidateAmazonUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let url = rawUrl.trim();

  // Giải mã link shim Facebook nếu có
  if (url.includes('facebook.com/l.php?u=') || url.includes('/flx/warn/?u=') || url.includes('u=')) {
    try {
      const u = new URL(url, window.location.origin);
      const real = u.searchParams.get('u');
      if (real) url = decodeURIComponent(real);
    } catch (_) { }
  }

  // Kiểm tra tên miền Amazon
  if (!/(?:amazon\.[a-z.]+|amzn\.to|a\.co)/i.test(url)) {
    return null;
  }

  // Loại bỏ các đường dẫn hệ thống rác của Amazon (đăng nhập, đăng ký, giỏ hàng, trợ giúp, điều khoản)
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

    // Nếu là short link a.co hoặc amzn.to
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

/**
 * Trích xuất mọi liên kết ngoài từ <script type="application/json" data-sjs> và Raw HTML
 * (Khắc phục trường hợp DOM #mount_0_0_OD để style="display:none" và render trễ)
 */
function extractExternalUrlsFromScriptsAndHtml() {
  const rawUrls = new Set();
  const scripts = Array.from(document.querySelectorAll('script'));
  const allSources = [];

  for (const s of scripts) {
    const t = s.textContent;
    if (t && (t.includes('external_url') || t.includes('l.facebook.com/l.php') || t.includes('amazon.') || t.includes('amzn.to') || t.includes('a.co') || t.includes('profile_tile_section_type') || t.includes('LINKS'))) {
      allSources.push(t);
    }
  }
  if (document.documentElement) {
    allSources.push(document.documentElement.innerHTML);
  }

  const unescapeFbString = (str) => {
    if (!str) return '';
    return str
      .replace(/\\\//g, '/')
      .replace(/\\u0025/g, '%')
      .replace(/\\u0026/g, '&')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();
  };

  const extractRealUrl = (u) => {
    if (!u) return null;
    let clean = unescapeFbString(u);
    if (clean.includes('l.facebook.com/l.php?u=') || clean.includes('/flx/warn/?u=') || clean.includes('/l.php?u=')) {
      try {
        const parsed = new URL(clean.startsWith('http') ? clean : 'https://' + clean, window.location.origin);
        const real = parsed.searchParams.get('u');
        if (real) clean = decodeURIComponent(real);
      } catch (_) {
        const matchU = clean.match(/[?&]u=([^&]+)/);
        if (matchU) {
          try { clean = decodeURIComponent(matchU[1]); } catch (_) { }
        }
      }
    }
    return clean.trim();
  };

  for (const src of allSources) {
    if (!src) continue;

    // 1. Regex cho "external_url":"([^"]+)" (VD: Amazon author / dp / shop trong LINKS profile tile)
    const extRegex = /"external_url"\s*:\s*"([^"]+)"/g;
    for (const m of src.matchAll(extRegex)) {
      const real = extractRealUrl(m[1]);
      if (real && real.startsWith('http')) rawUrls.add(real);
    }

    // 2. Regex cho "url":"(https?:\\\/\\\/l\.facebook\.com\\\/l\.php\?u=[^"&]+|https?:\/\/[^"]+)"
    const urlShimRegex = /"url"\s*:\s*"(https?:\\\/\\\/l\.facebook\.com\\\/l\.php\?u=[^"\\]+|https?:\/\/[^"\\]+)"/g;
    for (const m of src.matchAll(urlShimRegex)) {
      const real = extractRealUrl(m[1]);
      if (real && real.startsWith('http')) rawUrls.add(real);
    }

    // 3. Regex trực tiếp cho link Amazon hoặc Bio trong text/scripts
    const directAmz = src.match(/(?:https?:)?(?:\/\\|\/){2}(?:www\.)?(?:amazon\.[a-z.]+|amzn\.to|a\.co)(?:\/\\|\/)[^\s"'>\\]+/gi) || [];
    for (const da of directAmz) {
      const real = extractRealUrl(da);
      if (real && (real.startsWith('http') || real.includes('amazon.') || real.includes('amzn.to') || real.includes('a.co'))) {
        rawUrls.add(real.startsWith('http') ? real : 'https://' + real);
      }
    }
  }

  return Array.from(rawUrls);
}

/**
 * Trích xuất timestamp từ Relay GraphQL Stories (Pinned Post & Timeline Feed Units / Reels)
 * Chặn 100% serverTime, lastActiveTimes và ID người dùng đang đăng nhập (100060157728939 - Nguyễn Đức Trọng)
 */
function extractRelayFeedAndPinnedTimestamps(currentProfileId) {
  const scripts = Array.from(document.querySelectorAll('script')).filter(s => {
    const t = s.textContent || '';
    return (t.includes('creation_time') || t.includes('publish_time')) &&
      (t.includes('Story') || t.includes('timeline_list_feed_units') || t.includes('pinned') || t.includes('Pinned'));
  });

  const nowSec = Math.floor(Date.now() / 1000);
  const minTs = 1577836800; // 01/01/2020
  const maxTs = nowSec + 3600;
  const loggedInViewerId = '100060157728939'; // Nguyễn Đức Trọng (account đang đăng nhập)

  let pinnedTs = 0;
  let latestFeedTs = 0;

  for (const s of scripts) {
    const text = s.textContent || '';

    // Bỏ qua nếu khối script này chỉ là presence / lastActiveTimes của viewer đăng nhập
    if (text.includes('"lastActiveTimes"') || text.includes('"presence"') || text.includes('"chat_watermark"')) {
      if (!text.includes('timeline_list_feed_units') && !text.includes('profile_pinned_post') && !text.includes('ProfileCometPinnedPost')) {
        continue;
      }
    }

    // 1. Quét Pinned Post (ProfileCometPinnedPostSection / profile_pinned_post)
    const pinnedMatch = text.match(/(?:profile_pinned_post|ProfileCometPinnedPostSection|ProfileCometPinnedPost)[\s\S]{0,2500}?["\\]*creation_time["\\]*\s*:\s*(\d{9,11})/i);
    if (pinnedMatch) {
      const pts = parseInt(pinnedMatch[1], 10);
      if (pts >= minTs && pts <= maxTs) {
        if (pts > pinnedTs) pinnedTs = pts;
      }
    }

    // 2. Quét timeline_list_feed_units / ProfileCometTimelineFeedQuery
    const feedBlocks = text.match(/(?:timeline_list_feed_units|ProfileCometTimelineFeedQuery|ProfileCometTimelineListViewRootQuery)[\s\S]{0,15000}/g) || [];
    for (const block of feedBlocks) {
      const storyMatches = block.matchAll(/["\\]*__typename["\\]*\s*:\s*["\\]*Story["\\]*[\s\S]{0,800}?["\\]*creation_time["\\]*\s*:\s*(\d{9,11})/g);
      for (const sm of storyMatches) {
        const fts = parseInt(sm[1], 10);
        if (fts >= minTs && fts <= maxTs) {
          if (fts > latestFeedTs) latestFeedTs = fts;
        }
      }
    }

    // 3. Fallback: tìm các khối __typename: Story có creation_time trong toàn bộ text
    if (!latestFeedTs) {
      const genStoryMatches = text.matchAll(/["\\]*__typename["\\]*\s*:\s*["\\]*Story["\\]*[\s\S]{0,800}?["\\]*creation_time["\\]*\s*:\s*(\d{9,11})/g);
      for (const gsm of genStoryMatches) {
        const subStr = gsm[0];
        if (subStr.includes(loggedInViewerId) || subStr.includes('serverTime')) continue;
        const fts = parseInt(gsm[1], 10);
        if (fts >= minTs && fts <= maxTs) {
          if (fts > latestFeedTs) latestFeedTs = fts;
        }
      }
    }
  }

  return {
    pinnedTs,
    latestFeedTs
  };
}

const MONTH_MAP = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8,
  sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11
};

const FACEBOOK_UI_STRINGS = new Set([
  // Tiếng Việt
  'tìm hiểu thêm', 'learn more', 'tất cả', 'all', 'xem tất cả', 'see all',
  'theo dõi', 'follow', 'following', 'đang theo dõi', 'nhắn tin', 'message',
  'bạn bè', 'friends', 'thêm bạn bè', 'add friend', 'thích', 'like', 'liked',
  'đã thích', 'gửi tin nhắn', 'send message', 'gọi ngay', 'call now',
  'liên hệ', 'contact', 'contact us', 'xem thêm', 'see more', 'chi tiết', 'details',
  'chỉnh sửa', 'edit', 'trang chủ', 'home', 'bài viết', 'posts', 'ảnh', 'photos',
  'video', 'videos', 'giới thiệu', 'about', 'intro', 'đánh giá', 'reviews', 'người theo dõi', 'followers',
  'thông báo', 'notifications', 'chia sẻ', 'share', 'bình luận', 'comment',
  'trang', 'tiểu sử', 'chỉnh sửa tiểu sử', 'chỉnh sửa chi tiết',
  // Tiếng Trung (中文)
  '了解详情', '全部', '查看全部', '关注', '已关注', '发消息', '好友', '加为好友',
  '赞', '已赞', '发送消息', '立即呼叫', '联系我们', '联系', '查看更多', '详细信息',
  '编辑', '主页', '帖子', '照片', '视频', '简介', '评价', '粉丝', '关注者',
  '通知', '分享', '评论', '编辑个人简介', '编辑资料', '个人资料', '更多', '管理',
  // Hệ thống chung
  'facebook', 'facebook user', 'menu', 'tìm kiếm', 'search', '搜索'
]);

function isFacebookUIString(str) {
  if (!str || typeof str !== 'string') return true;
  const s = str.trim().toLowerCase().replace(/^[\s·•|:—–-]+|[\s·•|:—–-]+$/g, '');
  if (s.length < 2 || s.length > 80) return true;
  if (FACEBOOK_UI_STRINGS.has(s)) return true;
  if (/^(theo dõi|follow|following|đang theo dõi|nhắn tin|message|bạn bè|friends|thêm bạn bè|add friend|tìm hiểu thêm|learn more|tất cả|all|xem tất cả|see all|thích|like|đã thích|xem thêm|see more|关注|已关注|发消息|主页|简介|帖子)$/i.test(s)) return true;
  return false;
}

/**
 * Kiểm tra các tên rác hệ thống của Facebook
 */
function isGarbageName(name) {
  if (!name) return true;
  let s = name.toLowerCase().trim();
  if (isFacebookUIString(s)) return true;
  if (s === 'facebook' || s === 'thông báo' || s.includes('thông báo') || s === 'notifications' || s === '通知' || s.startsWith('(')) {
    return true;
  }
  return false;
}

/**
 * Lấy tên Fanpage / Profile chuẩn xác, không dính tên rác (Hỗ trợ VI, EN, ZH)
 */
function getProfileName() {
  // 1. Kiểm tra từ text ngay trước số người theo dõi trong DOM (VI, EN, ZH)
  let bodyText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
  if (bodyText) {
    let m = bodyText.match(/(?:^|\n)([^\n|]{2,60}?)\s*\n\s*\d+(?:[,\.]\d+)?[KkMm万萬]?\s*(?:người theo dõi|followers|lượt thích|likes|位粉丝|个粉丝|关注者|次赞|个赞|人关注)/i)
      || bodyText.match(/(?:^|\n|\|\s*)([^\n|]{2,60}?)\s*(?: |\s)*(?:•|\||\n)\s*\d+(?:[,\.]\d+)?[KkMm万萬]?\s*(?:người theo dõi|followers|lượt thích|likes|位粉丝|个粉丝|关注者|次赞|个赞|人关注)/i);
    if (m && !isGarbageName(m[1])) {
      let clean = m[1].replace(/^[\s|·•\-_]+|[\s|·•\-_]+$/g, '').trim();
      if (clean && !isGarbageName(clean)) return clean;
    }
  }

  // 2. Kiểm tra H1 bên trong vùng nội dung chính (main)
  let mainH1 = document.querySelector('div[role="main"] h1');
  if (mainH1) {
    const h1T = (mainH1.innerText || mainH1.textContent || '').trim();
    if (h1T && !isGarbageName(h1T)) return h1T;
  }

  // 3. Kiểm tra thẻ meta og:title
  let ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle && ogTitle.content) {
    let clean = ogTitle.content.replace(/^\(\d+\)\s*/, '').split('|')[0].split('-')[0].trim();
    if (!isGarbageName(clean)) return clean;
  }

  // 4. Kiểm tra bất kỳ thẻ H1 nào hợp lệ
  let h1List = Array.from(document.querySelectorAll('h1'));
  for (let h of h1List) {
    const hText = (h.innerText || h.textContent || '').trim();
    if (hText && !isGarbageName(hText)) {
      return hText;
    }
  }

  // 5. Kiểm tra document.title
  if (document.title) {
    let clean = document.title.replace(/^\(\d+\)\s*/, '').split('|')[0].split('-')[0].trim();
    if (!isGarbageName(clean)) return clean;
  }

  // 6. Fallback từ URL slug
  let pathname = window.location.pathname.replace(/^\/|\/$/g, '');
  let slug = pathname.split('/')[0] || '';
  if (slug && slug !== 'profile.php' && slug !== 'pages') {
    return slug;
  }

  return 'Facebook User';
}

/**
 * Trích xuất Facebook ID số từ URL hoặc DOM meta
 */
function extractFacebookID() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const qId = urlParams.get('id');
    if (qId && /^\d+$/.test(qId)) return qId;

    const mProfile = document.querySelector('meta[property="al:android:url"], meta[property="al:ios:url"]');
    if (mProfile && mProfile.content) {
      const m = mProfile.content.match(/fb:\/\/profile\/(\d+)|fb:\/\/page\/(\d+)/);
      if (m && (m[1] || m[2])) return m[1] || m[2];
    }

    const mUserId = document.querySelector('meta[property="fb:profile_id"], meta[property="fb:pages"]');
    if (mUserId && mUserId.content && /^\d+$/.test(mUserId.content)) {
      return mUserId.content;
    }

    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const t = s.textContent || '';
      if (t.includes('userID') || t.includes('pageID') || t.includes('entity_id')) {
        const m = t.match(/["'](?:userID|pageID|entity_id)["']\s*:\s*["']?(\d{8,20})["']?/);
        if (m && m[1]) return m[1];
      }
    }
  } catch (e) {
    console.warn('[FB Scraper] Lỗi khi trích xuất FB ID:', e);
  }
  return '';
}

/**
 * Trích xuất Avatar Profile/Fanpage Facebook thật từ DOM (Chuyển tiếp đến hàm extractProfileAvatar hoàn chỉnh)
 */
// Được định nghĩa chi tiết tại hàm extractProfileAvatar bên dưới


/**
 * Trích xuất chuỗi thời gian từ một đoạn text hoặc thuộc tính aria-label (Đa ngôn ngữ VI, EN, ZH)
 */
function extractTimeFromText(text) {
  if (!text) return null;
  let s = text.trim();
  let sLower = s.toLowerCase();

  // 1. Dạng Vừa xong / Just now / 刚刚
  if (sLower.includes('vừa xong') || sLower.includes('just now') || s.includes('刚刚')) {
    return s.includes('刚刚') ? '刚刚' : (sLower.includes('just now') ? 'just now' : 'vừa xong');
  }

  // 2. Dạng Hôm qua / Hôm nay / Yesterday / Today / 昨天 / 今天
  let yestM = sLower.match(/(?:hôm qua|yesterday|昨天)\s*(?:lúc|at)?\s*(\d{1,2}:\d{2}(?:\s*(?:am|pm))?)/i);
  if (yestM) return yestM[0].trim();

  let todayM = sLower.match(/(?:hôm nay|today|今天)\s*(?:lúc|at)?\s*(\d{1,2}:\d{2}(?:\s*(?:am|pm))?)/i);
  if (todayM) return todayM[0].trim();

  // 3. Dạng Tiếng Trung: 2025年8月15日 hoặc 10月14日 14:30
  let cnDateM = s.match(/(?:(\d{4})年)?\s*(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}:\d{2}))?/);
  if (cnDateM) return cnDateM[0].trim();

  // 4. Dạng Tiếng Việt: 10 tháng 10 lúc 14:30 hoặc 19 thg 10 hoặc 15 tháng 8, 2025
  let viDateM = sLower.match(/(\d{1,2}\s+(?:tháng|thg)\s+\d{1,2}(?:,?\s*\d{4})?(?:\s+lúc\s+\d{1,2}:\d{2})?)/i);
  if (viDateM) return viDateM[1].trim();

  // 5. Dạng Tiếng Anh: October 14 at 2:30 PM hoặc 14 Oct, 2025 hoặc Oct 14, 2025
  let enDateM1 = sLower.match(/([a-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?(?:\s+at\s+\d{1,2}:\d{2}(?:\s*(?:am|pm))?)?/i);
  if (enDateM1 && MONTH_MAP[enDateM1[1]] !== undefined) {
    return enDateM1[0].trim();
  }
  let enDateM2 = sLower.match(/(\d{1,2})\s+([a-z]+)(?:,?\s*(\d{4}))?(?:\s+at\s+\d{1,2}:\d{2}(?:\s*(?:am|pm))?)?/i);
  if (enDateM2 && MONTH_MAP[enDateM2[2]] !== undefined) {
    return enDateM2[0].trim();
  }

  // 6. Dạng Phút / Giờ / Ngày / Tuần / Tháng / Năm (VI, EN, ZH)
  let relM = s.match(/(\d+\s*(?:phút|min|mins|m|giờ|hour|hours|hr|hrs|h|ngày|day|days|d|tuần|week|weeks|w|tháng|month|months|mo|mos|năm|year|years|yr|yrs|y|分钟|小时|天|周|星期|个月)(?:[\s·•\-_,]|trước|ago|前|$))/i);
  if (relM) {
    return relM[1].trim();
  }

  return null;
}

/**
 * Chuyển đổi chuỗi thời gian sang Unix Timestamp (giây) - Hỗ trợ chuẩn xác VI, EN, ZH
 */
function parseRelativeTimeToTimestamp(str) {
  if (!str) return null;
  const s = str.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  // Vừa xong / Just now
  if (/^(vừa xong|just now|now|1 phút|1m)$/.test(s)) {
    return nowSec - 30;
  }

  // "Hôm qua" hoặc "Hôm qua lúc 00:15" / "Yesterday at 12:15 AM"
  const yesterdayMatch = s.match(/^(?:hôm qua|yesterday)(?:\s+(?:lúc|at)\s+(\d{1,2}):(\d{2})(?:\s*(am|pm|sa|ch))?)?$/i);
  if (yesterdayMatch) {
    const yDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (yesterdayMatch[1] !== undefined) {
      let h = parseInt(yesterdayMatch[1], 10);
      const m = parseInt(yesterdayMatch[2], 10);
      const ampm = (yesterdayMatch[3] || '').toLowerCase();
      if ((ampm === 'pm' || ampm === 'ch') && h < 12) h += 12;
      if ((ampm === 'am' || ampm === 'sa') && h === 12) h = 0;
      yDate.setHours(h, m, 0, 0);
    } else {
      yDate.setHours(12, 0, 0, 0);
    }
    return Math.floor(yDate.getTime() / 1000);
  }

  // "Hôm nay lúc 08:30" / "Today at 8:30 AM"
  const todayMatch = s.match(/^(?:hôm nay|today)\s+(?:lúc|at)\s+(\d{1,2}):(\d{2})(?:\s*(am|pm|sa|ch))?$/i);
  if (todayMatch) {
    let h = parseInt(todayMatch[1], 10);
    const m = parseInt(todayMatch[2], 10);
    const ampm = (todayMatch[3] || '').toLowerCase();
    if ((ampm === 'pm' || ampm === 'ch') && h < 12) h += 12;
    if ((ampm === 'am' || ampm === 'sa') && h === 12) h = 0;
    const tDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    return Math.floor(tDate.getTime() / 1000);
  }

  // Phút / Giờ / Ngày / Tuần / Tháng / Năm trước (Tránh đụng '16 tháng 10')
  let m = s.match(/^(\d+)\s*(?:phút|p|min|mins|minute|minutes|m)(?:[\s·•\-_,]|\b|trước|ago|$)/i);
  if (m) return nowSec - parseInt(m[1], 10) * 60;

  m = s.match(/^(\d+)\s*(?:giờ|g|h|hr|hrs|hour|hours)(?:[\s·•\-_,]|\b|trước|ago|$)/i);
  if (m) return nowSec - parseInt(m[1], 10) * 3600;

  m = s.match(/^(\d+)\s*(?:ngày|ng|d|day|days)(?:[\s·•\-_,]|\b|trước|ago|$)/i);
  if (m) return nowSec - parseInt(m[1], 10) * 86400;

  m = s.match(/^(\d+)\s*(?:tuần|t|w|wk|wks|week|weeks)(?:[\s·•\-_,]|\b|trước|ago|$)/i);
  if (m) return nowSec - parseInt(m[1], 10) * 604800;

  m = s.match(/^(\d+)\s*(?:tháng\s+trước|months?\s+ago|mos?\s+ago|mos\b)/i);
  if (m) return nowSec - parseInt(m[1], 10) * 2592000;

  m = s.match(/^(\d+)\s*(?:năm\s+trước|years?\s+ago|yrs?\s+ago|yrs\b)/i);
  if (m) return nowSec - parseInt(m[1], 10) * 31536000;

  return null;
}

/**
 * Định dạng Unix Timestamp thành chuỗi ngày giờ DD/MM/YYYY HH:mm:ss
 */
function formatTimestampToDate(ts) {
  if (!ts) return '';
  let dt = new Date(ts * 1000);
  let pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

/**
 * Tính toán thời gian tương đối chuẩn xác từ Unix Timestamp
 */
function formatRelativeTime(ts) {
  if (!ts) return '';
  let nowSec = Math.floor(Date.now() / 1000);
  let diffSec = Math.max(0, nowSec - ts);
  let diffMin = Math.floor(diffSec / 60);
  let diffHours = Math.floor(diffMin / 60);
  let diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return 'vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 7) return `${diffDays} ngày trước`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} tháng trước`;
  return `${Math.floor(diffDays / 365)} năm trước`;
}

/**
 * Kiểm tra chuỗi text hoặc thẻ DOM có chứa nội dung thông báo / bình luận rác không
 */
function isNotificationOrCommentGarbage(txt) {
  if (!txt || typeof txt !== 'string') return true;
  const t = txt.toLowerCase().trim();
  if (t.length < 1) return true;
  // Bỏ qua các nhãn hệ thống hoặc nút bấm
  if (/^(?:thích|like|bình luận|comment|chia sẻ|share|gửi|send|xem thêm|see more|xem bản dịch|see translation|phù hợp nhất|most relevant|tất cả bình luận|all comments|trả lời|reply|tác giả|author)$/i.test(t)) {
    return true;
  }
  return (
    t.includes('đã nhắc đến bạn') ||
    t.includes('đã bình luận') ||
    t.includes('đã thích') ||
    t.includes('đã chia sẻ') ||
    t.includes('mentioned you') ||
    t.includes('commented on') ||
    t.includes('reacted to') ||
    t.includes('shared your') ||
    t.includes('chưa đọc') ||
    t.includes('unread') ||
    t.includes('thông báo') ||
    t.includes('notifications')
  );
}

function isNotificationOrGarbageElement(el) {
  if (!el) return true;
  if (el.closest('div[role="dialog"], div[role="menu"], [aria-modal="true"], header, nav, [role="navigation"], [role="banner"], [aria-label*="Thông báo"], [aria-label*="Notification"]')) {
    return true;
  }
  const txt = (el.innerText || el.getAttribute('aria-label') || '');
  return isNotificationOrCommentGarbage(txt);
}

/**
 * Bóc tách thời gian đăng bài từ một khối DOM bài viết (article)
 */
/**
 * Hàm giải mã chống cào GHL Scrambled Label của Facebook (ghép các thẻ span theo CSS order)
 * Loại bỏ triệt để các ký tự rác có gắn checksum hoặc đẩy ra ngoài bằng position: absolute / top: 3em
 */
/**
 * Hàm parseTimeFromString chuẩn hóa:
 * Hỗ trợ định dạng có giờ phút ('16 tháng 10 lúc 16:03', 'Oct 16 at 4:03 PM')
 * Chặn lỗi không khớp regex khi chuỗi có chữ 'lúc'
 */
function parseTimeFromString(str) {
  if (!str) return null;
  const clean = str
    .replace(/[\u200B-\u200D\uFEFF\u00a0]/g, ' ')
    .replace(/[·•|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length < 2 || clean.length > 60) return null;

  // Bước 1: Kiểm tra thời gian tương đối
  const rel = parseRelativeTimeToTimestamp(clean);
  if (rel) return rel;

  // Tách giờ:phút nếu có ("lúc 16:03", "at 4:03 PM")
  let hour = 12, minute = 0;
  const timeMatch = clean.match(/(?:lúc|at|,|\s)\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM|SA|CH))?/i);
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    minute = parseInt(timeMatch[2], 10);
    const ampm = (timeMatch[3] || '').toUpperCase();
    if ((ampm === 'PM' || ampm === 'CH') && hour < 12) hour += 12;
    if ((ampm === 'AM' || ampm === 'SA') && hour === 12) hour = 0;
  }

  // Bước 2: Tiếng Việt ("16 tháng 10", "16 tháng 10 lúc 16:03", "16 tháng 10, 2025 lúc 16:03", "8 Tháng 10", "28 Tháng 9", "15 tháng 9")
  let m = clean.match(/^(?:ngày\s+)?(\d{1,2})\s+th(?:áng|g)\s+(\d{1,2})(?:(?:\s*,\s*|\s+năm\s+|\s+)(\d{4}))?(?:\s+lúc\s+\d{1,2}:\d{2}(?:\s*(?:AM|PM|SA|CH))?)?$/i);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    let year = m[3] ? parseInt(m[3], 10) : now.getFullYear();
    let dt = new Date(year, month, day, hour, minute, 0);
    if (!m[3] && dt.getTime() > now.getTime() + 86400000) {
      year -= 1;
      dt = new Date(year, month, day, hour, minute, 0);
    }
    return Math.floor(dt.getTime() / 1000);
  }

  // Bước 3: Định dạng DD/MM/YYYY hoặc DD-MM-YYYY
  m = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+\d{1,2}:\d{2}.*)?$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(y, mo, d, hour, minute, 0);
    if (!isNaN(dt.getTime())) return Math.floor(dt.getTime() / 1000);
  }

  // Bước 4: Tiếng Anh ("October 16", "Oct 16 at 4:03 PM", "16 October 2025")
  const months = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
  };
  m = clean.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?(?:\s+at\s+\d{1,2}:\d{2}.*)?$/i);
  if (m && months[m[1].toLowerCase()] !== undefined) {
    const mo = months[m[1].toLowerCase()];
    const d = parseInt(m[2], 10);
    let y = m[3] ? parseInt(m[3], 10) : now.getFullYear();
    let dt = new Date(y, mo, d, hour, minute, 0);
    if (!m[3] && dt.getTime() > now.getTime() + 86400000) {
      y -= 1;
      dt = new Date(y, mo, d, hour, minute, 0);
    }
    return Math.floor(dt.getTime() / 1000);
  }

  return null;
}

function decodeGHLScrambledText(container) {
  if (!container) return [];
  // Tìm các thẻ span dùng flex để sắp xếp chữ theo thuộc tính style="order:..."
  const flexSpans = container.querySelectorAll('span[style*="display: flex"], span[style*="display:flex"]');
  const results = [];

  for (const flexParent of flexSpans) {
    const children = Array.from(flexParent.children).filter(el => {
      if (el.tagName !== 'SPAN') return false;
      // Loại bỏ 100% các ký tự rác có gắn checksum hoặc đẩy ra ngoài bằng position: absolute / top: 3em
      if (el.hasAttribute('checksum')) return false;
      const styleAttr = el.getAttribute('style') || '';
      if (/position\s*:\s*absolute/i.test(styleAttr) || /top\s*:\s*3em/i.test(styleAttr)) return false;
      return true;
    });

    if (children.length > 0) {
      children.sort((a, b) => {
        const orderA = parseInt((a.getAttribute('style') || '').match(/order\s*:\s*(\d+)/i)?.[1] || '0', 10);
        const orderB = parseInt((b.getAttribute('style') || '').match(/order\s*:\s*(\d+)/i)?.[1] || '0', 10);
        return orderA - orderB;
      });
      const decoded = children.map(c => c.textContent || '').join('').replace(/\u00a0/g, ' ').trim();
      if (decoded) results.push(decoded);
    }
  }
  return results;
}

function extractTimeFromArticleElement(article) {
  if (!article) return null;
  const articleRect = article.getBoundingClientRect();

  // 0. ƯU TIÊN SỐ 1 TRÊN DOM: Giải mã trực tiếp chuỗi thời gian bị Facebook xáo trộn (GHL Scrambled Label)
  const decodedLabels = decodeGHLScrambledText(article);
  for (const lbl of decodedLabels) {
    const ts = parseTimeFromString(lbl);
    if (ts) {
      return {
        timestamp: ts,
        raw: lbl,
        publishTime: formatTimestampToDate(ts),
        relativeTime: formatRelativeTime(ts)
      };
    }
  }

  // Chỉ xét các thẻ nằm ở vùng Header trên cùng của bài viết (cách đỉnh bài viết tối đa 130px)
  // để KHÔNG BAO GIỜ chạm tới ngày tháng của Video/Reel được Share nằm bên dưới!
  const isInsideHeaderZone = (el) => {
    try {
      const r = el.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) return true;
      return (r.top - articleRect.top) <= 130;
    } catch (_) {
      return true;
    }
  };

  const links = article.querySelectorAll('a[href*="/posts/"], a[href*="/videos/"], a[href*="/reel/"], a[href*="permalink"], a[href*="story_fbid"], a[role="link"]');
  for (const a of links) {
    if (!isInsideHeaderZone(a)) continue;
    const label = a.getAttribute('aria-label') || '';
    if (label) {
      const ts = parseTimeFromString(label);
      if (ts) {
        return {
          timestamp: ts,
          raw: label,
          publishTime: formatTimestampToDate(ts),
          relativeTime: formatRelativeTime(ts)
        };
      }
    }
    const text = (a.innerText || a.textContent || '').trim();
    if (text && text.length <= 45) {
      const ts = parseTimeFromString(text);
      if (ts) {
        return {
          timestamp: ts,
          raw: text,
          publishTime: formatTimestampToDate(ts),
          relativeTime: formatRelativeTime(ts)
        };
      }
    }
  }

  const spans = article.querySelectorAll('span, abbr');
  for (const sp of spans) {
    if (!isInsideHeaderZone(sp)) continue;
    // Chỉ lấy span lá (hoặc span ngắn) ở vùng Header
    const text = (sp.innerText || sp.textContent || '').trim();
    if (text && text.length >= 2 && text.length <= 40) {
      const ts = parseTimeFromString(text);
      if (ts) {
        return {
          timestamp: ts,
          raw: text,
          publishTime: formatTimestampToDate(ts),
          relativeTime: formatRelativeTime(ts)
        };
      }
    }
  }
  return null;
}

/**
 * Quét tìm các bài viết trên feed DOM và lấy thời gian (Chính xác theo DOM thực tế)
 */
function findAllPostTimesInDOM() {
  let candidates = [];
  const minTs = 1577836800; // 01/01/2020
  const nowSec = Math.floor(Date.now() / 1000);
  const maxTs = nowSec + 86400 * 2;

  // 1. Tìm các bài viết trong timeline (bao gồm cả bài ghim ở đầu trang)
  let articles = Array.from(document.querySelectorAll(
    'div[role="feed"] div[role="article"], div[data-pagelet^="ProfileTimeline"] div[role="article"], div[data-pagelet^="FeedUnit_"], div[role="article"]'
  )).filter(el => {
    if (el.closest('header, nav, [role="navigation"], [role="banner"], [aria-label*="Thông báo"], [aria-label*="Notification"]')) return false;
    if (el.parentElement && el.parentElement.closest('div[role="article"]')) return false;
    let r = el.getBoundingClientRect();
    let docTop = r.top + window.scrollY;
    const textLen = (el.innerText || el.textContent || '').trim().length;
    return (el.offsetHeight > 50 || textLen > 25) && (docTop > 100 || r.top === 0 || textLen > 50);
  });

  articles.sort((a, b) => {
    let topA = a.getBoundingClientRect().top + window.scrollY;
    let topB = b.getBoundingClientRect().top + window.scrollY;
    return topA - topB;
  });

  for (let i = 0; i < Math.min(articles.length, 6); i++) {
    let article = articles[i];
    let articleText = (article.innerText || article.textContent || '').toLowerCase();
    let isPinned = /(?:đã ghim|pinned post|pinned|置顶|置顶帖子)/i.test(articleText.slice(0, 180));

    let articleTime = extractTimeFromArticleElement(article);
    if (articleTime && articleTime.timestamp >= minTs && articleTime.timestamp <= maxTs) {
      candidates.push({
        ...articleTime,
        isPinned: isPinned,
        source: 'article_dom',
        element: article
      });
    }
  }

  return candidates;
}

/**
 * Trích xuất chính xác dãy số publish_time (Unix Timestamp) từ Relay/GraphQL JSON và DOM
 * Thu thập tất cả các bài đăng và chọn con số LỚN NHẤT (mới nhất), giải mã chính xác ví dụ publish_time: 1792530962
 */
function extractFacebookPublishTimeDetailed() {
  const nowSec = Math.floor(Date.now() / 1000);
  const minTs = 1577836800; // 01/01/2020
  const maxTs = nowSec + 60;

  let currentProfileId = '';
  try {
    currentProfileId = extractFacebookID() || '';
  } catch (_) { }

  // 1. Quét Relay GraphQL Stories: Lấy Pinned Post và Timeline Feed Units (Reels / Feed)
  const relayTimes = extractRelayFeedAndPinnedTimestamps(currentProfileId);
  const relayPinnedTs = relayTimes.pinnedTs || 0;
  const relayFeedTs = relayTimes.latestFeedTs || 0;
  const relayMaxTs = Math.max(relayPinnedTs, relayFeedTs);

  let candidates = [];

  // 2. Quét từ DOM (Header bài viết hiển thị trên tường)
  try {
    const domCandidates = findAllPostTimesInDOM();
    for (const c of domCandidates) {
      if (c.timestamp && c.timestamp >= minTs && c.timestamp <= maxTs) {
        candidates.push(c);
      }
    }
  } catch (_) { }

  // 3. Quét từ <script> JSON bổ sung (page_insights)
  try {
    const scripts = Array.from(document.querySelectorAll('script')).filter(s => {
      const t = s.textContent || '';
      return t.includes('publish_time') || t.includes('creation_time');
    });

    for (const s of scripts) {
      const text = s.textContent || '';

      // Bắt các khối page_insights có chứa actor_id và publish_time
      const insightRegex = /["\\]*actor_id["\\]*\s*:\s*["\\]*(\d+)["\\]*[\s\S]{0,350}?["\\]*publish_time["\\]*\s*:\s*(\d{9,11})/g;
      for (const m of text.matchAll(insightRegex)) {
        const actorId = m[1];
        const ts = parseInt(m[2], 10);
        const snippet = m[0];

        if (currentProfileId && actorId && actorId !== currentProfileId) {
          continue;
        }
        const isVideoAttachment = snippet.includes('EntVideoCreationStory');

        if (ts >= minTs && ts <= maxTs) {
          candidates.push({
            timestamp: ts,
            source: isVideoAttachment ? 'video_script' : 'post_script',
            actorId: actorId,
            isPinned: false
          });
        }
      }
    }
  } catch (_) { }

  // Quyết định timestamp tối ưu: So sánh giữa Pinned Post, Regular Post (Feed/Reels) và DOM
  let targetTs = 0;
  let postTag = '';

  const firstDom = candidates.find(c => c.source === 'article_dom');

  if (relayMaxTs > 0) {
    targetTs = relayMaxTs;
    if (targetTs === relayPinnedTs && relayPinnedTs > relayFeedTs) {
      postTag = ' (Pinned)';
    } else if (targetTs === relayFeedTs && relayFeedTs > 0) {
      postTag = ' (Reels/Feed)';
    }
    // Nếu DOM có bài viết mới hơn nữa
    if (firstDom && firstDom.timestamp > targetTs) {
      targetTs = firstDom.timestamp;
      postTag = '';
    }
  } else if (firstDom) {
    targetTs = firstDom.timestamp;
  } else if (candidates.length > 0) {
    const postScripts = candidates.filter(c => c.source === 'post_script');
    targetTs = postScripts.length > 0 ? postScripts[0].timestamp : candidates[0].timestamp;
  }

  if (targetTs >= minTs && targetTs <= maxTs) {
    const dt = new Date(targetTs * 1000);
    const pad = n => String(n).padStart(2, '0');
    const formattedDate = `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}${postTag}`;

    const diffSec = Math.max(0, nowSec - targetTs);
    const diffDays = Math.floor(diffSec / 86400);
    const relText = `${formatRelativeTime(targetTs)}${postTag}`;

    const isActive = diffDays <= 60;
    const actStatus = isActive ? '✓ TÍCH CỰC (Trại đang hoạt động)' : '⚠️ ÍT HOẠT ĐỘNG (> 60 ngày)';

    return {
      timestamp: targetTs,
      publishTime: formattedDate,
      relativeTime: relText,
      activityStatus: actStatus,
      isoTime: dt.toISOString()
    };
  }

  return {
    timestamp: 0,
    publishTime: 'Chưa bóc tách',
    relativeTime: 'Gần đây',
    activityStatus: 'Chưa có bài đăng',
    isoTime: ''
  };
}


function extractFacebookID() {
  let url = window.location.href;
  let m = url.match(/[?&]id=(\d+)/) || url.match(/facebook\.com\/(?:people\/[^/]+\/)?(\d{8,})/);
  if (m && m[1]) return m[1];

  let alAndroid = document.querySelector('meta[property="al:android:url"]');
  if (alAndroid && alAndroid.content) {
    let mAl = alAndroid.content.match(/fb:\/\/profile\/(\d+)/);
    if (mAl && mAl[1]) return mAl[1];
  }

  let html = document.documentElement ? document.documentElement.innerHTML : '';
  let mUid = html.match(/"userID":"?(\d{8,})"?/) ||
    html.match(/"profileID":"?(\d{8,})"?/) ||
    html.match(/"entity_id":"?(\d{8,})"?/) ||
    html.match(/profile_id[":=]+(\d{8,})/);
  if (mUid && mUid[1]) return mUid[1];

  return '';
}

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]);

const US_STATES = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY'
};

// BỘ LỌC STOPWORDS CHẶN TRIỆT ĐỂ VIỆC LẤY NHẦM BIO / MARKETING TEXT VÀO ĐỊA CHỈ
const BIO_MARKETING_STOPWORDS = /\b(?:we are|we breed|family owned|raising|breeding|breeder|breeders|puppy|puppies|welcome to|our dogs|our goal|our passion|frenchies|doodles|poodles|retriever|shepherd|bulldog|corgi|akc registered|health tested|champion|bloodlines|take-home|application|contact us|follow us|specializing in|proud to|loving homes|furry friends|best friend|born and raised|call or text|available puppies|upcoming litters|adoption|adopt|stud service|good dog|screening process|meet the|about us|our story|dm for info|message us|ship nationwide|since \d{4}|for loving families|chuyên phối giống|nhân giống|chó con|bầy cún|thú cưng|cung cấp cún)\b/i;

const STREET_ADDRESS_REGEX = /\b(?:\d{1,6}[A-Za-z]?|P\.?O\.?\s*Box\s*\d+)\s+[A-Za-z0-9\s.,'#-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Highway|Hwy|Pkwy|Parkway|Plaza|Pl|Terrace|Ter|Square|Sq|Suite|Ste|Apt|Unit|Ranch|Trail|Trl|Pike|Loop|Trace)\b/i;

const CITY_STATE_ZIP_REGEX = /\b[A-Za-z\s.-]{2,30},\s*([A-Z]{2})\b(?:\s*(\d{5}(?:-\d{4})?))?/i;

function isLikelyAddress(s) {
  if (!s || typeof s !== 'string') return false;
  const str = s.trim();
  if (str.length < 5 || str.length > 130) return false;
  if (BIO_MARKETING_STOPWORDS.test(str)) return false;
  if (str.split(/\s+/).length > 15) return false;
  if (STREET_ADDRESS_REGEX.test(str)) return true;
  const m = str.match(CITY_STATE_ZIP_REGEX);
  if (m && m[1] && US_STATE_CODES.has(m[1].toUpperCase())) return true;
  return false;
}


const POPULAR_US_NAMES = new Set([
  'james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'joseph', 'thomas', 'charles',
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
  'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily', 'donna', 'michelle',
  'carol', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia', 'kathleen',
  'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela', 'emma', 'nicole', 'helen', 'samantha', 'katherine',
  'christine', 'debra', 'rachel', 'carolyn', 'janet', 'catherine', 'maria', 'heather', 'diane', 'ruth',
  'julie', 'olivia', 'joyce', 'virginia', 'victoria', 'kelly', 'lauren', 'christina', 'joan', 'evelyn',
  'judith', 'megan', 'cheryl', 'andrea', 'hannah', 'martha', 'jacqueline', 'frances', 'gloria', 'ann',
  'teresa', 'kathryn', 'sara', 'janice', 'jean', 'alice', 'madison', 'doris', 'abigail', 'julia',
  'judy', 'grace', 'denise', 'amber', 'marilyn', 'beverly', 'danielle', 'theresa', 'sophia', 'marie',
  'diana', 'brittany', 'natalie', 'isabella', 'charlotte', 'rose', 'kayla', 'alexis', 'lori', 'hattie',
  'brian', 'jason', 'kevin', 'jeffrey', 'scott', 'eric', 'stephen', 'andrew', 'raymond', 'gregory',
  'joshua', 'jerry', 'dennis', 'walter', 'patrick', 'peter', 'harold', 'douglas', 'henry', 'carl',
  'arthur', 'ryan', 'roger', 'joe', 'juan', 'jack', 'albert', 'jonathan', 'justin', 'terry', 'gerald',
  'keith', 'samuel', 'willie', 'ralph', 'lawrence', 'nicholas', 'roy', 'benjamin', 'bruce', 'brandon',
  'adam', 'harry', 'fred', 'wayne', 'billy', 'steve', 'louis', 'jeremy', 'aaron', 'randy', 'howard',
  'eugene', 'carlos', 'russell', 'bobby', 'victor', 'martin', 'ernest', 'phillip', 'todd', 'jesse',
  'craig', 'alan', 'shawn', 'clarence', 'sean', 'philip', 'chris', 'johnny', 'earl', 'jimmy', 'antonio'
]);

/**
 * Trích xuất đầy đủ thông tin từ Sidebar / Intro / Header của trang Facebook
 */
function cleanPhone(raw) {
  if (!raw) return '';
  const str = String(raw).trim();
  const digits = str.replace(/\D/g, '');
  if (!digits) return '';

  // Loại bỏ các số rác cụ thể, mã thành viên DogsNSW, số bị cụt
  const BOGUS_PHONES = new Set(['12100064234', '38063364', '84448438878', '162158179', '990105868']);
  if (BOGUS_PHONES.has(digits)) return '';

  // 1. Số Bắc Mỹ (US/Canada: 10 chữ số hoặc 11 chữ số bắt đầu bằng 1) -> E.164 (+1XXXXXXXXXX)
  if (digits.length === 10 && /^[2-9]/.test(digits)) {
    return '+1' + digits;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return '+' + digits;
  }

  // 2. Số Việt Nam (+84)
  if (digits.startsWith('84') && (digits.length === 11 || digits.length === 12)) return '+' + digits;
  if (digits.startsWith('0') && digits.length === 10) return '+84' + digits.slice(1);

  // 3. Số quốc tế hợp lệ có mã quốc gia (+61, +48, +44, +33, +49, +52, +36...)
  if (digits.length >= 10 && digits.length <= 15) {
    if (str.startsWith('+')) return '+' + digits;
    if (/^(?:61|48|44|33|49|52|36|380)/.test(digits)) return '+' + digits;
  }

  return '';
}

/**
 * Quét SĐT trực tiếp từ live DOM trên màn hình (Hỗ trợ cả Mỹ, Việt Nam và Quốc tế)
 */
function extractPhoneFromVisibleDOM() {
  if (typeof document === 'undefined') return '';

  // 1. Quét link tel: trong DOM
  const telLink = document.querySelector('a[href^="tel:"]');
  if (telLink) {
    const raw = decodeURIComponent((telLink.getAttribute('href') || '').replace(/^tel:/i, ''));
    const p = cleanPhone(raw);
    if (p) return p;
  }

  // 2. Quét link hoặc text WhatsApp (e.g. +84 84 713 1400)
  const waLink = document.querySelector('a[href*="wa.me/"], a[href*="whatsapp.com"]');
  if (waLink) {
    const href = waLink.getAttribute('href') || '';
    const mWa = href.match(/wa\.me\/(\d+)/i) || href.match(/phone=(\d+)/i);
    if (mWa) {
      const p = cleanPhone(mWa[1]);
      if (p) return p;
    }
  }

  // 3. Quét các text node hiển thị thực tế trong vùng Giới thiệu / Sidebar
  // Hỗ trợ cả định dạng Bắc Mỹ (+1 979-324-8697) và Việt Nam / Quốc tế (084 713 1400, +84 84 713 1400)
  const formattedPhoneRegex = /(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-](\d{3})[\s.-](\d{4})\b|(?:\+(?:84|\d{1,3})[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-])?\d{3,4}[\s.-]\d{3,4}\b|\b0[2-9]\d{1,2}[\s.-]\d{3}[\s.-]\d{3,4}\b/;

  const containers = Array.from(document.querySelectorAll('div[role="main"], div[data-pagelet*="Profile"], div[data-pagelet*="Intro"], div.x1n2onr6, div.x78zum5'));
  const roots = containers.length > 0 ? containers : [document.body];

  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript') return NodeFilter.FILTER_REJECT;
        const val = (node.nodeValue || '').trim();
        if (formattedPhoneRegex.test(val)) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });

    while (walker.nextNode()) {
      const txt = (walker.currentNode.nodeValue || '').trim();
      const m = txt.match(formattedPhoneRegex);
      if (m) {
        const cleaned = cleanPhone(m[0]);
        if (cleaned) return cleaned;
      }
    }
  }

  // 4. Quét body innerText với regex yêu cầu có dấu ngăn cách (tránh chuỗi số ngẫu nhiên trong script)
  if (document.body && document.body.innerText) {
    const m = document.body.innerText.match(formattedPhoneRegex);
    if (m) {
      const cleaned = cleanPhone(m[0]);
      if (cleaned) return cleaned;
    }
  }

  return '';
}

function cleanAddressText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();

  // Loại bỏ ngay lập tức nếu chuỗi chứa các từ khóa giao diện / text rác hoặc Bio stopwords
  if (/\b(?:cart|ship to vietnam|snoozed|live website inspector|quick add|years|litters|miles|vnd|calendar|milkshake|starred|items that ship|recommendations|imdb|movies|externalweblink|photo|best in|judge denk|running and playing|find your breed|dont stop me|dogsnsw|ankc)\b/i.test(s)) {
    return '';
  }
  if (typeof BIO_MARKETING_STOPWORDS !== 'undefined' && BIO_MARKETING_STOPWORDS.test(s)) {
    return '';
  }
  if (s.split(/\s+/).length > 15) return '';
  if (s.length >= 250) return '';

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
  if (s.length < 5 || (typeof isLikelyAddress === 'function' && !isLikelyAddress(s))) return '';

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
  'the parent', 'the parents', 'parent', 'parents', 'with b', 'with', 'the', 'and', 'or', 'about',
  'payment', 'payments', 'payment methods', 'method', 'methods', 'event highlights', 'highlight', 'highlights',
  'breeder listings', 'listing', 'listings', 'available adults', 'available', 'adult', 'adults',
  'guestbook', 'me address guestbook', 'address', 'form follows function', 'function', 'functions',
  'marketplace', 'akcmarketplace', 'rubriques', 'rubriques pr', 'official', 'page', 'team', 'club'
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
    'puppy', 'puppies', 'dog', 'dogs', 'meet', 'about', 'contact', 'welcome', 'payment', 'available'
  ]);
  if (BAD_FIRST_WORDS.has(firstWord)) return false;

  // Loại trừ các cụm từ kiểu "with B", "the Parent", "and More"
  if (/^(?:the|with|and|by|at|for|from|in|on|of|to)\s+/i.test(low)) return false;
  if (/^with\s+[a-z]\b/i.test(low)) return false;

  if (/skip\s+to|navigation|content|menu|search|cookie|privacy|policy|terms|rights\s+reserved|cart|checkout|kennel|puppy|puppies|farm|bulldog|frenchie|corgi|doodle|cavapoo|yorkie|retriever|shepherd|password|username|parent|parents|payment|highlight|listing|available|adult|function|marketplace|rubrique/i.test(low)) {
    return false;
  }
  if (!/[A-ZÀ-Ỹ]/.test(s)) return false;
  if (/[@\/\\{}[\]<>=+*_$#]/.test(s)) return false;
  return true;
}

function isValidEmail(em) {
  if (!em) return false;
  let s = em.toLowerCase().trim();
  if (s.length < 6 || s.length > 70) return false;

  // Sửa lỗi chính tả domain phổ biến
  s = s.replace(/@gmal\.com$/i, '@gmail.com').replace(/@yaho\.com$/i, '@yahoo.com').replace(/@hotmial\.com$/i, '@hotmail.com');

  // Loại bỏ email nền tảng trung gian
  const badEmails = new Set([
    'akcmarketplace@akc.org',
    'contact@tiltify.com',
    'support@teeshoplife.com',
    'info@wix.com',
    'support@wix.com',
    'contact@facebook.com',
    'domain@example.com'
  ]);
  if (badEmails.has(s)) return false;

  const bad = ['@facebook.com', '@fb.com', '@meta.com', '@instagram.com', '@sentry.io', '@w3.org', '@schema.org', '@example.com', '.png', '.jpg', '.webp', '.js'];
  for (let b of bad) {
    if (s.includes(b)) return false;
  }
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(s);
}

const SYSTEM_EXCLUDED_HOSTS = new Set([
  'facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.com', 'messenger.com',
  'instagram.com', 'www.instagram.com', 'threads.net', 'whatsapp.com', 'meta.com',
  'fbcdn.net', 'fbsbx.com', 'tfbnw.net', 'static.xx', 'static.xx.fbcdn.net',
  'google.com', 'www.google.com', 'goo.gl', 'bing.com', 'www.bing.com', 'microsoft.com',
  'gmail.com', 'mail.google.com', 'googlemail.com',
  'apple.com', 'schema.org', 'w3.org', 'apache.org', 'mozilla.org', 'wikipedia.org',
  't.co', 'bit.ly', 'tinyurl.com', 'youtube.com', 'twitter.com', 'x.com', 'tiktok.com'
]);

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
  } catch (_) { }
  return false;
}

function isValidWebsite(u) {
  if (!u) return false;
  let s = String(u).trim();
  if (/^mailto:/i.test(s) || /mailto%3A/i.test(s) || /where1=/i.test(s) || /bing\.com/i.test(s) || /google\.[^/]+\/maps/i.test(s)) return false;
  if (!/^https?:\/\//i.test(s)) {
    if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i.test(s)) {
      s = 'https://' + s;
    } else {
      return false;
    }
  }
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|wasm|json|map|mp4|mp3|m3u8)(\?.*)?$/i.test(s)) return false;

  try {
    const parsed = new URL(s);
    const host = parsed.hostname.toLowerCase();
    // Tuyệt đối không nhận Amazon vào trường website (Amazon phải đi vào amazon_url)
    if (/(?:amazon\.[a-z.]+|amzn\.to|a\.co)/i.test(host)) return false;
    if (SYSTEM_EXCLUDED_HOSTS.has(host)) return false;
    for (const bad of SYSTEM_EXCLUDED_HOSTS) {
      if (host === bad || host.endsWith('.' + bad)) return false;
    }
    const parts = host.split('.');
    if (parts.length < 2) return false;
    const tld = parts[parts.length - 1];
    if (tld.length < 2 || tld === 'xx') return false;
    if (/static|rsrc|cdn|connect|graph|beacon/i.test(host)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Trích xuất tiểu sử (Bio) trực tiếp từ DOM của khối Giới thiệu / Intro / 简介
 */
function findBioFromIntroDOM(container) {
  if (!container) return '';
  const lines = (container.innerText || '').split('\n').map(l => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex(l => /^(?:Giới thiệu|Intro|About|简介)$/i.test(l));
  if (headerIdx === -1) return '';

  for (let i = headerIdx + 1; i < Math.min(lines.length, headerIdx + 6); i++) {
    const line = lines[i];
    // Bỏ qua các nút thao tác UI
    if (/^(?:chỉnh sửa|edit|编辑|thêm tiểu sử|add bio|添加个人简介|quản lý|manage)/i.test(line)) continue;
    // Dừng lại nếu gặp tiêu đề của danh sách chi tiết hoặc phần khác
    if (/^(?:chi tiết|details|详细信息|ảnh|photos|照片|bài viết|posts|帖子)/i.test(line)) break;
    // Bỏ qua nếu là dòng thông tin chi tiết (follower, sống tại, page, rating...)
    if (/(?:người theo dõi|followers|lượt thích|likes|位粉丝|个粉丝|关注者|次赞|sống tại|lives in|现居|đến từ|from|来自|đánh giá|reviews|评分|page|trang|主页)/i.test(line)) continue;
    if (line.length >= 8 && line.length <= 500 && !isFacebookUIString(line)) {
      return line;
    }
  }
  return '';
}

function parseAddressRightToLeft(addrStr, curCity = '', curState = '', curCountry = '') {
  if (!addrStr || typeof addrStr !== 'string') {
    return { address: '', city: curCity, state: curState, zip: '', country: curCountry || 'United States' };
  }
  const low = addrStr.toLowerCase();
  for (const n of [
    'cart', 'ship to vietnam', 'snoozed', 'live website inspector',
    'quick add', 'years', 'litters', 'miles', 'vnd', 'calendar', 'milkshake',
    'starred', 'items that ship', 'recommendations', 'imdb', 'movies',
    'externalweblink', 'photo', 'best in', 'judge denk', 'running and playing'
  ]) {
    if (low.includes(n)) {
      return { address: '', city: curCity, state: curState, zip: '', country: curCountry || 'United States' };
    }
  }

  const parts = addrStr.split(',').map(p => p.trim()).filter(Boolean);
  let parsedCountry = '';
  let parsedZip = '';
  let parsedState = '';
  let parsedCity = '';

  while (parts.length > 0) {
    const last = parts[parts.length - 1];
    const lastLow = last.toLowerCase();
    if (['united states', 'usa', 'us', 'u.s.a.', 'u.s.'].includes(lastLow)) {
      parsedCountry = 'United States';
      parts.pop();
      continue;
    } else if (['australia', 'au'].includes(lastLow)) {
      parsedCountry = 'Australia';
      parts.pop();
      continue;
    } else if (['canada', 'ca'].includes(lastLow)) {
      parsedCountry = 'Canada';
      parts.pop();
      continue;
    }
    const mZip = last.match(/\b(\d{5}(?:-\d{4})?)\b$/);
    if (mZip && !parsedZip) {
      const z = mZip[1].slice(0, 5);
      if (z !== '12345' && z !== '00000') {
        parsedZip = z;
        const remaining = last.slice(0, mZip.index).trim();
        if (remaining) parts[parts.length - 1] = remaining;
        else parts.pop();
        continue;
      }
    }
    break;
  }

  if (parts.length > 0) {
    const last = parts[parts.length - 1];
    const mSt = last.match(/\b([A-Z]{2})\b(?:\s*(\d{5}))?$/);
    if (mSt && US_STATE_CODES.has(mSt[1])) {
      parsedState = mSt[1];
      if (!parsedCountry) parsedCountry = 'United States';
      if (mSt[2] && !parsedZip) parsedZip = mSt[2];
      const rem = last.slice(0, mSt.index).trim();
      if (rem) parts[parts.length - 1] = rem;
      else parts.pop();
    }
  }

  if (parts.length > 0) {
    const candCity = parts.pop().trim();
    const isStreet = /\b(?:\d{1,5}\s+[A-Za-z]|Street|St\b|Road|Rd\b|Avenue|Ave\b|Boulevard|Blvd\b|Drive|Dr\b|Lane|Ln\b|Way\b|Court|Ct\b|PO Box|County Rd|Highway|Hwy)\b/i.test(candCity);
    if (!isStreet && candCity.length < 35) {
      parsedCity = candCity.replace(/^(?:Located in|Based in|Near|Surrounding Area\.)\s*/i, '').trim();
    }
  }

  if (!parsedCity && curCity && !/cart|imdb|movies|recommendations|running and playing/i.test(curCity)) {
    parsedCity = curCity;
  }
  if (!parsedState && curState && US_STATE_CODES.has(curState.toUpperCase())) {
    parsedState = curState.toUpperCase();
  }
  if (!parsedCountry) parsedCountry = curCountry || 'United States';

  // Bảo vệ không để nguyên đoạn Bio rinh vào trường Address
  let cleanFinalAddr = '';
  if (typeof isLikelyAddress === 'function' && isLikelyAddress(addrStr)) {
    cleanFinalAddr = addrStr.trim();
  } else if (parsedCity && parsedState) {
    cleanFinalAddr = [parsedCity, parsedState, parsedZip, parsedCountry].filter(Boolean).join(', ');
  }

  return { address: cleanFinalAddr, city: parsedCity, state: parsedState, zip: parsedZip, country: parsedCountry };
}

/**
 * TR\u00cdCH XU\u1ea4T NHANH TH\u00d4NG TIN LI\u00caN H\u1ec6 T\u1eea DOM HI\u1ec2N TH\u1eca C\u1ee6A FACEBOOK PAGE
 * X\u1eed l\u00fd 2 layout th\u1ef1c t\u1ebf:
 * 1. C\u00f3 \u0111\u0103ng nh\u1eadp: C\u00e1c section ri\u00eang "Gi\u1edbi thi\u1ec7u", "Chi ti\u1ebft", "Li\u00ean k\u1ebft", "Th\u00f4ng tin li\u00ean h\u1ec7"
 * 2. Ch\u01b0a \u0111\u0103ng nh\u1eadp: T\u1ea5t c\u1ea3 trong 1 block "Gi\u1edbi thi\u1ec7u" t\u1ed5ng h\u1ee3p
 */
function extractPageContactsFromDOM() {
  const result = { phone: '', email: '', website: '', instagram: '', bio: '', category: '', zip: '', address: '', social_links: [] };

  // ===== HELPER: gi\u1ea3i m\u00e3 link shim =====
  const decodeShim = (href) => {
    if (!href) return '';
    if (/(?:l|lm)\.facebook\.com\/l\.php|\/l\.php\?u=|\/flx\/warn\/\?u=/.test(href)) {
      try {
        const u = new URL(href, window.location.origin);
        const real = u.searchParams.get('u');
        if (real) return decodeURIComponent(real);
      } catch (_) { }
    }
    return href;
  };

  // ===== 1. LAYOUT C\u00d3 LOGIN: T\u00ecm t\u1eebng section theo heading =====
  // T\u00ecm m\u1ecdi heading-level element c\u00f3 n\u1ed9i dung kh\u1edbp
  const allEls = Array.from(document.querySelectorAll('div[role="main"] span, div[role="main"] h2, div[role="main"] h3, div[role="main"] h4'));

  // Helper: t\u00ecm container ch\u1ee9a heading
  const findSectionBox = (headingEl) =>
    headingEl.closest('div.x1n2onr6, div.x9f619, div.x78zum5, div.x1q0g3np') ||
    headingEl.parentElement?.parentElement?.parentElement;

  // --- 1A. Section "Gi\u1edbi thi\u1ec7u" / "Intro" \u2192 Bio ---
  const bioHeadings = allEls.filter(el => {
    const t = (el.innerText || '').trim();
    return /^(?:Gi\u1edbi thi\u1ec7u|Intro|About|\u7b80\u4ecb)$/i.test(t) && el.children.length === 0;
  });
  for (const h of bioHeadings) {
    const box = findSectionBox(h);
    if (!box) continue;
    const boxText = (box.innerText || box.textContent || '').trim();
    const lines = boxText.split('\n').map(l => l.trim()).filter(l => l.length >= 8);
    // Ph\u1ea7n bio l\u00e0 d\u00f2ng \u0111\u1ea7u ti\u00ean sau heading kh\u00f4ng ph\u1ea3i UI string
    for (const line of lines) {
      if (/^(?:Gi\u1edbi thi\u1ec7u|Intro|About|\u7b80\u4ecb|Ch\u1ec9nh s\u1eeda|Edit|\u7f16\u8f91|Th\u00eam ti\u1ec3u s\u1eed)$/i.test(line)) continue;
      if (isFacebookUIString(line)) continue;
      if (/^\d+(?:[.,]\d+)?[KkMm]?\s*(?:ng\u01b0\u1eddi|followers|l\u01b0\u1ee3t|likes)/i.test(line)) continue;
      result.bio = line;
      break;
    }
    if (result.bio) break;
  }

  // --- 1B. Section "Li\u00ean k\u1ebft" / "Links" / "Website" \u2192 Website ---
  const linkHeadings = allEls.filter(el => {
    const t = (el.innerText || '').trim();
    return /^(?:Li\u00ean k\u1ebft|Links|Website|\u94fe\u63a5|Web)$/i.test(t) && el.children.length === 0;
  });
  for (const h of linkHeadings) {
    const box = findSectionBox(h);
    if (!box) continue;
    const anchors = Array.from(box.querySelectorAll('a[href]'));
    for (const a of anchors) {
      const href = decodeShim(a.getAttribute('href') || a.href || '');
      if (!href) continue;
      if (/(?:instagram|pinterest|youtube|youtu\.be|tiktok|linkedin|twitter|x\.com)\//i.test(href)) continue;
      if (isValidWebsite(href)) {
        result.website = href.startsWith('http') ? href : 'https://' + href;
        break;
      }
    }
    // Fallback: text visible trong box
    if (!result.website) {
      const boxText = box.innerText || box.textContent || '';
      const mDomain = boxText.match(/\b([a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.(?:com|org|net|us|co|biz|info|site|online|store|shop|pet|care|vet|tech|me|io|ca|uk|dog|kennel|farm|tv|app))\b/i);
      if (mDomain && isValidWebsite(mDomain[1])) {
        result.website = 'https://' + mDomain[1].toLowerCase();
      }
    }
    if (result.website) break;
  }

  // --- 1C. Section "Th\u00f4ng tin li\u00ean h\u1ec7" / "Contact info" \u2192 Phone + Email + Social ---
  const contactHeadings = allEls.filter(el => {
    const t = (el.innerText || '').trim();
    return /^(?:Th\u00f4ng tin li\u00ean h\u1ec7|Contact info|Contact Information|Li\u00ean h\u1ec7|\u8054\u7cfb\u65b9\u5f0f)$/i.test(t) && el.children.length === 0;
  });
  for (const h of contactHeadings) {
    const box = findSectionBox(h);
    if (!box) continue;

    // Phone: a[href^="tel:"] ho\u1eb7c text kh\u1edbp regex
    if (!result.phone) {
      const telA = box.querySelector('a[href^="tel:"]');
      if (telA) {
        const p = cleanPhone(decodeURIComponent(telA.getAttribute('href').replace(/^tel:/i, '')));
        if (p) result.phone = p;
      }
      if (!result.phone) {
        const waA = box.querySelector('a[href*="wa.me/"], a[href*="whatsapp.com"]');
        if (waA) {
          const m = (waA.getAttribute('href') || '').match(/wa\.me\/(\d+)/i);
          if (m) result.phone = cleanPhone(m[1]);
        }
      }
      if (!result.phone) {
        const boxText = box.innerText || '';
        const mP = boxText.match(/(?:\+?[\d]{1,3}[\s.-]?)?(?:\([\d]{2,4}\)[\s.-]?)?[\d]{3,4}[\s.-][\d]{3,4}[\s.-]?[\d]{0,4}\b/);
        if (mP) {
          const p = cleanPhone(mP[0]);
          if (p && p.replace(/\D/g, '').length >= 7) result.phone = p;
        }
      }
    }

    // Email: a[href^="mailto:"] ho\u1eb7c text kh\u1edbp regex
    if (!result.email) {
      const mailA = box.querySelector('a[href^="mailto:"]');
      if (mailA) {
        const raw = decodeURIComponent(mailA.getAttribute('href').replace(/^mailto:/i, '').split('?')[0]);
        if (isValidEmail(raw)) result.email = raw.toLowerCase();
      }
      if (!result.email) {
        const boxText = box.innerText || '';
        const mE = boxText.match(/\b([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]{2,})\b/);
        if (mE && isValidEmail(mE[1])) result.email = mE[1].toLowerCase();
      }
    }

    // Social links t\u1eeb t\u1ea5t c\u1ea3 anchor trong box
    const socialAnchors = Array.from(box.querySelectorAll('a[href]'));
    for (const a of socialAnchors) {
      const href = decodeShim(a.getAttribute('href') || a.href || '');
      if (!href) continue;
      if (/instagram\.com\/([a-zA-Z0-9_.-]+)/i.test(href)) {
        const m = href.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/i);
        if (m && !result.instagram) {
          const handle = m[1].replace(/\/+$/, '').toLowerCase();
          if (handle.length >= 3 && !handle.endsWith('.com') && !['explore', 'accounts', 'login', 'share', 'reels', 'stories'].includes(handle)) {
            result.instagram = `https://www.instagram.com/${handle}/`;
            if (!result.social_links.includes(result.instagram)) result.social_links.push(result.instagram);
          }
        }
      } else if (/(?:youtube\.com|youtu\.be|tiktok\.com|linkedin\.com|twitter\.com|x\.com|pinterest\.com)\//i.test(href)) {
        if (!result.social_links.includes(href)) result.social_links.push(href);
      }
    }
    break; // ch\u1ec9 l\u1ea5y section "Th\u00f4ng tin li\u00ean h\u1ec7" \u0111\u1ea7u ti\u00ean
  }

  // --- 1D. Section "Chi ti\u1ebft" / "Details" \u2192 Zip + Address ---
  const detailHeadings = allEls.filter(el => {
    const t = (el.innerText || '').trim();
    return /^(?:Chi ti\u1ebft|Details|\u8be6\u7ec6\u4fe1\u606f|Th\u00f4ng tin c\u00e1 nh\u00e2n)$/i.test(t) && el.children.length === 0;
  });
  for (const h of detailHeadings) {
    const box = findSectionBox(h);
    if (!box) continue;
    const boxText = (box.innerText || '').trim();
    if (!result.zip) {
      const mZip = boxText.match(/\b(\d{5})\b/);
      if (mZip && mZip[1] !== '00000') result.zip = mZip[1];
    }
    if (!result.address) {
      // Tìm dòng có địa chỉ thực (bắt buộc khớp mẫu địa chỉ và không lấy nhầm Bio)
      const addrLines = boxText.split('\n').map(l => l.trim());
      for (const line of addrLines) {
        if (line.length < 5) continue;
        if (result.bio && (line.toLowerCase().includes(result.bio.toLowerCase().slice(0, 25)) || result.bio.toLowerCase().includes(line.toLowerCase().slice(0, 25)))) {
          continue;
        }
        const cleaned = cleanAddressText(line);
        if (cleaned && typeof isLikelyAddress === 'function' && isLikelyAddress(cleaned)) {
          result.address = cleaned;
          break;
        }
      }
    }
    if (result.zip || result.address) break;
  }

  // --- 1E. Category t\u1eeb "Trang \u00b7 [category]" ho\u1eb7c "Page \u00b7 [category]" pattern ---
  if (!result.category) {
    const bodyText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    const mCat = bodyText.match(/(?:Trang|Page)\s*[\u00b7\u2022]\s*([^\n\r\u00b7\u2022]{3,60})/i);
    if (mCat && mCat[1]) result.category = mCat[1].trim();
  }

  // ===== 2. LAYOUT KH\u00d4NG LOGIN: T\u1ea5t c\u1ea3 trong block "Gi\u1edbi thi\u1ec7u" =====
  // N\u1ebfu ch\u01b0a l\u1ea5y \u0111\u01b0\u1ee3c data ch\u00ednh, qu\u00e9t to\u00e0n b\u1ed9 block Gi\u1edbi thi\u1ec7u
  const hasEnoughData = result.phone || result.email || result.website;
  if (!hasEnoughData) {
    // C\u00e1c block Gi\u1edbi thi\u1ec7u c\u00f3 th\u1ec3 ch\u1ee9a t\u1ea5t c\u1ea3 th\u00f4ng tin li\u00ean h\u1ec7
    const introBlocks = Array.from(document.querySelectorAll(
      'div[role="main"] > div > div, div[role="complementary"] > div'
    )).filter(el => {
      const t = (el.innerText || '').toLowerCase();
      // Block c\u00f3 c\u1ea3 phone/email v\u00e0 info kh\u00e1c
      const tLen = (el.innerText || el.textContent || '').trim().length;
      return (t.includes('@') || /\+?\d[\d\s().-]{6,}/.test(t)) && (el.offsetHeight > 50 || tLen > 30);
    });

    for (const block of introBlocks.slice(0, 3)) {
      // Phone
      if (!result.phone) {
        const telA = block.querySelector('a[href^="tel:"]');
        if (telA) {
          const p = cleanPhone(decodeURIComponent(telA.getAttribute('href').replace(/^tel:/i, '')));
          if (p) result.phone = p;
        }
        if (!result.phone) {
          const t = block.innerText || '';
          const mP = t.match(/(?:\+?[\d]{1,3}[\s.-]?)?(?:\([\d]{2,4}\)[\s.-]?)?[\d]{3,4}[\s.-][\d]{3,4}[\s.-]?[\d]{0,4}\b/);
          if (mP) {
            const p = cleanPhone(mP[0]);
            if (p && p.replace(/\D/g, '').length >= 7) result.phone = p;
          }
        }
      }
      // Email
      if (!result.email) {
        const mailA = block.querySelector('a[href^="mailto:"]');
        if (mailA) {
          const raw = decodeURIComponent(mailA.getAttribute('href').replace(/^mailto:/i, '').split('?')[0]);
          if (isValidEmail(raw)) result.email = raw.toLowerCase();
        }
        if (!result.email) {
          const mE = (block.innerText || '').match(/\b([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]{2,})\b/);
          if (mE && isValidEmail(mE[1])) result.email = mE[1].toLowerCase();
        }
      }
      // Website
      if (!result.website) {
        const anchors = Array.from(block.querySelectorAll('a[href]'));
        for (const a of anchors) {
          const href = decodeShim(a.getAttribute('href') || a.href || '');
          if (/(?:instagram|pinterest|youtube|youtu\.be|tiktok|linkedin|twitter|x\.com)\//i.test(href)) continue;
          if (isValidWebsite(href)) {
            result.website = href.startsWith('http') ? href : 'https://' + href;
            break;
          }
        }
      }
      // Social
      const anchors = Array.from(block.querySelectorAll('a[href]'));
      for (const a of anchors) {
        const href = decodeShim(a.getAttribute('href') || a.href || '');
        if (!href) continue;
        if (/instagram\.com\/([a-zA-Z0-9_.-]+)/i.test(href)) {
          const m = href.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/i);
          if (m && !result.instagram) {
            const handle = m[1].replace(/\/+$/, '').toLowerCase();
            if (handle.length >= 3 && !handle.endsWith('.com') && !['explore', 'accounts', 'login', 'share', 'reels', 'stories'].includes(handle)) {
              result.instagram = `https://www.instagram.com/${handle}/`;
              if (!result.social_links.includes(result.instagram)) result.social_links.push(result.instagram);
            }
          }
        } else if (/(?:youtube\.com|youtu\.be|tiktok\.com|linkedin\.com|twitter\.com|x\.com|pinterest\.com)\//i.test(href)) {
          if (!result.social_links.includes(href)) result.social_links.push(href);
        }
      }
    }
  }

  return result;
}

/**
 * TRÍCH XUẤT TOÀN DIỆN MỌI TRƯỜNG TỪ PHẦN GIỚI THIỆU / INTRO / COMET SCRIPT DATA
 * Bóc tách đa tầng: Thẻ <script data-sjs> + Thẻ <a> giải mã Link Shim + Aria-labels + DOM TreeWalker
 * Tương thích 100% khi người dùng chuyển đổi ngôn ngữ (Tiếng Việt / English / 中文)
 */
function extractIntroAndContacts(leadName) {
  let text = document.body ? (document.body.innerText || document.body.textContent || '') : '';
  let fullHtml = document.documentElement ? document.documentElement.innerHTML : '';

  let phone = '';
  let email = '';
  let website = '';
  let websiteScore = 0;
  let instagram = '';
  const social_links = [];
  let city = '';
  let state = '';
  let zip = '';
  let address = '';
  let bio = '';
  let category = '';
  let amazon_url = '';
  let has_amazon = false;
  let bio_links = [];
  const validAmazonUrlsList = [];

  // Thu thập nội dung script từ HTML của profile hiện tại để tránh lẫn lộn dữ liệu các profile trước
  const scriptSources = [fullHtml];

  // =========================================================================
  // 3.0 BÓC TÁCH TOÀN DIỆN TỪ RELAY PRELOADER JSON & SCRIPT DATA-SJS
  // (Khắc phục trường hợp DOM #mount_0_0_OD để style="display:none" và render trễ)
  // Quét các thẻ <script type="application/json" data-sjs> tìm "external_url" & Link Shims
  // =========================================================================
  const scriptExtUrls = extractExternalUrlsFromScriptsAndHtml();
  for (const rawU of scriptExtUrls) {
    const validAmz = sanitizeAndValidateAmazonUrl(rawU);
    if (validAmz && !validAmazonUrlsList.includes(validAmz)) {
      validAmazonUrlsList.push(validAmz);
    }
    const bioMatches = extractBioAggregatorLinks(rawU);
    for (const bm of bioMatches) {
      if (!bio_links.includes(bm)) bio_links.push(bm);
    }
    if (/instagram\.com\/([a-zA-Z0-9_.-]+)/i.test(rawU)) {
      const mIg = rawU.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/i);
      if (mIg && !instagram) {
        const handle = mIg[1].replace(/\/+$/, '').toLowerCase();
        if (handle.length >= 3 && !handle.endsWith('.com')) {
          instagram = `https://www.instagram.com/${handle}/`;
        }
      }
    } else if (/(?:youtube\.com|youtu\.be|tiktok\.com|linkedin\.com|twitter\.com|x\.com|pinterest\.com)\//i.test(rawU)) {
      const socialUrl = rawU.startsWith('http') ? rawU : `https://${rawU}`;
      if (!social_links.includes(socialUrl)) social_links.push(socialUrl);
    }
  }

  // =========================================================================
  // 1. QUÉT SỐ ĐIỆN THOẠI (PHONE) - ƯU TIÊN SỐ 1: LIVE DOM TREEWALKER
  // =========================================================================
  // 1.1 Quét trực tiếp trên live DOM hiển thị
  phone = extractPhoneFromVisibleDOM();

  // 1.2 Quét thẻ a có link tel: nếu DOM chưa có
  if (!phone) {
    const telLink = document.querySelector('a[href^="tel:"]');
    if (telLink) {
      const rawTel = decodeURIComponent((telLink.getAttribute('href') || '').replace(/^tel:/i, ''));
      const p = cleanPhone(rawTel);
      if (p) phone = p;
    }
  }

  // 1.3 Quét thuộc tính aria-label hoặc title trên các nút liên hệ (VI, EN, ZH)
  if (!phone) {
    const callEls = Array.from(document.querySelectorAll(
      '[aria-label*="điện thoại"], [aria-label*="phone"], [aria-label*="Call"], [aria-label*="Gọi"], ' +
      '[aria-label*="电话"], [aria-label*="拨打"], [title*="phone"], [title*="điện thoại"], [title*="电话"]'
    ));
    for (const el of callEls) {
      const val = (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || '').trim();
      const mP = val.match(/(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-](\d{3})[\s.-](\d{4})\b/);
      if (mP) {
        const p = cleanPhone(mP[0]);
        if (p) { phone = p; break; }
      }
    }
  }

  // 1.4 Quét các trường JSON GraphQL trong <script data-sjs> CHỈ KHI có định dạng SĐT phân tách chuẩn
  if (!phone) {
    const phoneJsonPatterns = [
      /["\\]*(?:telephone|formatted_phone_number|profile_field_phone|page_phone|phone_number_text)["\\]*\s*:\s*"([^"]+)"/gi,
      /["\\]*phone_number["\\]*\s*:\s*\{[\s\S]{0,100}?["\\]*universal_number["\\]*\s*:\s*"([^"]+)"/gi,
      // Facebook Page specific
      /["\\]*phone["\\]*\s*:\s*"(\+?[\d\s().-]{7,20})"/gi,
      /"profile_info"[\s\S]{0,300}?"phone"\s*:\s*"([^"]+)"/gi
    ];
    for (const src of scriptSources) {
      if (!src || src.length < 20) continue;
      for (const reg of phoneJsonPatterns) {
        for (const m of src.matchAll(reg)) {
          const raw = m[1].replace(/\\/g, '').trim();
          const p = cleanPhone(raw);
          if (p && !p.startsWith('0000000') && p.replace(/\D/g, '').length >= 7) {
            phone = p;
            break;
          }
        }
        if (phone) break;
      }
      if (phone) break;
    }
  }

  // 1.5b Quét vùng 'Thông tin liên hệ' / 'Contact info' dành cho Page (Facebook Page About tab)
  if (!phone) {
    const contactSections = Array.from(document.querySelectorAll(
      'div[data-pagelet*="PageInfo"], div[data-pagelet*="PageAbout"], div[data-pagelet*="PageIntro"], ' +
      'div[aria-label*="Thông tin liên hệ"], div[aria-label*="Contact info"], div[aria-label*="Contact Information"]'
    ));
    for (const sec of contactSections) {
      const secText = (sec.innerText || '').trim();
      // Quét tel link trong section này trước
      const telA = sec.querySelector('a[href^="tel:"]');
      if (telA) {
        const rawTel = decodeURIComponent((telA.getAttribute('href') || '').replace(/^tel:/i, ''));
        const p = cleanPhone(rawTel);
        if (p) { phone = p; break; }
      }
      // Fallback text regex
      const mP = secText.match(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]\d{3,4}[\s.-]\d{3,4}\b/);
      if (mP) {
        const p = cleanPhone(mP[0]);
        if (p && p.replace(/\D/g, '').length >= 7) { phone = p; break; }
      }
    }
  }

  // 1.5 Quét text thuần DOM (yêu cầu dấu phân cách để không bốc trúng số hash rác)
  if (!phone) {
    const mPhone = text.match(/(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-](\d{3})[\s.-](\d{4})\b/);
    if (mPhone && !mPhone[0].includes('0000000')) {
      phone = cleanPhone(mPhone[0]);
    }
  }

  // =========================================================================
  // 2. QUÉT EMAIL LIÊN HỆ
  // =========================================================================
  // 2.1 Quét thẻ a có link mailto:
  const mailtoLinks = Array.from(document.querySelectorAll('a[href^="mailto:"]'));
  for (const mailtoLink of mailtoLinks) {
    const rawMail = decodeURIComponent((mailtoLink.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0]);
    if (isValidEmail(rawMail)) {
      email = rawMail.trim().toLowerCase();
      break;
    }
  }

  // 2.2 Quét JSON GraphQL trong <script data-sjs>
  if (!email) {
    const emailJsonPatterns = [
      /["\\]*(?:email_address|profile_field_email|business_email|page_email)["\\]*\s*:\s*"([^"]+@[^"]+\.[a-zA-Z]{2,})"/gi,
      /["\\]*email["\\]*\s*:\s*"([^"]+@[^"]+\.[a-zA-Z]{2,})"/gi,
      // Facebook Page specific patterns
      /"page_contact_info"[\s\S]{0,500}?"email"\s*:\s*"([^"]+@[^"]+\.[a-zA-Z]{2,})"/gi,
      /"contact_fields"[\s\S]{0,500}?"value"\s*:\s*"([^"]+@[^"]+\.[a-zA-Z]{2,})"/gi
    ];
    for (const src of scriptSources) {
      if (!src || src.length < 20) continue;
      for (const reg of emailJsonPatterns) {
        for (const m of src.matchAll(reg)) {
          const em = m[1].replace(/\\/g, '').trim().toLowerCase();
          if (isValidEmail(em)) {
            email = em;
            break;
          }
        }
        if (email) break;
      }
      if (email) break;
    }
  }

  // 2.3 Quét text thuần DOM
  if (!email) {
    const mEmail = text.match(/\b([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/);
    if (mEmail && isValidEmail(mEmail[1])) {
      email = mEmail[1].trim().toLowerCase();
    }
  }

  // Một số giao diện Facebook chỉ render email như text/aria-label, không
  // tạo mailto:. Quét riêng vùng main để không phụ thuộc vào link ẩn đầu tiên.
  if (!email) {
    const contactText = [
      document.querySelector('div[role="main"]')?.innerText || '',
      ...Array.from(document.querySelectorAll('div[role="main"] [aria-label], div[role="main"] [title]'))
        .map(el => `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`)
    ].join('\n');
    const candidates = contactText.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || [];
    for (const candidate of candidates) {
      if (isValidEmail(candidate)) {
        email = candidate.toLowerCase();
        break;
      }
    }
  }

  // 2.4 Quét vùng 'Thông tin liên hệ' / 'Contact info' dành cho Facebook Page
  if (!email) {
    const pageSections = Array.from(document.querySelectorAll(
      'div[data-pagelet*="PageInfo"], div[data-pagelet*="PageAbout"], div[data-pagelet*="PageIntro"], ' +
      'div[aria-label*="Thông tin liên hệ"], div[aria-label*="Contact info"], div[aria-label*="Contact Information"]'
    ));
    for (const sec of pageSections) {
      const mailA = sec.querySelector('a[href^="mailto:"]');
      if (mailA) {
        const rawMail = decodeURIComponent((mailA.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0]);
        if (isValidEmail(rawMail)) { email = rawMail.trim().toLowerCase(); break; }
      }
      const secText = sec.innerText || '';
      const mEmail = secText.match(/\b([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/);
      if (mEmail && isValidEmail(mEmail[1])) { email = mEmail[1].trim().toLowerCase(); break; }
    }
  }

  // =========================================================================
  // 3. QUÉT WEBSITE & INSTAGRAM (GIẢI MÃ LINK SHIM L.FACEBOOK.COM TRIỆT ĐỂ)
  // =========================================================================
  // 3.1 Ưu tiên hàng đầu: Quét trực tiếp khối "Liên kết" (Links / Website) trên giao diện Facebook
  const linkHeadings = Array.from(document.querySelectorAll('div[role="main"] span, div[role="main"] h3, div[role="main"] h4, div[role="main"] div')).filter(el => {
    const t = (el.innerText || '').trim();
    return /^(?:Liên kết|Links|Website|链接|Web)$/i.test(t) && el.children.length === 0;
  });
  const officialLinkAnchors = new Set();

  for (const h of linkHeadings) {
    const sectionBox = h.closest('div.x1n2onr6, div.x9f619, div.x78zum5') || h.parentElement?.parentElement;
    if (sectionBox) {
      // Quét thẻ <a> trong khối liên kết
      const sectionLinks = Array.from(sectionBox.querySelectorAll('a[href]'));
      for (const a of sectionLinks) {
        officialLinkAnchors.add(a);
        let hf = a.getAttribute('href') || a.href || '';
        if (/(?:l|lm)\.facebook\.com\/l\.php/i.test(hf) || hf.includes('/l.php?u=') || hf.includes('/flx/warn/?u=')) {
          try {
            const u = new URL(hf, window.location.origin);
            const real = u.searchParams.get('u');
            if (real) hf = decodeURIComponent(real);
          } catch (_) { }
        }
        const isSocialLink = /(?:instagram\.com|pinterest\.com|youtube\.com|youtu\.be|tiktok\.com|linkedin\.com|twitter\.com|x\.com)\//i.test(hf);
        if (isValidWebsite(hf) && !isSocialLink) {
          website = hf.startsWith('http') ? hf : 'https://' + hf;
          websiteScore = 20;
          break;
        }
      }
      // Quét text tên miền trong khối liên kết nếu thẻ a bị che khuất
      if (!website) {
        const boxText = sectionBox.innerText || '';
        const mDomain = boxText.match(/\b([a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.(?:com|org|net|us|co|biz|info|site|online|store|shop|pet|care|vet|tech|me|io|ca|uk|dog|kennel|farm))\b/i);
        const isSocialDomain = /^(?:instagram|pinterest|youtube|youtu|tiktok|linkedin|twitter|x)\.com$/i.test(mDomain?.[1] || '');
        if (mDomain && !isSocialDomain && isValidWebsite(mDomain[1])) {
          website = 'https://' + mDomain[1].toLowerCase().trim() + '/';
          websiteScore = 18;
        }
      }
    }
    if (website) break;
  }

  // 3.2 Quét toàn bộ khối Giới thiệu / Thông tin cá nhân
  // Hỗ trợ cả Facebook Profile (ProfileIntro) VÀ Facebook Page (PageIntro, PageInfo)
  let introContainer = document.querySelector(
    'div[data-pagelet*="ProfileIntro"], div[data-pagelet*="Intro"], div[data-pagelet*="ProfileTilesFeed"], ' +
    'div[data-pagelet*="PageIntro"], div[data-pagelet*="PageInfo"], div[data-pagelet*="PageAbout"], ' +
    'div[data-pagelet*="PageTilesFeed"]'
  );
  if (!introContainer) {
    const headings = Array.from(document.querySelectorAll('h2, h3, h4, span, div')).filter(el => {
      const t = (el.innerText || '').trim();
      return /^(?:Giới thiệu|Intro|About|简介|Thông tin cá nhân|Personal info|Details|Chi tiết|Thông tin|Information)$/i.test(t) && el.children.length === 0;
    });
    for (const h of headings) {
      const p = h.closest('div.x1n2onr6, div[role="main"] > div, div.x9f619');
      if (p) { introContainer = p; break; }
    }
  }
  if (!introContainer) introContainer = document.querySelector('div[role="main"]') || document.body;

  // 3.2.1 Quét JSON GraphQL cho website / page_website (Facebook Page)
  if (!website) {
    const websiteJsonPatterns = [
      /["\\]*(?:website|page_website|external_url|website_url)["\\]*\s*:\s*"(https?:\/\/[^"]{5,200})"/gi,
      /["\\]*(?:website|page_website|website_url)["\\]*\s*:\s*"([^"]{5,200})"/gi
    ];
    for (const src of scriptSources) {
      if (!src || src.length < 20) continue;
      for (const reg of websiteJsonPatterns) {
        for (const m of src.matchAll(reg)) {
          const raw = m[1].replace(/\\/g, '').trim();
          if (isValidWebsite(raw)) {
            website = raw.startsWith('http') ? raw : 'https://' + raw;
            websiteScore = 15;
            break;
          }
        }
        if (website) break;
      }
      if (website) break;
    }
  }

  // 3.2.2 Quét JSON GraphQL cho category, address, city, zip của Facebook Page
  if (!category) {
    const catPatterns = [
      /["\\]*(?:category_name|page_category|primary_category)["\\]*\s*:\s*"([^"]{2,80})"/i,
      /["\\]*category["\\]*\s*:\s*"([^"]{2,80})"/i
    ];
    for (const src of scriptSources) {
      if (!src) continue;
      for (const pat of catPatterns) {
        const m = src.match(pat);
        if (m && m[1] && m[1].length < 80) { category = m[1].replace(/\\/g, '').trim(); break; }
      }
      if (category) break;
    }
  }

  if (!address) {
    const addrPatterns = [
      /["\\]*(?:single_line_address|formatted_address|street_address)["\\]*\s*:\s*"([^"]{5,200})"/i,
      /["\\]*address["\\]*\s*:\s*\{[\s\S]{0,300}?["\\]*street["\\]*\s*:\s*"([^"]{5,200})"/i
    ];
    for (const src of scriptSources) {
      if (!src) continue;
      for (const pat of addrPatterns) {
        const m = src.match(pat);
        if (m && m[1]) { address = m[1].replace(/\\/g, '').trim(); break; }
      }
      if (address) break;
    }
  }

  const allLinks = Array.from(introContainer.querySelectorAll('a[href]')).filter(a => {
    // Loại trừ tuyệt đối các link nằm trong bài viết (feed post), comment hoặc gợi ý
    if (a.closest('div[role="article"], div[data-pagelet*="FeedUnit"], div[data-pagelet*="Comment"]')) {
      return false;
    }
    return true;
  });
  const contactLinks = Array.from(document.querySelectorAll('div[role="main"] a[href]'))
    .filter(a => !a.closest('div[role="article"], div[data-pagelet*="FeedUnit"], div[data-pagelet*="Comment"]'));
  const allContactLinks = Array.from(new Set([...allLinks, ...contactLinks]));

  for (let a of allContactLinks) {
    let href = a.getAttribute('href') || a.href || '';

    // GIẢI MÃ ĐẦY ĐỦ LINK SHIM l.facebook.com HOẶC lm.facebook.com HOẶC /l.php?u=
    if (/(?:l|lm)\.facebook\.com\/l\.php/i.test(href) || href.startsWith('/l.php?u=') || href.includes('/flx/warn/?u=')) {
      try {
        const u = new URL(href, window.location.origin);
        const real = u.searchParams.get('u');
        if (real) href = decodeURIComponent(real);
      } catch (_) { }
    }

    // 1. Kiểm tra nếu là liên kết Amazon Storefront / Wishlist / Product / Author
    const checkedAmz = sanitizeAndValidateAmazonUrl(href);
    if (checkedAmz && !validAmazonUrlsList.includes(checkedAmz)) {
      validAmazonUrlsList.push(checkedAmz);
    }

    // 2. Kiểm tra nếu là liên kết tổng hợp Bio (linktr.ee, hoo.be, direct.me, msha.ke...)
    const bioMatches = extractBioAggregatorLinks(href);
    if (bioMatches && bioMatches.length > 0) {
      for (const bm of bioMatches) {
        if (!bio_links.includes(bm)) bio_links.push(bm);
      }
    }

    if (/instagram\.com\/([a-zA-Z0-9_.-]+)/i.test(href)) {
      const mIg = href.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/i);
      if (mIg) {
        const handle = mIg[1].replace(/\/+$/, '').toLowerCase();
        const BROKEN_IG_HANDLES = new Set([
          '.com', 'ans', 'ht.', 'ence', 'ence.', 'hborhood', 'hbors',
          'hlights', 'hlightseveryone', 'hts', 'inal', 'inally', 'ital',
          'ley', 'mat', 'most', 'playful', 'question', 'ree', 'sby',
          'size', 'things.', 'hter.', 'enetics', 'brother.', 'mac', 'dawg',
          'hest', 'hting', 'hdesertlabradors.com', 'p', 'reel', 'reels',
          'stories', 'explore', 'about', 'accounts', 'login', 'share'
        ]);
        if (!BROKEN_IG_HANDLES.has(handle) && !handle.endsWith('.com') && !handle.endsWith('.') && handle.length >= 3 && /^[a-zA-Z0-9_][a-zA-Z0-9_.]*[a-zA-Z0-9_]$/.test(handle)) {
          const socialUrl = `https://www.instagram.com/${handle}/`;
          if (!instagram) instagram = socialUrl;
          if (!social_links.includes(socialUrl)) social_links.push(socialUrl);
        }
      }
    } else if (/(?:youtube\.com|youtu\.be|tiktok\.com|linkedin\.com|twitter\.com|x\.com|pinterest\.com)\//i.test(href)) {
      if (!social_links.includes(href)) social_links.push(href);
    } else if (officialLinkAnchors.has(a) && isValidWebsite(href)) {
      const isForm = isThirdPartyFormService(href);
      let candidateScore = 5;
      let cleanTarget = href;

      try {
        const u = new URL(href);
        const host = u.hostname.toLowerCase();
        const path = u.pathname.replace(/\/+$/, '');

        if (isForm) {
          candidateScore = 1; // Biểu mẫu bên thứ ba (monday.com, jotform...) điểm thấp nhất
        } else if (host.includes('gooddog.com')) {
          candidateScore = 7;
        } else if (!path || path === '' || path === '/') {
          candidateScore = 10; // Tên miền riêng trang chủ chính thức (ví dụ: preciouspetcare.com) -> Ưu tiên cao nhất
          cleanTarget = u.origin + '/';
        } else {
          candidateScore = 8; // Tên miền riêng có trang con (ví dụ: preciouspetcare.com/contact) -> Chuẩn hóa về trang chủ để vào được menu đầy đủ
          cleanTarget = u.origin + '/';
        }
      } catch (_) { }

      if (!website || candidateScore > (websiteScore || 0)) {
        website = cleanTarget;
        websiteScore = candidateScore;
      }
    }
  }

  // Website chỉ được xác nhận từ khối "Liên kết". Không fallback sang text,
  // script hoặc contact links vì các nguồn đó thường chứa social URLs.

  // Quét Instagram @handle trong text nếu chưa có link
  if (!instagram) {
    const mIg = text.match(/(?:Instagram|IG|Follow us on IG)\s*[:·\-–]?\s*@?([a-zA-Z0-9_.-]{3,30})/i);
    if (mIg && !/^(the|and|for|our|dogs|puppy|kennel)$/i.test(mIg[1])) {
      instagram = `https://www.instagram.com/${mIg[1].replace('@', '')}/`;
    }
  }

  // =========================================================================
  // 4. QUÉT ĐỊA CHỈ, CITY, STATE, ZIP & COUNTRY TỪ BẢN ĐỒ VÀ METADATA
  // =========================================================================
  let country = '';

  // 4.1 Bóc tách từ query where1= trên link Bing Maps / Google Maps trong Intro
  for (let a of allContactLinks) {
    const h = a.getAttribute('href') || a.href || '';
    const mWhere = h.match(/where1=([^&"'\\]+)/i);
    if (mWhere) {
      try {
        const decodedWhere = decodeURIComponent(mWhere[1]).replace(/\+/g, ' ').trim();
        if (/^-?\d+\.\d+/.test(decodedWhere)) {
          const visibleTxt = (a.innerText || '').trim();
          if (visibleTxt && visibleTxt.length > 5 && !/^-?\d+\.\d+/.test(visibleTxt)) {
            address = visibleTxt;
          } else {
            address = decodedWhere;
          }
        } else {
          address = decodedWhere;
        }

        if (address) {
          if (/(?:Vietnam|Việt Nam|Hồ Chí Minh|Ho Chi Minh|Ha Noi|Hà Nội|TP\.?HCM|TPHCM)\b/i.test(address)) {
            country = 'Vietnam';
            if (/Hồ Chí Minh|Ho Chi Minh|TP\.?HCM|TPHCM|Sài Gòn/i.test(address)) {
              city = 'Hồ Chí Minh';
              state = 'Hồ Chí Minh';
            } else if (/Hà Nội|Ha Noi/i.test(address)) {
              city = 'Hà Nội';
              state = 'Hà Nội';
            }
            const mZipVn = address.match(/\b(\d{5,6})\b/);
            if (mZipVn) zip = mZipVn[1];
          } else {
            const parsed = parseAddressRightToLeft(address, city, state, country);
            address = parsed.address;
            if (parsed.city) city = parsed.city;
            if (parsed.state) state = parsed.state;
            if (parsed.zip) zip = parsed.zip;
            if (parsed.country) country = parsed.country;
          }
        }
      } catch (_) { }
      break;
    }
  }

  // Quét Địa chỉ từ Live DOM nếu where1 bị dính tọa độ (e.g. 30.66951) hoặc chưa có
  if (!address || /^-?\d+\.\d+/.test(address)) {
    const allSpans = Array.from(document.querySelectorAll('div[role="main"] span, div[data-pagelet*="Intro"] span, div.x1n2onr6 span'));
    for (const el of allSpans) {
      const t = (el.innerText || '').trim();
      if (t.length > 8 && t.length < 130 && (typeof isLikelyAddress === 'function' ? isLikelyAddress(t) : true)) {
        const cleanDomAddr = cleanAddressText(t);
        if (cleanDomAddr && (typeof isLikelyAddress === 'function' ? isLikelyAddress(cleanDomAddr) : true)) {
          address = cleanDomAddr;
          if (/Vietnam|Việt Nam|Hồ Chí Minh|Ho Chi Minh/i.test(cleanDomAddr)) {
            country = 'Vietnam';
            city = 'Hồ Chí Minh';
            state = 'Hồ Chí Minh';
            const mZipVn = cleanDomAddr.match(/\b(\d{5,6})\b/);
            if (mZipVn) zip = mZipVn[1];
          } else {
            const parsed = parseAddressRightToLeft(cleanDomAddr, city, state, country);
            address = parsed.address;
            if (parsed.city) city = parsed.city;
            if (parsed.state) state = parsed.state;
            if (parsed.zip) zip = parsed.zip;
            if (parsed.country) country = parsed.country;
          }
          break;
        }
      }
    }
  }

  // 4.2 Quét JSON GraphQL cho Address/City/State/Zip
  if (!city || !state) {
    for (const src of scriptSources) {
      if (!src || src.length < 20) continue;
      if (!city) {
        const mCity = src.match(/["\\]*(?:current_city|hometown|city)["\\]*[\s\S]{0,100}?["\\]*name["\\]*\s*:\s*"([^"]+)"/i);
        if (mCity) {
          const cParts = mCity[1].split(',').map(x => x.trim());
          city = cParts[0];
          if (cParts[1]) {
            const stCand = cParts[1].toUpperCase();
            if (US_STATE_CODES.has(stCand)) state = stCand;
            else if (US_STATES[cParts[1].toLowerCase()]) state = US_STATES[cParts[1].toLowerCase()];
          }
        }
      }
      if (!zip) {
        const mZ = src.match(/["\\]*postal_code["\\]*\s*:\s*"(\d{5}(?:-\d{4})?)"/i);
        if (mZ) zip = mZ[1];
      }
      if (city && state) break;
    }
  }

  // 4.3 Quét text DOM cho City, State, Zip
  if (!zip) {
    const mZip = text.match(/\b(0\d{4}|\d{5})(?:-\d{4})?\b/);
    if (mZip && !mZip[1].startsWith('00000')) zip = mZip[1];
  }

  if (!city || !state) {
    const mLocFull = text.match(/\b([A-Z][a-zA-Z\s.-]{2,25}),\s*([A-Z]{2})\b(?:\s*,\s*US)?/);
    if (mLocFull && US_STATE_CODES.has(mLocFull[2].toUpperCase())) {
      city = mLocFull[1].trim();
      state = mLocFull[2].toUpperCase();
    }
  }

  // 4.4 Hỗ trợ đa ngôn ngữ VI, EN, ZH: Sống tại / Lives in / From / Đến từ / 现居 / 来自 / 居住在
  if (!city || !state) {
    const mIntroLoc = text.match(/(?:Sống tại|Lives in|From|Đến từ|Location|现居|来自|居住在|所在地|所在地区)\s*[:·\-–]?\s*([A-Za-z\s.-]{2,25}),\s*([A-Za-z\s]{2,20}|[A-Z]{2})/i);
    if (mIntroLoc) {
      city = mIntroLoc[1].trim();
      const stCand = mIntroLoc[2].trim();
      if (stCand.length === 2 && US_STATE_CODES.has(stCand.toUpperCase())) {
        state = stCand.toUpperCase();
      } else if (US_STATES[stCand.toLowerCase()]) {
        state = US_STATES[stCand.toLowerCase()];
      }
    }
  }

  const cleanLead = (leadName || '').toLowerCase();
  if (!state) {
    if (/texas|\btx\b/i.test(cleanLead)) state = 'TX';
    else if (/michigan|\bmi\b/i.test(cleanLead)) state = 'MI';
    else if (/california|\bca\b/i.test(cleanLead)) state = 'CA';
    else if (/georgia|\bga\b/i.test(cleanLead)) state = 'GA';
    else if (/florida|\bfl\b/i.test(cleanLead)) state = 'FL';
    else if (/massachusetts|\bma\b/i.test(cleanLead)) state = 'MA';
    else if (/new york|\bny\b/i.test(cleanLead)) state = 'NY';
    else if (/north carolina|\bnc\b/i.test(cleanLead)) state = 'NC';
    else if (/ohio|\boh\b/i.test(cleanLead)) state = 'OH';
    else if (/pennsylvania|\bpa\b/i.test(cleanLead)) state = 'PA';
  }

  // =========================================================================
  // 5. QUÉT TIỂU SỬ / GIỚI THIỆU (BIO) - ĐA TẦNG & ĐA NGÔN NGỮ (VI / EN / ZH)
  // =========================================================================
  // 5.1 Quét JSON GraphQL (hỗ trợ cả Profile và Page)
  for (const src of scriptSources) {
    if (!src || src.length < 20) continue;
    const mBioJson =
      src.match(/["\\]*(?:profile_intro_card|bio_text|page_about|about)["\\]*[\s\S]{0,250}?["\\]*text["\\]*\s*:\s*"([^"]{10,600})"/i) ||
      src.match(/["\\]*(?:description|page_description|blurb)["\\]*\s*:\s*"([^"]{10,600})"/i) ||
      src.match(/["\\]*about["\\]*\s*:\s*"([^"]{10,600})"/i);
    if (mBioJson) {
      const candidate = mBioJson[1].replace(/\\n/g, ' ').replace(/\\t/g, ' ').replace(/\\/g, '').trim();
      // Lọc bỏ bio rác hệ thống
      if (candidate.length >= 10 && !isValidEmail(candidate) && !isValidWebsite(candidate)) {
        bio = candidate;
        break;
      }
    }
  }

  // 5.2 Quét trực tiếp từ DOM của khối introContainer
  if (!bio && introContainer) {
    const domBio = findBioFromIntroDOM(introContainer);
    if (domBio) {
      bio = domBio;
    }
  }

  // 5.2b Quét vùng Page 'About' nếu chưa có bio
  if (!bio) {
    const pageAboutSections = Array.from(document.querySelectorAll(
      'div[data-pagelet*="PageAbout"], div[data-pagelet*="PageInfo"], div[data-pagelet*="PageIntro"]'
    ));
    for (const sec of pageAboutSections) {
      const secText = (sec.innerText || '').trim();
      // Tách phần bio thực sự - bỏ qua các dòng chỉ là số followers, links, labels
      const lines = secText.split('\n').map(l => l.trim()).filter(l =>
        l.length >= 10 &&
        !/^(?:\d+[KkMm]?\s*(?:người|followers|lượt|likes|đánh giá|reviews)|(?:Giới thiệu|About|Intro|Information|Thông tin|Category|Danh mục|Website|Phone|Email|Address|Địa chỉ|Liên kết|Links)$)/i.test(l) &&
        !isFacebookUIString(l)
      );
      if (lines.length > 0) { bio = lines[0]; break; }
    }
  }

  // 5.3 Quét regex đa ngôn ngữ trên toàn bộ văn bản (hỗ trợ Giới thiệu / Intro / About / 简介)
  if (!bio) {
    const mBioText = text.match(/(?:Giới thiệu|Intro|About|简介)\s*\n+([\s\S]{5,500}?)(?:\n\s*(?:Chi tiết|Details|Ảnh|Photos|Đáng chú ý|Featured|Bài viết|Posts|详细信息|照片|精选|帖子|Chỉnh sửa|Edit|编辑|Quản lý|Manage))/i);
    if (mBioText && mBioText[1]) {
      let cand = mBioText[1].trim();
      if (!/^(?:chỉnh sửa|edit|编辑|thêm tiểu sử|add bio|添加个人简介)/i.test(cand) && cand.length >= 8) {
        bio = cand;
      }
    }
  }

  // =========================================================================
  // 6. QUÉT HẠNG MỤC TRANG (CATEGORY) - HỖ TRỢ VI, EN, ZH
  // =========================================================================
  if (!category) {
    const mCat = text.match(/(?:Page|Trang|主页)\s*[·•:—–-]\s*([^\n\r·•]{3,50})/i) ||
      fullHtml.match(/["\\]*(?:category_name|page_category|primary_category)["\\]*\s*:\s*"([^"]+)"/i);
    if (mCat) category = mCat[1].trim();
  }

  // =========================================================================
  // 7. DEEP BIO SCRAPING: QUÉT SÂU BIO, INTRO VÀ BÀI ĐĂNG GẦN NHẤT TÌM BIO & AMAZON
  // =========================================================================
  const targetScanTexts = [
    bio,
    introContainer ? introContainer.innerText : '',
    text
  ];
  for (const st of targetScanTexts) {
    if (!st) continue;
    // Tìm các đường dẫn bio tổng hợp (linktr.ee, hoo.be, direct.me, msha.ke...)
    const bFound = extractBioAggregatorLinks(st);
    for (const b of bFound) {
      if (!bio_links.includes(b)) bio_links.push(b);
    }
    // Tìm trực tiếp link Amazon trong text
    const amzInText = st.match(/https?:\/\/(?:www\.)?(?:amazon\.[a-z.]+|amzn\.to|a\.co)\/[^\s"'>]+/gi);
    if (amzInText) {
      for (const rawA of amzInText) {
        const validA = sanitizeAndValidateAmazonUrl(rawA);
        if (validA && !validAmazonUrlsList.includes(validA)) {
          validAmazonUrlsList.push(validA);
        }
      }
    }
  }

  // Quét bài viết đầu tiên trên feed (tìm link Amazon hoặc Linktree đính kèm bài đăng)
  const firstArticle = document.querySelector('div[role="article"]');
  if (firstArticle) {
    const artLinks = Array.from(firstArticle.querySelectorAll('a[href]'));
    for (const al of artLinks) {
      let aHref = al.getAttribute('href') || al.href || '';
      if (/(?:l|lm)\.facebook\.com\/l\.php/i.test(aHref) || aHref.includes('/l.php?u=')) {
        try {
          const u = new URL(aHref, window.location.origin);
          const real = u.searchParams.get('u');
          if (real) aHref = decodeURIComponent(real);
        } catch (_) { }
      }
      const vAmz = sanitizeAndValidateAmazonUrl(aHref);
      if (vAmz && !validAmazonUrlsList.includes(vAmz)) {
        validAmazonUrlsList.push(vAmz);
      }
      const bArt = extractBioAggregatorLinks(aHref);
      for (const b of bArt) {
        if (!bio_links.includes(b)) bio_links.push(b);
      }
    }
  }

  // =========================================================================
  // 8. PHÂN LOẠI VÀ BẢO TOÀN AMAZON URL & WEBSITE (KHÔNG ĐỂ TRẮNG CẢ 2 CỘT)
  // =========================================================================
  if (validAmazonUrlsList.length > 0) {
    const scoreAmz = (u) => {
      const s = u.toLowerCase();
      if (s.includes('/shop/')) return 40;
      if (s.includes('/dp/') || s.includes('/gp/product/')) return 30;
      if (s.includes('/author/')) return 20;
      if (s.includes('/hz/wishlist/')) return 15;
      return 10;
    };
    validAmazonUrlsList.sort((a, b) => scoreAmz(b) - scoreAmz(a));
    amazon_url = validAmazonUrlsList.join(', ');
    has_amazon = true;

    // Nếu trang không có website riêng nào khác ngoài link Amazon:
    // Giữ link Amazon đầu tiên làm website Storefront để không bị mất trắng cả 2 cột trên CRM
    if (!website) {
      website = validAmazonUrlsList[0];
    }
  }

  return {
    phone,
    email,
    website,
    instagram,
    city,
    state,
    zip,
    address: (() => {
      let finalA = cleanAddressText(address);
      if (finalA) {
        if (bio && (finalA.toLowerCase().includes(bio.toLowerCase().slice(0, 25)) || bio.toLowerCase().includes(finalA.toLowerCase().slice(0, 25)))) {
          return '';
        }
        if (typeof isLikelyAddress === 'function' && !isLikelyAddress(finalA)) {
          return '';
        }
      }
      return finalA;
    })(),
    bio,
    category,
    country,
    amazon_url,
    has_amazon,
    bio_links,
    social_links
  };
}

/**
 * Xác định Chủ Trại / Người Đại Diện theo Thứ Bậc Ưu Tiên Tuyệt Đối:
 * 1. Chủ trại được xác thực trên Good Dog / Website chính thức (ví dụ: "Lisa Z.")
 * 2. Tên chủ trại trong Bio/About
 * 3. Tên sở hữu cách trong tên trại (Amy's Frenchtons -> Amy)
 * 4. Tên người Mỹ phổ biến ở đầu tên trại
 * 5. Tiền tố email cá nhân trước @ (ví dụ: roleezyorkies@gmail.com -> Roleez Yorkies)
 * 6. Fallback về Tên Facebook (KHÔNG BAO GIỜ dùng placeholder chung chung)
 */
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
    const badTokens = /State|Props|Component|Function|Error|Object|Boolean|Number|Array|Null|Undefined|Event|Kennel|Puppy|Puppies|Farm|Bulldog|Frenchie|Corgi|Doodle/i;
    if (candidate.length >= 2 && candidate.length <= 30 && !badTokens.test(candidate)) {
      return {
        owner: candidate,
        confidence: 'Tier 1 - High (Profile Bio / About Verified)'
      };
    }
  }

  const mPoss = (leadName || '').match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:'s|’s)\b/);
  if (mPoss && mPoss[1]) {
    const pName = mPoss[1].trim();
    if (!/kennel|puppy|puppies|farm|bulldog|frenchie|corgi|doodle/i.test(pName)) {
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

    let clean = userPart.replace(/\d+$/, '');
    const commonFirstNames = ['amanda', 'lisa', 'sarah', 'jessica', 'ashley', 'emily', 'hannah', 'katie', 'megan', 'rachel', 'lauren', 'nicole', 'amber', 'stephanie', 'amy', 'michelle', 'kristen', 'kelly', 'kimberly', 'erin', 'mary', 'jennifer', 'elizabeth', 'linda', 'john', 'robert', 'michael', 'david', 'james', 'charles', 'daniel'];
    for (const fn of commonFirstNames) {
      if (clean.startsWith(fn) && clean.length > fn.length + 2) {
        let remainder = clean.slice(fn.length).replace(/(ab|tx|usa|kennel|dogs|puppy|puppies|\d+)$/i, '').trim();
        const firstCap = fn.charAt(0).toUpperCase() + fn.slice(1);
        if (remainder.length >= 2) {
          return {
            owner: `${firstCap} ${remainder.charAt(0).toUpperCase() + remainder.slice(1)}`,
            confidence: 'Tier 2 - Medium-High (Email Prefix Name Match)'
          };
        }
        return {
          owner: firstCap,
          confidence: 'Tier 2 - Medium-High (Email Prefix Name Match)'
        };
      }
    }

    const cleanPrefix = clean.replace(/(yorkies|kennel|dogs|puppies|puppy|doodles|frenchies|corgis)/i, m => ' ' + m)
      .replace(/[._-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanPrefix.length >= 3 && !/^(info|sales|contact|support|hello|admin|office|team|puppy|puppies)$/i.test(cleanPrefix)) {
      const titleCase = cleanPrefix.replace(/\b\w/g, l => l.toUpperCase());
      return {
        owner: titleCase,
        confidence: 'Tier 2 - Medium (Email Prefix Match)'
      };
    }
  }

  if (leadName && leadName.trim()) {
    return {
      owner: leadName.trim(),
      confidence: 'Tier 3 - Medium (Facebook Page Name Fallback)'
    };
  }

  return {
    owner: 'Facebook User',
    confidence: 'Tier 3 - Fallback'
  };
}

/**
 * Kiểm tra xem một URL avatar có phải silhouette mặc định hoặc ảnh rác của Facebook không
 */
function isDefaultSilhouetteAvatar(url) {
  if (!url || typeof url !== 'string') return true;
  const lower = url.toLowerCase();
  return lower.includes('t1.30497-1') ||
    lower.includes('453178253_471506465671661') ||
    lower.includes('blank_profile') ||
    lower.includes('rsrc.php') ||
    lower.includes('default_avatar') ||
    lower.includes('default_profile') ||
    lower.includes('unavatar.io');
}

/**
 * Trích xuất Avatar HD thực tế từ DOM profile header, Relay GraphQL hoặc meta tags
 * Hỗ trợ trọn vẹn SVG Namespace xlink:href, el.href.baseVal, và không bị chặn bởi Graph API
 */
function extractProfileAvatar() {
  let found = '';

  // 0. Xác định avatar của người đang đăng nhập trên thanh điều hướng để loại trừ triệt để
  let viewerAvatar = '';
  try {
    const navImg = document.querySelector('div[role="banner"] image, div[role="banner"] img, div[role="navigation"] image, div[role="navigation"] img, header image');
    if (navImg) {
      viewerAvatar = navImg.href?.baseVal ||
        navImg.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
        navImg.getAttribute('xlink:href') ||
        navImg.getAttribute('href') ||
        navImg.currentSrc || navImg.src || '';
      viewerAvatar = viewerAvatar.replace(/ctp=[sp]\d+x\d+&?/, '').replace(/[&?]$/, '');
    }
  } catch (_) { }

  const isValidCandidate = (url) => {
    if (!url || typeof url !== 'string') return false;
    if (!url.startsWith('http')) return false;
    if (!url.includes('fbcdn.net') && !url.includes('fbsbx.com') && !url.includes('facebook.com')) return false;
    if (isDefaultSilhouetteAvatar(url)) return false;
    if (viewerAvatar && url === viewerAvatar) return false;
    return true;
  };

  const getElSrc = (el) => {
    if (!el) return '';
    const s = el.href?.baseVal ||
      el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
      el.getAttribute('xlink:href') ||
      el.getAttribute('href') ||
      el.currentSrc ||
      el.src || '';
    return s.replace(/ctp=[sp]\d+x\d+&?/, '').replace(/[&?]$/, '');
  };

  // 1. Quét trực tiếp ảnh đại diện trong vùng div[role="main"] (LOẠI TRỪ 100% role="banner" và header)
  try {
    const targetedSelectors = [
      'div[role="main"] svg g mask ~ image',
      'div[role="main"] svg mask image',
      'div[role="main"] svg image[preserveAspectRatio]',
      'div[role="main"] a[aria-label*="ảnh đại diện" i] image',
      'div[role="main"] a[aria-label*="profile picture" i] image',
      'div[role="main"] a[aria-label*="avatar" i] image',
      'div[role="main"] a[aria-label*="头像" i] image',
      'div[role="main"] a[aria-label*="头贴" i] image',
      'div[role="main"] div[role="button"][aria-label*="ảnh đại diện" i] image',
      'div[role="main"] div[aria-label*="Xem ảnh đại diện" i] image',
      'div[role="main"] div[aria-label*="Hành động với ảnh đại diện" i] image',
      'div[role="main"] svg[aria-label*="profile picture" i] image',
      'div[role="main"] svg[aria-label*="ảnh đại diện" i] image',
      'div[role="main"] svg image',
      'div[role="main"] img[src*="t39.30808-1"]',
      'div[role="main"] img[src*="t39.30808-6"]'
    ];

    for (const sel of targetedSelectors) {
      const els = Array.from(document.querySelectorAll(sel));
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        const docTop = rect.top + window.scrollY;
        if (docTop > 650) continue;
        const clean = getElSrc(el);
        if (isValidCandidate(clean)) {
          found = clean;
          break;
        }
      }
      if (found) break;
    }
  } catch (_) { }

  // 2. Thử các thẻ <img> hoặc <image> bất kỳ trong div[role="main"] nằm ở top < 550px
  if (!found) {
    try {
      const mainImgs = Array.from(document.querySelectorAll('div[role="main"] img, div[role="main"] image'));
      for (const img of mainImgs) {
        const rect = img.getBoundingClientRect();
        const docTop = rect.top + window.scrollY;
        if (docTop > 550) continue;
        const clean = getElSrc(img);
        if (isValidCandidate(clean)) {
          if (clean.includes('t39.30808') || clean.includes('t1.6435-9') || clean.includes('t1.18169-1')) {
            found = clean;
            break;
          }
        }
      }
    } catch (_) { }
  }

  // 3. Quét trong các thẻ <script> chứa Relay GraphQL profile_picture / profilePhoto
  if (!found) {
    try {
      const scripts = Array.from(document.querySelectorAll('script:not([src])'));
      for (const sc of scripts) {
        const txt = sc.textContent || '';
        if (!txt.includes('profile_picture') && !txt.includes('profilePhoto') && !txt.includes('profile_photo') && !txt.includes('t39.30808')) continue;
        const m = txt.match(/"profile_picture"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"/i) ||
          txt.match(/"profilePhoto"\s*:\s*\{[^}]*"uri"\s*:\s*"([^"]+)"/i) ||
          txt.match(/"profile_photo"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"/i) ||
          txt.match(/"(https?:\\\/\\\/[^"]*(?:fbcdn\.net|fbsbx\.com)[^"]*t39\.30808-[16][^"]*)"/i);
        if (m && m[1]) {
          let uri = m[1].replace(/\\u00253A/gi, ':').replace(/\\u00252F/gi, '/').replace(/\\u002526/gi, '&').replace(/\\\//g, '/');
          const clean = uri.replace(/ctp=[sp]\d+x\d+&?/, '').replace(/[&?]$/, '');
          if (isValidCandidate(clean)) {
            found = clean;
            break;
          }
        }
      }
    } catch (_) { }
  }

  // 4. Fallback: Thẻ meta og:image
  if (!found) {
    try {
      const ogImg = document.querySelector('meta[property="og:image"]')?.content || '';
      const clean = ogImg.replace(/ctp=[sp]\d+x\d+&?/, '').replace(/[&?]$/, '');
      if (isValidCandidate(clean)) {
        found = clean;
      }
    } catch (_) { }
  }

  return found;
}

/**
 * THAO TÁC NÂNG CAO: Tìm bài đăng gần nhất trên Feed, click vào ảnh hoặc video của bài viết,
 * mở Theater / Dialog để đọc timestamp gốc chính xác 100%, sau đó đóng lại an toàn.
 */
async function inspectLatestPostMediaForPublishTime() {
  const minTs = 1577836800; // 01/01/2020
  const nowSec = Math.floor(Date.now() / 1000);
  const maxTs = nowSec + 86400 * 2;

  try {
    // 1. Tìm các bài viết trên timeline (lấy bài đầu tiên hiển thị, kể cả bài ghim)
    const articles = Array.from(document.querySelectorAll(
      'div[role="feed"] div[role="article"], div[data-pagelet^="ProfileTimeline"] div[role="article"], div[data-pagelet^="FeedUnit_"], div[role="article"]'
    )).filter(el => {
      if (el.closest('header, nav, [role="navigation"], [role="banner"], [aria-label*="Thông báo"], [aria-label*="Notification"]')) return false;
      if (el.parentElement && el.parentElement.closest('div[role="article"]')) return false;
      const r = el.getBoundingClientRect();
      const docTop = r.top + window.scrollY;
      const textLen = (el.innerText || el.textContent || '').trim().length;
      return (el.offsetHeight > 50 || textLen > 25) && (docTop > 100 || r.top === 0 || textLen > 50);
    });

    if (articles.length === 0) {
      console.log('[FB Scraper] Chưa tìm thấy bài viết nào trên timeline.');
      return null;
    }

    // Chọn bài viết đầu tiên hiển thị trên timeline (Bài gần nhất / Bài đã ghim)
    let targetArticle = articles[0];

    // 2. TÌM TẤM ẢNH BÀI ĐĂNG (Photo Element):
    // Trên bài viết của Kayla Parrish, có tấm ảnh feedback lớn (chứa chữ 'Most relevant' và ảnh cún Golden)
    let postImg = targetArticle.querySelector('img[src*="fbcdn"]');
    if (!postImg) {
      const allImgs = Array.from(targetArticle.querySelectorAll('img')).filter(img => {
        const r = img.getBoundingClientRect();
        return r.width > 80 && r.height > 80;
      });
      if (allImgs.length > 0) postImg = allImgs[0];
    }

    // Tìm container click được của ảnh (thẻ a dẫn tới photo.php hoặc div[role="button"])
    let clickTarget = null;
    if (postImg) {
      clickTarget = postImg.closest('a[href*="/photo"], a[href*="fbid="], a[href*="photo.php"]') ||
        postImg.closest('div[role="button"]') ||
        postImg.parentElement ||
        postImg;
    }

    // Nếu không có ảnh, tìm thẻ link thời gian bài viết
    if (!clickTarget) {
      const timeAnchor = targetArticle.querySelector(
        'a[role="link"][href*="/posts/"], a[role="link"][href*="permalink"], a[role="link"][href*="story"], a[role="link"]'
      );
      clickTarget = timeAnchor;
    }

    // 3. HIỆU ỨNG TRỰC QUAN CHO NGƯỜI DÙNG:
    // Cuộn tấm ảnh / bài viết vào giữa màn hình và tạo viền phát sáng xanh neon
    const scrollTarget = postImg || targetArticle;
    try {
      scrollTarget.scrollIntoView({ behavior: 'auto', block: 'center' });
      if (postImg) {
        postImg.style.outline = '4px solid #38bdf8';
        postImg.style.boxShadow = '0 0 30px rgba(56, 189, 248, 0.9)';
        postImg.style.borderRadius = '8px';
        postImg.style.transition = 'all 0.3s ease';
      } else {
        targetArticle.style.outline = '4px solid #38bdf8';
        targetArticle.style.boxShadow = '0 0 30px rgba(56, 189, 248, 0.9)';
        targetArticle.style.borderRadius = '12px';
      }
    } catch (_) { }

    const updateBanner = (txt, color = '#0284c7') => {
      const el = document.getElementById('funnel-status-badge');
      if (el) { el.innerText = txt; el.style.background = color; }
    };
    updateBanner('⚡ Đang bóc tách bài đăng gần nhất (Chế độ An toàn 100% không click popup)...', '#0284c7');

    // Bóc tách trực tiếp từ Header bài viết bằng DOM (TUYỆT ĐỐI KHÔNG CLICK VÀO ẢNH / COMMENT ĐỂ TRÁNH DÍNH POPUP VÀ TREO TAB)
    let extractedFromMedia = extractTimeFromArticleElement(targetArticle);

    // Tự động xóa viền sáng
    if (postImg) {
      postImg.style.outline = '';
      postImg.style.boxShadow = '';
    }
    if (targetArticle) {
      targetArticle.style.outline = '';
      targetArticle.style.boxShadow = '';
    }

    // 5. ĐỐI CHIẾU VỚI RELAY GRAPHQL STORIES (Lấy max giữa Pinned Post và Feed Units/Reels)
    let finalTs = extractedFromMedia ? extractedFromMedia.timestamp : null;
    let postTypeTag = '';
    try {
      const relayTimes = extractRelayFeedAndPinnedTimestamps(currentProfileId);
      const rMax = Math.max(relayTimes.pinnedTs || 0, relayTimes.latestFeedTs || 0);
      if (rMax > 0) {
        if (rMax === relayTimes.pinnedTs && relayTimes.pinnedTs > (relayTimes.latestFeedTs || 0)) {
          postTypeTag = ' (Pinned)';
        } else if (rMax === relayTimes.latestFeedTs) {
          postTypeTag = ' (Reels/Feed)';
        }
        if (!finalTs || rMax > finalTs) {
          finalTs = rMax;
        }
      }
    } catch (_) { }

    if (finalTs && finalTs >= minTs && finalTs <= maxTs) {
      const dt = new Date(finalTs * 1000);
      const pad = n => String(n).padStart(2, '0');
      const formattedDate = `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}${postTypeTag}`;
      const relText = `${formatRelativeTime(finalTs)}${postTypeTag}`;
      const diffDays = Math.floor(Math.max(0, nowSec - finalTs) / 86400);
      const actStatus = diffDays <= 60 ? '✓ TÍCH CỰC (Trại đang hoạt động)' : '⚠️ ÍT HOẠT ĐỘNG (> 60 ngày)';

      console.log(`[FB Scraper] 🏆 Bóc tách thành công bài đăng gần nhất: ${formattedDate} (${relText})`);
      return {
        timestamp: finalTs,
        publishTime: formattedDate,
        relativeTime: relText,
        activityStatus: actStatus,
        isoTime: dt.toISOString(),
        fromMediaClick: true
      };
    }
  } catch (err) {
    console.warn('[FB Scraper] Lỗi khi inspect bài đăng:', err);
  }

  return null;
}

/**
 * Bóc tách riêng Thời gian đăng & Hậu trường thuật toán của Facebook Reels (EntVideoCreationStory)
 * Phục vụ phân tích nội dung Viral toàn cầu theo yêu cầu của Sếp (Reverse Engineering Facebook Reels)
 */
function extractFacebookReelViralInsights() {
  const nowSec = Math.floor(Date.now() / 1000);
  const minTs = 1577836800; // 01/01/2020
  const maxTs = nowSec + 60;
  const pad = n => String(n).padStart(2, '0');
  const formatDt = (ts) => {
    if (!ts) return 'Chưa có Reels';
    const dt = new Date(ts * 1000);
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  };

  let reelCandidates = [];

  // 1. Quét trong <script> JSON của Facebook để lấy dữ liệu hậu trường EntVideoCreationStory
  try {
    const scripts = Array.from(document.querySelectorAll('script')).filter(s => {
      const t = s.textContent || '';
      return t.includes('EntVideoCreationStory') || t.includes('publish_time') || t.includes('playable_duration_in_ms');
    });

    for (const s of scripts) {
      const text = s.textContent || '';

      // Bắt các khối EntVideoCreationStory (chứa publish_time chuẩn xác từng giây của Reel)
      const videoStoryRegex = /"actor_id"\s*:\s*"(\d+)"[\s\S]{0,300}?"psn"\s*:\s*"EntVideoCreationStory"[\s\S]{0,200}?"publish_time"\s*:\s*(\d{9,11})/g;
      for (const m of text.matchAll(videoStoryRegex)) {
        const actorId = m[1];
        const ts = parseInt(m[2], 10);
        if (ts < minTs || ts > maxTs) continue;

        // Tìm thêm ngữ cảnh xung quanh khối script này để bóc tách video_id, thời lượng, caption, hashtag...
        const pos = m.index || 0;
        const windowStart = Math.max(0, pos - 2500);
        const windowEnd = Math.min(text.length, pos + 3500);
        const chunk = text.slice(windowStart, windowEnd);

        // Lấy video_id (Reel ID)
        const vidMatch = chunk.match(/"video_id"\s*:\s*"(\d+)"/) || chunk.match(/"id"\s*:\s*"(\d{12,20})"/);
        const videoId = vidMatch ? vidMatch[1] : '';

        // Lấy thời lượng video (ms -> giây)
        const durMatch = chunk.match(/"playable_duration_in_ms"\s*:\s*(\d+)/);
        const durationSec = durMatch ? Math.round(parseInt(durMatch[1], 10) / 1000) : 0;

        // Lấy Caption / Nội dung chữ của Reel
        let caption = '';
        const msgMatch = chunk.match(/"message"\s*:\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (msgMatch && msgMatch[1]) {
          try {
            caption = JSON.parse(`"${msgMatch[1]}"`);
          } catch (_) {
            caption = msgMatch[1];
          }
        }

        // Lấy số lượt phát / chia sẻ nếu có trong JSON
        const playMatch = chunk.match(/"play_count"\s*:\s*(\d+)/) || chunk.match(/"video_view_count"\s*:\s*(\d+)/);
        const playCount = playMatch ? parseInt(playMatch[1], 10) : 0;

        reelCandidates.push({
          reelTimestamp: ts,
          reelActorId: actorId,
          reelId: videoId,
          reelUrl: videoId ? `https://www.facebook.com/reel/${videoId}` : '',
          reelDurationSec: durationSec,
          reelCaption: caption,
          reelPlayCount: playCount
        });
      }
    }
  } catch (_) { }

  // 2. Bổ sung thông tin từ DOM nếu đang đứng trực tiếp trên trang /reel/ hoặc bài post có nhúng Reel
  try {
    const reelLinks = Array.from(document.querySelectorAll('a[href*="/reel/"], a[href*="/videos/"]'));
    const firstReelLink = reelLinks.find(a => /\/(reel|videos)\/\d+/.test(a.getAttribute('href') || ''));
    const domReelUrl = firstReelLink ? firstReelLink.href.split('?')[0] : (window.location.href.includes('/reel/') ? window.location.href.split('?')[0] : '');

    if (reelCandidates.length === 0 && domReelUrl) {
      // Fallback nếu Facebook chưa đổ script EntVideoCreationStory
      const vidIdMatch = domReelUrl.match(/\/(?:reel|videos)\/(\d+)/);
      reelCandidates.push({
        reelTimestamp: 0,
        reelActorId: '',
        reelId: vidIdMatch ? vidIdMatch[1] : '',
        reelUrl: domReelUrl,
        reelDurationSec: 0,
        reelCaption: '',
        reelPlayCount: 0
      });
    } else if (reelCandidates.length > 0 && !reelCandidates[0].reelUrl && domReelUrl) {
      reelCandidates[0].reelUrl = domReelUrl;
    }
  } catch (_) { }

  // 3. Tổng hợp kết quả trả về
  if (reelCandidates.length > 0) {
    const best = reelCandidates[0];
    const ts = best.reelTimestamp;
    const viralAgeDays = ts ? Math.max(0, Math.floor((nowSec - ts) / 86400)) : 0;

    // Tách tự động danh sách Hashtags từ Caption để Sếp dễ phân tích từ khóa xu hướng
    const hashtags = (best.reelCaption.match(/#[\p{L}\p{N}_]+/gu) || []).join(' ');

    return {
      hasReel: true,
      reelPublishTime: ts ? formatDt(ts) : 'Chưa rõ ngày',
      reelPublishTimestamp: ts,
      reelRelativeTime: ts && typeof formatRelativeTime === 'function' ? formatRelativeTime(ts) : '',
      reelViralAgeDays: viralAgeDays,
      reelViralBadge: ts
        ? (viralAgeDays >= 7 ? `🔥 Đề xuất bền bỉ (${viralAgeDays} ngày)` : `⚡ Mới lên xu hướng (${viralAgeDays} ngày)`)
        : 'Có Video/Reel',
      reelUrl: best.reelUrl,
      reelId: best.reelId,
      reelCreatorId: best.reelActorId,
      reelDuration: best.reelDurationSec ? `${best.reelDurationSec}s` : '',
      reelDurationSec: best.reelDurationSec || 0,
      reelCaption: best.reelCaption || '',
      reelHashtags: hashtags,
      reelPlayCount: best.reelPlayCount || 0
    };
  }

  return {
    hasReel: false,
    reelPublishTime: 'Không có Reel',
    reelPublishTimestamp: 0,
    reelRelativeTime: '',
    reelViralAgeDays: 0,
    reelViralBadge: 'Chưa có Reel',
    reelUrl: '',
    reelId: '',
    reelCreatorId: '',
    reelDuration: '',
    reelDurationSec: 0,
    reelCaption: '',
    reelHashtags: '',
    reelPlayCount: 0
  };
}

/**
 * Quy trình cào Toàn Diện: Publish Time + Toàn bộ Intro + Website Owner (Lisa Z.)
 */
async function scrapePublishTime(targetUrl, stt, taskId) {
  let url = targetUrl || window.location.href;

  // 1. Tạo thanh thông báo trực quan trên đầu trang cho user theo dõi
  let banner = document.getElementById('fb-funnel-inspector-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'fb-funnel-inspector-banner';
    banner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            background: linear-gradient(90deg, #1e293b, #0f172a);
            color: #38bdf8;
            border-bottom: 2px solid #38bdf8;
            padding: 10px 18px;
            font-size: 13px;
            font-weight: 700;
            z-index: 9999999;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.6);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
    banner.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:18px;">🔍</span>
                <span><b>Facebook Intro & Funnel Inspector:</b> Đang quét thông tin Giới thiệu & Bài viết [Dòng #${stt || 1}]</span>
            </div>
            <div id="funnel-status-badge" style="background:#0284c7; color:#fff; padding:3px 10px; border-radius:12px; font-size:11px;">Đang cuộn nạp DOM sống...</div>
        `;
    document.body.prepend(banner);
  }

  const updateBadge = (txt, color = '#0284c7') => {
    const el = document.getElementById('funnel-status-badge');
    if (el) { el.innerText = txt; el.style.background = color; }
  };

  // 2. Lấy tên Profile / Fanpage & FB ID & Avatar
  let name = getProfileName();
  let fb_id = extractFacebookID();
  let avatarUrl = extractProfileAvatar();

  // 3. Cuộn mượt để kích hoạt nạp bài đăng gần nhất trên Feed
  window.scrollTo({ top: 850, behavior: 'auto' });
  await sleep(1400);
  window.scrollBy({ top: 450, behavior: 'auto' });
  await sleep(1000);

  // Cập nhật lại tên & avatar nếu DOM vừa nạp xong
  let refinedName = getProfileName();
  if (refinedName && refinedName !== 'Facebook User' && !isGarbageName(refinedName)) {
    name = refinedName;
  }
  if (!fb_id) {
    fb_id = extractFacebookID();
  }
  if (!avatarUrl) {
    avatarUrl = extractProfileAvatar();
  }

  updateBadge('⚡ Đang bóc tách bài đăng gần nhất (Chế độ An toàn 100% không click)...', '#0284c7');

  // 4. Bóc tách bài đăng gần nhất: An toàn 100%, không click ảnh/comment, chống treo tab
  let timeInfo = await inspectLatestPostMediaForPublishTime();

  // 4.1 Fallback quét DOM Feed & Relay JSON nếu bài viết chưa có timestamp
  if (!timeInfo || !timeInfo.timestamp) {
    updateBadge('Đang bóc tách Timestamps (Relay GraphQL & DOM Timeline)...', '#0284c7');
    timeInfo = extractFacebookPublishTimeDetailed();
  }

  let publishTime = timeInfo.publishTime || 'Chưa bóc tách';
  let publishTimestamp = timeInfo.timestamp || '';
  let relativeTime = timeInfo.relativeTime || '';
  let activityStatus = timeInfo.activityStatus || '✓ TÍCH CỰC (Trại đang hoạt động)';

  // 5. BÓC TÁCH TOÀN BỘ PHẦN GIỚI THIỆU / LIÊN HỆ / ĐỊA CHỈ TRÊN TRANG
  // 5.0 Bước ưu tiên: Extract nhanh từ DOM live (2 layout Facebook Page)
  updateBadge('⚡ Đang bóc tách DOM sections (Thông tin liên hệ, Liên kết, Giới thiệu)...', '#059669');
  const pageContacts = extractPageContactsFromDOM();
  console.log('[FB Scraper] extractPageContactsFromDOM:', JSON.stringify(pageContacts));

  let contacts = extractIntroAndContacts(name);
  // Merge kết quả DOM nhanh vào contacts (ưu tiên DOM nhanh vì chính xác hơn regex)
  for (const field of ['phone', 'email', 'website', 'instagram', 'bio', 'category', 'zip', 'address']) {
    if (!contacts[field] && pageContacts[field]) contacts[field] = pageContacts[field];
    // Ưu tiên kết quả DOM nếu contacts lấy được chuỗi rác ngắn hơn
    if (contacts[field] && pageContacts[field] && field === 'bio' && pageContacts[field].length > contacts[field].length) {
      contacts[field] = pageContacts[field];
    }
  }
  if (pageContacts.social_links && pageContacts.social_links.length > 0) {
    contacts.social_links = Array.from(new Set([...(contacts.social_links || []), ...pageContacts.social_links]));
  }

  // Facebook lazy-loads the contact card after the first scroll. Re-read it
  // once so email, website and location are not lost when the card appears late.
  await sleep(1800);
  // Re-scrape sau khi lazy-load hoàn tất
  const latePageContacts = extractPageContactsFromDOM();
  const lateContacts = extractIntroAndContacts(name);
  for (const field of ['phone', 'email', 'website', 'instagram', 'city', 'state', 'zip', 'address', 'bio', 'category', 'country']) {
    if (!contacts[field] && lateContacts[field]) contacts[field] = lateContacts[field];
    if (!contacts[field] && latePageContacts[field]) contacts[field] = latePageContacts[field];
  }
  contacts.bio_links = Array.from(new Set([...(contacts.bio_links || []), ...(lateContacts.bio_links || [])]));
  contacts.social_links = Array.from(new Set([
    ...(contacts.social_links || []),
    ...(lateContacts.social_links || []),
    ...(latePageContacts.social_links || [])
  ]));
  if (!contacts.amazon_url && lateContacts.amazon_url) {
    contacts.amazon_url = lateContacts.amazon_url;
    contacts.has_amazon = true;
  }

  // 5.1 FACEBOOK PAGE: Fetch tab /about để bổ sung dữ liệu bị thiếu (email, website, address, bio, category)
  // Dùng action FETCH_PAGE_ABOUT_HTML để fetch raw HTML có cookie session đang đăng nhập
  const missingFields = !contacts.email || !contacts.website || !contacts.bio || !contacts.address || !contacts.category;
  if (missingFields) {
    try {
      updateBadge('🔍 Đang fetch tab About để bổ sung dữ liệu...', '#7c3aed');
      let aboutUrl = '';
      if (window.location.href.includes('profile.php')) {
        try {
          const u = new URL(window.location.href);
          u.searchParams.set('sk', 'about');
          aboutUrl = u.toString();
        } catch (_) {
          aboutUrl = window.location.href.replace(/([?&])sk=[^&]*/, '') + '&sk=about';
        }
      } else {
        aboutUrl = window.location.origin + window.location.pathname.replace(/\/$/, '') + '/about';
      }
      const aboutRes = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'FETCH_PAGE_ABOUT_HTML',
          url: aboutUrl
        }, response => resolve(response || {}));
      });


      if (aboutRes && aboutRes.ok && aboutRes.html) {
        // Parse thông tin từ HTML của tab About
        const aHtml = aboutRes.html;

        // Email từ About
        if (!contacts.email) {
          const mAboutEmail = aHtml.match(/mailto:([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/) ||
            aHtml.match(/"email"\s*:\s*"([^"]+@[^"]+\.[a-zA-Z]{2,})"/);
          if (mAboutEmail && isValidEmail(mAboutEmail[1])) contacts.email = mAboutEmail[1].toLowerCase();
        }

        // Website từ About
        if (!contacts.website) {
          const mAboutWeb = aHtml.match(/"(?:website|external_url|page_website)"\s*:\s*"(https?:\/\/[^"]{5,200})"/);
          if (mAboutWeb && isValidWebsite(mAboutWeb[1])) contacts.website = mAboutWeb[1];
        }

        // Phone từ About
        if (!contacts.phone) {
          const mAboutPhone = aHtml.match(/tel:([\d+\s().-]{7,20})/) ||
            aHtml.match(/"(?:phone|telephone|page_phone)"\s*:\s*"([^"]+)"/);
          if (mAboutPhone) {
            const p = cleanPhone(mAboutPhone[1]);
            if (p) contacts.phone = p;
          }
        }

        // Address từ About
        if (!contacts.address) {
          const mAboutAddr = aHtml.match(/"(?:single_line_address|formatted_address)"\s*:\s*"([^"]{5,200})"/);
          if (mAboutAddr) contacts.address = mAboutAddr[1].replace(/\\/g, '').trim();
        }

        // Bio / Description từ About
        if (!contacts.bio) {
          const mAboutBio = aHtml.match(/"(?:description|about|page_about|blurb)"\s*:\s*"([^"]{10,600})"/);
          if (mAboutBio) {
            const candidate = mAboutBio[1].replace(/\\n/g, ' ').replace(/\\/g, '').trim();
            if (candidate.length >= 10) contacts.bio = candidate;
          }
        }

        // Category từ About
        if (!contacts.category) {
          const mAboutCat = aHtml.match(/"(?:category_name|page_category|primary_category)"\s*:\s*"([^"]{2,80})"/);
          if (mAboutCat) contacts.category = mAboutCat[1].replace(/\\/g, '').trim();
        }

        // Instagram từ About
        if (!contacts.instagram) {
          const mAboutIg = aHtml.match(/instagram\.com\/([a-zA-Z0-9_.-]{3,30})/);
          if (mAboutIg) {
            const handle = mAboutIg[1].replace(/\/+$/, '').toLowerCase();
            if (handle.length >= 3 && !handle.endsWith('.com')) {
              contacts.instagram = `https://www.instagram.com/${handle}/`;
            }
          }
        }

        console.log('[FB Scraper] ✅ Đã bổ sung dữ liệu từ About tab');
      }
    } catch (eAbout) {
      console.warn('[FB Scraper] Không fetch được About tab:', eAbout);
    }
  }

  // 5. NẾU CÓ WEBSITE (ĐẶC BIỆT LÀ GOOD DOG): GỌI BACKGROUND FETCH ĐỂ TÌM CHỦ TRẠI (ví dụ: Lisa Z.)
  let webOwnerName = '';
  if (contacts.website) {
    try {
      const webRes = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          action: 'FETCH_EXTERNAL_URL',
          url: contacts.website
        }, (response) => {
          resolve(response || {});
        });
      });

      if (webRes && webRes.ok) {
        if (webRes.owner || webRes.breederName) {
          webOwnerName = webRes.owner || webRes.breederName;
        }
        if (webRes.phone && !contacts.phone) contacts.phone = webRes.phone;
        if (webRes.email && !contacts.email) contacts.email = webRes.email;
        if (webRes.address && !contacts.address) contacts.address = webRes.address;
        if (webRes.city && !contacts.city) contacts.city = webRes.city;
        if (webRes.state && !contacts.state) contacts.state = webRes.state;
        if (webRes.zip && !contacts.zip) contacts.zip = webRes.zip;
        if (webRes.country && (!contacts.country || contacts.country === 'United States')) contacts.country = webRes.country;
        if (webRes.has_amazon && webRes.amazon_url && !contacts.amazon_url) {
          contacts.amazon_url = webRes.amazon_url;
          contacts.has_amazon = true;
        }
      } else if (webRes && webRes.breederName) {
        webOwnerName = webRes.breederName;
        if (!contacts.city && webRes.city) contacts.city = webRes.city;
        if (!contacts.state && webRes.state) contacts.state = webRes.state;
        if (!contacts.zip && webRes.zip) contacts.zip = webRes.zip;
      }
    } catch (e) {
      console.warn('[FB Scraper] Lỗi khi fetch external website:', e);
    }
  }

  // 5.1 DEEP BIO SCRAPING: Nếu chưa tìm thấy Amazon và phát hiện link Bio (linktr.ee, hoo.be, direct.me, msha.ke)
  if (!contacts.amazon_url && contacts.bio_links && contacts.bio_links.length > 0) {
    const bioToVisit = contacts.bio_links.slice(0, 2);
    for (const bUrl of bioToVisit) {
      try {
        const bioRes = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            action: 'FETCH_EXTERNAL_URL',
            url: bUrl,
            isBioAggregator: true
          }, (response) => {
            resolve(response || {});
          });
        });
        if (bioRes && bioRes.has_amazon && bioRes.amazon_url) {
          contacts.amazon_url = bioRes.amazon_url;
          contacts.has_amazon = true;
          console.log(`[FB Scraper] 🎯 Đã tìm thấy link Amazon từ Bio aggregator (${bUrl}): ${contacts.amazon_url}`);
          break;
        }
      } catch (errBio) {
        console.warn('[FB Scraper] Lỗi fetch bio link:', errBio);
      }
    }
  }

  // 6. XÁC ĐỊNH CHỦ SỞ HỮU / NGƯỜI NHÂN GIỐNG THEO THỨ BẬC ƯU TIÊN
  let ownerInfo = extractOwnerRepresentative(name, contacts.email, document.documentElement.innerHTML, webOwnerName);

  // 7. BÓC TÁCH RIÊNG LUỒNG 2: HẬU TRƯỜNG THUẬT TOÁN FACEBOOK REELS (REVERSE ENGINEERING VIRAL REELS)
  let reelInsights = extractFacebookReelViralInsights();

  // Gửi kết quả hoàn chỉnh về background kèm taskId để khóa trùng lặp
  chrome.runtime.sendMessage({
    action: 'PROFILE_RESULT',
    data: {
      taskId: taskId,
      stt: stt,
      fb_id: fb_id,
      url: url,
      name: name,
      avatar_url: avatarUrl,
      owner: ownerInfo.owner,
      ownerConfidence: ownerInfo.confidence,
      phone: contacts.phone,
      email: contacts.email,
      website: contacts.website,
      instagram: contacts.instagram,
      social_links: contacts.social_links || [],
      city: contacts.city,
      state: contacts.state,
      zip: contacts.zip,
      address: contacts.address,
      has_amazon: Boolean(contacts.has_amazon),
      amazon_url: contacts.amazon_url || '',
      bio_links: contacts.bio_links || [],
      country: contacts.country || (contacts.state ? 'United States' : 'United States'),
      bio: contacts.bio,
      // Luồng 1: Bài đăng tường cá nhân (Dành cho Sales/CRM)
      publishTime: publishTime,
      publishTimestamp: publishTimestamp,
      relativeTime: relativeTime,
      // Luồng 2: Hậu trường Reels Viral (Dành cho R&D / Content Marketing bắt chước thuật toán)
      hasReel: Boolean(reelInsights && reelInsights.hasReel),
      reelPublishTime: reelInsights ? reelInsights.reelPublishTime : 'Không có Reel',
      reelPublishTimestamp: reelInsights ? reelInsights.reelPublishTimestamp : 0,
      reelRelativeTime: reelInsights ? reelInsights.reelRelativeTime : '',
      reelViralAgeDays: reelInsights ? reelInsights.reelViralAgeDays : 0,
      reelViralBadge: reelInsights ? reelInsights.reelViralBadge : 'Chưa có Reel',
      reelUrl: reelInsights ? reelInsights.reelUrl : '',
      reelId: reelInsights ? reelInsights.reelId : '',
      reelCreatorId: reelInsights ? reelInsights.reelCreatorId : '',
      reelDuration: reelInsights ? reelInsights.reelDuration : '',
      reelDurationSec: reelInsights ? reelInsights.reelDurationSec : 0,
      reelCaption: reelInsights ? reelInsights.reelCaption : '',
      reelHashtags: reelInsights ? reelInsights.reelHashtags : '',
      reelPlayCount: reelInsights ? reelInsights.reelPlayCount : 0
    }
  });
}

/**
 * Xuất file CSV dự phòng từ content script với đầy đủ 18 cột chuẩn
 */
function downloadCSV(dataArray, isPartial) {
  if (!dataArray || dataArray.length === 0) return;

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
  let csvContent = "\uFEFF" + headers.join(',') + '\n';

  dataArray.forEach((row, idx) => {
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
    csvContent += vals.join(',') + '\n';
  });

  let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  let url = URL.createObjectURL(blob);
  let a = document.createElement('a');
  a.href = url;
  let timestamp = new Date().getTime();
  a.download = `FB_Profile_Funnel_CRM_${isPartial ? 'Part_' : ''}${timestamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
