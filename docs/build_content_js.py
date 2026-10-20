import os

CONTENT_JS_CODE = r'''// Pet Lead AI - Follower Harvester Content Script (Production Enhanced)
(() => {
  let isHarvesting = false;
  let isPaused = false;
  let scrollTimer = null;
  const processedKeys = new Set();
  const collectedBatch = [];

  const FOLLOWER_COUNTER_REGEX = /^\d+[\.,]?\d*[KM]?\s*(?:người theo dõi|đang theo dõi|followers|following|người thích|likes|bạn bè|friends)\b/i;
  const SYSTEM_NAV_REGEX = /^(?:xem tất cả|tất cả|mọi người|thước phim|reels|marketplace|trang|pages|nhóm|groups|sự kiện|events|người theo dõi|đang theo dõi|bạn bè|tìm hiểu thêm|bài viết mới|giới thiệu|ảnh|photos|video|videos|kỷ niệm|đã lưu|bảng feed|trình quản lý quảng cáo|tạo tin|quảng cáo|được tài trợ|sponsored|advertiser)$/i;
  const TIMESTAMP_REGEX = /^\d+\s*(?:giờ|phút|giây|ngày|tuần|tháng|năm|hr|hrs|min|mins|sec|secs|day|days|wk|wks|mo|mos|yr|yrs)\b/i;

  // Filter unwanted button labels, sidebar menus, counters & ads
  const EXCLUDED_NAME_PATTERNS = [
    /^(theo dõi|đang theo dõi|bỏ theo dõi|follow|following|unfollow)$/i,
    /^(thêm bạn bè|bạn bè|hủy kết bạn|add friend|friends|unfriend)$/i,
    /^(nhắn tin|tin nhắn|message|chat|gửi tin nhắn)$/i,
    /^(xem thêm|see more|chỉnh sửa|edit|xóa|delete)$/i,
    /^(chia sẻ|share|thích|like)$/i,
    /^(bài viết mới|tất cả|xem tất cả|giới thiệu|ảnh|video|thước phim|reels|sự kiện|trang|nhóm)$/i,
    /^(kỷ niệm|đã lưu|bảng feed|trình quản lý quảng cáo|tạo tin|tin mới)$/i,
    /^(được tài trợ|sponsored|advertiser|quảng cáo|ad)$/i,
    TIMESTAMP_REGEX,
    FOLLOWER_COUNTER_REGEX,
    SYSTEM_NAV_REGEX
  ];

  // System subpaths that must never be treated as customer profile links
  const SYSTEM_URL_PATTERNS = [
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
    /\/login\b/i
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

  function isExcludedUrl(rawUrl) {
    if (!rawUrl) return true;
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
    return EXCLUDED_NAME_PATTERNS.some(p => p.test(clean));
  }

  // Parse numeric Facebook ID
  function parseNumericFbId(url, card) {
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

    // Inspect ONLY anchors strictly inside card
    if (card && card.querySelectorAll) {
      const cardAnchors = Array.from(card.querySelectorAll('a')).slice(0, 6);
      for (const a of cardAnchors) {
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

  // Find container for follower cards
  function getFollowerContainer() {
    // If dedicated followers/following page
    if (window.location.pathname.includes('/followers') || window.location.pathname.includes('/following')) {
      return document.querySelector('div[role="main"]') || document.body;
    }
    // Check if visible modal dialog is present
    const dialogs = document.querySelectorAll('div[role="dialog"]');
    for (const d of dialogs) {
      if (d.offsetWidth > 250 && d.offsetHeight > 200) {
        const style = window.getComputedStyle(d);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          return d;
        }
      }
    }
    return document.querySelector('div[role="main"]') || document.body;
  }

  // Find scroll target
  function getScrollTarget() {
    const dialogs = document.querySelectorAll('div[role="dialog"]');
    for (const d of dialogs) {
      if (d.offsetWidth > 250 && d.offsetHeight > 200 && d.scrollHeight > d.clientHeight + 50) {
        const style = window.getComputedStyle(d);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          return d;
        }
      }
    }
    const main = document.querySelector('div[role="main"]');
    if (main && main.scrollHeight > main.clientHeight + 100) return main;
    return window;
  }

  // Scrape visible follower cards
  function harvestVisibleCards() {
    const newItems = [];
    const container = getFollowerContainer();
    const viewer = getViewerAccount();
    const { hostName, cleanHref } = getHostPageInfo();

    const allLinks = Array.from(container.querySelectorAll('a[role="link"], a[href]'));

    for (const a of allLinks) {
      const rawHref = a.getAttribute('href') || a.href || '';
      if (!rawHref) continue;

      // Filter out system URLs and external domains
      if (isExcludedUrl(rawHref)) continue;

      // Filter out top navbar, header, left navigation rail
      if (a.closest('div[role="navigation"], div[role="banner"], header, div[data-pagelet="LeftRail"], div[data-pagelet="RightRail"]')) {
        continue;
      }

      // Check name text
      const text = (a.innerText || a.textContent || a.getAttribute('aria-label') || '').trim().split('\n')[0].trim();
      if (!text || isExcludedName(text)) continue;

      // Exclude host page name
      if (hostName && text.toLowerCase() === hostName.toLowerCase()) continue;

      // Tight Card Boundary Discovery
      let card = null;
      let curr = a.parentElement;
      let depth = 0;
      while (curr && curr !== container && curr !== document.body && depth < 10) {
        depth++;
        if (curr.getAttribute('role') === 'listitem') {
          card = curr;
          break;
        }
        const hasActionBtn = curr.querySelector('div[role="button"][aria-label], button, div[aria-label*="Theo dõi" i], div[aria-label*="Follow" i], div[aria-label*="Bạn bè" i], div[aria-label*="Nhắn tin" i]');
        const hasAvatar = curr.querySelector('img[src*="fbcdn"], image[*|href*="fbcdn"]');
        if (hasActionBtn && hasAvatar && curr.clientHeight < 300) {
          card = curr;
          break;
        }
        curr = curr.parentElement;
      }

      if (!card) {
        card = a.closest('div[role="listitem"]') || a.parentElement?.parentElement || a;
      }

      const numericId = parseNumericFbId(rawHref, card);
      const cleanUrl = sanitizeProfileUrl(rawHref, numericId);

      // Exclude Host Page
      if (cleanUrl) {
        const targetClean = cleanUrl.split('?')[0].replace(/\/(?:followers|following|friends|photos|videos|reels).*/i, '').replace(/\/$/, '');
        if (targetClean.toLowerCase() === cleanHref.toLowerCase()) continue;
        if (cleanUrl.toLowerCase().endsWith('/following') || cleanUrl.toLowerCase().endsWith('/followers')) continue;
      }

      // Exclude Viewer Profile
      if (viewer) {
        if (numericId && viewer.id && numericId === viewer.id) continue;
        if (viewer.name && text.toLowerCase() === viewer.name.toLowerCase()) continue;
        if (viewer.href && cleanUrl.toLowerCase() === viewer.href.toLowerCase()) continue;
      }

      const uniqueKey = numericId || cleanUrl;
      if (!uniqueKey || processedKeys.has(uniqueKey)) continue;

      // Extract Avatar URL
      let avatarUrl = '';
      if (card.querySelectorAll) {
        const imgs = Array.from(card.querySelectorAll('img, image'));
        for (const imgEl of imgs) {
          const src = imgEl.getAttribute('src') || imgEl.getAttribute('href') || imgEl.getAttribute('xlink:href') || '';
          if (src && (src.includes('fbcdn.net') || src.includes('scontent')) && !src.includes('rsrc.php') && !src.includes('emoji.php')) {
            avatarUrl = src;
            break;
          }
        }
      }
      // Upgrade avatar to HD
      if (avatarUrl && avatarUrl.includes('fbcdn.net')) {
        avatarUrl = avatarUrl.replace(/([?&])ctp=[sp]\d+x\d+(&|$)/, '$1').replace(/\?&/, '?').replace(/[?&]$/, '');
      }

      // Extract Subtitle & Bio
      let subtitle = '';
      let bio = '';
      const descTexts = [];
      if (card.querySelectorAll) {
        const textNodes = card.querySelectorAll('span[dir="auto"], div[dir="auto"]');
        for (const node of textNodes) {
          const t = (node.innerText || '').trim();
          if (t && t !== text && !isExcludedName(t) && !descTexts.includes(t)) {
            descTexts.push(t);
          }
        }
      }
      if (descTexts.length > 0) subtitle = descTexts[0];
      if (descTexts.length > 1) bio = descTexts.slice(1).join(' · ');

      // Extract matched dog keywords
      const fullCardText = `${text} ${subtitle} ${bio} ${cleanUrl}`;
      const matchedDogKeywords = findMatchedDogKeywords(fullCardText);

      let finalFbId = numericId;
      if (!finalFbId && avatarUrl) {
        const m = avatarUrl.match(/_(\d{10,20})_\d+_n\./);
        if (m) finalFbId = m[1];
      }

      const followerRecord = {
        fb_id: finalFbId || '',
        name: text,
        url: cleanUrl,
        raw_url: rawHref,
        avatar_url: avatarUrl,
        subtitle: subtitle,
        bio: bio,
        matched_keywords: matchedDogKeywords,
        photo_urls: avatarUrl ? [avatarUrl] : [],
        source_page: window.location.href,
        audience_type: classifyAudience(text, subtitle, bio),
        scraped_at: new Date().toISOString()
      };

      processedKeys.add(uniqueKey);
      newItems.push(followerRecord);
      collectedBatch.push(followerRecord);
    }

    if (newItems.length > 0) {
      chrome.runtime.sendMessage({
        action: 'NEW_FOLLOWERS_BATCH',
        data: newItems
      });
    }

    return newItems.length;
  }

  // Smooth scroll loop with human-like jitter
  function runScrollLoop() {
    if (!isHarvesting || isPaused) return;

    harvestVisibleCards();

    const target = getScrollTarget();
    const scrollAmount = Math.floor(Math.random() * 200) + 480;

    if (target && target !== window && target !== document.body) {
      target.scrollTop += scrollAmount;
    }
    window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    document.documentElement.scrollTop += scrollAmount;

    const delay = Math.floor(Math.random() * 600) + 800;
    scrollTimer = setTimeout(runScrollLoop, delay);
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'START_HARVESTING') {
      isHarvesting = true;
      isPaused = false;
      const initialCount = harvestVisibleCards();
      runScrollLoop();
      sendResponse({ status: 'started', initialCount });
    } else if (msg.action === 'PAUSE_HARVESTING') {
      isPaused = true;
      clearTimeout(scrollTimer);
      sendResponse({ status: 'paused' });
    } else if (msg.action === 'RESUME_HARVESTING') {
      isPaused = false;
      runScrollLoop();
      sendResponse({ status: 'resumed' });
    } else if (msg.action === 'STOP_HARVESTING') {
      isHarvesting = false;
      isPaused = false;
      clearTimeout(scrollTimer);
      harvestVisibleCards();
      sendResponse({ status: 'stopped', count: collectedBatch.length });
    } else if (msg.action === 'RESET_HARVESTING') {
      isHarvesting = false;
      isPaused = false;
      clearTimeout(scrollTimer);
      processedKeys.clear();
      collectedBatch.length = 0;
      sendResponse({ status: 'reset', count: 0 });
    }
    return true;
  });

  console.log("🐾 Pet Lead AI - Follower Harvester Content Script Injected & Ready.");
})();
'''

ROOT = os.path.dirname(os.path.abspath(__file__))
SYSTEM_ROOT = os.path.dirname(ROOT)

TARGET_FILES = [
    os.path.join(SYSTEM_ROOT, "step1_follower_harvester", "extension", "content.js"),
    os.path.join(SYSTEM_ROOT, "fb_following_scraper", "content.js")
]

for p in TARGET_FILES:
    with open(p, "w", encoding="utf-8") as f:
        f.write(CONTENT_JS_CODE)
    print(f"Updated {p} ({len(CONTENT_JS_CODE)} bytes)")

print("content.js updated successfully!")
