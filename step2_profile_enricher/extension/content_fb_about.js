// Pet Lead AI - Step 2.1 Facebook Intro & Latest Post (Publish Time) DOM Extractor
(() => {
  // Mapping tiểu bang US
  const US_STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri",
    "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming"
  };

  const PUPPY_KEYWORDS = [
    'puppy', 'puppies', 'litter', 'litters', 'for sale', 'available', 'ready for homes',
    'taking deposits', 'accepting deposits', 'born on', 'weeks old', 'chó con', 'xuất chuồng',
    'tìm nhà mới', 'rước cún', 'đón cún', 'bán cún'
  ];

  const POTTY_GRASS_KEYWORDS = [
    'potty', 'potty training', 'pad', 'turf', 'grass', 'lawn', 'kennel run',
    'khay vệ sinh', 'cỏ cún', 'thảm cỏ', 'đi vệ sinh'
  ];

  function parseRelativeTimeString(txt) {
    if (!txt) return null;
    txt = txt.toLowerCase().trim();
    const now = new Date();
    
    // Minutes: "5 phút", "5 mins", "5m"
    let m = txt.match(/(\d+)\s*(?:phút|m|min|mins)/i);
    if (m) {
      return new Date(now.getTime() - parseInt(m[1]) * 60 * 1000);
    }
    // Hours: "2 giờ", "2 hrs", "2h"
    m = txt.match(/(\d+)\s*(?:giờ|h|hr|hrs)/i);
    if (m) {
      return new Date(now.getTime() - parseInt(m[1]) * 3600 * 1000);
    }
    // Days: "3 ngày", "3d", "3 days", "hôm qua", "yesterday"
    if (txt.includes('hôm qua') || txt.includes('yesterday')) {
      return new Date(now.getTime() - 24 * 3600 * 1000);
    }
    m = txt.match(/(\d+)\s*(?:ngày|d|day|days)/i);
    if (m) {
      return new Date(now.getTime() - parseInt(m[1]) * 24 * 3600 * 1000);
    }
    // Weeks
    m = txt.match(/(\d+)\s*(?:tuần|w|week|weeks)/i);
    if (m) {
      return new Date(now.getTime() - parseInt(m[1]) * 7 * 24 * 3600 * 1000);
    }
    // Months
    m = txt.match(/(\d+)\s*(?:tháng|mo|month|months)/i);
    if (m) {
      return new Date(now.getTime() - parseInt(m[1]) * 30 * 24 * 3600 * 1000);
    }
    // Years
    m = txt.match(/(\d+)\s*(?:năm|y|yr|years)/i);
    if (m) {
      return new Date(now.getTime() - parseInt(m[1]) * 365 * 24 * 3600 * 1000);
    }
    return null;
  }

  function scrapeSubstep1DOM() {
    const data = {
      status: 'ok',
      url: window.location.href,
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
        country: 'United States',
        full_address: ''
      },
      latest_post: {
        publish_time: '',
        publish_timestamp: 0,
        publish_human: '',
        relative_time: '',
        days_ago: 999,
        activity_status: 'Chưa xác định bài đăng',
        activity_tier: 'UNKNOWN',
        post_text: '',
        post_url: ''
      },
      sales_intelligence: {
        puppy_available: false,
        stud_service: false,
        recommended_product: 'Puppy Starter Kit V2/V3 (Khay vệ sinh + Cỏ cún)',
        sales_pitch: '',
        lead_score_boost: 0
      }
    };

    // 1. TÊN VÀ PROFILE ID
    const h1 = document.querySelector('h1[dir="auto"], h1');
    if (h1) data.name = (h1.innerText || '').trim();

    // Tìm Avatar HD
    const avatarImg = document.querySelector('image[preserveAspectRatio*="xMidYMid"], img[alt*="ảnh đại diện" i], img[alt*="profile picture" i]');
    if (avatarImg) {
      const src = avatarImg.getAttribute('xlink:href') || avatarImg.getAttribute('src') || '';
      if (src && !src.includes('data:image')) {
        data.avatar_url = src.replace(/ctp=[sp]\d+x\d+&?/, '').replace(/[&?]$/, '');
      }
    }

    // Tìm FB ID số từ link bài viết hoặc thẻ ngầm
    const idMatch = window.location.href.match(/[?&]id=(\d+)/) || (document.body.innerHTML.match(/fb:\/\/profile\/\?id=(\d+)/) || []);
    if (idMatch && idMatch[1]) data.profile_id = idMatch[1];

    // 2. PHẦN GIỚI THIỆU (INTRO / ABOUT)
    // Quét toàn bộ khối Intro (div[data-pagelet*="ProfileIntro"], v.v.)
    const introContainer = document.querySelector('div[data-pagelet*="ProfileIntro"], div[data-pagelet*="ProfileTilesFeed"]') || document.body;
    const textNodes = introContainer.querySelectorAll('span[dir="auto"], div[dir="auto"], a[role="link"]');

    textNodes.forEach(el => {
      const txt = (el.innerText || '').trim();
      if (!txt) return;

      // Email
      if (txt.includes('@') && txt.includes('.') && !txt.includes(' ')) {
        const m = txt.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (m && !data.intro.email) data.intro.email = m[0];
      }

      // Phone (US format)
      const mPhone = txt.match(/(?:\+?1[\s.\-]?)?(?:\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-](\d{4}))/);
      if (mPhone && !data.intro.phone && !txt.includes('@')) {
        data.intro.phone = `+1 (${mPhone[1]}) ${mPhone[2]}-${mPhone[3]}`;
      }

      // Website
      if ((txt.startsWith('http') || txt.includes('.com') || txt.includes('.org') || txt.includes('.net') || txt.includes('www.')) && !txt.includes('facebook.com') && !txt.includes('instagram.com')) {
        const mWeb = txt.match(/https?:\/\/[^\s]+/);
        if (mWeb && !data.intro.website) data.intro.website = mWeb[0];
        else if (!data.intro.website && !txt.includes(' ')) {
          data.intro.website = (txt.startsWith('www.') ? 'https://' : 'https://www.') + txt.replace(/^https?:\/\//, '');
        }
      }

      // Bio (Đoạn text giới thiệu > 20 ký tự, không phải số điện thoại, không phải nút bấm)
      if (txt.length > 25 && !data.intro.bio && !mPhone && !txt.includes('@') && !txt.includes('Thêm') && !txt.includes('Chỉnh sửa') && !txt.includes('Đang theo dõi')) {
        data.intro.bio = txt;
      }

      // Địa chỉ City, State
      const mAddr = txt.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s+([A-Z]{2})\b/);
      if (mAddr && US_STATES[mAddr[2]]) {
        data.intro.city = mAddr[1];
        data.intro.state = mAddr[2];
      }
    });

    const locArr = [data.intro.city, data.intro.state, data.intro.country].filter(Boolean);
    data.intro.full_address = locArr.join(', ');

    // 3. BÀI VIẾT GẦN NHẤT & PUBLISH TIME
    // Tìm container Feed
    const feed = document.querySelector('div[role="feed"]') || document.querySelector('div[data-pagelet*="Feed"]');
    let firstPostEl = null;

    if (feed) {
      // Tìm bài đăng đầu tiên của người dùng (bỏ qua composer đăng bài)
      const posts = feed.querySelectorAll('div[data-pagelet*="FeedUnit"], div[role="article"], div.user-post');
      for (const p of posts) {
        // Bài viết phải có text hoặc link bài viết
        const msgEl = p.querySelector('div[data-ad-preview="message"], div[dir="auto"]');
        const linkEl = p.querySelector('a[href*="/posts/"], a[href*="permalink"], a[href*="/photos/"]');
        if (msgEl || linkEl) {
          firstPostEl = p;
          break;
        }
      }
    }

    if (firstPostEl) {
      // Lấy text bài viết
      const msgEl = firstPostEl.querySelector('div[data-ad-preview="message"], div[dir="auto"]');
      if (msgEl) {
        data.latest_post.post_text = (msgEl.innerText || '').trim();
      }

      // Lấy link bài viết và publish time
      const timeLink = firstPostEl.querySelector('a[href*="/posts/"], a[href*="permalink.php"], a[role="link"][href*="facebook.com"]');
      if (timeLink) {
        const href = timeLink.getAttribute('href') || '';
        data.latest_post.post_url = href.startsWith('/') ? `https://www.facebook.com${href}` : href;

        // Thử tìm timestamp số trong data-utime
        const utime = timeLink.getAttribute('data-utime') || timeLink.closest('[data-utime]')?.getAttribute('data-utime');
        let postDate = null;

        if (utime && parseInt(utime) > 1500000000) {
          postDate = new Date(parseInt(utime) * 1000);
          data.latest_post.publish_timestamp = parseInt(utime);
        } else {
          // Thử bóc tách text thời gian: "2 giờ", "3 ngày", "15 Tháng 10 lúc 14:00"
          const rawTimeText = (timeLink.innerText || timeLink.getAttribute('aria-label') || '').trim();
          data.latest_post.relative_time = rawTimeText;
          postDate = parseRelativeTimeString(rawTimeText);
          if (postDate) {
            data.latest_post.publish_timestamp = Math.floor(postDate.getTime() / 1000);
          }
        }

        if (postDate) {
          const now = new Date();
          const diffMs = now.getTime() - postDate.getTime();
          const daysAgo = Math.max(0, Math.floor(diffMs / (24 * 3600 * 1000)));

          data.latest_post.days_ago = daysAgo;
          data.latest_post.publish_time = postDate.toISOString();
          data.latest_post.publish_human = postDate.toLocaleDateString('vi-VN') + ' ' + postDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

          if (!data.latest_post.relative_time) {
            data.latest_post.relative_time = `${daysAgo} ngày trước`;
          }

          // Phân loại Activity Status
          if (daysAgo <= 14) {
            data.latest_post.activity_status = "🔥 RẤT TÍCH CỰC (Đăng trong 2 tuần qua)";
            data.latest_post.activity_tier = "HOT_ACTIVE";
          } else if (daysAgo <= 45) {
            data.latest_post.activity_status = "✓ TÍCH CỰC (Đăng trong 1.5 tháng qua)";
            data.latest_post.activity_tier = "ACTIVE";
          } else if (daysAgo <= 90) {
            data.latest_post.activity_status = "⚠️ TRUNG BÌNH (Đăng trong 3 tháng qua)";
            data.latest_post.activity_tier = "WARM";
          } else {
            data.latest_post.activity_status = `❄️ ĐÓNG BĂNG (> ${Math.floor(daysAgo / 30)} tháng chưa có bài mới)`;
            data.latest_post.activity_tier = "DORMANT";
          }
        }
      }
    }

    // 4. PHÂN TÍCH Ý ĐỊNH KINH DOANH & GỢI Ý SẢN PHẨM (SALES INTELLIGENCE)
    const corpus = `${data.name} ${data.intro.bio} ${data.latest_post.post_text}`.toLowerCase();
    const hasPuppy = PUPPY_KEYWORDS.some(kw => corpus.includes(kw));
    const hasPottyGrass = POTTY_GRASS_KEYWORDS.some(kw => corpus.includes(kw));

    data.sales_intelligence.puppy_available = hasPuppy;

    if (hasPuppy) {
      data.sales_intelligence.recommended_product = 'Gói Puppy Starter Kit V3 (Thảm Cỏ Cún Kháng Khuẩn + Khay Potty Chống Tràn)';
      data.sales_intelligence.sales_pitch = 'Trại đang có cún con chuẩn bị về nhà mới. Chào gói Take-Home Pack giúp khách hàng huấn luyện đi vệ sinh trên thảm cỏ ngay từ nhỏ.';
      data.sales_intelligence.lead_score_boost = 25;
    } else if (hasPottyGrass) {
      data.sales_intelligence.recommended_product = 'Hệ thống Cỏ Nhân Tạo K9 Pet Grass Chuyên Dụng Ngoài Trời & Khay Potty Cỡ Đại';
      data.sales_intelligence.sales_pitch = 'Trại nuôi đàn lớn. Chào giải pháp thảm cỏ thoát nước tốt, khử mùi nước tiểu cho khu chuồng chạy Kennel Run.';
      data.sales_intelligence.lead_score_boost = 20;
    } else {
      data.sales_intelligence.recommended_product = 'Puppy Starter Kit V2 (Standard Pet Grass + Training Pad)';
      data.sales_intelligence.sales_pitch = 'Tiếp cận chủ nuôi cún cảnh với giải pháp vệ sinh tiện lợi, sạch sẽ trong nhà.';
      data.sales_intelligence.lead_score_boost = 10;
    }

    return data;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'SCRAPE_ABOUT_DATA' || msg.action === 'SCRAPE_SUBSTEP1_DATA') {
      const res = scrapeSubstep1DOM();
      sendResponse(res);
    }
    return true;
  });

  console.log("🐾 Pet Lead AI - Step 2.1 Facebook Intro & Latest Post (Publish Time) Extractor Ready.");
})();

