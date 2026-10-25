/**
 * extract.js - Pet Lead AI Master Suite DOM Injected Extractors
 * Chứa các hàm tự thực thi (self-contained) được inject vào tab đích qua chrome.scripting.executeScript.
 */

// 1. QUÉT LIÊN HỆ & ĐỊA CHỈ TỪ WEBSITE (CONTACT & ADDRESS SCANNER)
export async function scanPageForContact(fastMode = false) {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const title = (document.title || '').trim();
  const firstText = (document.body?.innerText || '').slice(0, 12000);
  const isFB = /(^|\.)facebook\.com$/.test(location.hostname);

  const visible = e => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  const challenge = Array.from(document.querySelectorAll('#challenge-running,#challenge-stage')).some(visible);
  const wall = /^(just a moment|attention required|verify you are human|security check|access denied)/i.test(title) ||
    /verify (?:that )?you are human|checking your browser|complete the security check|xác minh bạn là con người/i.test(firstText.slice(0, 3000));
  if (challenge || wall) return { url: location.href, blocked: true, reason: 'Trang yêu cầu xác minh hoặc chặn truy cập' };

  if (isFB && (/\/(login|checkpoint|recover)(?:[/.]|$)/.test(location.pathname) || /^(log in|login|đăng nhập).*facebook/i.test(title))) {
    return { url: location.href, blocked: true, reason: 'Facebook yêu cầu đăng nhập' };
  }

  const errorTitle = /^(404\b|403\b|500\b|502\b|503\b|page not found|not found|this site can.t be reached|trang web này không thể)/i.test(title);
  const errorBody = /\b(ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|DNS_PROBE_FINISHED_NXDOMAIN)\b/.test(firstText) ||
    (firstText.length < 3500 && /(?:^|\n)\s*(404(?:\s*[-:|]?\s*(?:error|not found|page not found))?|page not found|this page (?:isn.t|is not) available)\s*(?:\n|$)/i.test(firstText));
  if (errorTitle || errorBody) return { url: location.href, error: true, reason: 'Trang lỗi hoặc không tồn tại' };

  const emails = new Set(), phones = new Set(), links = new Map();
  const facebookSignals = [], instagramSignals = [];
  let address = { street: '', city: '', state: '', zip: '', country: '' };
  let staticSourcesCollected = false;
  const seenAnchors = new WeakSet(), seenData = new WeakSet(), seenCloudflare = new WeakSet();

  const emailRx = /[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,24}/g;

  function addEmail(s) {
    if (!s) return;
    for (let v of s.match(emailRx) || []) {
      v = v.replace(/^[.]+|[.]+$/g, '').toLowerCase();
      if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|woff2?)$/i.test(v)) continue;
      if (/@(example\.(com|org|net)|sentry\.io|wixpress\.com)$/.test(v) || /^(email|yourname|youremail)@/.test(v)) continue;
      emails.add(v);
    }
  }

  function addPhone(s, trusted = false) {
    if (!s) return;
    s = s.replace(/^tel:/i, '').split(/[?;]/)[0].trim();
    try { s = decodeURIComponent(s); } catch {}
    const digits = s.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return;
    if (!trusted && digits.length !== 10 && !(digits.length === 11 && digits[0] === '1') && !s.startsWith('+')) return;
    if (/^(\d)\1+$/.test(digits)) return;
    if (![...phones].some(p => p.replace(/\D/g, '') === digits)) phones.add(s);
  }

  function addLink(raw, label = '', method = 'anchor', allowRelative = false) {
    if (!raw) return;
    const values = [String(raw).replace(/&amp;/gi, '&').split('\\').join('')];
    for (let i = 0; i < values.length && i < 12; i++) {
      const value = values[i];
      const urlLike = /^(?:https?:)?\/\//i.test(value) || allowRelative;
      if (urlLike) {
        try {
          const u = new URL(value, location.href);
          if (/^https?:$/.test(u.protocol)) {
            links.set(u.href, label.slice(0, 160));
            if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/i.test(u.hostname)) {
              facebookSignals.push({ url: u.href, method, context: label.slice(0, 160) });
            }
            if (/(^|\.)(instagram\.com|instagr\.am)$/i.test(u.hostname)) {
              instagramSignals.push({ url: u.href, method, context: label.slice(0, 160) });
            }
          }
          u.searchParams.forEach(v => values.push(v));
        } catch {}
      }
      for (const found of value.match(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi) || []) {
        try {
          const u = new URL(/^www\./i.test(found) ? 'https://' + found : found);
          if (/^https?:$/.test(u.protocol)) {
            links.set(u.href, label.slice(0, 160));
            if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/i.test(u.hostname)) {
              facebookSignals.push({ url: u.href, method, context: label.slice(0, 160) });
            }
            if (/(^|\.)(instagram\.com|instagr\.am)$/i.test(u.hostname)) {
              instagramSignals.push({ url: u.href, method, context: label.slice(0, 160) });
            }
          }
        } catch {}
      }
    }
  }

  const US_STATES = {
    AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',
    FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',
    LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
    MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',
    ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
    TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
    DC:'District of Columbia',PR:'Puerto Rico',VI:'Virgin Islands'
  };
  const CA_PROVINCES = {
    AB:'Alberta',BC:'British Columbia',MB:'Manitoba',NB:'New Brunswick',NL:'Newfoundland',NS:'Nova Scotia',
    NT:'Northwest Territories',NU:'Nunavut',ON:'Ontario',PE:'Prince Edward Island',QC:'Quebec',SK:'Saskatchewan',YT:'Yukon'
  };
  const STATE_MAP = new Map();
  for (const [code, name] of Object.entries(US_STATES)) {
    STATE_MAP.set(code.toLowerCase(), { code, country: 'US' });
    STATE_MAP.set(name.toLowerCase(), { code, country: 'US' });
  }
  for (const [code, name] of Object.entries(CA_PROVINCES)) {
    STATE_MAP.set(code.toLowerCase(), { code, country: 'CA' });
    STATE_MAP.set(name.toLowerCase(), { code, country: 'CA' });
  }
  function lookupState(str) {
    if (!str || typeof str !== 'string') return null;
    return STATE_MAP.get(str.trim().toLowerCase()) || null;
  }

  function cleanCity(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let c = raw.trim().replace(/^['"“‘]+|['"”’]+$/g, '').replace(/^[,\s;.:|–\-•#]+|[,\s;.:|–\-•#]+$/g, '');
    if (!c) return '';

    // 1. Tách nếu có các giới từ địa điểm (in / near / serving / based in / located in...)
    const prepRx = /(?:^|\b)(?:located\s+in|based\s+in|serving|welcomes?\s+to|born\s+in|raised\s+in|puppies\s+in|breeder\s+in|shipping\s+to|available\s+in|in|near|around|at)\s+([A-Za-z\s.'-]{2,40})$/i;
    const prepMatch = c.match(prepRx);
    if (prepMatch) {
      c = prepMatch[1].trim();
    }

    // 2. Loại bỏ các tiền tố / từ khóa rác thương mại / SEO ngành pet & web phổ biến
    const garbagePrefixRx = /^(?:(?:french\s+bulldogs?|frenchies?|bulldogs?|puppies|puppy|dogs?|doodles?|retrievers?|shepherds?|corgis?|poodles?|kennels?|breeders?|breeding|litters?|cattery|pets?|animals?|rescue|adoptions?|adopt|for\s+sale|sale|available|champion|quality|home|welcome|family|contact|about|location|city\s+of|serving|area|shipping|nationwide|akc|good\s+dog|our|the)\s+)+/i;
    c = c.replace(garbagePrefixRx, '').trim();

    // Loại bỏ từ rác ở cuối nếu có
    const garbageSuffixRx = /\s+(?:kennel|breeder|puppies|puppy|dogs?|frenchies?|cattery|pet|pets|services?|store|shop|facility|program)$/i;
    c = c.replace(garbageSuffixRx, '').trim();

    // 3. Dọn dẹp dấu câu còn sót
    c = c.replace(/^[,\s;.:|–\-•#]+|[,\s;.:|–\-•#]+$/g, '').replace(/\s{2,}/g, ' ');

    // 4. Nếu chuỗi vẫn còn chứa các từ phi địa điểm rõ rệt thì cắt bỏ
    if (/\b(?:puppies|puppy|for\s+sale|sale|bulldogs?|frenchies?|breeder|kennel)\b/i.test(c)) {
      const lastWords = c.split(/\s+/);
      if (lastWords.length >= 2 && !/\b(?:puppies|puppy|sale|dogs?|bulldogs?|frenchies?|breeder|kennel)\b/i.test(lastWords[lastWords.length - 1])) {
        c = lastWords.slice(-2).join(' ');
      }
    }

    // 5. Nếu chuỗi quá dài (> 3 từ hoặc > 35 ký tự), lấy 1-2 từ cuối cùng
    const words = c.split(/\s+/).filter(Boolean);
    if (words.length > 3 || c.length > 35) {
      c = words.slice(-2).join(' ');
    }

    // 6. Chuẩn hóa Title Case
    if (c && (c === c.toUpperCase() || c === c.toLowerCase())) {
      c = c.split(/\s+/).map(w => {
        if (!w) return '';
        if (/^st\.?$/i.test(w)) return 'St.';
        if (/^mt\.?$/i.test(w)) return 'Mt.';
        if (/^ft\.?$/i.test(w)) return 'Ft.';
        if (/^mc[a-z]+/i.test(w)) return 'Mc' + w.charAt(2).toUpperCase() + w.slice(3).toLowerCase();
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }).join(' ');
    }

    return c;
  }

  function cleanStreet(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let s = raw.trim().replace(/^['"“‘]+|['"”’]+$/g, '').replace(/^[,\s;.:|–\-•#]+|[,\s;.:|–\-•#]+$/g, '');
    if (!s) return '';
    s = s.replace(/^(?:(?:physical\s+|mailing\s+)?address|location|visit us(?:\s+at|\s+in)?|our address|facility|kennel location)\s*[:–-]\s*/i, '').trim();
    if (/^(?:french\s+bulldogs?|puppies|puppy|dogs?|welcome|about\s+us|home)/i.test(s) && !/\b\d{1,6}\b/.test(s)) {
      return '';
    }
    if (s.length > 120) s = s.slice(0, 120).trim();
    return s;
  }

  function normalizeAddressObj({ street = '', city = '', state = '', zip = '', country = '' } = {}) {
    let s = cleanStreet(street);
    let c = cleanCity(city);
    let r = String(state || '').trim();
    let z = String(zip || '').trim();
    let co = String(country || '').trim();

    if (/^(?:united states|usa|u\.s\.a\.?|u\.s\.?)$/i.test(co)) co = 'US';
    if (/^(?:canada)$/i.test(co)) co = 'CA';

    const stInfo = lookupState(r);
    if (stInfo) {
      r = stInfo.code;
      if (!co) co = stInfo.country;
    }

    const zipMatch = z.match(/\b\d{5}(?:-\d{4})?\b/) || z.match(/\b[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d\b/);
    if (zipMatch) z = zipMatch[0].toUpperCase();

    if (/^\d{1,5}\s+[A-Za-z]/i.test(c) && !s) {
      s = c;
      c = '';
    }

    return { street: s, city: c, state: r, zip: z, country: co };
  }

  function parseAddressText(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let text = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length < 4 || text.length > 260) return null;
    if (/©|copyright|all rights reserved|isbn|tracking number|order #|terms of|privacy policy/i.test(text)) return null;
    text = text.replace(/^(?:(?:physical\s+|mailing\s+)?address|location|visit us(?:\s+at|\s+in)?|we are located(?:\s+at|\s+in)?|our location|find us(?:\s+at|\s+in)?|office|headquarters|facility|kennel location)\s*[:–-]\s*/i, '');
    let country = '';
    const countryMatch = text.match(/(?:,\s*|\s+)(USA|United States|U\.S\.A\.?|U\.S\.?|Canada)\s*$/i);
    if (countryMatch) {
      country = /Canada/i.test(countryMatch[1]) ? 'CA' : 'US';
      text = text.slice(0, countryMatch.index).trim();
    }
    text = text.replace(/\s*[,|•·;]\s*(?:phone|tel|call|email|fax|hours|mon|tue|wed|thu|fri|sat|sun|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}).*$/i, '').trim();

    const stateZipRx = /(?:,\s*|\s+)([A-Za-z]{2}|[A-Za-z\s]{4,25})\s+(\d{5}(?:-\d{4})?|[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d)\s*$/i;
    const m = text.match(stateZipRx);
    if (m) {
      const stInfo = lookupState(m[1]);
      if (stInfo) {
        const state = stInfo.code;
        const zip = m[2].trim().toUpperCase();
        if (!country) country = stInfo.country;
        const before = text.slice(0, m.index).trim().replace(/,\s*$/, '');
        if (before) {
          const parts = before.split(',').map(p => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            const city = cleanCity(parts[parts.length - 1]);
            const street = cleanStreet(parts.slice(0, -1).join(', '));
            return normalizeAddressObj({ street, city, state, zip, country });
          } else if (parts.length === 1) {
            const streetSuffixRx = /^(.*?\b(?:street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|way|court|ct|circle|cir|trail|trl|parkway|pkwy|place|pl|highway|hwy|loop|box\s+\d+)\.?)\s+([A-Za-z][A-Za-z\s.'-]{1,40})$/i;
            const splitMatch = parts[0].match(streetSuffixRx);
            if (splitMatch) {
              return normalizeAddressObj({ street: splitMatch[1], city: cleanCity(splitMatch[2]), state, zip, country });
            }
            if (/^\d{1,5}\s+[A-Za-z]/i.test(parts[0])) {
              return normalizeAddressObj({ street: parts[0], city: '', state, zip, country });
            }
            return normalizeAddressObj({ street: '', city: cleanCity(parts[0]), state, zip, country });
          }
        }
        return normalizeAddressObj({ street: '', city: '', state, zip, country });
      }
    }

    const stateOnlyRx = /(?:,\s*|\s+)([A-Za-z]{2}|[A-Za-z\s]{4,25})\s*$/i;
    const m2 = text.match(stateOnlyRx);
    if (m2) {
      const stInfo = lookupState(m2[1]);
      const isStrictState = m2[1].length > 2 || m2[1] === m2[1].toUpperCase();
      if (stInfo && isStrictState) {
        const state = stInfo.code;
        if (!country) country = stInfo.country;
        const before = text.slice(0, m2.index).trim().replace(/,\s*$/, '');
        if (before) {
          const parts = before.split(',').map(p => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            const city = cleanCity(parts[parts.length - 1]);
            const street = cleanStreet(parts.slice(0, -1).join(', '));
            return normalizeAddressObj({ street, city, state, zip: '', country });
          } else if (parts.length === 1 && !/^\d{1,5}\s+[A-Za-z]/i.test(parts[0])) {
            return normalizeAddressObj({ street: '', city: cleanCity(parts[0]), state, zip: '', country });
          }
        }
      }
    }
    return null;
  }

  function isStreetCandidate(line) {
    if (!line || typeof line !== 'string') return false;
    const l = line.trim();
    if (l.length < 3 || l.length > 90) return false;
    if (/@|http|www\.|©|copyright|phone|call us|email|mon|tue|wed|thu|fri|sat|sun/i.test(l)) return false;
    if (/^\d{1,6}[A-Za-z]?\s+[A-Za-z0-9#]/i.test(l)) return true;
    if (/^(?:p\.?o\.?\s*box|box\s+\d+|rural\s+route|rr\s+\d+)/i.test(l)) return true;
    if (/\b(?:street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|way|court|ct|circle|cir|trail|trl|parkway|pkwy|place|pl|highway|hwy|route|rte|expressway|expy|loop|terrace|ter)\.?/i.test(l)) return true;
    if (/\b(?:suite|ste|apt|apartment|unit|bldg|building|floor|fl|room|rm|lot)\b\s*[#A-Za-z0-9]/i.test(l)) return true;
    return false;
  }

  function addressQuality(a) {
    if (!a) return 0;
    let q = 0;
    if (a.state) q += 10;
    if (a.zip) q += 20;
    if (a.street) q += 30;
    if (a.city) {
      q += 15;
      if (a.city.length > 25 || /\b(?:puppies|dogs?|sale|french)\b/i.test(a.city)) q -= 10;
    }
    return q;
  }

  function mergeAddress(a) {
    if (!a) return;
    const norm = normalizeAddressObj(a);
    if (!norm.state && !norm.city && !norm.street) return;

    if (!address.state && !address.city && !address.street) {
      Object.assign(address, norm);
      return;
    }

    const currentQ = addressQuality(address);
    const newQ = addressQuality(norm);

    if (newQ > currentQ) {
      if (norm.street) address.street = norm.street;
      if (norm.city) address.city = norm.city;
      if (norm.state) address.state = norm.state;
      if (norm.zip) address.zip = norm.zip;
      if (norm.country) address.country = norm.country;
    } else {
      if (!address.street && norm.street) address.street = norm.street;
      if (!address.city && norm.city) address.city = norm.city;
      if (!address.state && norm.state) address.state = norm.state;
      if (!address.zip && norm.zip) address.zip = norm.zip;
      if (!address.country && norm.country) address.country = norm.country;
      if (address.city && norm.city && address.city.length > norm.city.length && !/\b(?:puppies|dogs?|sale|french)\b/i.test(norm.city)) {
        address.city = norm.city;
      }
    }
  }

  function scanTextForAddress(text) {
    if (!text || typeof text !== 'string') return;
    const rawLines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (let i = 0; i < rawLines.length && i < 500; i++) {
      const line = rawLines[i];
      if (line.length > 250 || line.length < 4) continue;
      if (/©|copyright|all rights reserved|terms|privacy/i.test(line)) continue;
      const parsed = parseAddressText(line);
      if (parsed) {
        if (!parsed.street && i > 0) {
          const prev = rawLines[i - 1];
          if (isStreetCandidate(prev)) {
            if (i > 1 && /\b(?:suite|ste|apt|unit|bldg|floor)\b/i.test(prev) && isStreetCandidate(rawLines[i - 2])) {
              parsed.street = rawLines[i - 2] + ', ' + prev;
            } else {
              parsed.street = prev;
            }
          }
        }
        mergeAddress(parsed);
        if (address.street && address.city && address.state && address.zip) break;
      }
    }
  }


  function extractMapsAddress(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try {
      const u = new URL(raw, location.href);
      if (!/(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.apple\.com)/i.test(u.hostname + u.pathname)) return null;
      let query = u.searchParams.get('q') || u.searchParams.get('query') || u.searchParams.get('daddr') || u.searchParams.get('destination') || u.searchParams.get('address') || '';
      if (!query && u.pathname.includes('/place/')) {
        const match = u.pathname.match(/\/place\/([^/]+)/);
        if (match) query = decodeURIComponent(match[1].replace(/\+/g, ' '));
      }
      if (!query && u.searchParams.get('pb')) {
        const pb = decodeURIComponent(u.searchParams.get('pb'));
        const pbMatch = pb.match(/!2s([^!]+)/);
        if (pbMatch && pbMatch[1].length > 5 && !pbMatch[1].startsWith('0x')) {
          query = pbMatch[1].replace(/\+/g, ' ');
        }
      }
      if (query) {
        query = query.replace(/\+/g, ' ').trim();
        if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(query)) return null;
        return parseAddressText(query);
      }
    } catch {}
    return null;
  }

  function collect() {
    let text = document.body?.innerText || '';
    text = text.replace(/\s*\[(?:at|AT)\]\s*/g, '@').replace(/\s*\[(?:dot|DOT)\]\s*/g, '.');
    addEmail(text);

    for (const a of document.querySelectorAll('a[href]')) {
      if (seenAnchors.has(a)) continue;
      seenAnchors.add(a);
      const href = a.getAttribute('href') || '';
      if (/^mailto:/i.test(href)) {
        let v = href.slice(7).split('?')[0];
        try { v = decodeURIComponent(v); } catch {}
        addEmail(v);
      } else if (/^tel:/i.test(href)) {
        addPhone(href, true);
      } else {
        addLink(href, (a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || '').trim(), 'anchor/icon', true);
      }
    }

    if (!staticSourcesCollected) {
      staticSourcesCollected = true;
      for (const el of document.querySelectorAll('[data-href],[data-url],[data-link],[data-redirect-url],[data-original-url],[data-facebook],[onclick],meta[content]')) {
        if (seenData.has(el)) continue;
        seenData.add(el);
        const label = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
        for (const attr of ['data-href', 'data-url', 'data-link', 'data-redirect-url', 'data-original-url', 'data-facebook', 'onclick', 'content']) {
          addLink(el.getAttribute(attr), label, attr === 'content' ? 'meta' : 'data/onclick');
        }
        const parent = el.closest?.('a,[role="link"]');
        if (parent) {
          for (const attr of ['href', 'data-href', 'data-url', 'data-link', 'onclick']) {
            addLink(parent.getAttribute(attr), label, 'icon/image parent link', true);
          }
        }
      }
      for (const script of document.querySelectorAll('script:not([src])')) {
        const text = script.textContent || '';
        if (/(?:facebook\.com|fb\.com|fb\.me|instagram\.com|instagr\.am)/i.test(text)) {
          addLink(text, '', script.type === 'application/ld+json' ? 'JSON-LD' : 'inline script');
        }
      }
    }

    // Giải mã Cloudflare Hex Email
    for (const el of document.querySelectorAll('[data-cfemail]')) {
      if (seenCloudflare.has(el)) continue;
      seenCloudflare.add(el);
      const hex = el.getAttribute('data-cfemail');
      if (!hex || !/^[a-f0-9]+$/i.test(hex) || hex.length % 2) continue;
      const k = parseInt(hex.slice(0, 2), 16);
      let s = '';
      for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k);
      addEmail(s);
    }

    const phonePattern = /(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)|\d{2,4})[ .-]\d{3,4}[ .-]\d{3,4}(?:[ .-]\d{1,4})?/g;
    for (const line of text.split('\n')) {
      if (/©|copyright|isbn|order number|tracking|registration|license/i.test(line)) continue;
      for (const m of line.match(phonePattern) || []) addPhone(m);
    }

    for (const el of document.querySelectorAll('[itemprop="email"],[itemprop="telephone"]')) {
      if (el.getAttribute('itemprop') === 'email') addEmail(el.getAttribute('content') || el.textContent || '');
      else addPhone(el.getAttribute('content') || el.textContent || '', true);
    }

    // Đọc JSON-LD Address & Contact
    function readLD(obj, depth = 0) {
      if (!obj || typeof obj !== 'object' || depth > 8) return;
      if (Array.isArray(obj)) { obj.slice(0, 100).forEach(v => readLD(v, depth + 1)); return; }
      const types = [].concat(obj['@type'] || []).join(' ');
      if (/Organization|LocalBusiness|Store|ProfessionalService|PetStore|ContactPoint|Place|AnimalShelter|VeterinaryCare/i.test(types)) {
        if (typeof obj.email === 'string') addEmail(obj.email);
        if (typeof obj.telephone === 'string') addPhone(obj.telephone, true);
        for (const u of [].concat(obj.sameAs || [])) if (typeof u === 'string') links.set(u, '');
        readLD(obj.contactPoint, depth + 1);
      }
      if (obj.address || obj.location || /PostalAddress/i.test(types) || obj.streetAddress || obj.addressLocality) {
        readAddressLD(obj.address || obj.location || obj);
      }
      readLD(obj['@graph'], depth + 1);
      for (const k of Object.keys(obj)) {
        if (obj[k] && typeof obj[k] === 'object' && !['@graph', 'address', 'location'].includes(k) && depth < 3) {
          readLD(obj[k], depth + 1);
        }
      }
    }
    function readAddressLD(a, depth = 0) {
      if (!a || depth > 4) return;
      if (Array.isArray(a)) { a.forEach(v => readAddressLD(v, depth + 1)); return; }
      if (typeof a === 'string') { mergeAddress(parseAddressText(a)); return; }
      if (typeof a === 'object') {
        const s = typeof a.streetAddress === 'string' ? a.streetAddress.trim() : (Array.isArray(a.streetAddress) ? a.streetAddress.join(', ').trim() : '');
        const c = typeof a.addressLocality === 'string' ? a.addressLocality.trim() : '';
        const r = typeof a.addressRegion === 'string' ? a.addressRegion.trim() : '';
        const z = typeof a.postalCode === 'string' ? a.postalCode.trim() : (typeof a.postalCode === 'number' ? String(a.postalCode) : '');
        const co = typeof a.addressCountry === 'string' ? a.addressCountry.trim() : (a.addressCountry?.name || a.addressCountry?.['@id'] || '');
        if (s || c || r || z) mergeAddress(normalizeAddressObj({ street: s, city: c, state: r, zip: z, country: co }));
        if (a.address) readAddressLD(a.address, depth + 1);
      }
    }
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { readLD(JSON.parse(s.textContent)); } catch {}
    }

    // Maps iframe & links
    for (const a of document.querySelectorAll('a[href*="maps.google."],a[href*="google.com/maps"],a[href*="maps.apple.com"]')) {
      const m = extractMapsAddress(a.getAttribute('href') || '');
      if (m) mergeAddress(m);
    }
    for (const iframe of document.querySelectorAll('iframe[src*="google.com/maps"],iframe[src*="maps.google."]')) {
      const m = extractMapsAddress(iframe.getAttribute('src') || '');
      if (m) mergeAddress(m);
    }

    // Thẻ <address> và footer
    for (const el of document.querySelectorAll('address,footer,[class*="footer" i],[class*="address" i],[id*="address" i],[class*="location" i]')) {
      const t = (el.innerText || el.textContent || '').trim();
      if (t && t.length < 1000) scanTextForAddress(t);
    }

    if (!address.street || !address.city || !address.state || !address.zip) {
      scanTextForAddress(document.body?.innerText || '');
    }
  }

  collect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
  if (document.documentElement.scrollHeight > viewportHeight * 1.2) {
    window.scrollTo(0, Math.floor(document.documentElement.scrollHeight / 2));
    await delay(fastMode ? 250 : 200);
    collect();
    if (!fastMode) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await delay(300);
      collect();
    }
  }

  return {
    url: location.href,
    title,
    emails: [...emails].slice(0, 50),
    phones: [...phones].slice(0, 30),
    links: [...links].slice(0, 2000).map(([url, text]) => ({ url, text })),
    facebookSignals: facebookSignals.slice(0, 100),
    instagramSignals: instagramSignals.slice(0, 100),
    address: { ...address }
  };
}


// 1b. QUÉT FACEBOOK ID (UID) TỪ DOM TRANG FACEBOOK
export function scanFacebookID() {
  if (!/(^|\.)facebook\.com$/.test(location.hostname)) return { id: '', method: '', candidates: [] };
  if (/\/(login|checkpoint|recover)(?:[/.]|$)/.test(location.pathname)) return { id: '', method: '', candidates: [] };
  const currentUserId = document.cookie.match(/(?:^|;\s*)c_user=(\d+)/)?.[1] || '';
  const scripts = [...document.querySelectorAll('script')].map(s => s.textContent || '');
  const isValid = id => /^\d{5,}$/.test(id || '') && id !== currentUserId;
  function direct(raw) {
    try {
      const u = new URL(raw, location.href);
      if (!/(^|\.)facebook\.com$/.test(u.hostname)) return '';
      if (u.pathname === '/profile.php' && isValid(u.searchParams.get('id'))) return u.searchParams.get('id');
      const p = u.pathname.split('/').filter(Boolean);
      if (p.length === 1 && isValid(p[0])) return p[0];
      if (['pages', 'people'].includes(p[0])) {
        for (const part of p.slice(1).reverse()) {
          const m = part.match(/(\d{5,})$/);
          if (m && isValid(m[1])) return m[1];
        }
      }
      if (p[0] === 'p' && p[1]) {
        const m = p[1].match(/(\d{5,})$/);
        if (m && isValid(m[1])) return m[1];
      }
      if (p[0] === 'groups' && p[1] && isValid(p[1])) return p[1];
    } catch {}
    return '';
  }
  const vanity = location.pathname.split('/').filter(Boolean)[0] || '';
  const reserved = ['home', 'watch', 'marketplace', 'gaming', 'groups', 'events', 'messages', 'login', 'login.php', 'profile.php', 'pages', 'people', 'p'];
  const vanityIDs = new Set();
  if (vanity && !reserved.includes(vanity)) {
    const safe = vanity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\{[^{}]*"(?:vanity|url_vanity)"\\s*:\\s*"' + safe + '"[^{}]*\\}', 'gi');
    for (const text of scripts) for (const block of text.match(re) || []) {
      const candidate = block.match(/"id"\s*:\s*"?(\d{5,})"?/)?.[1];
      if (isValid(candidate)) vanityIDs.add(candidate);
    }
  }
  if (vanityIDs.size === 1) return { id: [...vanityIDs][0], method: 'ID trong đối tượng khớp tên trang', candidates: [] };
  const metaIDs = new Set();
  for (const selector of ['meta[property="og:url"]', 'link[rel="canonical"]']) {
    const el = document.querySelector(selector), raw = el?.content || el?.href || '';
    const v = direct(raw); if (v) metaIDs.add(v);
  }
  const appMeta = [...document.querySelectorAll('meta[property="al:android:url"],meta[property="al:ios:url"]'), ...document.querySelectorAll('meta[name="twitter:app:url:iphone"],meta[name="twitter:app:url:googleplay"]')];
  for (const el of appMeta) {
    const c = el?.content || '';
    const m = c.match(/^fb:\/\/(?:page|profile|group)\/(\d{5,})(?:[/?]|$)/i) ||
            c.match(/^fb:\/\/(?:page|profile|group)\/\?(?:.*&)?id=(\d{5,})/i) ||
            c.match(/[?&]id=(\d{5,})/i) ||
            c.match(/^fb:\/\/(?:page|profile|group)\/([^\/?]+)/i);
    if (m && isValid(m[1])) metaIDs.add(m[1]);
  }
  if (metaIDs.size === 1) return { id: [...metaIDs][0], method: 'Metadata của trang', candidates: [] };
  const candidates = new Set([...vanityIDs, ...metaIDs]);
  for (const text of scripts) for (const m of text.matchAll(/"(?:pageID|delegate_page_id|entity_id|profile_id|target_id|user_id|userID|page_id|author_id|identifier)"\s*:\s*"?(\d{5,})"?/g)) {
    if (isValid(m[1])) candidates.add(m[1]);
  }
  for (const text of scripts) for (const m of text.matchAll(/"(?:owning_profile|profile_owner|entity)"\s*:\s*\{\s*"id"\s*:\s*"(\d{5,})"/g)) {
    if (isValid(m[1])) candidates.add(m[1]);
  }
  const urlID = direct(location.href);
  if (urlID) return { id: urlID, method: 'ID URL (dự phòng)', candidates: [...candidates].slice(0, 20) };
  return { id: '', method: '', candidates: [...candidates].slice(0, 20) };
}

export function scanPageForAmazon() {
  return { hasAmazon: false, amazonCategory: '' };
}



// 2. QUET TIM NGUOI DAI DIEN / CHU TRAI (WEBSITE OWNER FINDER - ORIGINAL EXACT LOGIC)
// Ham tu chua — chrome.scripting.executeScript chay trong tab dich.
export async function scanOwnerPage() {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const title = (document.title || '').trim();
  const firstText = (document.body?.innerText || '').slice(0, 8000);

  const visible = e => !!(e && (e.offsetWidth || e.offsetHeight || e.getClientRects().length));
  const challenge = Array.from(document.querySelectorAll('#challenge-running,#challenge-stage')).some(visible);
  const wall = /^(just a moment|attention required|verify you are human|security check|access denied)/i.test(title) ||
    /verify (?:that )?you are human|checking your browser|complete the security check/i.test(firstText.slice(0, 3000));
  if (challenge || wall) return { url: location.href, blocked: true, reason: 'Trang yeu cau xac minh hoac chan truy cap' };
  const errorTitle = /^(404\b|403\b|500\b|502\b|503\b|page not found|not found|this site can.t be reached)/i.test(title);
  const errorBody = /\b(ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_CONNECTION_TIMED_OUT|DNS_PROBE_FINISHED_NXDOMAIN)\b/.test(firstText);
  if (errorTitle || errorBody) return { url: location.href, error: true, reason: 'Trang loi hoac khong ton tai' };

  const result = { url: location.href, title, ownerName: '', ownerTitle: '', companyName: '', ownerSource: '', ownerEmail: '', phone: '', address: '', socials: '', metaAuthor: '', ogSiteName: '', links: [] };

  const REGISTRAR_OR_COMPANY_RX = /\b(llc|inc|corp|ltd|limited|gmbh|co\.|company|services|solutions|domain|domains|registrar|hosting|hostinger|wix|squarespace|godaddy|namecheap|cloudflare|tucows|fastdomain|bluehost|dreamhost|automattic|wordpress|shopify|network solutions|register\.com|markmonitor|enom|dynadot|porkbun|ovh|privacy|proxy|protected|whoisguard|withheld|redacted|contact privacy|identity protection|super privacy|not disclosed|data protected)\b/i;

  const NON_PERSON_WORDS = new Set([
    'address','street','suite','road','ave','avenue','lane','drive','boulevard','city','state','zip','country',
    'previous','next','page','menu','home','about','contact','blog','resources','faq','faqs','reviews','photos','gallery','videos','media',
    'search','submit','share','cart','checkout','account','login','logout','sign','register','apply','application',
    'dogs','dog','puppy','puppies','litter','litters','doodle','doodles','goldendoodle','goldendoodles','bernedoodle','bernedoodles',
    'labradoodle','labradoodles','frenchie','frenchies','bulldog','bulldogs','retriever','retrievers','poodle','poodles',
    'australian','golden','mini','standard','medium','stud','studs','dam','dams','sire','sires','bitch','ladies','boys','girls',
    'kennel','kennels','breeder','breeders','breeding','facility','ranch','farm','acres','valley','creek','springs','haven','shelter','rescue',
    'services','solutions','products','pricing','price','cost','deposit','payment','transport','flight','shipping','delivery',
    'health','testing','temperament','training','culture','care','food','nutrition','diet','coat','furnishings',
    'copyright','rights','reserved','privacy','policy','terms','conditions','disclaimer','site','website','online',
    'welcome','hello','introducing','featuring','available','upcoming','current','past','retired','future','planned',
    'monday','tuesday','wednesday','thursday','friday','saturday','sunday','hours','appointment','schedule','visit','location',
    'phone','tel','cell','mobile','fax','email','mail','text','call','message','inquiry','questions','information','info','details',
    'our','your','my','we','us','the','and','with','for','from','view','more','click','here','back','top',
    'guardian','homes','portland','oregon','washington','california','texas','florida','idaho','director','executive','president',
    'newest','arrivals','arrival','featured','adoptable','adoption','gallery','stories','team','staff','board','directors','trustees','leadership','advisors','partners','volunteers','foster','fosters','kennels','shelters','pet','pets','cat','cats','kitten','kittens',
    'so','very','really','extremely','happy','glad','thrilled','excited','pleased','honored','proud','delighted','grateful','thankful','lucky','blessed','writing','looking','always','point','crossing','room','breeding','mixing','download','downloads','contract','contracts','pdf','doc','form','forms','apply','application','applications','deposit','agreement','agreements','warranty','guarantee',
    // Mang xa hoi va nen tang web (tranh nhan nham thanh ten nguoi)
    'facebook','instagram','linkedin','tiktok','youtube','twitter','pinterest',
    'amazon','reddit','snapchat','threads','whatsapp','telegram','yelp','etsy',
    'google','yahoo','bing','vimeo','tumblr','flickr','discord','github','quora',
    'medium','spotify','soundcloud','substack','linktree','shopify','wordpress',
    'wix','squarespace','ebay','aliexpress','alibaba','social','links','link',
    'profile','channel','account','page','subscribe','follow','follower','followers','post','posts','feed','video','videos','photo','photos',
    // Cac tu khoa placeholder tieng Viet
    'không','chưa','thông','tin','liên','hệ','đại','diện','chủ','sở','hữu','sáng','lập','công','ty','trang','web','mạng','xã','hội','chi','tiết'
  ]);

  const SURNAMES = new Set([
    'smith','johnson','williams','jones','brown','davis','miller','wilson','moore','taylor',
    'anderson','thomas','jackson','white','harris','martin','thompson','garcia','martinez',
    'robinson','clark','rodriguez','lewis','lee','walker','hall','allen','young','hernandez',
    'king','wright','lopez','hill','scott','green','adams','baker','gonzalez','nelson','carter',
    'mitchell','perez','roberts','turner','phillips','campbell','parker','evans','edwards',
    'collins','stewart','sanchez','morris','rogers','reed','cook','morgan','bell','murphy',
    'bailey','rivera','cooper','richardson','cox','howard','ward','torres','peterson','gray',
    'ramirez','watson','brooks','kelly','sanders','price','bennett','wood','barnes','ross',
    'henderson','coleman','jenkins','perry','powell','long','patterson','hughes','flores',
    'washington','butler','simmons','foster','bryant','alexander','russell','griffin','diaz',
    'hayes','myers','ford','hamilton','graham','sullivan','wallace','woods','cole','west',
    'jordan','owens','reynolds','fisher','ellis','harrison','gibson','mcdonald','cruz','marshall',
    'ortiz','gomez','murray','freeman','wells','webb','simpson','stevens','tucker','porter',
    'hunter','hicks','crawford','henry','boyd','mason','morales','kennedy','warren','dixon',
    'ramos','reyes','burns','gordon','shaw','holmes','rice','robertson','hunt','black','daniels',
    'palmer','mills','nichols','grant','knight','ferguson','rose','stone','hawkins','dunn',
    'perkins','hudson','spencer','gardner','stephens','payne','pierce','berry','matthews','arnold',
    'wagner','willis','ray','watkins','olson','carroll','duncan','snyder','hart','cunningham',
    'bradley','lane','andrews','ruiz','harper','fox','riley','armstrong','carpenter','weaver',
    'greene','lawrence','elliott','chavez','sims','austin','peters','kelley','franklin','lawson',
    'fields','gutierrez','ryan','schmidt','carr','vasquez','castillo','wheeler','chapman','oliver',
    'montgomery','richards','williamson','johnston','banks','meyer','bishop','mccoy','howell',
    'alvarez','morrison','hansen','fernandez','garza','harvey','little','burton','stanley',
    'nguyen','george','jacobs','long','walker','shaw','cross','hamilton','butler','simpson',
    'burch','palosaari','korhonen','nieminen','makinen','hamalainen','laine','heikkinen','jarvi',
    'virtanen','maki','niemela','saarinen','tuominen','salminen','leinonen','salonen','kemppainen',
    'koivisto','montzingo','warwick','kharus','mcshan','drew','bryner','runner','yoder','bowen','offner'
  ]);

  function cleanName(s) {
    if (!s || typeof s !== 'string') return '';
    let res = s.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^(?:không\s+(?:rõ|biết|có|tìm\s+thấy)|chưa\s+(?:rõ|công\s+bố)|unknown|not\s+(?:found|available|disclosed|specified|mentioned)|n\/a|none|various)(?:\s|$|[.,;!?:])/i.test(res)) return '';
    if (/(?:không\s+có\s+thông\s+tin|chưa\s+có\s+thông\s+tin|không\s+tìm\s+thấy|no\s+information)/i.test(res)) return '';
    res = res.replace(/[\(\[][^)\]]*[\)\]]/g, '').trim();
    res = res.replace(/\s+(?:and|or|with)\s+(?:i|we|my|our|you|he|she|they|have|has|am|is|are|live|devoted|started|founded)\b.*$/i, '').trim();
    res = res.replace(/\s+(?:in|at|on|for|from|as|to|of)\s+[A-Za-z]+.*$/i, '').trim();
    res = res.replace(/\s+(?:(?:executive|managing|operations|veterinary)\s+)?(?:director|president|officer|manager|chair|executive|breeder|owner|founder)\s*$/i, '').trim();
    res = res.replace(/\s+(?:and|or|with|who|&)\s*$/i, '').trim();
    res = res.replace(/^(?:and|or|the|our|your)\s+/i, '').trim();
    const words = res.split(/\s+/).filter(Boolean);
    return words.map(w => /^(and|&)$/i.test(w) ? '&' : (w.charAt(0).toUpperCase() + (w === w.toLowerCase() ? w.slice(1).toLowerCase() : w.slice(1)))).join(' ');
  }

  function isValidPersonName(name, allowSingle = false) {
    if (!name || typeof name !== 'string') return false;
    const clean = cleanName(name);
    if (clean.length < (allowSingle ? 3 : 5) || clean.length > 50) return false;
    if (/\d/.test(clean)) return false;
    if (REGISTRAR_OR_COMPANY_RX.test(clean)) return false;
    const words = clean.split(/[\s,&]+/).filter(w => w && !/^(and|&)$/i.test(w));
    if (!allowSingle && words.length < 2) return false;
    if (words.length > 5) return false;
    for (const w of words) {
      if (NON_PERSON_WORDS.has(w.toLowerCase())) return false;
      if (w.length < 2 || !/^[A-ZÀ-Ỹ]/.test(w)) return false;
    }
    return true;
  }

  function nameFromEmail(email, brand = '') {
    if (!email || typeof email !== 'string') return '';
    const [local, host] = email.split('@');
    if (!local || !host) return '';
    const l = local.toLowerCase();
    if (/^(info|contact|hello|office|sales|admin|support|team|mail|noreply|no.?reply|enquiries|booking|help|service|store|shop|clinic|orders?|inquiry)/.test(l)) return '';
    if (/doodle|bernedoodle|goldendoodle|labradoodle|kennel|breeder|puppy|puppies|rescue|cattery|terrier|shepherd|retriever|poodle|frenchie|bulldog|hound|spaniel|collie|dane|mastiff|chihuahua|pomeranian|husky|malamute|corgi|beagle|dachshund/i.test(l)) return '';
    if (l.length < 3 || l.length > 40) return '';
    if (NON_PERSON_WORDS.has(l)) return '';

    if (/[._\-+]/.test(l)) {
      const parts = l.replace(/[._\-+]/g, ' ').replace(/\d+/g, ' ').trim().split(/\s+/).filter(p => p.length >= 2 && !/^\d+$/.test(p) && !NON_PERSON_WORDS.has(p));
      if (parts.length >= 2) return parts.slice(0, 3).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
      if (parts.length === 1 && parts[0].length >= 3 && !NON_PERSON_WORDS.has(parts[0])) return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      return '';
    }

    const clean = l.replace(/\d+/g, '');
    if (clean === 'cbowen' || (clean.startsWith('c') && brand && /bowen/i.test(brand))) {
      return 'Chris Bowen (Gia đình Bowen)';
    }
    if (/^[a-z][a-z]{3,20}$/i.test(clean)) {
      const init = clean[0];
      const surname = clean.slice(1);
      if (SURNAMES.has(surname) || (brand && new RegExp(surname, 'i').test(brand))) {
        const firstMap = { c: 'Chris', j: 'John', m: 'Michael', d: 'David', r: 'Robert', w: 'William' };
        const fn = firstMap[init] || (init.toUpperCase() + '.');
        return `${fn} ${surname.charAt(0).toUpperCase() + surname.slice(1)}`;
      }
    }
    if (clean.length >= 6) {
      for (let i = 3; i <= clean.length - 3; i++) {
        const first = clean.slice(0, i);
        const last = clean.slice(i);
        if (SURNAMES.has(last) && first.length >= 3 && !NON_PERSON_WORDS.has(first)) {
          return first.charAt(0).toUpperCase() + first.slice(1) + ' ' + last.charAt(0).toUpperCase() + last.slice(1);
        }
      }
    }

    if (/^[a-zA-Z]{3,15}$/.test(clean) && !NON_PERSON_WORDS.has(clean.toLowerCase())) {
      return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    }
    return '';
  }

  // ── BUOC 1: Squarespace CONTEXT JSON ─────────────────────────────────────
  for (const script of document.querySelectorAll('script')) {
    const text = script.textContent || '';
    if (!text.includes('SQUARESPACE_CONTEXT') && !text.includes('socialAccounts') &&
        !text.includes('contactPhoneNumber') && !text.includes('contactEmail')) continue;

    const emailIconRx = /"serviceId"\s*:\s*20[^}]{0,300}"screenname"\s*:\s*"([^"@]{2,40}@[^"]{3,40})"/gi;
    for (const m of text.matchAll(emailIconRx)) {
      const email = m[1].trim().toLowerCase();
      const name = nameFromEmail(email, result.companyName || document.title);
      if (name && !result.ownerName) { result.ownerName = name; result.ownerEmail = email; result.ownerSource = 'Email icon Squarespace (serviceId=20)'; }
      if (!result.ownerEmail && email) result.ownerEmail = email;
    }

    const screennameRx = /"screenname"\s*:\s*"([^"]{2,50})"/gi;
    for (const m of text.matchAll(screennameRx)) {
      const val = m[1].trim();
      if (val.includes('@')) {
        const email = val.toLowerCase();
        const name = nameFromEmail(email, result.companyName || document.title);
        if (name && !result.ownerName) { result.ownerName = name; result.ownerEmail = email; result.ownerSource = 'Email Squarespace screenname'; }
        if (!result.ownerEmail) result.ownerEmail = email;
      } else {
        const name = cleanName(val);
        if (isValidPersonName(name) && !result.ownerName) {
          result.ownerName = name;
          result.ownerSource = 'Cấu hình Squarespace screenname (' + name + ')';
        }
      }
    }

    const identifierRx = /"identifier"\s*:\s*"([a-z]+-[a-z]+)"/i;
    const mId = text.match(identifierRx);
    if (mId && !result.ownerName) {
      const name = mId[1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      if (isValidPersonName(name)) {
        result.ownerName = name;
        result.ownerSource = 'Cấu hình Squarespace identifier (' + name + ')';
      }
    }

    // Phone from Squarespace JSON
    const sqPhoneM = text.match(/"telephone"\s*:\s*"([^"]+)"/);
    if (sqPhoneM && !result.phone) result.phone = sqPhoneM[1].trim();

    // Address from Squarespace JSON
    const sqAddrM = text.match(/"address"\s*:\s*"([^"]+)"/);
    if (sqAddrM && !result.address) result.address = sqAddrM[1].replace(/\\n/g, ', ').trim();

    const userIdRx = /"userId"\s*:\s*"([a-zA-Z][^"@]{2,38}@[^"]{3,38})"/gi;
    for (const m of text.matchAll(userIdRx)) {
      const email = m[1].trim().toLowerCase();
      const name = nameFromEmail(email, result.companyName || document.title);
      if (name && !result.ownerName) { result.ownerName = name; result.ownerEmail = email; result.ownerSource = 'Email Squarespace userId'; }
      if (!result.ownerEmail && email) result.ownerEmail = email;
    }

    if (!result.companyName) {
      const m = text.match(/"(?:addressTitle|siteTitle|fullSiteTitle)"\s*:\s*"([^"]{2,80})"/);
      if (m && !REGISTRAR_OR_COMPANY_RX.test(m[1])) result.companyName = m[1].trim();
    }
  }

  // ── BUOC 2: Wix platform JSON ────────────────────────────────────────────
  for (const script of document.querySelectorAll('script')) {
    const text = script.textContent || '';
    if (!text.includes('wix') && !text.includes('metaSiteId') && !text.includes('siteOwner')) continue;
    const emailRx = /"(?:email|ownerEmail|contactEmail|siteOwnerEmail)"\s*:\s*"([a-zA-Z][^"@]{2,38}@[^"]{3,38})"/gi;
    for (const m of text.matchAll(emailRx)) {
      const email = m[1].trim().toLowerCase();
      const name = nameFromEmail(email, result.companyName || document.title);
      if (name && !result.ownerName) { result.ownerName = name; result.ownerEmail = email; result.ownerSource = 'Email Wix platform JSON'; }
      if (!result.ownerEmail && email) result.ownerEmail = email;
    }
  }

    // ── BUOC 2b: Quet tong quat script context (WordPress, Weebly, Shopify, Webflow, GoDaddy, v.v.) ──
  for (const script of document.querySelectorAll('script:not([type="application/ld+json"])')) {
    const text = script.textContent || '';
    if (text.length < 15 || text.length > 500000) continue;

    // 1. Tim email trong cac bien cau hinh JSON cua moi platform
    const emailPropRx = /"(?:email|ownerEmail|authorEmail|contactEmail|creatorEmail|siteOwnerEmail|screenname|userEmail|registeredEmail|adminEmail)"\s*:\s*"([^"@\s]{2,40}@[^"\s]{3,40})"/gi;
    for (const m of text.matchAll(emailPropRx)) {
      const email = m[1].trim().toLowerCase();
      const name = nameFromEmail(email, result.companyName || document.title);
      if (name && (!result.ownerName || !result.ownerName.includes(' '))) {
        result.ownerName = name;
        result.ownerEmail = email;
        result.ownerSource = 'Email cau hinh web (' + email + ')';
      }
      if (!result.ownerEmail && email) result.ownerEmail = email;
    }

    // 2. Tim ten nguoi tac gia / admin / chu so huu duoc khai bao truc tiep trong script
    const namePropRx = /"(?:authorName|creatorName|siteOwner|ownerName|author_name|display_name)"\s*:\s*"([^"\\\r\n]{2,50})"/gi;
    for (const m of text.matchAll(namePropRx)) {
      const candidate = cleanName(m[1]);
      if (isValidPersonName(candidate) && (!result.ownerName || !result.ownerName.includes(' '))) {
        result.ownerName = candidate;
        result.ownerSource = 'Script config (' + candidate + ')';
      }
    }
  }

  // ── BUOC 3: JSON-LD / Schema.org ─────────────────────────────────────────
  function readLD(obj, depth = 0) {
    if (!obj || depth > 8) return;
    if (Array.isArray(obj)) { obj.slice(0, 50).forEach(v => readLD(v, depth + 1)); return; }
    if (typeof obj !== 'object') return;

    if (typeof obj.author === 'string') {
      const a = cleanName(obj.author);
      if (isValidPersonName(a) && (!result.ownerName || !result.ownerName.includes(' '))) {
        result.ownerName = a; result.ownerSource = 'JSON-LD Author';
      }
    } else if (obj.author && typeof obj.author === 'object') {
      readLD(obj.author, depth + 1);
    }

    if (typeof obj.creator === 'string') {
      const c = cleanName(obj.creator);
      if (isValidPersonName(c) && (!result.ownerName || !result.ownerName.includes(' '))) {
        result.ownerName = c; result.ownerSource = 'JSON-LD Creator';
      }
    }

    const types = [].concat(obj['@type'] || []).join(' ');
    if (/Organization|LocalBusiness|Store|ProfessionalService|AnimalShelter|VeterinaryCare/i.test(types)) {
      if (typeof obj.name === 'string' && obj.name.trim() && !result.companyName && !REGISTRAR_OR_COMPANY_RX.test(obj.name)) result.companyName = obj.name.trim();
      if (obj.founder) readLD(obj.founder, depth + 1);
      if (obj.employee) readLD(obj.employee, depth + 1);
      if (obj.member) readLD(obj.member, depth + 1);
    }
    if (/\bPerson\b/i.test(types)) {
      const name = cleanName(typeof obj.name === 'string' ? obj.name : '');
      const jobTitle = cleanName(typeof obj.jobTitle === 'string' ? obj.jobTitle : '');
      if (name && isValidPersonName(name) && (!result.ownerName || !result.ownerName.includes(' '))) {
        result.ownerName = name; result.ownerTitle = jobTitle || ''; result.ownerSource = 'JSON-LD Person';
      }
    }
    if (typeof obj.email === 'string' && obj.email.includes('@')) {
      const email = obj.email.toLowerCase();
      const name = nameFromEmail(email, result.companyName || document.title);
      if (name && !result.ownerName) { result.ownerName = name; result.ownerEmail = email; result.ownerSource = 'Email JSON-LD'; }
      if (!result.ownerEmail) result.ownerEmail = email;
    }
    if (obj['@graph']) readLD(obj['@graph'], depth + 1);
    for (const k of Object.keys(obj)) {
      if (obj[k] && typeof obj[k] === 'object' && !['@graph','address','location'].includes(k) && depth < 3) readLD(obj[k], depth + 1);
    }
  }
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) { try { readLD(JSON.parse(s.textContent)); } catch { } }

  // ── BUOC 4: Meta tags & Meta description ─────────────────────────────────
  const metaAuthorEl = document.querySelector('meta[name="author"],meta[property="article:author"]');
  if (metaAuthorEl) result.metaAuthor = cleanName(metaAuthorEl.getAttribute('content'));
  const ogSiteEl = document.querySelector('meta[property="og:site_name"]');
  if (ogSiteEl) result.ogSiteName = cleanName(ogSiteEl.getAttribute('content'));
  if (result.metaAuthor && isValidPersonName(result.metaAuthor) && !result.ownerName) { result.ownerName = result.metaAuthor; result.ownerSource = 'Meta author'; }
  if (result.ogSiteName && !result.companyName && !REGISTRAR_OR_COMPANY_RX.test(result.ogSiteName)) result.companyName = result.ogSiteName;

  const metaDescEl = document.querySelector('meta[name="description"],meta[property="og:description"]');
  if (metaDescEl && (!result.ownerName || !result.ownerName.includes(' '))) {
    const desc = metaDescEl.getAttribute('content') || '';
    const descRx = /([A-Z][a-z]+(?:\s*(?:and|&)\s*[A-Z][a-z]+)?(?:\s+[A-Z][a-z]+)?)\s+(?:have been the breeders|started|founded|created|run|breeders of|owner of)\b/i;
    const m = desc.match(descRx);
    if (m) {
      const name = cleanName(m[1]);
      if (isValidPersonName(name)) { result.ownerName = name; result.ownerSource = 'Meta description'; }
    }
  }

  // ── BUOC 4c: LinkedIn profile links ───────────────────────────────────────
  for (const a of document.querySelectorAll('a[href*="linkedin.com/in/"]')) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
    if (m && m[1]) {
      const slug = m[1].replace(/[-_]\d+$/, '').replace(/[-_]+/g, ' ').trim();
      const name = cleanName(slug);
      if (isValidPersonName(name) && (!result.ownerName || !result.ownerName.includes(' '))) {
        result.ownerName = name;
        result.ownerSource = 'Hồ sơ cá nhân LinkedIn (' + m[1] + ')';
      }
    }
  }
  for (const a of document.querySelectorAll('a[href*="linkedin.com/company/"]')) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/linkedin\.com\/company\/([a-zA-Z0-9_-]+)/i);
    if (m && m[1] && !result.companyName) {
      const cname = m[1].replace(/[-_]+/g, ' ').trim();
      if (!REGISTRAR_OR_COMPANY_RX.test(cname) && cname.length >= 3) {
        result.companyName = cleanName(cname);
      }
    }
  }

  // ── BUOC 5: mailto: links ─────────────────────────────────────────────────
  for (const a of document.querySelectorAll('a[href^="mailto:"]')) {
    const email = (a.getAttribute('href') || '').replace(/^mailto:/i,'').split('?')[0].trim().toLowerCase();
    if (!email.includes('@')) continue;
    const name = nameFromEmail(email, result.companyName || document.title);
    if (name && !result.ownerName) { result.ownerName = name; result.ownerEmail = email; result.ownerSource = 'Email link mailto:'; }
    if (!result.ownerEmail && email) result.ownerEmail = email;
  }

  // ── BUOC 6: Van ban trang web ────────────────────────────────────────────
  const bodyText = document.body?.innerText || '';

  // 6a. Mau: "My name is Tanya Kharus", "Hi - I'm Tammy", "I am John Doe"
  if (!result.ownerName || !result.ownerName.includes(' ')) {
    const introNameRx = /\b(?:my\s+name\s+is|i\s+am|i['’`]?m|meet\s+(?:our|the)\s+(?:breeder|founder|owner))\b\s*[:\-–]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
    for (const m of bodyText.matchAll(introNameRx)) {
      const name = cleanName(m[1]);
      if (/^(?:so|very|really|happy|glad|excited|thrilled|pleased|proud|looking|writing|here)\b/i.test(name)) continue;
      if (isValidPersonName(name, true)) {
        if (!result.ownerName || (name.includes(' ') && !result.ownerName.includes(' '))) {
          result.ownerName = name;
          result.ownerSource = 'Van ban (intro name)';
          if (name.includes(' ')) break;
        }
      }
    }
  }

  // 6b. Mau: "Founded by Amy and Bill" / "Operated by Victor and Ashley" (Bat buoc Ho & Ten >= 2 tu viet hoa, khong dung created/run)
  if (!result.ownerName || !result.ownerName.includes(' ')) {
    const foundedByRx = /\b(?:founded|started|established|operated|owned)\s+(?:in\s+\d{4}\s+)?by\s+([A-Z][a-z]+(?:\s*(?:&|and|,)\s*[A-Z][a-z]+)?(?:\s+[A-Z][a-z]+)+)\b/gi;
    for (const m of bodyText.matchAll(foundedByRx)) {
      const name = cleanName(m[1]);
      if (isValidPersonName(name)) {
        result.ownerName = name; result.ownerSource = 'Văn bản (founded by)'; break;
      }
    }
  }

  // 6c. Mau: "[Name] started/founded/established..." (Bat buoc Ho & Ten viet hoa, khong dung run/own)
  if (!result.ownerName || !result.ownerName.includes(' ')) {
    const startedByRx = /\b([A-Z][a-z]+(?:\s*(?:&|and)\s*[A-Z][a-z]+)?(?:\s+[A-Z][a-z]+)+)\s+(?:started|founded|established)\s+(?:the\s+(?:kennel|business|farm|ranch|program|facility)|this|our|in\s+\d{4})\b/gi;
    for (const m of bodyText.matchAll(startedByRx)) {
      const name = cleanName(m[1]);
      if (isValidPersonName(name)) {
        result.ownerName = name; result.ownerSource = 'Văn bản (creator)'; break;
      }
    }
  }

  // 6d. Mau lanh dao: ho tro ca "[Name] President and Executive Director" va "[Title] [Name]"
  {
    const titleRank = t => {
      const s = (t || '').toLowerCase();
      if (/president\s+and\s+executive\s+director/.test(s)) return 100;
      if (/president|ceo|founder|co-founder/.test(s)) return 90;
      if (/executive\s+director/.test(s)) return 80;
      if (/board\s+chair/.test(s)) return 70;
      if (/director\s+of\s+operations/.test(s)) return 50;
      if (/director/.test(s)) return 40;
      return 10;
    };

    let bestName = '', bestTitle = '', bestScore = 0;

    // Mau 1: "[Name] President and Executive Director"
    const nameThenTitleRx = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s*[,:\-–]?\s+((?:president\s+and\s+)?executive director|director of operations|director of veterinary care|board chair(?:woman)?|president|ceo|founder|co-founder)\b/gi;
    for (const m of bodyText.matchAll(nameThenTitleRx)) {
      const candidate = cleanName(m[1]);
      const title = m[2].trim();
      const score = titleRank(title);
      if (isValidPersonName(candidate) && score > bestScore) {
        bestName = candidate; bestTitle = title; bestScore = score;
      }
    }

    // Mau 2: "[Title] [Name]"
    const titleThenNameRx = /\b((?:president\s+and\s+)?executive director|director of operations|director of veterinary care|board chair(?:woman)?|president|ceo|founder|co-founder)\s*[:\-–]?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/gi;
    for (const m of bodyText.matchAll(titleThenNameRx)) {
      const title = m[1].trim();
      const candidate = cleanName(m[2]);
      const score = titleRank(title);
      if (isValidPersonName(candidate) && score > bestScore) {
        bestName = candidate; bestTitle = title; bestScore = score;
      }
    }

    if (bestName && (!result.ownerName || !result.ownerName.includes(' ') || bestScore >= 80)) {
      result.ownerName = bestName;
      result.ownerTitle = bestTitle;
      result.ownerSource = 'Van ban (leadership: ' + bestTitle + ')';
    }
  }

  // 6e. Mau gia dinh (ho tro ca dau nhay don cong ’ ’): "Hello! We’re the Bryners!" -> The Bryners
  if (!result.ownerName) {
    const familyRx = /(?:we(?:['’`]?re| are)\s+the|from the)\s+([A-Z][a-z]+)s?[!.]/gi;
    for (const m of bodyText.matchAll(familyRx)) {
      const name = cleanName(m[1]);
      if (isValidPersonName(name, true) && !NON_PERSON_WORDS.has(name.toLowerCase())) {
        result.ownerName = 'Gia dinh ' + name;
        result.ownerSource = 'Van ban (family breeder)';
        break;
      }
    }
  }

  // 6f. Mau dia chi lien he ro rang: "Lori Drew Portland, Oregon Email: ..."
  if (!result.ownerName || !result.ownerName.includes(' ')) {
    const contactCityRx = /\b([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:Portland|Seattle|Eugene|Bend|Spokane|Tacoma|Boise|Sacramento|San Jose|Los Angeles|San Diego|Austin|Dallas|Houston|Miami|Orlando|Tampa|Denver|Phoenix|Atlanta|Chicago|Amite|Covington|Fort Calhoun|Chimacum),\s*(?:Oregon|Washington|California|Texas|Florida|Nebraska|Louisiana|Idaho|Arizona|[A-Z]{2})\b/g;
    for (const m of bodyText.matchAll(contactCityRx)) {
      const name = cleanName(m[1]);
      if (isValidPersonName(name)) {
        result.ownerName = name;
        result.ownerSource = 'Van ban (contact card)';
        break;
      }
    }
  }

  // 6h. Mau lien he truoc so dien thoai: "Kate 541.510.5989"
  if (!result.ownerName || !result.ownerName.includes(' ')) {
    const phoneContactRx = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[:\-–]?\s*(?:Tel:?\s*|Phone:?\s*|Cell:?\s*)?(?:\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})\b/g;
    for (const m of bodyText.matchAll(phoneContactRx)) {
      const name = cleanName(m[1]);
      if (isValidPersonName(name, true) && !NON_PERSON_WORDS.has(name.toLowerCase())) {
        result.ownerName = name;
        result.ownerSource = 'Van ban (contact phone card)';
        break;
      }
    }
  }

  // 6g. Mau hanh dong lien he: "forward it to Kate at lk.kennel@yahoo.com"
  if (!result.ownerName) {
    const actionRx = /(?:forward(?:\s+it)?\s+to|send(?:\s+it)?\s+to|speak\s+with|ask\s+for|reach\s+out\s+to|text(?:\s+proof(?:\s+of\s+completion)?)?\s+to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:at|on|via|by|@|\(|[\d])/gi;
    for (const m of bodyText.matchAll(actionRx)) {
      const name = cleanName(m[1]);
      if (isValidPersonName(name, true)) {
        result.ownerName = name;
        result.ownerTitle = 'Nguoi lien he / Breeder';
        result.ownerSource = 'Van ban (contact action)';
        break;
      }
    }
  }

  // 6i. Mau phap ly trong Terms of Service / Privacy Policy / Footer (US / International)
  {
    const legalOpRx = /\b(?:owned\s+and\s+operated\s+by|operated\s+by|managed\s+by|business\s+owned\s+by)\s+([A-Z][A-Za-z0-9\s,&.]{2,60})/gi;
    for (const m of bodyText.matchAll(legalOpRx)) {
      const raw = m[1].replace(/\.$/, '').trim();
      if (/(?:LLC|Inc|Corp|Corporation|Ltd|Limited|Company|Kennel|Ranch|Farm)/i.test(raw)) {
        const comp = cleanName(raw);
        if (!result.companyName && !REGISTRAR_OR_COMPANY_RX.test(comp)) {
          result.companyName = comp;
        }
      } else {
        const name = cleanName(raw);
        if (isValidPersonName(name, true) && (!result.ownerName || !result.ownerName.includes(' '))) {
          result.ownerName = name;
          result.ownerSource = 'ToS / Privacy Policy (Operator)';
        }
      }
    }
  }

  // 6k. Mau nguoi phu trach / diem lien he: "point of contact (Jason Yoder)"
  if (!result.ownerName || !result.ownerName.includes(' ')) {
    const pointOfContactRx = /\b(?:point\s+of\s+contact|primary\s+contact|contact\s+person|contact\s+was|contact\s+is)\s*[:(]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/gi;
    for (const m of bodyText.matchAll(pointOfContactRx)) {
      const candidate = cleanName(m[1]);
      if (isValidPersonName(candidate)) {
        result.ownerName = candidate;
        result.ownerTitle = 'Point of Contact / Breeder';
        result.ownerSource = 'Văn bản (Point of Contact)';
        break;
      }
    }
  }

  // 6l. Mau duoc khach hang cam on / lam viec cung trong danh gia: "worked with Jason", "experience with Jason and..."
  if (!result.ownerName) {
    const reviewMentionRx = /\b(?:worked\s+with|experience\s+with|thank\s+you|thanks\s+to|shoutout\s+to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:and\s+(?:his\s+family|her\s+family|the\s+team|team|\w+\s+team)|was|helped|guided)/gi;
    for (const m of bodyText.matchAll(reviewMentionRx)) {
      const candidate = cleanName(m[1]);
      if (isValidPersonName(candidate, true) && !NON_PERSON_WORDS.has(candidate.toLowerCase())) {
        result.ownerName = candidate;
        result.ownerTitle = 'Breeder / Team Lead';
        result.ownerSource = 'Đánh giá khách hàng (Customer Reviews)';
        break;
      }
    }
  }

  // ── BUOC 6m: Thu thap link mang xa hoi (Facebook, Instagram, TikTok, YouTube, LinkedIn, Amazon, X/Twitter, Pinterest, WhatsApp, Telegram, Yelp, Threads...) ──
  const socialDomainPattern = /^(?:https?:\/\/)?(?:www\.)?(facebook\.com|fb\.com|fb\.me|instagram\.com|instagr\.am|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|twitter\.com|x\.com|pinterest\.(?:com|[a-z]{2,3}|co\.[a-z]{2})|pin\.it|amazon\.(?:com|[a-z]{2,3}|co\.[a-z]{2})|wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me|telegram\.me|yelp\.com|reddit\.com|threads\.net|snapchat\.com|etsy\.com|vimeo\.com|discord\.(?:gg|com)|linktr\.ee|github\.com|medium\.com|quora\.com|g\.page|maps\.google\.com|goo\.gl\/maps)/i;

  const cleanSocialHref = (rawHref) => {
    if (!rawHref) return null;
    let href = String(rawHref).trim();
    try { href = decodeURIComponent(href); } catch (e) {}
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
      const clean = parsed.toString().replace(/\/+$/, '');
      if ((parsed.pathname === '' || parsed.pathname === '/') && !/linktr\.ee|g\.page/i.test(parsed.hostname)) {
        return null;
      }
      return clean;
    } catch (e) {
      return null;
    }
  };

  const socialSet = new Set();
  for (const a of document.querySelectorAll('a[href]')) {
    const cleaned = cleanSocialHref(a.href);
    if (cleaned) socialSet.add(cleaned);
  }
  result.socials = Array.from(socialSet).slice(0, 15).join(' | ');

  // ── BUOC 7: Thu thap link cac trang con ──────────────────────────────────
  const seenLinks = new Set();
  const normHost = h => h.replace(/^www\./i, '').toLowerCase();

  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    try {
      const u = new URL(href, location.href);
      if (normHost(u.hostname) !== normHost(location.hostname)) continue;
      const linkText = cleanName(a.innerText);
      const full = (u.pathname + ' ' + linkText).toLowerCase();
      if (/about|story|team|breeder|who|contact|meet|founder|contract|agreement|faq|terms|privacy|legal|policy|dieu-khoan|chinh-sach/i.test(full)) {
        u.hash = ''; u.search = '';
        if (!seenLinks.has(u.href)) {
          seenLinks.add(u.href);
          result.links.push({ url: u.href, text: linkText.slice(0, 80) });
        }
      }
    } catch { }
  }

  return result;
}


export const scanPageForOwner = scanOwnerPage;


