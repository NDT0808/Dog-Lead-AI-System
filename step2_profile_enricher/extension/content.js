if (window.location.origin.includes('127.0.0.1') || window.location.origin.includes('localhost')) {
    const announceReady = () => {
        window.postMessage({ type: 'PET_LEAD_EXT_READY', tool: 'fb_profile_funnel_scraper', version: '2.0.0' }, '*');
    };
    announceReady();
    setInterval(announceReady, 1500);

    // Relay scan requests from Web Dashboard to background.js
    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data) return;
        if (event.data.type === 'START_STEP2_SCAN_VIA_EXTENSION') {
            chrome.runtime.sendMessage({
                action: 'START_AUTO_FROM_DASHBOARD',
                urls: event.data.links,
                options: event.data.options
            });
        } else if (event.data.type === 'STOP_STEP2_SCAN_VIA_EXTENSION') {
            chrome.runtime.sendMessage({ action: 'STOP_AUTO' });
        } else if (event.data.type === 'RESUME_STEP2_SCAN_VIA_EXTENSION') {
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
    let isCurrentlyScraping = false;

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'START_SCRAPE') {
            if (isCurrentlyScraping) {
                console.log("[FB Scraper] Đang cào dở, bỏ qua lệnh START_SCRAPE trùng lặp.");
                sendResponse({ status: 'already_running' });
                return;
            }
            isCurrentlyScraping = true;
            scrapePublishTime(msg.targetUrl, msg.stt, msg.taskId)
                .finally(() => {
                    isCurrentlyScraping = false;
                });
            sendResponse({ status: 'started' });
        }
        else if (msg.action === 'TRIGGER_DOWNLOAD') {
            downloadCSV(msg.data, msg.isPartial);
            sendResponse({ status: 'ok' });
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
        }
    });
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

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
    let bodyText = document.body ? document.body.innerText : '';
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
    if (mainH1 && mainH1.innerText && !isGarbageName(mainH1.innerText)) {
        return mainH1.innerText.trim();
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
        if (h.innerText && !isGarbageName(h.innerText)) {
            return h.innerText.trim();
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
function parseRelativeTimeToTimestamp(relStr) {
    if (!relStr) return null;
    let s = relStr.trim();
    let sLower = s.toLowerCase();
    let now = new Date();
    let nowSec = Math.floor(now.getTime() / 1000);

    // 1. Vừa xong / Just now / 刚刚
    if (sLower.includes('vừa xong') || sLower.includes('just now') || s.includes('刚刚')) {
        return nowSec;
    }

    // 2. Hôm qua / Yesterday / 昨天
    let yestM = sLower.match(/(?:hôm qua|yesterday|昨天)\s*(?:lúc|at)?\s*(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i);
    if (yestM) {
        let d = new Date(now);
        d.setDate(d.getDate() - 1);
        let hour = parseInt(yestM[1], 10);
        let min = parseInt(yestM[2], 10);
        if (yestM[3] && yestM[3].toLowerCase() === 'pm' && hour < 12) hour += 12;
        if (yestM[3] && yestM[3].toLowerCase() === 'am' && hour === 12) hour = 0;
        d.setHours(hour, min, 0, 0);
        return Math.floor(d.getTime() / 1000);
    }
    if (sLower.includes('hôm qua') || sLower.includes('yesterday') || s.includes('昨天')) {
        return nowSec - 86400;
    }

    // 3. Hôm nay / Today / 今天
    let todayM = sLower.match(/(?:hôm nay|today|今天)\s*(?:lúc|at)?\s*(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i);
    if (todayM) {
        let d = new Date(now);
        let hour = parseInt(todayM[1], 10);
        let min = parseInt(todayM[2], 10);
        if (todayM[3] && todayM[3].toLowerCase() === 'pm' && hour < 12) hour += 12;
        if (todayM[3] && todayM[3].toLowerCase() === 'am' && hour === 12) hour = 0;
        d.setHours(hour, min, 0, 0);
        return Math.floor(d.getTime() / 1000);
    }

    // 4. Trung: 2025年8月15日 hoặc 10月14日 14:30
    let cnDateM = s.match(/(?:(\d{4})年)?\s*(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{2}))?/);
    if (cnDateM) {
        let year = cnDateM[1] ? parseInt(cnDateM[1], 10) : now.getFullYear();
        let month = parseInt(cnDateM[2], 10) - 1;
        let day = parseInt(cnDateM[3], 10);
        let hour = cnDateM[4] ? parseInt(cnDateM[4], 10) : 12;
        let min = cnDateM[5] ? parseInt(cnDateM[5], 10) : 0;
        let d = new Date(year, month, day, hour, min, 0);
        return Math.floor(d.getTime() / 1000);
    }

    // 5. Việt: 14 tháng 10 lúc 14:30 hoặc 19 thg 10 hoặc 15 tháng 8, 2025
    let viDateM = sLower.match(/(\d{1,2})\s+(?:tháng|thg)\s+(\d{1,2})(?:,?\s*(\d{4}))?(?:\s+lúc\s+(\d{1,2}):(\d{2}))?/i);
    if (viDateM) {
        let day = parseInt(viDateM[1], 10);
        let month = parseInt(viDateM[2], 10) - 1;
        let year = viDateM[3] ? parseInt(viDateM[3], 10) : now.getFullYear();
        let hour = viDateM[4] ? parseInt(viDateM[4], 10) : 12;
        let min = viDateM[5] ? parseInt(viDateM[5], 10) : 0;
        let d = new Date(year, month, day, hour, min, 0);
        return Math.floor(d.getTime() / 1000);
    }

    // 6. Anh: October 14 at 2:30 PM hoặc Oct 14, 2025
    let enDateM1 = sLower.match(/([a-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?(?:\s+at\s+(\d{1,2}):(\d{2}))?(?:\s*(am|pm))?/i);
    if (enDateM1 && MONTH_MAP[enDateM1[1]] !== undefined) {
        let month = MONTH_MAP[enDateM1[1]];
        let day = parseInt(enDateM1[2], 10);
        let year = enDateM1[3] ? parseInt(enDateM1[3], 10) : now.getFullYear();
        let hour = enDateM1[4] ? parseInt(enDateM1[4], 10) : 12;
        let min = enDateM1[5] ? parseInt(enDateM1[5], 10) : 0;
        if (enDateM1[6] && enDateM1[6].toLowerCase() === 'pm' && hour < 12) hour += 12;
        if (enDateM1[6] && enDateM1[6].toLowerCase() === 'am' && hour === 12) hour = 0;
        let d = new Date(year, month, day, hour, min, 0);
        return Math.floor(d.getTime() / 1000);
    }

    let enDateM2 = sLower.match(/(\d{1,2})\s+([a-z]+)(?:,?\s*(\d{4}))?(?:\s+at\s+(\d{1,2}):(\d{2}))?(?:\s*(am|pm))?/i);
    if (enDateM2 && MONTH_MAP[enDateM2[2]] !== undefined) {
        let day = parseInt(enDateM2[1], 10);
        let month = MONTH_MAP[enDateM2[2]];
        let year = enDateM2[3] ? parseInt(enDateM2[3], 10) : now.getFullYear();
        let hour = enDateM2[4] ? parseInt(enDateM2[4], 10) : 12;
        let min = enDateM2[5] ? parseInt(enDateM2[5], 10) : 0;
        if (enDateM2[6] && enDateM2[6].toLowerCase() === 'pm' && hour < 12) hour += 12;
        if (enDateM2[6] && enDateM2[6].toLowerCase() === 'am' && hour === 12) hour = 0;
        let d = new Date(year, month, day, hour, min, 0);
        return Math.floor(d.getTime() / 1000);
    }

    // 7. Tương đối: Phút
    let minM = s.match(/(\d+)\s*(?:phút|min|mins|m|分钟)(?:[\s·•\-_,]|trước|ago|前|$)/i);
    if (minM) return nowSec - parseInt(minM[1], 10) * 60;

    // Giờ
    let hrM = s.match(/(\d+)\s*(?:giờ|hour|hours|hr|hrs|h|小时)(?:[\s·•\-_,]|trước|ago|前|$)/i);
    if (hrM) return nowSec - parseInt(hrM[1], 10) * 3600;

    // Ngày
    let dayM = s.match(/(\d+)\s*(?:ngày|day|days|d|天)(?:[\s·•\-_,]|trước|ago|前|$)/i);
    if (dayM) return nowSec - parseInt(dayM[1], 10) * 86400;

    // Tuần
    let wkM = s.match(/(\d+)\s*(?:tuần|week|weeks|w|周|星期)(?:[\s·•\-_,]|trước|ago|前|$)/i);
    if (wkM) return nowSec - parseInt(wkM[1], 10) * 7 * 86400;

    // Tháng
    let moM = s.match(/(\d+)\s*(?:tháng|month|months|mo|mos|个月)(?:[\s·•\-_,]|trước|ago|前|$)/i);
    if (moM) return nowSec - parseInt(moM[1], 10) * 30 * 86400;

    // Năm
    let yrM = s.match(/(\d+)\s*(?:năm|year|years|yr|yrs|y|年)(?:[\s·•\-_,]|trước|ago|前|$)/i);
    if (yrM) return nowSec - parseInt(yrM[1], 10) * 365 * 86400;

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
    const t = txt.toLowerCase();
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
        t.includes('notifications') ||
        t.includes('bình luận')
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
function extractTimeFromArticleElement(article) {
    if (!article || isNotificationOrGarbageElement(article)) return null;

    // 1. Kiểm tra thuộc tính data-utime (Facebook mobile / touch / một số desktop build)
    const utimeEls = article.querySelectorAll('[data-utime]');
    for (const el of utimeEls) {
        if (isNotificationOrGarbageElement(el)) continue;
        const u = parseInt(el.getAttribute('data-utime'), 10);
        if (u && u > 1577836800 && u <= Math.floor(Date.now() / 1000) + 86400) {
            return {
                timestamp: u,
                publishTime: formatTimestampToDate(u),
                relativeTime: formatRelativeTime(u)
            };
        }
    }

    // 2. Kiểm tra các thẻ link timestamp đặc trưng của Facebook trong phần header bài viết
    const candidateLinks = Array.from(article.querySelectorAll(
        'a[href*="/posts/"], a[href*="permalink.php"], a[href*="story_fbid="], ' +
        'a[href*="/videos/"], a[href*="/photo"], a[href*="/reel/"], a[role="link"]'
    )).filter(a => !isNotificationOrGarbageElement(a));

    for (const a of candidateLinks) {
        // 2.1 Kiểm tra aria-label trên thẻ a
        const aria = a.getAttribute('aria-label');
        if (aria && !isNotificationOrCommentGarbage(aria)) {
            const timeStr = extractTimeFromText(aria);
            if (timeStr) {
                const ts = parseRelativeTimeToTimestamp(timeStr);
                if (ts && ts > 1577836800) {
                    return { relativeTime: formatRelativeTime(ts), timestamp: ts, publishTime: formatTimestampToDate(ts) };
                }
            }
        }

        // 2.2 Kiểm tra innerText trên thẻ a
        const txt = (a.innerText || '').trim();
        if (txt && !isNotificationOrCommentGarbage(txt)) {
            const timeStr = extractTimeFromText(txt);
            if (timeStr) {
                const ts = parseRelativeTimeToTimestamp(timeStr);
                if (ts && ts > 1577836800) {
                    return { relativeTime: formatRelativeTime(ts), timestamp: ts, publishTime: formatTimestampToDate(ts) };
                }
            }
        }
    }

    // 3. Quét các thẻ abbr, span[dir="auto"], span trong vùng đầu của article (giới hạn 15 phần tử đầu bài viết)
    const spans = Array.from(article.querySelectorAll('abbr, span[dir="auto"], span')).slice(0, 15);
    for (const s of spans) {
        if (isNotificationOrGarbageElement(s)) continue;
        const aria = s.getAttribute('aria-label');
        if (aria && !isNotificationOrCommentGarbage(aria)) {
            const timeStr = extractTimeFromText(aria);
            if (timeStr) {
                const ts = parseRelativeTimeToTimestamp(timeStr);
                if (ts && ts > 1577836800) {
                    return { relativeTime: formatRelativeTime(ts), timestamp: ts, publishTime: formatTimestampToDate(ts) };
                }
            }
        }
        const txt = (s.innerText || '').trim();
        if (txt && txt.length < 50 && !isNotificationOrCommentGarbage(txt)) {
            const timeStr = extractTimeFromText(txt);
            if (timeStr) {
                const ts = parseRelativeTimeToTimestamp(timeStr);
                if (ts && ts > 1577836800) {
                    return { relativeTime: formatRelativeTime(ts), timestamp: ts, publishTime: formatTimestampToDate(ts) };
                }
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

    // 1. Tìm các article hoặc khối post trong timeline
    let articles = Array.from(document.querySelectorAll('div[role="article"], div[data-pagelet^="FeedUnit_"], div[data-pagelet^="ProfileTimeline"] div[role="article"]')).filter(el => {
        if (isNotificationOrGarbageElement(el)) return false;
        let r = el.getBoundingClientRect();
        let docTop = r.top + window.scrollY;
        return el.offsetHeight > 50 && docTop > 100;
    });

    articles.sort((a, b) => {
        let topA = a.getBoundingClientRect().top + window.scrollY;
        let topB = b.getBoundingClientRect().top + window.scrollY;
        return topA - topB;
    });

    for (let i = 0; i < Math.min(articles.length, 10); i++) {
        let article = articles[i];
        let articleText = (article.innerText || '').toLowerCase();
        
        // Kiểm tra xem bài có nằm trong mục ghim / đáng chú ý / featured không
        let isPinned = /(?:đã ghim|pinned post|pinned|置顶|置顶帖子|đáng chú ý|featured|highlights)/i.test(articleText);
        // Kiểm tra heading cha gần nhất
        let parentSection = article.closest('div[role="feed"], div[data-pagelet^="ProfileTimeline"]');
        let headerText = parentSection ? (parentSection.innerText || '').slice(0, 150).toLowerCase() : '';
        if (headerText.includes('đáng chú ý') && i === 0) {
            isPinned = true;
        }

        let articleTime = extractTimeFromArticleElement(article);
        if (articleTime && articleTime.timestamp >= minTs && articleTime.timestamp <= maxTs) {
            candidates.push({
                ...articleTime,
                isPinned: isPinned
            });
        }
    }

    // 2. Quét các link bài viết có href đặc trưng trên toàn feed chính
    let candidateLinks = Array.from(document.querySelectorAll(
        'div[role="main"] a[href*="/posts/"], div[role="main"] a[href*="permalink.php"], div[role="main"] a[href*="story_fbid="], div[role="main"] a[href*="/videos/"]'
    )).filter(el => {
        if (isNotificationOrGarbageElement(el)) return false;
        let r = el.getBoundingClientRect();
        let docTop = r.top + window.scrollY;
        return docTop > 300;
    });

    for (let el of candidateLinks) {
        let txt = el.getAttribute('aria-label') || el.innerText || '';
        if (!txt || isNotificationOrCommentGarbage(txt)) continue;
        let timeStr = extractTimeFromText(txt);
        if (timeStr) {
            let ts = parseRelativeTimeToTimestamp(timeStr);
            if (ts && ts >= minTs && ts <= maxTs) {
                candidates.push({
                    relativeTime: formatRelativeTime(ts),
                    timestamp: ts,
                    publishTime: formatTimestampToDate(ts),
                    isPinned: false
                });
            }
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
    const maxTs = nowSec + 60; // Tuyệt đối không nhận tương lai (chặn triệt để các mã token hệ thống/cache invalidation)

    let domCandidates = [];

    // 1. ƯU TIÊN SỐ 1 (GROUND TRUTH): Quét trực tiếp các bài viết thực tế đang hiển thị trên DOM timeline
    try {
        const foundDom = findAllPostTimesInDOM();
        for (const c of foundDom) {
            if (c.timestamp && c.timestamp >= minTs && c.timestamp <= maxTs) {
                domCandidates.push({
                    timestamp: c.timestamp,
                    source: 'dom',
                    isPinned: c.isPinned || false,
                    relativeTime: c.relativeTime,
                    publishTime: c.publishTime
                });
            }
        }
    } catch (_) {}

    // 2. Quét thuộc tính data-utime trên các bài viết trong feed chính
    try {
        const utimeEls = document.querySelectorAll('div[role="main"] div[role="article"] [data-utime], div[role="feed"] [data-utime]');
        for (const el of utimeEls) {
            if (isNotificationOrGarbageElement(el)) continue;
            const u = parseInt(el.getAttribute('data-utime'), 10);
            if (u >= minTs && u <= maxTs) {
                domCandidates.push({
                    timestamp: u,
                    source: 'utime',
                    isPinned: false
                });
            }
        }
    } catch (_) {}

    let chosenCandidate = null;

    // Nếu DOM timeline đã có bài viết thực tế -> DÙNG NGAY, TUYỆT ĐỐI KHÔNG ĐỂ SCRIPT CHÈM LÊN!
    if (domCandidates.length > 0) {
        const nonPinned = domCandidates.filter(c => !c.isPinned);
        const targetPool = nonPinned.length > 0 ? nonPinned : domCandidates;
        targetPool.sort((a, b) => b.timestamp - a.timestamp);
        chosenCandidate = targetPool[0];
    } else {
        // 3. FALLBACK DUY NHẤT: Khi timeline DOM chưa nạp kịp bài đăng nào, mới quét script tags
        let scriptCandidates = [];
        try {
            const scripts = Array.from(document.querySelectorAll('script')).filter(s => {
                const t = s.textContent || '';
                return t.includes('post_context') || t.includes('creation_story');
            });

            const postRegexList = [
                /["\\]*post_context["\\]*[\s\S]{0,300}?["\\]*publish_time["\\]*\s*:\s*(\d{9,11})/g,
                /["\\]*creation_story["\\]*[\s\S]{0,400}?["\\]*(?:publish_time|creation_time)["\\]*\s*:\s*(\d{9,11})/g
            ];

            for (const s of scripts) {
                const text = s.textContent || '';
                for (const reg of postRegexList) {
                    for (const m of text.matchAll(reg)) {
                        const ts = parseInt(m[1], 10);
                        if (ts >= minTs && ts <= maxTs) {
                            scriptCandidates.push({
                                timestamp: ts,
                                source: 'script',
                                isPinned: false
                            });
                        }
                    }
                }
            }
        } catch (_) {}

        if (scriptCandidates.length > 0) {
            scriptCandidates.sort((a, b) => b.timestamp - a.timestamp);
            chosenCandidate = scriptCandidates[0];
        }
    }

    if (chosenCandidate) {
        const targetTs = chosenCandidate.timestamp;
        const dt = new Date(targetTs * 1000);
        const pad = n => String(n).padStart(2, '0');
        const formattedDate = `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;

        const diffSec = Math.max(0, nowSec - targetTs);
        const diffDays = Math.floor(diffSec / 86400);
        const relText = formatRelativeTime(targetTs);

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

    // Fallback nếu không có bài đăng nào được bóc tách
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

  // 1. Số Việt Nam (Đầu số +84 hoặc 0xxx xxx xxx)
  if (str.startsWith('+84') || str.startsWith('084') || /^(?:84|0)(?:3|5|7|8|9|2)\d{8}$/.test(digits) || (digits.length === 10 && digits.startsWith('0'))) {
    if (digits.startsWith('84') && (digits.length === 11 || digits.length === 12)) return digits;
    if (digits.startsWith('0') && digits.length === 10) return '84' + digits.slice(1);
    if (digits.length === 9) return '84' + digits;
    return digits;
  }

  // 2. Số Bắc Mỹ (US/Canada: 10 chữ số bắt đầu bằng 2-9 hoặc 11 chữ số bắt đầu bằng 1)
  if (digits.length === 10 && /^[2-9]/.test(digits)) {
    return '1' + digits; // Định dạng Bắc Mỹ 11 chữ số thuần: 1 + (Area Code) + (Number)
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return digits;
  }

  // 3. Số quốc tế khác có tiền tố +
  if (str.startsWith('+') && digits.length >= 8 && digits.length <= 15) {
    return digits;
  }

  return (digits.length >= 9 && digits.length <= 15) ? digits : '';
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

function isValidEmail(em) {
  if (!em) return false;
  const s = em.toLowerCase().trim();
  if (s.length < 6 || s.length > 70) return false;
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
  } catch (_) {}
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

/**
 * TRÍCH XUẤT TOÀN DIỆN MỌI TRƯỜNG TỪ PHẦN GIỚI THIỆU / INTRO / COMET SCRIPT DATA
 * Bóc tách đa tầng: Thẻ <script data-sjs> + Thẻ <a> giải mã Link Shim + Aria-labels + DOM TreeWalker
 * Tương thích 100% khi người dùng chuyển đổi ngôn ngữ (Tiếng Việt / English / 中文)
 */
function extractIntroAndContacts(leadName) {
  let text = document.body ? document.body.innerText : '';
  let fullHtml = document.documentElement ? document.documentElement.innerHTML : '';

  let phone = '';
  let email = '';
  let website = '';
  let websiteScore = 0;
  let instagram = '';
  let city = '';
  let state = '';
  let zip = '';
  let address = '';
  let bio = '';
  let category = '';

  // Thu thập nội dung script từ HTML của profile hiện tại để tránh lẫn lộn dữ liệu các profile trước
  const scriptSources = [fullHtml];

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
      /["\\]*(?:telephone|formatted_phone_number|profile_field_phone)["\\]*\s*:\s*"([^"]+)"/gi,
      /["\\]*phone_number["\\]*\s*:\s*\{[\s\S]{0,100}?["\\]*universal_number["\\]*\s*:\s*"([^"]+)"/gi
    ];
    for (const src of scriptSources) {
      if (!src || src.length < 20) continue;
      for (const reg of phoneJsonPatterns) {
        for (const m of src.matchAll(reg)) {
          const raw = m[1].replace(/\\/g, '').trim();
          if (/^(\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(raw)) {
            const p = cleanPhone(raw);
            if (p && !p.startsWith('0000000')) {
              phone = p;
              break;
            }
          }
        }
        if (phone) break;
      }
      if (phone) break;
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
  const mailtoLink = document.querySelector('a[href^="mailto:"]');
  if (mailtoLink) {
    const rawMail = decodeURIComponent((mailtoLink.getAttribute('href') || '').replace(/^mailto:/i, '').split('?')[0]);
    if (isValidEmail(rawMail)) email = rawMail.trim().toLowerCase();
  }

  // 2.2 Quét JSON GraphQL trong <script data-sjs>
  if (!email) {
    const emailJsonPatterns = [
      /["\\]*(?:email_address|profile_field_email)["\\]*\s*:\s*"([^"]+@[^"]+\.[a-zA-Z]{2,})"/gi,
      /["\\]*email["\\]*\s*:\s*"([^"]+@[^"]+\.[a-zA-Z]{2,})"/gi
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

  // =========================================================================
  // 3. QUÉT WEBSITE & INSTAGRAM (GIẢI MÃ LINK SHIM L.FACEBOOK.COM TRIỆT ĐỂ)
  // =========================================================================
  // 3.1 Ưu tiên hàng đầu: Quét trực tiếp khối "Liên kết" (Links / Website) trên giao diện Facebook
  const linkHeadings = Array.from(document.querySelectorAll('div[role="main"] span, div[role="main"] h3, div[role="main"] h4, div[role="main"] div')).filter(el => {
    const t = (el.innerText || '').trim();
    return /^(?:Liên kết|Links|Website|链接|Web)$/i.test(t) && el.children.length === 0;
  });

  for (const h of linkHeadings) {
    const sectionBox = h.closest('div.x1n2onr6, div.x9f619, div.x78zum5') || h.parentElement?.parentElement;
    if (sectionBox) {
      // Quét thẻ <a> trong khối liên kết
      const sectionLinks = Array.from(sectionBox.querySelectorAll('a[href]'));
      for (const a of sectionLinks) {
        let hf = a.getAttribute('href') || a.href || '';
        if (/(?:l|lm)\.facebook\.com\/l\.php/i.test(hf) || hf.includes('/l.php?u=') || hf.includes('/flx/warn/?u=')) {
          try {
            const u = new URL(hf, window.location.origin);
            const real = u.searchParams.get('u');
            if (real) hf = decodeURIComponent(real);
          } catch (_) {}
        }
        if (isValidWebsite(hf)) {
          website = hf.startsWith('http') ? hf : 'https://' + hf;
          websiteScore = 20;
          break;
        }
      }
      // Quét text tên miền trong khối liên kết nếu thẻ a bị che khuất
      if (!website) {
        const boxText = sectionBox.innerText || '';
        const mDomain = boxText.match(/\b([a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.(?:com|org|net|us|co|biz|info|site|online|store|shop|pet|care|vet|tech|me|io|ca|uk|dog|kennel|farm))\b/i);
        if (mDomain && isValidWebsite(mDomain[1])) {
          website = 'https://' + mDomain[1].toLowerCase().trim() + '/';
          websiteScore = 18;
        }
      }
    }
    if (website) break;
  }

  // 3.2 Quét toàn bộ khối Giới thiệu / Thông tin cá nhân
  let introContainer = document.querySelector('div[data-pagelet*="ProfileIntro"], div[data-pagelet*="Intro"], div[data-pagelet*="ProfileTilesFeed"]');
  if (!introContainer) {
    const headings = Array.from(document.querySelectorAll('h2, h3, h4, span, div')).filter(el => {
      const t = (el.innerText || '').trim();
      return /^(?:Giới thiệu|Intro|About|简介|Thông tin cá nhân|Personal info|Details|Chi tiết)$/i.test(t) && el.children.length === 0;
    });
    for (const h of headings) {
      const p = h.closest('div.x1n2onr6, div[role="main"] > div, div.x9f619');
      if (p) { introContainer = p; break; }
    }
  }
  if (!introContainer) introContainer = document.querySelector('div[role="main"]') || document.body;

  const allLinks = Array.from(introContainer.querySelectorAll('a[href]')).filter(a => {
    // Loại trừ tuyệt đối các link nằm trong bài viết (feed post), comment hoặc gợi ý
    if (a.closest('div[role="article"], div[data-pagelet*="FeedUnit"], div[data-pagelet*="Comment"]')) {
      return false;
    }
    return true;
  });

  for (let a of allLinks) {
    let href = a.getAttribute('href') || a.href || '';
    
    // GIẢI MÃ ĐẦY ĐỦ LINK SHIM l.facebook.com HOẶC lm.facebook.com HOẶC /l.php?u=
    if (/(?:l|lm)\.facebook\.com\/l\.php/i.test(href) || href.startsWith('/l.php?u=') || href.includes('/flx/warn/?u=')) {
      try {
        const u = new URL(href, window.location.origin);
        const real = u.searchParams.get('u');
        if (real) href = decodeURIComponent(real);
      } catch (_) {}
    }

    if (/instagram\.com\/([a-zA-Z0-9_.-]+)/i.test(href)) {
      const mIg = href.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/i);
      if (mIg && !['p', 'reel', 'stories', 'explore', 'about', 'accounts'].includes(mIg[1].toLowerCase())) {
        if (!instagram) instagram = `https://www.instagram.com/${mIg[1].replace(/\/+$/, '')}/`;
      }
    } else if (isValidWebsite(href)) {
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
      } catch (_) {}

      if (!website || candidateScore > (websiteScore || 0)) {
        website = cleanTarget;
        websiteScore = candidateScore;
      }
    }
  }

  // 3.3 Quét text toàn trang tìm tên miền nếu vẫn chưa có website
  if (!website) {
    const mainText = (introContainer.innerText || text || '');
    const mAllDomains = mainText.match(/\b([a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.(?:com|org|net|us|co|biz|info|site|online|store|shop|pet|care|vet|tech|me|io|ca|uk|dog|kennel|farm))\b/gi);
    if (mAllDomains) {
      for (const d of mAllDomains) {
        if (isValidWebsite(d)) {
          website = 'https://' + d.toLowerCase().trim() + '/';
          websiteScore = 6;
          break;
        }
      }
    }
  }

  // Quét JSON GraphQL cho Website nếu DOM Intro chưa có (Chỉ quét trên fullHtml của profile hiện tại)
  if (!website) {
    const jsonWebPatterns = [
      /["\\]*websites["\\]*\s*:\s*\[[\s\S]{0,180}?["\\]*url["\\]*\s*:\s*"([^"]+)"/gi,
      /["\\]*(?:website|external_url|external_link)["\\]*\s*:\s*"([^"]+)"/gi,
      /["\\]*profile_intro_card["\\]*[\s\S]{0,400}?["\\]*url["\\]*\s*:\s*"([^"]+)"/gi
    ];
    for (const reg of jsonWebPatterns) {
      for (const m of fullHtml.matchAll(reg)) {
        const cleanU = m[1].replace(/\\/g, '').replace(/\\u0025/g, '%');
        if (isValidWebsite(cleanU)) {
          website = cleanU;
          break;
        }
      }
      if (website) break;
    }
  }

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
  for (let a of allLinks) {
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
            const parts = address.split(',').map(p => p.trim()).filter(Boolean);
            for (const p of parts) {
              const mSt = p.match(/\b([A-Z]{2})\b(?:\s*(\d{5}))?/);
              if (mSt && US_STATE_CODES.has(mSt[1])) {
                state = mSt[1];
                if (mSt[2]) zip = mSt[2];
                if (!country) country = 'United States';
              }
            }
            if (parts.length >= 2 && !city && !/^-?\d+\.\d+/.test(parts[0])) {
              city = parts[0];
            }
          }
        }
      } catch (_) {}
      break;
    }
  }

  // Quét Địa chỉ từ Live DOM nếu where1 bị dính tọa độ (e.g. 30.66951) hoặc chưa có
  if (!address || /^-?\d+\.\d+/.test(address)) {
    const allSpans = Array.from(document.querySelectorAll('div[role="main"] span, div[data-pagelet*="Intro"] span, div.x1n2onr6 span'));
    for (const el of allSpans) {
      const t = (el.innerText || '').trim();
      if (t.length > 8 && t.length < 140 && /,?\s*(?:United States|USA|[A-Z]{2},?\s*\d{5}|Vietnam|Việt Nam|Hồ Chí Minh|Ho Chi Minh|Canada|Australia|United Kingdom)/i.test(t)) {
        const cleanDomAddr = cleanAddressText(t);
        if (cleanDomAddr) {
          address = cleanDomAddr;
          if (/Vietnam|Việt Nam|Hồ Chí Minh|Ho Chi Minh/i.test(cleanDomAddr)) {
            country = 'Vietnam';
            city = 'Hồ Chí Minh';
            state = 'Hồ Chí Minh';
            const mZipVn = cleanDomAddr.match(/\b(\d{5,6})\b/);
            if (mZipVn) zip = mZipVn[1];
          } else {
            const parts = cleanDomAddr.split(',').map(p => p.trim()).filter(Boolean);
            for (const p of parts) {
              const mSt = p.match(/\b([A-Z]{2})\b(?:\s*(\d{5}))?/);
              if (mSt && US_STATE_CODES.has(mSt[1])) {
                state = mSt[1];
                if (mSt[2]) zip = mSt[2];
                if (!country) country = 'United States';
              }
            }
            if (parts.length >= 2 && !city) {
              city = parts[0];
            }
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
  // 5.1 Quét JSON GraphQL
  for (const src of scriptSources) {
    if (!src || src.length < 20) continue;
    const mBioJson = src.match(/["\\]*(?:profile_intro_card|bio_text)["\\]*[\s\S]{0,250}?["\\]*text["\\]*\s*:\s*"([^"]{10,400})"/i);
    if (mBioJson) {
      bio = mBioJson[1].replace(/\\n/g, ' ').replace(/\\/g, '').trim();
      break;
    }
  }

  // 5.2 Quét trực tiếp từ DOM của khối introContainer
  if (!bio && introContainer) {
    const domBio = findBioFromIntroDOM(introContainer);
    if (domBio) {
      bio = domBio;
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
  const mCat = text.match(/(?:Page|Trang|主页)\s*[·•:—–-]\s*([^\n\r·•]{3,50})/i) ||
              fullHtml.match(/["\\]*category_name["\\]*\s*:\s*"([^"]+)"/i);
  if (mCat) category = mCat[1].trim();

  return { phone, email, website, instagram, city, state, zip, address: cleanAddressText(address), bio, category, country };
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
    } catch (_) {}

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
    } catch (_) {}

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
        } catch (_) {}
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
        } catch (_) {}
    }

    // 4. Fallback: Thẻ meta og:image
    if (!found) {
        try {
            const ogImg = document.querySelector('meta[property="og:image"]')?.content || '';
            const clean = ogImg.replace(/ctp=[sp]\d+x\d+&?/, '').replace(/[&?]$/, '');
            if (isValidCandidate(clean)) {
                found = clean;
            }
        } catch (_) {}
    }

    return found;
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

    // 3. Cuộn sâu qua khỏi vùng header (khoảng 900px) để Facebook kích hoạt nạp bài đăng timeline
    window.scrollTo({ top: 900, behavior: 'smooth' });
    await sleep(1500);
    window.scrollBy({ top: 600, behavior: 'smooth' });
    await sleep(1200);

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

    updateBadge('Đang bóc tách Bài viết & Timestamps...', '#f59e0b');

    // 4. Quét dãy số publish_time chính xác từ Relay/GraphQL JSON & DOM
    let timeInfo = extractFacebookPublishTimeDetailed();

    let publishTime = timeInfo.publishTime || 'Chưa bóc tách';
    let publishTimestamp = timeInfo.timestamp || '';
    let relativeTime = timeInfo.relativeTime || '';
    let activityStatus = timeInfo.activityStatus || '✓ TÍCH CỰC (Trại đang hoạt động)';

    // 4. BÓC TÁCH TOÀN BỘ PHẦN GIỚI THIỆU / LIÊN HỆ / ĐỊA CHỈ TRÊN TRANG
    let contacts = extractIntroAndContacts(name);

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

    // 6. XÁC ĐỊNH CHỦ SỞ HỮU / NGƯỜI NHÂN GIỐNG THEO THỨ BẬC ƯU TIÊN
    let ownerInfo = extractOwnerRepresentative(name, contacts.email, document.documentElement.innerHTML, webOwnerName);

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
            city: contacts.city,
            state: contacts.state,
            zip: contacts.zip,
            address: contacts.address,
            country: contacts.country || (contacts.state ? 'United States' : 'United States'),
            bio: contacts.bio,
            publishTime: publishTime,
            publishTimestamp: publishTimestamp,
            relativeTime: relativeTime
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
