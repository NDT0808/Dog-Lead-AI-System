/**
 * 构建脚本：data/*.json  ->  data/analytics.json（派生统计） + data/loader.js（免服务端数据桥）
 * 用法：node tools/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));

const leads = read('leads.json');
const meta = read('meta.json');

/* ---------- Facebook 主页 ID ---------- */
function fbIdOf(lead) {
  if (lead.fb_id) return String(lead.fb_id);
  const raw = String(lead.url || '');
  const parts = raw.split(/[;,\s]+/).filter(Boolean);
  const fb = parts.find((u) => /facebook\.com/i.test(u));
  if (!fb) return '';
  try {
    const u = new URL(/^https?:/i.test(fb) ? fb : 'https://' + fb);
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return '';
    const id = u.searchParams.get('id');
    if (id && /^\d{5,}$/.test(id)) return id;
    const seg = u.pathname.split('/').filter(Boolean);
    if (!seg.length) return '';
    if (seg[0] === 'pages') {
      const nums = seg.filter((s) => /^\d{5,}$/.test(s));
      if (nums.length) return nums[nums.length - 1];
    }
    const last = seg[seg.length - 1];
    if (/^\d{5,}$/.test(last)) return last;
    const m = last.match(/-(\d{8,})$/);
    if (m) return m[1];
    return last.replace(/\?.*$/, '');
  } catch { return ''; }
}
let withFbId = 0;
for (const l of leads) { l.fb_id = fbIdOf(l); if (l.fb_id) withFbId++; }
fs.writeFileSync(path.join(OUT, 'leads.json'), JSON.stringify(leads, null, 2), 'utf8');

/* ---------- 工具 ---------- */
const tally = (rows, fn) => {
  const m = new Map();
  for (const r of rows) {
    const k = fn(r);
    if (k == null || k === '') continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const pct = (n) => +((n / leads.length) * 100).toFixed(1);

/* ---------- 评级 ---------- */
const tierOrder = ['Tier S', 'Tier A', 'Tier B', 'Tier C', 'Tier D'];
const tiers = tally(leads, (l) => l.rank_tier)
  .sort((a, b) => tierOrder.indexOf(a[0]) - tierOrder.indexOf(b[0]))
  .map(([label, value]) => ({ label, value, percent: pct(value) }));

/* ---------- 亚马逊渠道 ---------- */
const AMZ_LABEL = {
  both_target: { zh: '玩具 + 草坪便盆（双目标）', vi: 'Cả đồ chơi + Cỏ/Potty (TARGET kép)' },
  grass_target: { zh: '草坪 / 便盆 TARGET', vi: 'Cỏ / Khay Potty (TARGET)' },
  toys_target: { zh: '玩具 TARGET', vi: 'Đồ chơi (TARGET)' },
  amz_other: { zh: '亚马逊其他品类', vi: 'Amazon khác' },
  no_amz: { zh: '暂无亚马逊店铺', vi: 'Chưa có Amazon' }
};
function amzKind(l) {
  const c = l.amz_cat || '';
  if (c.includes('Selling pet toys + Artificial grass')) return 'both_target';
  if (c.includes('Selling artificial grass')) return 'grass_target';
  if (c.includes('Selling pet toys')) return 'toys_target';
  if (!l.amz_link || c === 'Amazon link not found') return 'no_amz';
  return 'amz_other';
}
const amazonRaw = tally(leads, amzKind);
const amazon = amazonRaw.map(([key, value]) => ({ key, value, percent: pct(value), zh: AMZ_LABEL[key].zh, vi: AMZ_LABEL[key].vi }));
const amazonIndex = Object.fromEntries(amazonRaw);

/* ---------- 机构类型 ---------- */
const CAT_LABEL = {
  breeder: { zh: '商业繁育犬舍 (Breeder)', vi: 'Trại chó thương mại (Breeder)' },
  service: { zh: '训犬 / 美容 / 寄宿 (Pet Care)', vi: 'Huấn luyện & Boarding' },
  rescue: { zh: '动物救助站 (Rescue)', vi: 'Trạm cứu trợ / Shelter' }
};
const categories = tally(leads, (l) => l.cat_code).map(([key, value]) => ({
  key, value, percent: pct(value), zh: CAT_LABEL[key]?.zh || key, vi: CAT_LABEL[key]?.vi || key
}));

/* ---------- 评分 ---------- */
const scores = leads.map((l) => l.score).filter((s) => typeof s === 'number');
const sum = scores.reduce((a, b) => a + b, 0);
const scoreBuckets = [
  { label: '85 - 100', min: 85, max: 100 },
  { label: '70 - 84', min: 70, max: 84 },
  { label: '50 - 69', min: 50, max: 69 },
  { label: '30 - 49', min: 30, max: 49 },
  { label: '< 30', min: -Infinity, max: 29 }
].map((b) => ({ label: b.label, value: scores.filter((s) => s >= b.min && s <= b.max).length }));

const fieldCount = (k) => leads.filter((l) => typeof l[k] === 'string' && l[k].trim() !== '').length;
const contactCoverage = [
  { key: 'phone', zh: '电话 Phone', vi: 'Điện thoại Phone', value: fieldCount('phone') },
  { key: 'email', zh: '邮箱 Email', vi: 'Email', value: fieldCount('email') },
  { key: 'website', zh: '官网 Website', vi: 'Website chính thức', value: fieldCount('website') },
  { key: 'url', zh: 'Facebook 主页', vi: 'Trang Facebook', value: fieldCount('url') },
  { key: 'zip', zh: '邮编 Zip', vi: 'Mã Zip', value: fieldCount('zip') }
].map((d) => ({ ...d, percent: pct(d.value) }));

/* ---------- 地理 ---------- */
const geoStates = tally(leads, (l) => (l.state || '').trim().toUpperCase());
const geoCities = tally(leads, (l) => (l.city || '').trim());
const geo = {
  states: geoStates.slice(0, 12).map(([label, value]) => ({ label: label || '未标注', value })),
  cities: geoCities.slice(0, 10).map(([label, value]) => ({ label: label || '未标注', value })),
  distinctStates: geoStates.filter(([s]) => s).length,
  stateCoverage: pct(leads.filter((l) => (l.state || '').trim()).length)
};

/* ---------- 分析产出 ---------- */
const analytics = {
  generatedAt: new Date().toISOString(),
  totalLeads: leads.length,
  score: {
    min: Math.min(...scores),
    max: Math.max(...scores),
    avg: +(sum / scores.length).toFixed(1),
    buckets: scoreBuckets
  },
  tiers,
  tierIndex: Object.fromEntries(tiers.map((d) => [d.label, d.value])),
  amazon,
  amazonIndex,
  amazonTotal: amazonIndex.both_target + amazonIndex.grass_target + amazonIndex.toys_target + amazonIndex.amz_other,
  categories,
  contactCoverage,
  geo,
  dataQuality: {
    note: '字段完整度：用于评估可直接触达（电话/邮件）的客户比例。',
    reachableByPhoneOrEmail: leads.filter((l) => l.phone || l.email).length,
    reachablePercent: pct(leads.filter((l) => l.phone || l.email).length),
    missingState: leads.filter((l) => !(l.state || '').trim()).length
  },
  priorityLeads: leads.filter((l) => l.is_prio).length,
  topLeads: [...leads]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 20)
    .map((l) => ({ stt: l.stt, name: l.name, owner: l.owner, city: l.city, state: l.state, zip: l.zip, score: l.score, rank_tier: l.rank_tier, amz_cat: l.amz_cat, phone: l.phone, email: l.email }))
};

fs.writeFileSync(path.join(OUT, 'analytics.json'), JSON.stringify(analytics, null, 2), 'utf8');

/* ---------- loader.js：让 HTML 直接双击（file://）也能读取 JSON 数据 ---------- */
const i18n = read('i18n.json');
const bundle = { meta, analytics, i18n, leads };
const loader =
  '/* 自动生成，勿手工修改。由 tools/build.mjs 从 data/*.json 生成。 */\n' +
  'window.REPORT_DATA = ' + JSON.stringify(bundle) + ';\n';
fs.writeFileSync(path.join(OUT, 'loader.js'), loader, 'utf8');

const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1) + ' KB';
console.log('analytics.json', kb('analytics.json'));
console.log('loader.js     ', kb('loader.js'));
console.log('leads:', leads.length, '| fb_id 覆盖:', withFbId, `(${(withFbId / leads.length * 100).toFixed(1)}%)`);
console.log('leads:', leads.length, '| score', analytics.score.min + '-' + analytics.score.max, '| avg', analytics.score.avg);
console.log('tiers:', JSON.stringify(analytics.tierIndex));
console.log('amazon:', JSON.stringify(analytics.amazonIndex));
console.log('reachable:', analytics.dataQuality.reachableByPhoneOrEmail, analytics.dataQuality.reachablePercent + '%');
console.log('states:', analytics.geo.distinctStates, '| stateCoverage', analytics.geo.stateCoverage + '%');
