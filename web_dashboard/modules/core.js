/**
 * core.js - Pet Lead AI Master Suite Core Engine
 * Tích hợp chuẩn hóa URL, phân tích CSV, nhận diện Facebook UID, 
 * chuẩn hóa Bang US/Canada, và thuật toán trích xuất tên người đại diện / chủ trại.
 */

export const uniq = values => [...new Set(values.filter(Boolean))];

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function normalizeURL(input) {
  let s = String(input || '').trim().replace(/^['"]|['"]$/g, '');
  if (!s || /^(?:javascript|data|file|chrome|mailto|tel):/i.test(s)) return '';
  if (s.startsWith('//')) s = 'https:' + s;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try {
    let u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return '';
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return '';
    if (/(^|\.)google\.com$/.test(u.hostname) && u.pathname === '/url') {
      const target = u.searchParams.get('q') || u.searchParams.get('url');
      if (target && /^https?:\/\//i.test(target)) u = new URL(target);
    }
    if (u.username || u.password) return '';
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|msclkid$)/i.test(key)) u.searchParams.delete(key);
    }
    return u.href;
  } catch {
    return '';
  }
}

export function recoveryURLs(input) {
  const clean = normalizeURL(input);
  if (!clean) return [];
  const u = new URL(clean), noQuery = new URL(clean);
  noQuery.search = '';
  const root = new URL('/', u);
  const alt = new URL(root);
  if (alt.hostname.startsWith('www.')) alt.hostname = alt.hostname.slice(4);
  else if (alt.hostname.split('.').length === 2) alt.hostname = 'www.' + alt.hostname;
  return uniq([clean, noQuery.href, root.href, alt.href]);
}

export function parseCSV(text, delimiter) {
  text = text.replace(/^\uFEFF/, '');
  if (!delimiter) {
    let quoted = false, counts = { ',': 0, ';': 0, '\t': 0 };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && /[\r\n]/.test(ch)) {
        break;
      } else if (!quoted && ch in counts) {
        counts[ch]++;
      }
    }
    delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || ',';
  }
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === '') {
        quoted = !quoted;
      } else {
        cell += ch;
      }
    } else if (!quoted && ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (!quoted && (ch === '\r' || ch === '\n')) {
      row.push(cell);
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
      cell = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      cell += ch;
    }
  }
  if (quoted) throw new Error('CSV có dấu nháy chưa đóng. Hãy kiểm tra định dạng file.');
  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

export function detectWebsiteColumn(header) {
  const clean = h => String(h || '').toLowerCase().replace(/[\s_\-]/g, '');
  const aliases = ['website', 'websiteurl', 'web', 'url', 'linkweb', 'linkwebsite', 'trangweb', 'websitegoc', '官网'];
  const idx = header.findIndex(h => aliases.includes(clean(h)));
  if (idx >= 0) return idx;
  const fbAliases = ['facebook', 'facebookurl', 'fb', 'fburl', 'linkfb', 'linkfacebook', 'facebooklink', 'fanpage', 'profile', 'fbid', 'uid'];
  return header.findIndex(h => fbAliases.includes(clean(h)));
}

export function detectFacebookColumn(header) {
  const clean = h => String(h || '').toLowerCase().replace(/[\s_\-]/g, '');
  const fbAliases = ['facebook', 'facebookurl', 'fb', 'fburl', 'linkfb', 'linkfacebook', 'facebooklink', 'fanpage', 'profile', 'fbid', 'uid', 'facebookid'];
  return header.findIndex(h => fbAliases.includes(clean(h)));
}

export function makeRecords(table, column, hasHeader = true) {
  const header = hasHeader ? table[0] : [];
  const nameCol = header.findIndex(x => /^(name|tên|breeder|trại|doanh nghiệp|title|商家名称)$/i.test(x.trim()));
  const areaCol = header.findIndex(x => /^(area|khu vực|location|vị trí|state|city|bang)$/i.test(x.trim()));
  return table.slice(hasHeader ? 1 : 0).map((r, i) => ({
    row: i + (hasHeader ? 2 : 1),
    name: nameCol >= 0 ? (r[nameCol] || '') : '',
    area: areaCol >= 0 ? (r[areaCol] || '') : '',
    original: (r[column] || '').trim(),
    url: normalizeURL(r[column])
  }));
}

export function csvString(rows, headers) {
  const escape = value => {
    let s = String(value ?? '');
    // Ngăn chặn Excel Formula Injection: nếu bắt đầu bằng =, +, -, @ thì thêm dấu '
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return '\uFEFF' + [headers, ...rows.map(r => headers.map(k => r[k] ?? ''))].map(r => r.map(escape).join(',')).join('\r\n') + '\r\n';
}

export function primaryEmail(emails, url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  const score = e => {
    const el = e.toLowerCase();
    return (el.endsWith('@' + host) ? 100 : 0) +
      (/@gmail\.com$/i.test(el) ? 40 : 0) +
      (/^(info|contact|hello|office|sales|enquiries)@/i.test(el) ? 10 : 0) -
      (/^(noreply|no-reply|privacy|abuse)@/i.test(el) ? 100 : 0);
  };
  return [...emails].sort((a, b) => score(b) - score(a))[0] || '';
}

export function facebookURL(raw) {
  try {
    let u = new URL(raw);
    if (!/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(u.hostname)) return '';
    if (/(^|\.)fb\.me$/.test(u.hostname)) u = new URL('https://www.facebook.com/' + u.pathname.replace(/^\//, ''));
    if (u.pathname === '/l.php') return '';
    u.hostname = 'www.facebook.com';
    u.protocol = 'https:';
    u.hash = '';
    const parts = u.pathname.split('/').filter(Boolean);
    if (!parts.length || /^(sharer(?:\.php)?|share(?:\.php)?|dialog|plugins|login(?:\.php)?|recover|help|privacy|policies|watch|reel|photo(?:\.php)?|story\.php|permalink\.php)$/i.test(parts[0])) return '';
    if (parts[0] === 'profile.php') {
      const id = u.searchParams.get('id');
      if (!/^\d{5,}$/.test(id || '')) return '';
      u.search = '';
      u.searchParams.set('id', id);
    } else {
      if (parts[0] === 'pages' || parts[0] === 'people' || parts[0] === 'p') {
        u.pathname = '/' + parts.slice(0, parts[0] === 'p' ? 2 : 3).join('/') + '/';
      } else if (parts[0] === 'groups') {
        u.pathname = '/' + parts.slice(0, 2).join('/') + '/';
      } else {
        u.pathname = '/' + parts[0] + '/';
      }
      u.search = '';
    }
    return u.href;
  } catch {
    return '';
  }
}

export function numericFacebookID(raw) {
  const clean = facebookURL(raw);
  if (!clean) return '';
  const u = new URL(clean);
  if (u.pathname === '/profile.php') return u.searchParams.get('id') || '';
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length === 1 && /^\d{5,}$/.test(parts[0])) return parts[0];
  if (['people', 'pages'].includes(parts[0])) {
    for (const p of parts.slice(1).reverse()) {
      const m = p.match(/(\d{5,})$/);
      if (m) return m[1];
    }
  }
  if (parts[0] === 'p' && parts[1]) {
    const m = parts[1].match(/(\d{5,})$/);
    if (m) return m[1];
  }
  if (parts[0] === 'groups' && parts[1] && /^\d{5,}$/.test(parts[1])) return parts[1];
  return '';
}

export function instagramURL(raw) {
  try {
    const u = new URL(raw);
    if (!/(^|\.)(instagram\.com|instagr\.am)$/.test(u.hostname)) return '';
    const part = u.pathname.split('/').filter(Boolean)[0] || '';
    if (!part || /^(accounts|explore|p|reel|reels|stories|direct|about|developer|legal|privacy|terms)$/i.test(part)) return '';
    u.hostname = 'www.instagram.com';
    u.protocol = 'https:';
    u.pathname = '/' + part + '/';
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return '';
  }
}

// Danh mục Bang Hoa Kỳ & Tỉnh bang Canada
export const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia', PR: 'Puerto Rico', VI: 'Virgin Islands'
};

export const CA_PROVINCES = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland',
  NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island',
  QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon'
};

export const STATE_MAP = new Map();
for (const [code, name] of Object.entries(US_STATES)) {
  STATE_MAP.set(code.toLowerCase(), { code, country: 'US' });
  STATE_MAP.set(name.toLowerCase(), { code, country: 'US' });
}
for (const [code, name] of Object.entries(CA_PROVINCES)) {
  STATE_MAP.set(code.toLowerCase(), { code, country: 'CA' });
  STATE_MAP.set(name.toLowerCase(), { code, country: 'CA' });
}

export function lookupState(str) {
  if (!str || typeof str !== 'string') return null;
  return STATE_MAP.get(str.trim().toLowerCase()) || null;
}

export const REGISTRAR_OR_COMPANY_RX = /\b(llc|inc|corp|ltd|limited|gmbh|co\.|company|services|solutions|domain|domains|registrar|hosting|hostinger|wix|squarespace|godaddy|namecheap|cloudflare|tucows|fastdomain|bluehost|dreamhost|automattic|wordpress|shopify|network solutions|register\.com|markmonitor|enom|dynadot|porkbun|ovh|privacy|proxy|protected|whoisguard|withheld|redacted|contact privacy|identity protection|super privacy|not disclosed|data protected)\b/i;

export function isRegistrarOrCompany(str) {
  return REGISTRAR_OR_COMPANY_RX.test(str || '');
}

export const NON_PERSON_WORDS = new Set([
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
  'facebook','instagram','linkedin','tiktok','youtube','twitter','pinterest','amazon','reddit','snapchat',
  'không','chưa','thông','tin','liên','hệ','đại','diện','chủ','sở','hữu','sáng','lập','công','ty','trang','web'
]);

export const SURNAMES = new Set([
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
  'koivisto','montzingo','warwick','kharus','mcshan','drew','bryner','runner','yoder','bowen','offner'
]);

export function cleanPersonName(s) {
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

export function isValidPersonName(name, allowSingle = false) {
  if (!name || typeof name !== 'string') return false;
  const clean = cleanPersonName(name);
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

export function nameFromEmail(email, brand = '') {
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
  if (/^[a-z][a-z]{3,20}$/i.test(clean)) {
    const init = clean[0];
    const surname = clean.slice(1);
    if (SURNAMES.has(surname) || (brand && new RegExp(surname, 'i').test(brand))) {
      const firstMap = { c: 'Chris', j: 'John', m: 'Michael', d: 'David', r: 'Robert', w: 'William' };
      const fn = firstMap[init] || (init.toUpperCase() + '.');
      return `${fn} ${surname.charAt(0).toUpperCase() + surname.slice(1)}`;
    }
  }
  return '';
}

export function cleanCity(raw) {
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

export function cleanStreet(raw) {
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


