/**
 * 🐾 Pet Lead AI — Server Profile Enricher (4-Tier Headless Funnel)
 * Chạy 100% trên RAM/CPU Server, thực hiện bóc tách sâu Bước 2 và 3 công cụ độc lập:
 * - Tầng 1: Facebook Profile & Page SSR (/about, SĐT, Email, Website, publish_time)
 * - Tầng 2: Multi-Subpage Website Crawler (/about, /contact, /meet-the-breeder)
 * - Tầng 3: Cloudflare Decryption, US Address, Phone, Owner Heuristics & Amazon Classifier
 * - Tầng 4: Chấm điểm 5 trục Anti-Saturation Dynamic Scoring Engine
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFacebookCookieString, extractRealNumericFbid, extractFbidFromHtml } from './server_scraper_engine.mjs';

const US_STATES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',
  FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',
  LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',
  ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
  DC:'District of Columbia'
};

const STATE_LOOKUP = new Map();
for (const [code, name] of Object.entries(US_STATES)) {
  STATE_LOOKUP.set(code.toLowerCase(), code);
  STATE_LOOKUP.set(name.toLowerCase(), code);
}

// ─── CLOUDFLARE EMAIL DECRYPTOR ──────────────────────────────────────────────
export function decodeCloudflareEmail(hex) {
  if (!hex || typeof hex !== 'string' || hex.length < 4 || hex.length % 2 !== 0) return '';
  try {
    const k = parseInt(hex.substring(0, 2), 16);
    let email = '';
    for (let i = 2; i < hex.length; i += 2) {
      email += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16) ^ k);
    }
    return email.trim();
  } catch (_) {
    return '';
  }
}

// ─── TEXT CLEANERS & EXTRACTORS ──────────────────────────────────────────────
export function extractEmailsFromHtml(html) {
  const emails = new Set();
  if (!html) return [];

  // 1. Cloudflare protected emails
  const cfMatches = html.matchAll(/data-cfemail=["']([a-f0-9]+)["']/gi);
  for (const m of cfMatches) {
    const dec = decodeCloudflareEmail(m[1]);
    if (dec && dec.includes('@')) emails.add(dec.toLowerCase());
  }

  // 2. Mailto links
  const mailtoMatches = html.matchAll(/href=["']mailto:([^"?#]+)/gi);
  for (const m of mailtoMatches) {
    const e = decodeURIComponent(m[1]).trim().toLowerCase();
    if (e.includes('@') && !e.includes('example.com') && !e.includes('sentry.io')) {
      emails.add(e);
    }
  }

  // 3. Regular expression
  const rx = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,12})+/g;
  let match;
  while ((match = rx.exec(html)) !== null) {
    const e = match[0].toLowerCase();
    if (!/\.(png|jpg|jpeg|gif|svg|webp|css|js|woff2?)$/i.test(e) && !e.includes('example.com') && !e.includes('wixpress.com')) {
      emails.add(e);
    }
  }

  return Array.from(emails);
}

export function extractPhonesFromHtml(html) {
  const phones = new Set();
  if (!html) return [];

  // 1. Tel: links
  const telMatches = html.matchAll(/href=["']tel:([^"'\s]+)["']/gi);
  for (const m of telMatches) {
    const raw = decodeURIComponent(m[1]).replace(/[^\d+]/g, '');
    if (raw.length >= 10 && raw.length <= 15) phones.add(raw);
  }

  // 2. US Phone formats
  const rx = /(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-]?(\d{4})/g;
  let match;
  while ((match = rx.exec(html)) !== null) {
    const formatted = `+1 (${match[1]}) ${match[2]}-${match[3]}`;
    phones.add(formatted);
  }

  return Array.from(phones);
}

export function parseUsAddress(text) {
  if (!text) return { street: '', city: '', state: '', zip: '', country: 'US' };

  // City, ST 12345
  const rxZip = /([A-Za-z\s.'-]{2,35}),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)/;
  const mZip = text.match(rxZip);
  if (mZip) {
    const stCode = mZip[2].toUpperCase();
    if (US_STATES[stCode]) {
      return {
        street: '',
        city: mZip[1].trim(),
        state: stCode,
        zip: mZip[3],
        country: 'US'
      };
    }
  }

  // City, State
  const rxState = /([A-Za-z\s.'-]{2,35}),\s*([A-Za-z\s]{2,20})/g;
  let m;
  while ((m = rxState.exec(text)) !== null) {
    const candCity = m[1].trim();
    const candState = m[2].trim().toLowerCase();
    if (STATE_LOOKUP.has(candState)) {
      return {
        street: '',
        city: candCity,
        state: STATE_LOOKUP.get(candState),
        zip: '',
        country: 'US'
      };
    }
  }

  return { street: '', city: '', state: '', zip: '', country: 'US' };
}

export function extractOwnerName(html, emailList = []) {
  if (!html) return '';

  // 1. Heuristic regex from text
  const patterns = [
    /(?:Meet the Breeder|About the Breeder|Breeder|Owner|Founder|Hi,?\s+I'm|We are)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/i,
    /(?:Operated by|Managed by|Owned by|Created by)\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/i,
    /(?:I am|My name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/i
  ];

  for (const rx of patterns) {
    const m = html.match(rx);
    if (m && m[1]) {
      const name = m[1].trim();
      if (!/(Puppy|Breeder|Kennel|Dog|Frenchie|Good Dog|Facebook|Google)/i.test(name)) {
        return name;
      }
    }
  }

  // 2. Heuristic from personal email prefix
  for (const email of emailList) {
    const prefix = email.split('@')[0];
    if (prefix && !/(info|contact|support|sales|admin|office|hello|help)/i.test(prefix)) {
      const cleanPrefix = prefix.replace(/\d+$/, '');
      const parts = cleanPrefix.split(/[._-]/);
      if (parts.length === 2 && parts[0].length >= 3 && parts[1].length >= 3) {
        return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
      }
    }
  }

  return '';
}

export function classifyAmazonChannel(html) {
  if (!html) return { amz_cat: 'Amazon link not found', amz_link: '', has_amz: false };

  const amzLinkRx = /(https?:\/\/(?:www\.)?(?:amazon\.com(?:\/shop\/[^\s"'<>]*)?|amzn\.to\/[^\s"'<>]+|a\.co\/[^\s"'<>]+))/i;
  const match = html.match(amzLinkRx);

  if (!match) {
    return { amz_cat: 'Amazon link not found', amz_link: '', has_amz: false };
  }

  const amzLink = match[1];
  const lowerHtml = html.toLowerCase();

  const hasGrass = /\b(grass|turf|lawn|patch|potty|pee pad|puppy pad|toilet|litter)\b/i.test(lowerHtml);
  const hasToys = /\b(toy|chew|kong|bone|rope|plush|squeak|teething|snuggle puppy)\b/i.test(lowerHtml);

  if (hasGrass && hasToys) {
    return {
      amz_cat: 'Selling pet toys + Artificial grass/Pet toilets (TARGET)',
      amz_link: amzLink,
      has_amz: true
    };
  } else if (hasGrass) {
    return {
      amz_cat: 'Selling artificial grass/pet toilets (TARGET)',
      amz_link: amzLink,
      has_amz: true
    };
  } else if (hasToys) {
    return {
      amz_cat: 'Selling pet toys',
      amz_link: amzLink,
      has_amz: true
    };
  } else {
    return {
      amz_cat: "There's an Amazon link, but no target sales.",
      amz_link: amzLink,
      has_amz: true
    };
  }
}

// ─── 5-AXIS DYNAMIC SCORING ENGINE ───────────────────────────────────────────
export function calculate5AxisScore(lead) {
  // Trục 1: Recency (0 - 35)
  let recencyScore = 5;
  const pTime = lead.publish_time || '';
  if (pTime.includes('giờ') || pTime.includes('hr') || pTime.includes('phút') || pTime.includes('min')) {
    recencyScore = 35;
  } else if (pTime.includes('1 ngày') || pTime.includes('1 day') || pTime.includes('2 ngày') || pTime.includes('yesterday')) {
    recencyScore = 28;
  } else if (pTime.includes('ngày') || pTime.includes('days')) {
    recencyScore = 20;
  }

  // Trục 2: ICP Fit (10 - 30)
  let icpScore = 28; // Mặc định Breeder B2B
  if (lead.category && /rescue|shelter/i.test(lead.category)) icpScore = 15;
  else if (lead.category && /boarding|training/i.test(lead.category)) icpScore = 22;

  // Trục 3: Breed Commercial Value (0 - 15)
  let breedScore = 10;
  const highValueRx = /(golden|retriever|french|boykin|spaniel|doodle|bernedoodle|corgi|dachshund|boxer|schnauzer)/i;
  if (highValueRx.test((lead.name || '') + ' ' + (lead.bio || '') + ' ' + (lead.keywords_found || []).join(' '))) {
    breedScore = 15;
  }

  // Trục 4: Business Infrastructure (0 - 10)
  let infraScore = 0;
  if (lead.website) infraScore += 5;
  if (lead.phone || lead.email) infraScore += 5;

  // Trục 5: Amazon Credibility (0 - 15)
  let amzScore = 0;
  const amzCat = lead.amz_cat || '';
  if (amzCat.includes('Selling pet toys + Artificial grass')) amzScore = 15;
  else if (amzCat.includes('Selling artificial grass')) amzScore = 10;
  else if (amzCat.includes('Selling pet toys')) amzScore = 7;
  else if (amzCat.includes("There's an Amazon link")) amzScore = 3;

  const totalScore = recencyScore + icpScore + breedScore + infraScore + amzScore;

  let rankTier = 'Tier S';
  if (totalScore >= 85) rankTier = 'Tier S';
  else if (totalScore >= 70) rankTier = 'Tier A';
  else if (totalScore >= 50) rankTier = 'Tier B';
  else if (totalScore >= 30) rankTier = 'Tier C';
  else rankTier = 'Tier D';

  return { totalScore, rankTier, scores: { recencyScore, icpScore, breedScore, infraScore, amzScore } };
}

// ─── MASTER MULTI-TIER ENRICHER ──────────────────────────────────────────────
export async function scrapeProfileMultiTier({ url, website, name, onLog = () => {} }) {
  const result = {
    url: url || '',
    website: website || '',
    name: name || '',
    fb_id: '',
    phone: '',
    email: '',
    owner_name: '',
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
    publish_time: '',
    bio: '',
    amz_cat: 'Amazon link not found',
    amz_link: '',
    has_amz: false,
    cat: 'Dog Breeder / Commercial Kennel (B2B)',
    cat_code: 'breeder',
    score: 80,
    rank_tier: 'Tier S'
  };

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  const cookieStr = loadFacebookCookieString();
  if (cookieStr) headers['Cookie'] = cookieStr;

  // ─── TẦNG 1: QUÉT FACEBOOK PROFILE / PAGE ──────────────────────────────────
  if (url && url.includes('facebook.com')) {
    onLog(`🔍 [Tầng 1] Đang quét Facebook Profile: ${url}`);
    try {
      const fbRes = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
      if (fbRes.ok) {
        const fbHtml = await fbRes.text();
        const fbid = extractFbidFromHtml(fbHtml) || extractRealNumericFbid(url);
        if (fbid) result.fb_id = fbid;

        // Trích xuất Bio / Description
        const mDesc = fbHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        if (mDesc) result.bio = mDesc[1];

        // Trích xuất Website ngoài từ FB
        const mWeb = fbHtml.match(/href=["'](?:https?:\/\/l\.facebook\.com\/l\.php\?u=)?(https?:\/\/(?!www\.facebook\.com)[^"&]+)/i);
        if (mWeb && !result.website) {
          result.website = decodeURIComponent(mWeb[1]);
          onLog(`🌐 Phát hiện website chính thức từ Facebook: ${result.website}`);
        }

        // Bóc tách SĐT & Email sơ bộ từ FB HTML
        const fbPhones = extractPhonesFromHtml(fbHtml);
        if (fbPhones.length > 0) result.phone = fbPhones[0];

        const fbEmails = extractEmailsFromHtml(fbHtml);
        if (fbEmails.length > 0) result.email = fbEmails[0];

        // Bóc tách ngày giờ bài viết gần nhất
        const mTime = fbHtml.match(/abbr[^>]+data-utime=["'](\d+)["']/i);
        if (mTime) {
          result.publish_time = new Date(parseInt(mTime[1], 10) * 1000).toISOString();
        } else {
          result.publish_time = 'Vừa cập nhật gần đây';
        }
      }
    } catch (err) {
      onLog(`⚠️ [Tầng 1] Lỗi kết nối Facebook: ${err.message}`);
    }
  }

  // ─── TẦNG 2: MULTI-SUBPAGE WEBSITE CRAWLER ──────────────────────────────────
  const targetWeb = result.website || website;
  if (targetWeb && targetWeb.startsWith('http')) {
    onLog(`🌐 [Tầng 2] Bắt đầu cào Website chính thức: ${targetWeb}`);
    let aggregatedHtml = '';

    try {
      // 1. Quét trang chủ
      const homeRes = await fetch(targetWeb, {
        headers: { 'User-Agent': headers['User-Agent'] },
        signal: AbortSignal.timeout(10000)
      });
      if (homeRes.ok) {
        const homeHtml = await homeRes.text();
        aggregatedHtml += homeHtml + '\n';

        // 2. Khám phá các trang con quan trọng
        const subLinks = new Set();
        const subPathRegex = /href=["']((?:\/[a-zA-Z0-9.\-_]+)?\/(?:about|about-us|contact|meet-the-breeder|supplies|shop|team|puppies)[a-zA-Z0-9.\-_/]*)["']/gi;
        let subMatch;
        while ((subMatch = subPathRegex.exec(homeHtml)) !== null) {
          try {
            const resolvedSub = new URL(subMatch[1], targetWeb).href;
            if (resolvedSub.startsWith(targetWeb)) subLinks.add(resolvedSub);
          } catch (_) {}
          if (subLinks.size >= 4) break;
        }

        // 3. Quét tối đa 3 trang con song song
        const subArray = Array.from(subLinks).slice(0, 3);
        onLog(`📑 [Tầng 2] Quét ${subArray.length} trang con liên quan: ${subArray.join(', ')}`);
        const subFetches = subArray.map(subUrl =>
          fetch(subUrl, { headers: { 'User-Agent': headers['User-Agent'] }, signal: AbortSignal.timeout(8000) })
            .then(r => r.ok ? r.text() : '')
            .catch(() => '')
        );
        const subHtmls = await Promise.all(subFetches);
        aggregatedHtml += subHtmls.join('\n');
      }
    } catch (err) {
      onLog(`⚠️ [Tầng 2] Lỗi truy cập Website: ${err.message}`);
    }

    // ─── TẦNG 3: TRÍCH XUẤT SÂU TỪ WEBSITE HTML ─────────────────────────────
    if (aggregatedHtml) {
      onLog('🔬 [Tầng 3] Giải mã Cloudflare Email, Địa chỉ US, Chủ trại & Kênh Amazon...');

      // 1. Email (đã giải mã Cloudflare)
      const allEmails = extractEmailsFromHtml(aggregatedHtml);
      if (allEmails.length > 0 && !result.email) {
        result.email = allEmails[0];
      }

      // 2. SĐT chuẩn Mỹ
      const allPhones = extractPhonesFromHtml(aggregatedHtml);
      if (allPhones.length > 0 && !result.phone) {
        result.phone = allPhones[0];
      }

      // 3. Địa chỉ
      const addr = parseUsAddress(aggregatedHtml);
      if (addr.city) result.city = addr.city;
      if (addr.state) result.state = addr.state;
      if (addr.zip) result.zip = addr.zip;

      // 4. Tên Chủ trại
      const owner = extractOwnerName(aggregatedHtml, allEmails);
      if (owner) result.owner_name = owner;

      // 5. Phân loại kênh Amazon
      const amz = classifyAmazonChannel(aggregatedHtml);
      result.amz_cat = amz.amz_cat;
      result.amz_link = amz.amz_link;
      result.has_amz = amz.has_amz;
    }
  }

  // ─── TẦNG 4: CHẤM ĐIỂM 5 TRỤC ──────────────────────────────────────────────
  const scored = calculate5AxisScore(result);
  result.score = scored.totalScore;
  result.rank_tier = scored.rankTier;
  result.scoring_breakdown = scored.scores;

  onLog(`🎯 [Tầng 4] Hoàn tất bóc tách: Hạng ${result.rank_tier} (Điểm: ${result.score}/100) — Amazon: ${result.amz_cat}`);
  return result;
}
