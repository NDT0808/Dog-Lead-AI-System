// Pet Lead AI - Follower Harvester Content Script (Production Enhanced v3.3)
// Chuyên trách cào chính xác 100% tệp "Đang theo dõi" (Following) & "Người theo dõi" (Followers) trên cả Trang cá nhân & Fanpage
// Hỗ trợ triệt để Facebook New Page Experience (NPE), Modal dialog và Profile tabpanel
// Triệt tiêu 100% rác: Chat Messenger, Lối tắt thanh bên trái, Người liên hệ thanh bên phải, Gợi ý kết bạn
(() => {
  // 1. Web Dashboard Bridge (Khi chạy từ http://127.0.0.1:* hoặc http://localhost:*)
  const isWebDashboard = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
  if (isWebDashboard) {
    console.log("🐾 Pet Lead AI - Extension Bridge active on Web Dashboard (127.0.0.1 / localhost)");
    
    // Đăng ký dashboard tab với background script
    try {
      chrome.runtime.sendMessage({ action: 'REGISTER_DASHBOARD_TAB' });
    } catch (e) {}

    const announceReady = () => {
      window.postMessage({ type: 'PET_LEAD_EXT_READY', version: '3.3.0' }, '*');
    };
    announceReady();
    setInterval(announceReady, 1500);

    // Relay scan requests from Web Dashboard to background.js
    window.addEventListener('message', (event) => {
      if (event.source !== window || !event.data) return;
      if (event.data.type === 'START_STEP2_SCAN_VIA_EXTENSION') {
        chrome.runtime.sendMessage({
          action: 'EXECUTE_STEP2_BROWSER_SCAN',
          links: event.data.links,
          options: event.data.options
        });
      } else if (event.data.type === 'STOP_STEP2_SCAN_VIA_EXTENSION') {
        chrome.runtime.sendMessage({ action: 'STOP_STEP2_BROWSER_SCAN' });
      }
    });

    // Relay scan events from background.js to Web Dashboard
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.action && msg.action.startsWith('STEP2_')) {
        window.postMessage({ type: 'PET_LEAD_STEP2_EVENT', payload: msg }, '*');
      }
      return true;
    });

    return; // Không chạy bộ cào người theo dõi Facebook trên trang Dashboard
  }

  let isHarvesting = false;
  let isPaused = false;
  let scrollTimer = null;
  let harvestDebounceTimer = null;
  let consecutiveNoNewCount = 0;
  const processedKeys = new Set();
  const collectedBatch = [];

  const TRANSLATION_REGEX = /^(?:xem bản dịch|xem bản gốc|bản dịch|dịch|see translation|see original|translation|original|original \(english\)|dịch từ tiếng [a-zÀ-ỹ]+)$/i;
  const ACTION_BTN_REGEX = /^(?:theo dõi|đang theo dõi|bỏ theo dõi|follow|following|unfollow|thêm bạn bè|bạn bè|hủy kết bạn|add friend|friends|unfriend|nhắn tin|tin nhắn|message|chat|gửi tin nhắn|xem thêm|see more|chỉnh sửa|edit|xóa|delete|chia sẻ|share|thích|like|quản lý|manage|tùy chọn|options)$/i;
  const SYSTEM_MEDIA_REGEX = /^(?:xem ảnh|xem ảnh bài|xem ảnh bìa|xem ảnh đại diện|ảnh đại diện|ảnh bìa|chỉ báo trạng thái hoạt động|active status indicator|view profile picture|profile picture|cover photo|view photo|view media)$/i;
  const FOLLOWER_COUNTER_REGEX = /^\d+[\.,]?\d*[KM]?\s*(?:người theo dõi|đang theo dõi|followers|following|người thích|likes|bạn bè|friends|bạn chung|mutual friends)\b/i;
  const SYSTEM_NAV_REGEX = /^(?:xem tất cả|tất cả|mọi người|thước phim|reels|marketplace|trang|pages|nhóm|groups|sự kiện|events|người theo dõi|đang theo dõi|bạn bè|tìm hiểu thêm|bài viết mới|giới thiệu|ảnh|photos|video|videos|kỷ niệm|đã lưu|bảng feed|trình quản lý quảng cáo|tạo tin|quảng cáo|được tài trợ|sponsored|advertiser)$/i;
  const TIMESTAMP_REGEX = /^\d+\s*(?:giờ|phút|giây|ngày|tuần|tháng|năm|hr|hrs|min|mins|sec|secs|day|days|wk|wks|mo|mos|yr|yrs)\b/i;
  const TIMELINE_TITLE_REGEX = /^(?:dòng thời gian của|ảnh đại diện của|bài viết của|timeline of|profile of)\s+/i;

  // Filter unwanted button labels, sidebar menus, counters, translations & ads
  const EXCLUDED_NAME_PATTERNS = [
    TRANSLATION_REGEX,
    ACTION_BTN_REGEX,
    SYSTEM_MEDIA_REGEX,
    FOLLOWER_COUNTER_REGEX,
    SYSTEM_NAV_REGEX,
    TIMESTAMP_REGEX,
    TIMELINE_TITLE_REGEX,
    /^xem bản dịch/i,
    /^see translation/i,
    /bản dịch$/i,
    /^xem ảnh/i,
    /^chỉ báo/i
  ];

  // Danh mục từ khóa các trang rác lối tắt / không phải trang người dùng / trại chó
  const JUNK_SHORTCUT_KEYWORDS = [
    'chậu kiểng', 'ốc mượn hồn', 'linh mai vàng', 'tps flowerhorn',
    'bệnh viện mắt', 'truyện kiều', 'van hờ foods', 'chậu cảnh',
    'cây cảnh', 'hoa lan', 'bonsai'
  ];

  // System subpaths that must never be treated as customer profile links
  const SYSTEM_URL_PATTERNS = [
    /\/friends\/suggestions\b/i,
    /\/friends_mutual\b/i,
    /\/photo(?:\.php|\/|\?)/i,
    /\/photos(?:\.php|\/|\?)/i,
    /\/media\b/i,
    /\/onthisday\b/i,
    /\/saved\b/i,
    /\/ad_campaign\b/i,
    /\/ads\b/i,
    /\/stories\b/i,
    /\/posts\b/i,
    /\/permalink\b/i,
    /\/watch\b/i,
    /\/gaming\b/i,
    /\/marketplace\b/i,
    /\/events\b/i,
    /\/groups\b/i,
    /\/settings\b/i,
    /\/messages\b/i,
    /\/notifications\b/i,
    /\/help\b/i,
    /\/policies\b/i,
    /\/privacy\b/i,
    /\/business\b/i,
    /\/sharer\b/i,
    /\/dialog\b/i,
    /\/login\b/i,
    /\/ajax\//i,
    /\/hashtag\//i,
    /\/about(?:$|\/|\?)/i,
    /\/followers(?:$|\/|\?)/i,
    /\/following(?:$|\/|\?)/i,
    /\/friends(?:$|\/|\?)/i,
    /\/reels(?:$|\/|\?)/i,
    /\/videos(?:$|\/|\?)/i,
    /\/reviews(?:$|\/|\?)/i,
    /\/community(?:$|\/|\?)/i,
    /\/search\b/i,
    /\/feed\b/i,
    /\/allactivity\b/i
  ];

  // Comprehensive Pet & Dog Breed Dictionary
  const BREEDER_KEYWORDS = [
    'kennel', 'kennels', 'breeder', 'breeders', 'breeding', 'litter', 'litters',
    'puppy', 'puppies', 'pup', 'pups', 'dam', 'sire', 'stud', 'stud dog',
    'pedigree', 'akc', 'ckc', 'ukc', 'fci', 'show dog', 'working dog', 'k9', 'canine',
    'trại chó', 'chó cảnh', 'chó giống', 'phối giống', 'chó con', 'cún con',
    'frenchie', 'frenchies', 'french bulldog', 'bulldog', 'bulldogs', 'english bulldog',
    'american bully', 'exotic bully', 'bully', 'bullies', 'pitbull', 'pitbulls', 'apbt',
    'cane corso', 'corso', 'mastiff', 'mastiffs', 'bullmastiff', 'tibetan mastiff', 'dogo', 'boxer', 'boxers',
    'golden retriever', 'golden retrievers', 'retriever', 'retrievers', 'goldens',
    'labrador retriever', 'labrador', 'labradors', 'lab', 'labs', 'flat coated retriever',
    'boykin spaniel', 'boykin', 'cocker spaniel', 'cocker', 'english cocker', 'springer spaniel',
    'spaniel', 'spaniels', 'cavalier king charles', 'cavalier', 'king charles',
    'pointer', 'german shorthaired pointer', 'gsp', 'vizsla', 'weimaraner', 'setter', 'irish setter',
    'poodle', 'poodles', 'toy poodle', 'miniature poodle', 'standard poodle',
    'doodle', 'doodles', 'goldendoodle', 'goldendoodles', 'labradoodle', 'bernedoodle', 'bernedoodles',
    'aussiedoodle', 'sheepadoodle', 'cavapoo', 'maltipoo', 'cockapoo', 'schnoodle', 'whoodle',
    'corgi', 'corgis', 'pembroke', 'cardigan', 'welsh corgi',
    'german shepherd', 'german shepherds', 'shepherd', 'shepherds', 'gsd',
    'belgian malinois', 'malinois', 'dutch shepherd', 'australian shepherd', 'aussie', 'aussies',
    'border collie', 'collie', 'collies', 'shetland sheepdog', 'sheltie', 'australian cattle dog', 'blue heeler',
    'siberian husky', 'husky', 'huskies', 'alaskan malamute', 'malamute', 'samoyed',
    'pomsky', 'pomskies', 'pomeranian', 'pomeranians', 'pom', 'poms', 'spitz',
    'shiba inu', 'shiba', 'akita', 'chow chow', 'chow', 'shar pei',
    'dachshund', 'dachshunds', 'doxie', 'doxies', 'miniature dachshund', 'wiener dog', 'teckel',
    'basset hound', 'basset', 'bassets', 'beagle', 'beagles', 'bloodhound', 'coonhound', 'rhodesian ridgeback',
    'rottweiler', 'rottweilers', 'rottie', 'doberman', 'dobermann', 'great dane',
    'bernese mountain dog', 'bernese', 'great pyrenees', 'saint bernard', 'newfoundland',
    'shih tzu', 'shihtzu', 'pug', 'pugs', 'chihuahua', 'chihuahuas',
    'maltese', 'bichon frise', 'bichon', 'havanese', 'yorkshire terrier', 'yorkie', 'yorkies',
    'schnauzer', 'schnauzers', 'mini schnauzer', 'miniature schnauzer',
    'boston terrier', 'jack russell', 'russell terrier', 'terrier', 'terriers',
    'pet potty', 'dog potty', 'puppy pad', 'pee pad', 'potty training',
    'pet grass', 'dog turf', 'dog lawn', 'k9 grass', 'artificial grass for dog',
    'puppy kit', 'take-home kit', 'puppy pack', 'puppy starter kit',
    'dog training', 'k9 training', 'dog boarding', 'pet resort', 'dog daycare', 'grooming'
  ];

  // Kiểm tra hồ sơ rác (shortcuts, sidebar contacts, suggestions, không có link cá nhân)
  function isJunkFollowerRecord(item) {
    if (!item || !item.name) return true;
    const clean = item.name.trim();
    if (clean.length < 2 || clean.length > 90) return true;
    if (isExcludedName(clean)) return true;

    // Check known non-profile shortcut pages
    const lowerName = clean.toLowerCase();
    if (JUNK_SHORTCUT_KEYWORDS.some(k => lowerName.includes(k))) return true;

    // Suggestions or messages
    const raw = item.raw_url || item.url || '';
    if (raw.includes('/friends/suggestions/') || raw.includes('/messages/') || raw.includes('/hashtag/')) {
      return true;
    }

    // Phải có URL profile hoặc UID hợp lệ
    if (!item.fb_id && (!item.url || !item.url.includes('facebook.com/'))) {
      return true;
    }

    return false;
  }

  // Preload and cleanse existing processed keys from storage on initialization
  async function initProcessedKeys() {
    try {
      const st = await chrome.storage.local.get(['scrapedFollowers']);
      if (st.scrapedFollowers && Array.isArray(st.scrapedFollowers)) {
        const cleaned = st.scrapedFollowers.filter(x => !isJunkFollowerRecord(x));
        cleaned.forEach(item => {
          const k = item.fb_id || item.url;
          if (k) processedKeys.add(k);
          collectedBatch.push(item);
        });
        if (cleaned.length !== st.scrapedFollowers.length) {
          console.log(`🐾 [PetLead AI] Đã tự động lọc bỏ ${st.scrapedFollowers.length - cleaned.length} bản ghi rác khỏi bộ nhớ.`);
          chrome.storage.local.set({ scrapedFollowers: cleaned });
        }
      }
    } catch (e) {}
  }
  initProcessedKeys();

  function isExcludedUrl(rawUrl) {
    if (!rawUrl) return true;
    if (rawUrl.startsWith('#') || rawUrl.startsWith('javascript:')) return true;
    try {
      const u = new URL(rawUrl, window.location.href);
      if (!u.hostname.includes('facebook.com')) return true;
      if (SYSTEM_URL_PATTERNS.some(p => p.test(u.pathname))) return true;
      if (u.pathname === '/' || u.pathname === '') return true;
    } catch (e) {
      return true;
    }
    return false;
  }

  // Kiểm tra nghiêm ngặt phần tử có nằm trong các thanh bên / menu / chat / gợi ý không
  // TUYỆT ĐỐI KHÔNG loại trừ div[role="feed"] hoặc article vì danh sách followers trên Fanpage nằm trong feed!
  function isInsideExcludedSection(el) {
    if (!el || !el.closest) return false;
    
    // Nếu phần tử đang nằm trong Modal dialog người theo dõi -> CHỈ loại bỏ ô tìm kiếm hoặc khung chat
    const insideDialog = el.closest('div[role="dialog"]');
    if (insideDialog) {
      if (el.getAttribute && el.getAttribute('role') === 'tab') return true;
      return !!el.closest(
        'form[role="search"], div[role="search"], ' +
        'div[data-pagelet*="Chat"], div[aria-label*="tin nhắn" i], div[aria-label*="chat" i], div[aria-label*="cuộc trò chuyện" i]'
      );
    }

    // Tab header buttons
    if (el.getAttribute && (el.getAttribute('role') === 'tab' || el.closest('div[role="tablist"]'))) {
      return true;
    }

    // LOẠI TRỪ THANH BÊN / CHAT / ĐIỀU HƯỚNG / GỢI Ý
    return !!el.closest(
      'header, ' +
      'div[role="banner"], ' +
      'div[role="navigation"], ' +
      'nav, ' +
      'aside, ' +
      'div[role="complementary"], ' +
      'div[data-pagelet*="LeftRail"], ' +
      'div[data-pagelet*="RightRail"], ' +
      'div[data-pagelet*="LeftCol"], ' +
      'div[data-pagelet*="RightCol"], ' +
      'div[data-pagelet*="Left"], ' +
      'div[data-pagelet*="Right"], ' +
      'div[data-pagelet*="Chat"], ' +
      'div[data-pagelet*="Dock"], ' +
      'div[data-pagelet="ProfileHeader"], ' +
      'div[aria-label*="Người liên hệ" i], ' +
      'div[aria-label*="Contacts" i], ' +
      'div[aria-label*="Cuộc trò chuyện" i], ' +
      'div[aria-label*="Chats" i], ' +
      'div[aria-label*="Danh bạ" i], ' +
      'div[aria-label*="Lối tắt" i], ' +
      'div[aria-label*="Shortcuts" i], ' +
      'div[aria-label*="Những người bạn có thể biết" i], ' +
      'div[aria-label*="Gợi ý" i], ' +
      'div[aria-label*="Suggestions" i], ' +
      'div[aria-label*="Khám phá" i], ' +
      'form[role="search"], ' +
      'div[role="search"]'
    );
  }

  function getViewerAccount() {
    try {
      const banner = document.querySelector('div[role="banner"], header');
      if (banner) {
        const profileLink = banner.querySelector('a[aria-label*="Trang cá nhân" i], a[aria-label*="Your profile" i], a[role="link"][href*="/profile.php"], a[role="link"][href*="/people/"]');
        if (profileLink) {
          const href = profileLink.getAttribute('href') || '';
          const name = (profileLink.innerText || profileLink.getAttribute('aria-label') || '').trim();
          const id = parseNumericFbId(href);
          return { id, name, href };
        }
      }
    } catch (e) {}
    return null;
  }

  function getHostPageInfo() {
    let hostName = '';
    const h1 = document.querySelector('h1');
    if (h1) hostName = h1.innerText.trim();
    if (!hostName) {
      const title = document.title || '';
      hostName = title.split('|')[0].trim();
    }
    const href = window.location.href;
    const cleanHref = href.split('?')[0].replace(/\/(?:followers|following|friends|photos|videos|reels).*/i, '').replace(/\/$/, '');
    return { hostName, cleanHref };
  }

  function classifyAudience(name, subtitle, bio) {
    const textLower = `${name} ${subtitle} ${bio}`.toLowerCase();
    for (const kw of BREEDER_KEYWORDS) {
      if (textLower.includes(kw)) return 'BREEDER_PRO';
    }
    return 'DOG_LOVER_AUDIENCE';
  }

  function findMatchedDogKeywords(text) {
    if (!text) return [];
    const lower = text.toLowerCase();
    const matched = [];
    for (const kw of BREEDER_KEYWORDS) {
      const reg = new RegExp('(?:^|[^a-zA-Z0-9À-ỹ])' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[^a-zA-Z0-9À-ỹ])', 'i');
      if (reg.test(lower)) {
        matched.push(kw);
      }
    }
    return matched;
  }

  function isExcludedName(text) {
    if (!text) return true;
    const clean = text.trim();
    if (clean.length < 2 || clean.length > 90) return true;
    if (/^[\d\s.,#@!$%^&*()_+=\-[\]{}|;:'"<>?\/~`]+$/.test(clean)) return true;
    if (TRANSLATION_REGEX.test(clean)) return true;
    if (ACTION_BTN_REGEX.test(clean)) return true;
    if (SYSTEM_MEDIA_REGEX.test(clean)) return true;
    if (FOLLOWER_COUNTER_REGEX.test(clean)) return true;
    if (SYSTEM_NAV_REGEX.test(clean)) return true;
    if (TIMESTAMP_REGEX.test(clean)) return true;
    if (TIMELINE_TITLE_REGEX.test(clean)) return true;
    if (JUNK_SHORTCUT_KEYWORDS.some(k => clean.toLowerCase().includes(k))) return true;
    return EXCLUDED_NAME_PATTERNS.some(p => p.test(clean));
  }

  // Parse numeric Facebook ID
  function parseNumericFbId(url, card) {
    if (card) {
      const hovercard = card.getAttribute('data-hovercard') || card.querySelector('[data-hovercard]')?.getAttribute('data-hovercard') || '';
      const mHover = hovercard.match(/[?&]id=(\d{8,})/);
      if (mHover) return mHover[1];
    }

    if (url) {
      const mSet = url.match(/set=(?:pb|a|ecnf|pcb)\.(\d{8,})/);
      if (mSet) return mSet[1];
      const mId = url.match(/[?&]id=(\d{8,})/) || url.match(/id=(\d{8,})/);
      if (mId) return mId[1];
      const mProfile = url.match(/profile\.php\?id=(\d{8,})/);
      if (mProfile) return mProfile[1];
      const mPeople = url.match(/facebook\.com\/people\/[^\/]+\/(\d{8,})/);
      if (mPeople) return mPeople[1];
      const mSlug = url.match(/facebook\.com\/(\d{10,})/);
      if (mSlug) return mSlug[1];
    }

    if (card && card.querySelectorAll) {
      const cardAnchors = Array.from(card.querySelectorAll('a')).slice(0, 8);
      for (const a of cardAnchors) {
        const hover = a.getAttribute('data-hovercard') || '';
        const mH = hover.match(/[?&]id=(\d{8,})/);
        if (mH) return mH[1];

        const href = a.getAttribute('href') || a.href || '';
        const mSet = href.match(/set=(?:pb|a|ecnf|pcb)\.(\d{8,})/);
        if (mSet) return mSet[1];
        const mId = href.match(/profile\.php\?id=(\d{8,})/) || href.match(/[?&]id=(\d{8,})/);
        if (mId) return mId[1];
      }
    }

    return '';
  }

  // Clean canonical Facebook link
  function sanitizeProfileUrl(rawUrl, numericId) {
    if (!rawUrl) return numericId ? `https://www.facebook.com/profile.php?id=${numericId}` : '';
    try {
      let u = new URL(rawUrl, window.location.href);
      if (u.pathname.includes('/l.php')) {
        const real = u.searchParams.get('u');
        if (real) u = new URL(real);
      }
      u.searchParams.delete('fbclid');
      u.searchParams.delete('__tn__');
      u.searchParams.delete('epa');
      u.searchParams.delete('ref');
      u.searchParams.delete('comment_id');

      if (numericId && /^\d{8,}$/.test(numericId)) {
        return `https://www.facebook.com/profile.php?id=${numericId}`;
      }
      return u.toString().split('?')[0];
    } catch (e) {
      return rawUrl;
    }
  }

  // Tự động chuyển trang đến tab Đang theo dõi (Following) nếu người dùng đang ở Timeline
  function autoNavigateToFollowingTab() {
    const href = window.location.href;
    const isAlreadyFollowing = href.includes('/following') || href.includes('sk=following');
    const isAlreadyFollowers = href.includes('/followers') || href.includes('sk=followers');
    if (isAlreadyFollowing || isAlreadyFollowers) return true;

    // Tìm thẻ chuyển tab "Đang theo dõi" trên giao diện
    const followingLink = document.querySelector(
      'a[href*="/following"], a[href*="sk=following"], ' +
      'div[role="tablist"] a[href*="following"]'
    );
    if (followingLink && !isInsideExcludedSection(followingLink)) {
      console.log("🐾 [PetLead AI] Đang bấm mở tab Đang theo dõi (Following)...");
      followingLink.click();
      return true;
    }

    // Nếu là trang cá nhân profile.php?id=...
    if (href.includes('profile.php?id=')) {
      const u = new URL(href);
      u.searchParams.set('sk', 'following');
      console.log(`🐾 [PetLead AI] Tự động chuyển hướng tới: ${u.toString()}`);
      window.location.href = u.toString();
      return true;
    }

    // Nếu là URL vanity facebook.com/{slug}
    if (href.includes('facebook.com/') && !href.includes('/groups/') && !href.includes('/watch/')) {
      const clean = href.split('?')[0].replace(/\/$/, '');
      const targetUrl = clean + '/following';
      console.log(`🐾 [PetLead AI] Tự động chuyển hướng tới: ${targetUrl}`);
      window.location.href = targetUrl;
      return true;
    }

    return false;
  }

  // TÌM ĐÚNG VÙNG CHỨA HỒ SƠ THEO DÕI
  // Hỗ trợ cả Modal Popup, Profile Tabpanel, ProfileAppSection và Fanpage Followers Grid
  function getFollowerContainer() {
    // 1. Kiểm tra hộp thoại Popup Modal (Nếu mở popup từ Fanpage hoặc bấm xem người theo dõi trên trang cá nhân)
    const dialogs = document.querySelectorAll('div[role="dialog"]');
    for (const d of dialogs) {
      if (d.offsetWidth > 200 && d.offsetHeight > 150) {
        const style = window.getComputedStyle(d);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        // Bỏ qua nếu là khung chat / tin nhắn
        const isChat = !!d.querySelector('div[role="textbox"], [data-pagelet*="Chat"], [aria-label*="tin nhắn" i], [aria-label*="chat" i], [aria-label*="cuộc trò chuyện" i]');
        if (isChat) continue;

        // Tiêu đề hoặc aria-label hoặc các tab chuyển đổi trong dialog
        const dText = ((d.getAttribute('aria-label') || '') + ' ' + (d.innerText || '')).slice(0, 500).toLowerCase();
        if (dText.includes('đang theo dõi') || dText.includes('following') || 
            dText.includes('người theo dõi') || dText.includes('followers') || 
            dText.includes('bạn bè') || dText.includes('friends') ||
            dText.includes('thành viên') || dText.includes('members') ||
            d.querySelector('[aria-label*="theo dõi" i], [aria-label*="following" i], [aria-label*="followers" i], div[role="tablist"]')) {
          return d;
        }
      }
    }

    // 2. Tabpanel trang cá nhân (Tab Đang theo dõi / Người theo dõi / Bạn bè)
    const tabpanels = document.querySelectorAll('div[role="tabpanel"]');
    for (const tp of tabpanels) {
      if (tp.offsetWidth > 250 && tp.offsetHeight > 100) {
        return tp;
      }
    }

    // 3. Phần ProfileAppSection chứa danh sách lưới người theo dõi
    const appSections = document.querySelectorAll('div[data-pagelet*="ProfileAppSection"]');
    for (const sec of appSections) {
      if (sec.offsetWidth > 250 && sec.offsetHeight > 150) {
        return sec;
      }
    }

    // 4. Khung ProfileTabs
    const profileTabs = document.querySelector('div[data-pagelet="ProfileTabs"]');
    if (profileTabs && profileTabs.offsetWidth > 250) {
      const innerTabpanel = profileTabs.querySelector('div[role="tabpanel"]');
      if (innerTabpanel) return innerTabpanel;
      return profileTabs;
    }

    // 5. Fanpage hoặc Trang cá nhân khi đang ở URL followers / following:
    // Tuyệt đối hỗ trợ trang Fanpage như facebook.com/officialgooddog/followers
    const href = window.location.href;
    if (href.includes('followers') || href.includes('following') || href.includes('sk=followers') || href.includes('sk=following')) {
      const main = document.querySelector('div[role="main"], main, div[data-pagelet*="MainFeed"], div[data-pagelet="ProfileAppSection_0"]');
      if (main && main.offsetWidth > 300) return main;
      return document.body;
    }

    return null;
  }

  // Persist newly harvested items directly into chrome.storage.local
  async function persistFollowersToStorage(newRecords) {
    if (!newRecords || newRecords.length === 0) return;
    try {
      const res = await chrome.storage.local.get(['scrapedFollowers']);
      const current = res.scrapedFollowers || [];
      const map = new Map();
      current.forEach(item => {
        if (!isJunkFollowerRecord(item)) {
          const k = item.fb_id || item.url;
          if (k) map.set(k, item);
        }
      });
      newRecords.forEach(item => {
        if (!isJunkFollowerRecord(item)) {
          const k = item.fb_id || item.url;
          if (k) {
            if (!map.has(k)) map.set(k, item);
            else map.set(k, { ...map.get(k), ...item });
          }
        }
      });
      const updated = Array.from(map.values());
      await chrome.storage.local.set({
        scrapedFollowers: updated,
        lastHarvestTime: Date.now()
      });
    } catch (e) {
      console.warn("[PetLead AI] Failed to save to storage:", e);
    }
  }

  // Bóc tách một thẻ người theo dõi hợp lệ từ DOM
  function extractFollowerRecordFromCard(card, viewer, hostInfo) {
    if (!card) return null;
    if (isInsideExcludedSection(card)) return null;

    // 1. Phải có ảnh đại diện từ CDN Facebook (img hoặc svg image)
    let avatarUrl = '';
    const imgs = Array.from(card.querySelectorAll('img, image'));
    for (const imgEl of imgs) {
      const src = imgEl.getAttribute('src') || imgEl.getAttribute('href') || imgEl.getAttribute('xlink:href') || '';
      if (src && (src.includes('fbcdn.net') || src.includes('scontent') || src.startsWith('data:image')) && 
          !src.includes('rsrc.php') && !src.includes('emoji.php') && !src.includes('/static/')) {
        avatarUrl = src;
        break;
      }
    }
    // Mở rộng tìm thẻ cha nếu avatar nằm ngang hàng
    if (!avatarUrl && card.parentElement) {
      const parentImgs = Array.from(card.parentElement.querySelectorAll('img, image'));
      for (const imgEl of parentImgs) {
        const src = imgEl.getAttribute('src') || imgEl.getAttribute('href') || imgEl.getAttribute('xlink:href') || '';
        if (src && (src.includes('fbcdn.net') || src.includes('scontent') || src.startsWith('data:image')) && 
            !src.includes('rsrc.php') && !src.includes('emoji.php') && !src.includes('/static/')) {
          avatarUrl = src;
          break;
        }
      }
    }

    // 2. Tìm link cá nhân và họ tên
    const anchors = Array.from(card.querySelectorAll('a[role="link"], a[href]'));
    let targetAnchor = null;
    let nameText = '';
    let numericId = '';

    for (const a of anchors) {
      const href = a.getAttribute('href') || a.href || '';
      if (isExcludedUrl(href)) continue;

      const text = (a.innerText || a.textContent || '').trim().split('\n')[0].trim();
      if (text && !isExcludedName(text)) {
        nameText = text;
        targetAnchor = a;
        numericId = parseNumericFbId(href, card);
        break;
      }
    }

    // Fallback tìm tên từ text node nếu anchor là wrapper không text
    if (!nameText) {
      const textNodes = Array.from(card.querySelectorAll('span[dir="auto"], strong'));
      for (const node of textNodes) {
        const t = (node.innerText || '').trim().split('\n')[0].trim();
        if (t && !isExcludedName(t)) {
          nameText = t;
          for (const a of anchors) {
            const href = a.getAttribute('href') || a.href || '';
            if (!isExcludedUrl(href)) {
              targetAnchor = a;
              numericId = parseNumericFbId(href, card);
              break;
            }
          }
          break;
        }
      }
    }

    if (!nameText || isExcludedName(nameText)) return null;

    // Loại trừ trang nguồn và tài khoản của chính người quét
    if (hostInfo.hostName && nameText.toLowerCase().trim() === hostInfo.hostName.toLowerCase().trim()) return null;
    if (viewer && viewer.name && nameText.toLowerCase().trim() === viewer.name.toLowerCase().trim()) return null;
    if (viewer && viewer.id && numericId && viewer.id === numericId) return null;

    const rawHref = targetAnchor ? (targetAnchor.getAttribute('href') || targetAnchor.href || '') : '';
    if (!rawHref && !numericId) return null;

    // Loại trừ nếu link trùng với trang nguồn chính (officialgooddog)
    if (hostInfo.cleanHref && rawHref) {
      try {
        const uRaw = new URL(rawHref, window.location.href);
        const uHost = new URL(hostInfo.cleanHref, window.location.href);
        if (uRaw.pathname.toLowerCase().replace(/\/$/, '') === uHost.pathname.toLowerCase().replace(/\/$/, '')) {
          return null;
        }
      } catch (e) {}
    }

    const cleanUrl = sanitizeProfileUrl(rawHref, numericId);

    // Bổ sung ID số từ hovercard hoặc các anchor liên kết trong thẻ
    let finalFbId = numericId || parseNumericFbId(cleanUrl, card);

    // Nếu không có avatar thật nhưng có SVG placeholder (như chữ cái "S"), đặt fallback avatar
    if (!avatarUrl) {
      avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameText)}&background=2563eb&color=fff&size=200`;
    } else if (avatarUrl.includes('fbcdn.net')) {
      // Nâng cấp Avatar HD
      avatarUrl = avatarUrl.replace(/([?&])ctp=[sp]\d+x\d+(&|$)/, '$1').replace(/\?&/, '?').replace(/[?&]$/, '');
    }

    // Bóc tách Subtitle & Bio
    let subtitle = '';
    let bio = '';
    const descTexts = [];
    const textNodes = card.querySelectorAll('span[dir="auto"], div[dir="auto"]');
    for (const node of textNodes) {
      const t = (node.innerText || '').trim();
      if (t && t !== nameText && !isExcludedName(t) && !descTexts.includes(t)) {
        descTexts.push(t);
      }
    }
    if (descTexts.length > 0) subtitle = descTexts[0];
    if (descTexts.length > 1) bio = descTexts.slice(1).join(' · ');

    const fullCardText = `${nameText} ${subtitle} ${bio} ${cleanUrl}`;
    const matchedDogKeywords = findMatchedDogKeywords(fullCardText);

    return {
      fb_id: finalFbId || '',
      name: nameText,
      url: cleanUrl,
      raw_url: rawHref,
      avatar_url: avatarUrl,
      subtitle: subtitle,
      bio: bio,
      matched_keywords: matchedDogKeywords,
      photo_urls: avatarUrl ? [avatarUrl] : [],
      source_page: window.location.href,
      audience_type: classifyAudience(nameText, subtitle, bio),
      scraped_at: new Date().toISOString()
    };
  }

  // Scrape visible follower cards strictly from the follower grid / dialog / fanpage feed
  function harvestVisibleCards() {
    const container = getFollowerContainer() || document.querySelector('div[role="main"]') || document.body;
    if (!container) {
      console.log("🐾 [PetLead AI] Chưa phát hiện vùng danh sách Đang theo dõi. Đang kiểm tra điều hướng...");
      autoNavigateToFollowingTab();
      return 0;
    }

    const newItems = [];
    const viewer = getViewerAccount();
    const hostInfo = getHostPageInfo();
    const candidateCardsSet = new Set();

    // Strategy 1: Quét từ tất cả nút bấm hành động (Theo dõi, Đang theo dõi, Bạn bè, Thêm bạn bè, Nhắn tin...)
    const actionBtns = Array.from(container.querySelectorAll(
      'div[role="button"], button, [aria-label*="theo dõi" i], [aria-label*="following" i], [aria-label*="follow" i], [aria-label*="bạn bè" i], [aria-label*="friends" i], [aria-label*="thêm bạn bè" i], [aria-label*="nhắn tin" i]'
    ));
    for (const btn of actionBtns) {
      if (isInsideExcludedSection(btn)) continue;
      const btnText = (btn.innerText || btn.getAttribute('aria-label') || '').trim();
      if (ACTION_BTN_REGEX.test(btnText) || /theo dõi|following|bạn bè|friends/i.test(btnText)) {
        let p = btn.parentElement;
        let d = 0;
        while (p && p !== container && d < 9) {
          if (p.querySelector('a[role="link"], a[href]')) {
            if (p.clientHeight >= 30 && p.clientWidth >= 160) {
              candidateCardsSet.add(p);
              break;
            }
          }
          p = p.parentElement;
          d++;
        }
      }
    }

    // Strategy 2: Quét từ tất cả link hồ sơ hợp lệ bên trong container
    const profileAnchors = Array.from(container.querySelectorAll('a[role="link"], a[href]')).filter(a => {
      if (isInsideExcludedSection(a)) return false;
      const h = a.getAttribute('href') || a.href || '';
      if (!h || isExcludedUrl(h)) return false;
      const t = (a.innerText || a.textContent || '').trim().split('\n')[0].trim();
      return t && !isExcludedName(t);
    });
    for (const a of profileAnchors) {
      let row = a.closest('div[role="listitem"]') || a.closest('div[role="article"]');
      if (!row) {
        let p = a.parentElement;
        let d = 0;
        while (p && p !== container && d < 8) {
          if (p.clientHeight >= 30 && p.clientHeight <= 350 && p.clientWidth >= 160) {
            row = p;
            break;
          }
          p = p.parentElement;
          d++;
        }
      }
      if (row && !isInsideExcludedSection(row)) {
        candidateCardsSet.add(row);
      } else if (!isInsideExcludedSection(a)) {
        candidateCardsSet.add(a.parentElement?.parentElement || a);
      }
    }

    // Strategy 3: Quét div[role="listitem"]
    const listItems = Array.from(container.querySelectorAll('div[role="listitem"]'));
    for (const li of listItems) {
      if (!isInsideExcludedSection(li)) candidateCardsSet.add(li);
    }

    // Strategy 4: Quét từ tất cả ảnh avatar / ảnh đại diện bên trong container
    const avatarImgs = Array.from(container.querySelectorAll('img[src*="fbcdn"], img[src*="scontent"], svg image[href*="fbcdn"], svg image[href*="scontent"], svg image[xlink\\:href*="fbcdn"], svg image[xlink\\:href*="scontent"]'));
    for (const im of avatarImgs) {
      if (isInsideExcludedSection(im)) continue;
      let p = im.parentElement;
      let d = 0;
      while (p && p !== container && d < 8) {
        if (p.querySelector('a[role="link"], a[href]')) {
          if (p.clientHeight >= 30 && p.clientWidth >= 160) {
            candidateCardsSet.add(p);
            break;
          }
        }
        p = p.parentElement;
        d++;
      }
    }

    // Tiến hành bóc tách từng card
    for (const card of candidateCardsSet) {
      const record = extractFollowerRecordFromCard(card, viewer, hostInfo);
      if (!record || isJunkFollowerRecord(record)) continue;

      const uniqueKey = record.fb_id || record.url;
      if (!uniqueKey || processedKeys.has(uniqueKey)) continue;

      processedKeys.add(uniqueKey);
      newItems.push(record);
      collectedBatch.push(record);
    }

    if (newItems.length > 0) {
      persistFollowersToStorage(newItems);

      try {
        const bc = new BroadcastChannel('PET_LEAD_CHANNEL');
        bc.postMessage({
          type: 'NEW_HARVESTED_FOLLOWERS',
          data: newItems,
          count: collectedBatch.length,
          timestamp: Date.now()
        });
        bc.close();
      } catch (e) {}

      try {
        chrome.runtime.sendMessage({
          action: 'NEW_FOLLOWERS_BATCH',
          data: newItems
        }).catch(() => {});
      } catch (e) {}
    }

    return newItems.length;
  }

  // Active smooth scroll loop with auto-recovery and jitter
  function runScrollLoop() {
    if (!isHarvesting || isPaused) return;

    const newlyFound = harvestVisibleCards();
    if (newlyFound > 0) {
      consecutiveNoNewCount = 0;
    } else {
      consecutiveNoNewCount++;
    }

    const scrollStep = Math.floor(Math.random() * 250) + 550;

    // Cuộn đúng vùng container
    const container = getFollowerContainer() || document.querySelector('div[role="main"]') || document.body;
    if (container) {
      const dialog = (container.getAttribute('role') === 'dialog') ? container : container.closest('div[role="dialog"]');
      if (dialog) {
        let scrollableTarget = null;
        const allDivs = Array.from(dialog.querySelectorAll('div'));
        for (const s of allDivs) {
          if (s.scrollHeight > s.clientHeight + 25) {
            const overflowY = window.getComputedStyle(s).overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll') {
              scrollableTarget = s;
              break;
            }
          }
        }
        if (!scrollableTarget) scrollableTarget = dialog;

        if (scrollableTarget) {
          scrollableTarget.scrollTop += scrollStep;
          scrollableTarget.dispatchEvent(new Event('scroll', { bubbles: true }));
        } else {
          for (const s of allDivs) {
            if (s.scrollHeight > s.clientHeight + 20) {
              s.scrollTop += scrollStep;
              s.dispatchEvent(new Event('scroll', { bubbles: true }));
            }
          }
        }
      } else {
        window.scrollBy({ top: scrollStep, left: 0, behavior: 'smooth' });
        if (document.scrollingElement) {
          document.scrollingElement.scrollBy({ top: scrollStep, left: 0, behavior: 'smooth' });
        }
        const feedScroll = document.querySelector('div[role="feed"], div[data-pagelet*="ProfileAppSection"]');
        if (feedScroll && feedScroll.scrollHeight > feedScroll.clientHeight + 30) {
          feedScroll.scrollTop += scrollStep;
          feedScroll.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
      }
    } else {
      window.scrollBy({ top: scrollStep, left: 0, behavior: 'smooth' });
    }

    window.dispatchEvent(new Event('scroll'));

    // Đánh thức Facebook Comet lazy load nếu tạm dừng nạp dữ liệu
    if (consecutiveNoNewCount >= 3) {
      const dialog = container ? ((container.getAttribute('role') === 'dialog') ? container : container.closest('div[role="dialog"]')) : null;
      if (dialog) {
        const allDivs = Array.from(dialog.querySelectorAll('div'));
        for (const s of allDivs) {
          if (s.scrollHeight > s.clientHeight + 15) {
            s.scrollTop -= 80;
            s.dispatchEvent(new Event('scroll', { bubbles: true }));
            setTimeout(() => {
              s.scrollTop += 250;
              s.dispatchEvent(new Event('scroll', { bubbles: true }));
            }, 150);
            break;
          }
        }
      } else {
        window.scrollBy({ top: -100, behavior: 'smooth' });
        setTimeout(() => {
          window.scrollBy({ top: 350, behavior: 'smooth' });
          window.dispatchEvent(new Event('scroll'));
        }, 150);
      }
    }

    const delay = Math.floor(Math.random() * 400) + 750;
    scrollTimer = setTimeout(runScrollLoop, delay);
  }

  // Passive Trigger on Scroll & Mutation
  function triggerHarvestOnScrollOrMutation() {
    if (!isHarvesting || isPaused) return;
    if (harvestDebounceTimer) clearTimeout(harvestDebounceTimer);
    harvestDebounceTimer = setTimeout(() => {
      if (isHarvesting && !isPaused) {
        harvestVisibleCards();
      }
    }, 250);
  }

  window.addEventListener('scroll', triggerHarvestOnScrollOrMutation, { passive: true });

  const domObserver = new MutationObserver((mutations) => {
    if (!isHarvesting || isPaused) return;
    for (const m of mutations) {
      if (m.addedNodes && m.addedNodes.length > 0) {
        triggerHarvestOnScrollOrMutation();
        break;
      }
    }
  });
  domObserver.observe(document.body, { childList: true, subtree: true });

  // Listen for messages from popup & dashboard
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'START_HARVESTING') {
      isHarvesting = true;
      isPaused = false;
      chrome.storage.local.set({ harvesterState: { isRunning: true, isPaused: false } });
      
      const container = getFollowerContainer();
      if (!container) {
        autoNavigateToFollowingTab();
      }

      const initialCount = harvestVisibleCards();
      runScrollLoop();
      sendResponse({ status: 'started', initialCount });
    } else if (msg.action === 'PAUSE_HARVESTING') {
      isPaused = true;
      chrome.storage.local.set({ harvesterState: { isRunning: true, isPaused: true } });
      clearTimeout(scrollTimer);
      sendResponse({ status: 'paused' });
    } else if (msg.action === 'RESUME_HARVESTING') {
      isHarvesting = true;
      isPaused = false;
      chrome.storage.local.set({ harvesterState: { isRunning: true, isPaused: false } });
      harvestVisibleCards();
      runScrollLoop();
      sendResponse({ status: 'resumed' });
    } else if (msg.action === 'STOP_HARVESTING') {
      isHarvesting = false;
      isPaused = false;
      chrome.storage.local.set({ harvesterState: { isRunning: false, isPaused: false } });
      clearTimeout(scrollTimer);
      harvestVisibleCards();
      sendResponse({ status: 'stopped', count: collectedBatch.length });
    } else if (msg.action === 'GET_STATUS') {
      sendResponse({
        status: isHarvesting ? (isPaused ? 'paused' : 'running') : 'ready',
        isHarvesting,
        isPaused,
        count: collectedBatch.length
      });
    } else if (msg.action === 'RESET_HARVESTING' || msg.action === 'PURGE_JUNK_DATA') {
      isHarvesting = false;
      isPaused = false;
      clearTimeout(scrollTimer);
      processedKeys.clear();
      collectedBatch.length = 0;
      chrome.storage.local.remove(['scrapedFollowers']);
      chrome.storage.local.set({ harvesterState: { isRunning: false, isPaused: false } });
      sendResponse({ status: 'reset', count: 0 });
    } else if (msg.action === 'NAVIGATE_TO_FOLLOWING') {
      const ok = autoNavigateToFollowingTab();
      sendResponse({ status: ok ? 'navigated' : 'failed' });
    }
    return true;
  });

  console.log("🐾 Pet Lead AI - Follower Harvester Content Script Injected & Ready (v3.3 Production).");
})();
