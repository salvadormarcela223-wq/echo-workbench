// 每日自动抓取：从可信源抓真实近期行业资讯 → 过滤假深链/空字段/陈旧内容 → 写入暂存草稿 feed-draft.json。
// 关键：写入草稿前先过「质量闸门」(validate-feed.mjs, 暂放行空 impact)。impact 由 AI 解读步骤(enrich)填充、
// 再过严格闸门后，才由 daily-pipeline.mjs 发布到线上 feed.json。任何空字段/假链接/死链都不会进线上。
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import { validate, gateNewItem } from './validate-feed.mjs';

const ROOT = path.resolve('.');
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/sources.json'), 'utf-8'));
const writeBack = process.argv.includes('--write');
let feed = null;
try { feed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/feed.json'), 'utf-8').replace(/^\uFEFF/, '')); } catch (e) {}

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 剥离追踪参数（utm_/fbclid/gclid/mc_/spm），保留真实查询参数（如 ?id=）
export function stripTracking(link) {
  try {
    const u = new URL(link);
    const del = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'spm'];
    let changed = false;
    del.forEach((k) => { if (u.searchParams.has(k)) { u.searchParams.delete(k); changed = true; } });
    return changed ? u.toString() : link;
  } catch { return link; }
}

export function clean(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

export const GENERIC = /^(首页|更多|登录|注册|联系我们|关于我们|订阅|隐私|条款|Home|More|Menu|Search|Contact|Privacy|Terms|CTP Newsroom|Press Office|Press Announcements|Press Releases|Industry news|Subscribe|Newsletter|Read More|News and Events|Sign Up for Email Updates|Categories|Topics|RSS|媒体中心|聚焦中国|全球视野|贝恩专著)$/i;

// 内容兜底路由：判断一条内容是否涉及「电子烟 / 烟草 / 尼古丁替代」——这类只归行业资讯(news)，
// 其余（FMCG、餐饮、包装、市场研究、消费电子、官方平台、CMI/感官）归专业提升(insights)。
export const TOBACCO_RE = /电子烟|电子雾|烟草|尼古丁|烟油|烟弹|雾化|雾化物|悦刻|RELX|思摩尔|SMOORE|雾芯|PMTA|加热不燃烧|HNB|无烟烟草|口含烟|snus|嚼烟|vape|vaping|e-cig|e-cigarette|tobacco|cigarette|hookah|水烟|控烟|减害|烟草控制|无烟|烟碱|尼古丁袋|尼古丁替代|NRT|薄荷醇|menthol|烟草税|tobacco control|harm reduction|smoke-free|nicotine pouch|vaping policy/i;
// 强非烟草主题（烟草媒体偶尔也发跨界新闻，如新能源/出海/汽车）。内容命中这些且无任何烟草词时，视为非烟草，不归入行业资讯。
export const NONTOB_STRONG = /新能源|电动车|电动汽车|纯电动|混动|续航|动力电池|锂电池|出海|巴西|滴滴|汽车|车企|整车|乘用车|vehicle|electric vehicle|\bEV\b|automaker|tesla|比亚迪|蔚来|小鹏|理想|新能源汽车|智能驾驶|自动驾驶|光伏|储能/i;
export function isTobacco(it, srcName) {
  const content = [it.title, it.summary, it.desc].filter(Boolean).join(' ');
  // 注意：解析出的条目本身不带 source 字段，必须把「源名」显式传进来兜底，
  // 否则像国家烟草局「天津…反走私宣传」这类标题不含"烟草"二字的新闻会被误判为非烟草整源 0 条。
  const meta = [srcName, it.source, it.origin].filter(Boolean).join(' ');
  // 内容明显是非烟草主题且无任何烟草词 -> 非烟草（拦截烟草媒体发的跨界新闻，如「滴滴出海·新能源」）
  if (NONTOB_STRONG.test(content) && !TOBACCO_RE.test(content)) return false;
  // 源名兜底：仅对"本身是烟草/电子烟专媒"的源生效。
  // 综合类站点（如中国经济网·电子烟）名字虽含"电子烟"，但整页是泛产经，不能用源名放行，
  // 必须正文真含烟草词才归入行业资讯（否则会灌入跑题内容，如数字经济/楼市/小家电新闻）。
  const NAME_FALLBACK_BLOCK = /中国经济网|ce\.cn/i;
  if (!NAME_FALLBACK_BLOCK.test(meta) && TOBACCO_RE.test(meta)) return true;
  return TOBACCO_RE.test(content);
}

// 自动分类：当源配置未指定 cat 时，根据标题关键词+来源推断分类
export function autoCat(it, srcName) {
  const t = (it.title + ' ' + (it.summary || '')).toLowerCase();
  const src = (srcName || '').toLowerCase();
  // 企业/公司动向
  if (/pmi|philip morris|kt&g|jti|british american|bat|altria|imperial|jt|韩国烟草|菲莫国际|英美烟草|日本烟草|公司.*推出|公司.*发布|公司.*宣布|launch|acquire|merger|deal|sues|lawsuit|收购|兼并/i.test(t)) return '巨头动向';
  // 监管/政策/法规
  if (/regulation|regulat|ban|law|legal|legislation|tax|fda|who|eu|european union|英国.*控|规划管控|crackdown|诉讼|sues|court|ruling|禁令|合规|监管|执法|policy|directive|bill|草案|立法/i.test(t)) return '欧洲监管';
  // 市场数据/报告
  if (/market|share|growth|revenue|sales|forecast|trend|data.*report|survey|industry.*sector|insight|outlook|统计|增长|下滑|份额|市场规模/i.test(t)) return '市场动态';
  // 产品技术
  if (/product|device|technology|tech|innovation|patent|flavor|ingredient|nicotine|vape|e-cig|heated|hnb|新品|技术|研发/i.test(t)) return '产品技术';
  // 出口贸易
  if (/export|import|trade|tariff|shipping|supply chain|出口|进口|贸易|海关/i.test(t)) return '出口贸易';
  // 按来源兜底
  if (/tobacco reporter/i.test(src)) return '欧洲监管';
  if (/tobacco insider/i.test(src)) return '市场动态';
  if (/inside fmcg/i.test(src)) return '市场动态';
  return '企业动态';
}

export async function getText(url, retries = 4) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, redirect: 'follow', signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      lastErr = e;
      // 末次兜底：部分站点(如 Tobacco Insider)的 WAF 会拦截带自定义 UA 的请求，改用不带自定义头的请求
      if (i === retries - 1) {
        try {
          const r2 = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
          if (!r2.ok) throw new Error('HTTP ' + r2.status);
          return await r2.text();
        } catch (e2) { lastErr = e2; }
      }
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

// 跳过像 CSS/脚本噪声的 <p> 块（含 { } @ ; 等样式标记或几乎无文字），避免把页面样式当成正文/摘要
function isProseLike(t) {
  if (!t || t.length < 20) return false;
  if (/[{};@]|function\s*\(|@font-face|@media|@import/.test(t)) return false;
  const letters = (t.match(/[一-龥a-zA-Z]/g) || []).length;
  return letters >= Math.min(20, t.length * 0.4);
}

// 从文章页抽取第一段作为要点摘要（保证不为空）
export async function deriveSummary(link, fallback) {
  if (fallback && fallback.length >= 40 && isProseLike(fallback)) return clean(fallback).slice(0, 160);
  try {
    const html = await fetchArticleHTML(link);
    const ps = html.match(/<p[\s\S]*?<\/p>/gi) || [];
    for (const p of ps) {
      const t = clean(p);
      if (isProseLike(t)) return t.slice(0, 160);
    }
  } catch (e) { }
  return fallback && isProseLike(fallback) ? clean(fallback).slice(0, 160) : '';
}

// 抓正文（零 token）：取文章页前若干 <p> 拼成正文（≤2000字），用于"厚度门槛"与前端展示
export async function deriveBody(link, maxLen = 2000) {
  try {
    const html = await fetchArticleHTML(link);
    const ps = html.match(/<p[\s\S]*?<\/p>/gi) || [];
    const parts = [];
    for (const p of ps) {
      const t = clean(p);
      if (isProseLike(t)) { parts.push(t); if (parts.join(' ').length >= maxLen) break; }
    }
    return parts.join(' ').slice(0, maxLen);
  } catch (e) { return ''; }
}

// —— 浏览器渲染抓取（type:"browser"）：针对 WAF/反爬站（Vaping360 / 2firsts 等），
// 普通 fetch 被 403/空，改用本机 Chrome 渲染后再抽链接。跨平台加载 puppeteer（与 fetch-insights 同款修复）。
function loadPuppeteer() {
  const bases = [
    'C:/Users/VOOPOO/.workbuddy/binaries/node/workspace/',
    path.join(ROOT, 'node_modules'),
    ROOT,
  ];
  const tried = [];
  for (const b of bases) {
    try { return createRequire(path.resolve(b, '__probe__.js'))('puppeteer'); }
    catch (e) { tried.push(`${b} (${e.code || e.message})`); }
  }
  try { return createRequire(import.meta.url)('puppeteer'); }
  catch (e) { tried.push(`self (${e.code || e.message})`); }
  throw new Error('puppeteer 不可用，已尝试: ' + tried.join(' | '));
}
async function fetchBrowserHTML(url, waitMs = 7000, browser = null) {
  let localBrowser = false;
  try {
    if (!browser) { const puppeteer = loadPuppeteer(); browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] }); localBrowser = true; }
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setRequestInterception(true);
    page.on('request', (r) => { const t = r.resourceType(); (['image', 'font', 'stylesheet', 'media'].includes(t)) ? r.abort() : r.continue(); });
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }); } catch (e) { /* 重型 JS 站常超时，继续抓已加载的 DOM */ }
    await new Promise((r) => setTimeout(r, waitMs));
    for (let i = 0; i < 10; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await new Promise((r) => setTimeout(r, 500)); }
    await new Promise((r) => setTimeout(r, 2500));
    return await page.content();
  } finally { try { if (localBrowser && browser) await browser.close(); } catch (e) { } }
}
// —— 日期/文本解析工具 ——
const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11, jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function isValidDate(d) { if (isNaN(d)) return false; const now = new Date(); return d.getFullYear() >= 2015 && d <= now; }
// 从一段文本里识别真实发布日期：中文 YYYY年M月D日 / ISO YYYY-MM-DD / 英文 Month DD YYYY / DD Month YYYY
export function parseDateFromText(text) {
  if (!text) return null;
  const t = String(text);
  let m = t.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); if (isValidDate(d)) return d; }
  m = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); if (isValidDate(d)) return d; }
  m = t.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m && MONTHS[m[1].toLowerCase()] !== undefined) { const d = new Date(+m[3], MONTHS[m[1].toLowerCase()], +m[2]); if (isValidDate(d)) return d; }
  m = t.match(/\b(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})\b/);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) { const d = new Date(+m[3], MONTHS[m[2].toLowerCase()], +m[1]); if (isValidDate(d)) return d; }
  return null;
}
// 解析内嵌元数据（2firsts 等 Vue 站）：文章对象形如 id:17426,...,create_time:1786013842,...,title:"...",description:"..."。
// 返回 { [id]: { date:'YYYY-MM-DD'|null, title, desc } }。create_time 为秒级 Unix 时间戳。
function extractEmbedMeta(html) {
  const map = {};
  if (!/create_time:/.test(html)) return map;
  const re = /id:(\d+)([\s\S]*?)(?=id:\d+|$)/g;
  let mm;
  while ((mm = re.exec(html))) {
    const id = mm[1];
    if (map[id]) continue;
    const chunk = mm[2];
    const ts = (chunk.match(/create_time:(\d+)/) || [])[1];
    const title = (chunk.match(/title:"([^"]*)"/) || [])[1];
    const desc = (chunk.match(/description:"([^"]*)"/) || [])[1];
    let date = null;
    if (ts) { const n = parseInt(ts, 10); if (n > 1e9 && n < 2e9) { const d = new Date(n * 1000); if (isValidDate(d)) date = d.toISOString().slice(0, 10); } }
    map[id] = { date, title, desc };
  }
  return map;
}

export function parseBrowser(html, base, articleRe) {
  // 解码 HTML 实体（关键：2firsts 等站链接含 &amp;id= 实体，不解码会被 new URL 变成畸形地址 → 回源 404）
  const dec = (s) => (s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  // 浏览器型源（2firsts/Vaping360 等）真实发布日期与摘要就在列表页上，不必回源被墙的文章页：
  // 2firsts 把元数据（id→create_time 时间戳 + title + description）写在内嵌数据里；
  // Vaping360 每张卡片有 article-card__date / article-card__desc。
  const idMeta = extractEmbedMeta(html);
  const out = [];
  const re = new RegExp('<a[^>]+href="([^"]*(?:' + articleRe + ')[^"]*)"[^>]*>([\\s\\S]*?)</a>', 'gi');
  let m;
  while ((m = re.exec(html))) {
    try {
      const rawHref = dec(m[1]);
      const href = stripTracking(new URL(rawHref, base).href);
      const idm = rawHref.match(/[?&]id=(\d+)/);
      const meta = idm ? idMeta[idm[1]] : null;
      let title = dec(clean(m[2]));
      if (meta && meta.title && meta.title.length >= 6) title = meta.title;
      if (!title || title.length < 6) continue;
      if (GENERIC.test(title)) continue;
      // 发布日期：优先列表页窗口内真实日期，其次 2firsts 内嵌时间戳
      let pub = '';
      const near = html.slice(Math.max(0, m.index - 1000), m.index + 1000);
      const d = parseDateFromText(near);
      if (d) pub = d.toISOString().slice(0, 10);
      else if (meta && meta.date) pub = meta.date;
      // 摘要：列表卡片里 class 含 desc/excerpt/summary 的元素文本（Vaping360 等）；2firsts 优先用内嵌 description
      let desc = '';
      const descM = near.match(/class="[^"]*(?:desc|excerpt|summary|teaser|blurb)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|p|span)>/i);
      if (descM) { const t = clean(descM[1]); if (isProseLike(t)) desc = t; }
      if (meta && meta.desc && isProseLike(meta.desc)) desc = meta.desc.slice(0, 400);
      out.push({ title, link: href, pub, desc: desc.slice(0, 400) });
    } catch (e) { }
  }
  const seen = new Set(); const uniq = [];
  for (const x of out) { if (!seen.has(x.link)) { seen.add(x.link); uniq.push(x); } }
  return uniq;
}

// 共享浏览器实例：浏览器型源（Vaping360/2firsts 等 Cloudflare 站）连文章页也挡普通 fetch，
// 故列表与文章页抓取共用同一个浏览器，避免每条文章都启停一次浏览器（省资源、提速）。
let _sharedBrowser = null;
async function getSharedBrowser() {
  if (!_sharedBrowser) {
    const puppeteer = loadPuppeteer();
    _sharedBrowser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  }
  return _sharedBrowser;
}
async function closeSharedBrowser() { if (_sharedBrowser) { try { await _sharedBrowser.close(); } catch (e) {} _sharedBrowser = null; } }

// 抓文章页 HTML：先试普通 fetch（快）；被 Cloudflare 拦（短页面/挑战词）则降级用浏览器渲染。
// 浏览器型源的文章页必须走浏览器，否则拿不到真实日期/正文。
async function fetchArticleHTML(url) {
  try {
    const html = await getText(url);
    if (html && html.length > 800 && !/cloudflare|just a moment|verify you are human|attention required/i.test(html)) return html;
  } catch (e) {}
  try {
    const browser = await getSharedBrowser();
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.evaluateOnNewDocument(() => { try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch (e) {} try { window.chrome = { runtime: {} }; } catch (e) {} });
    await page.setRequestInterception(true);
    page.on('request', (r) => { const t = r.resourceType(); (['image', 'media'].includes(t)) ? r.abort() : r.continue(); });
    try { await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 }); } catch (e) {}
    await new Promise((r) => setTimeout(r, 6000));
    for (let i = 0; i < 8; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await new Promise((r) => setTimeout(r, 300)); }
    const html = await page.content();
    await page.close();
    return html || '';
  } catch (e) { return ''; }
}

// 回源文章页抓取真实发布日期：优先 <meta article:published_time/og:published_time/datePublished>，
// 其次 <time datetime>，最后退回正文文本里的日期模式（January 5, 2026 / 5 January 2026 / 2026-01-05）。
// 尽力而为，拿不到返回 null（由上层决定跳过，绝不伪造「今天」冒充）。
export async function deriveDate(link) {
  try {
    const html = await fetchArticleHTML(link);
    const metaRe = /<meta[^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|og:published_time|datePublished)["'][^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|og:published_time|datePublished)["']/i;
    const m = html.match(metaRe);
    if (m) { const d = new Date(m[1] || m[2]); if (!isNaN(d) && d <= new Date() && d.getFullYear() >= 2015) return d; }
    const timeTags = html.match(/<time[^>]+datetime=["']([^"']+)["']/gi) || [];
    for (const tt of timeTags) {
      const dm = tt.match(/datetime=["']([^"']+)["']/i);
      if (dm) { const d = new Date(dm[1]); if (!isNaN(d) && d <= new Date() && d.getFullYear() >= 2015) return d; }
    }
  } catch (e) { }
  return null; // 取不到真实日期就返回 null，由上层决定跳过，绝不拿「今天」冒充发布日
}

export function parseRSS(xml, base) {
  const out = [];
  const items = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
  for (const it of items) {
    const title = clean((it.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    let link = (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] ||
      clean((it.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]);
    link = stripTracking(link);
    if (link && base) { try { link = new URL(link, base).href; } catch (e) {} }
    const pub = clean((it.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
      it.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) || [])[1]);
    const desc = clean((it.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
      it.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1]);
    if (title && link) out.push({ title, link: link.trim(), pub, desc: desc.slice(0, 160) });
  }
  return out;
}

// 列表页「链接+标题+日期」成对解析（国家烟草局等：li 内 <a> + <span class="date">）。
// 关键：发布日期直接从列表页取，不必逐篇回源抓日期 —— 省掉一半请求，避免被目标站限流导致整源 0 条。
export function parseListDate(html, base, sel) {
  const out = [];
  const esc = (sel || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('<li>\\s*<a[^>]+href="([^"]*' + esc + '[^"]*)"[^>]*>([\\s\\S]*?)</a>\\s*<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)</span>', 'gi');
  let m;
  while ((m = re.exec(html))) {
    try {
      const href = stripTracking(new URL(m[1], base).href);
      const title = clean(m[2]);
      const pub = clean(m[3]);
      if (!title || title.length < 4) continue;
      if (GENERIC.test(title)) continue;
      out.push({ title, link: href, pub, desc: '' });
    } catch (e) { }
  }
  const seen = new Set(); const uniq = [];
  for (const x of out) { if (!seen.has(x.link)) { seen.add(x.link); uniq.push(x); } }
  return uniq;
}

export function parseHTML(html, base, sel) {
  const out = [];
  const esc = (sel || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('<a[^>]+href="([^"]*' + esc + '[^"]*)"[^>]*>([\\s\\S]*?)</a>', 'gi');
  let m; let basePath = '';
  try { basePath = new URL(base).pathname.replace(/\/$/, ''); } catch (e) { }
  while ((m = re.exec(html))) {
    try {
      const href = stripTracking(new URL(m[1], base).href);
      const u = new URL(href);
      const title = clean(m[2]);
      if (!title || title.length < 4) continue;
      if (GENERIC.test(title)) continue;
      if (u.pathname.replace(/\/$/, '') === basePath) continue;
      if (!/^(首页|更多|登录|注册)/i.test(title)) out.push({ title, link: href, pub: '', desc: '' });
    } catch (e) { }
  }
  const seen = new Set(); const uniq = [];
  for (const x of out) { if (!seen.has(x.link)) { seen.add(x.link); uniq.push(x); } }
  return uniq;
}

// —— 浏览器型源（DOM 抽取）：在已渲染的页面里直接读「链接 + 标题 + 日期 + 摘要」，不再做脆弱的 HTML 字符串切分 ——
// 处理无年份短日期(10-22)与相对时间(4小时前/3天前)：假定当年，超今天则上一年；相对时间按「现在 - N」算。
export function parseRelativeOrShortDate(...texts) {
  const now = new Date();
  for (const raw of texts) {
    if (!raw) continue;
    const t = String(raw);
    let m = t.match(/(\d+)\s*(?:分钟|min)/i); if (m) { const d = new Date(now.getTime() - (+m[1]) * 60000); if (isValidDate(d)) return d; }
    m = t.match(/(\d+)\s*(?:小时|hrs?|hours?)/i); if (m) { const d = new Date(now.getTime() - (+m[1]) * 3600000); if (isValidDate(d)) return d; }
    m = t.match(/(\d+)\s*(?:天|days?|d)\b/i); if (m) { const d = new Date(now.getTime() - (+m[1]) * 86400000); if (isValidDate(d)) return d; }
    m = t.match(/(\d{1,2})[-/.](\d{1,2})(?![-/.]\d)/);
    if (m) { let d = new Date(now.getFullYear(), +m[1] - 1, +m[2]); if (!isValidDate(d)) d = new Date(now.getFullYear() - 1, +m[1] - 1, +m[2]); if (isValidDate(d)) return d; }
  }
  return null;
}
// 清理标题：去掉结尾被网站塞进来的日期后缀（" 10-22" / " 4小时前" 等），只保留真正的标题
function cleanTitle(title) {
  return (title || '')
    .replace(/\s*(\d{1,2})[-/.](\d{1,2})(?![-/.]\d)\s*$/, '')
    .replace(/\s*(刚刚|\d+\s*(?:分钟|小时|天)前)\s*$/i, '')
    .replace(/\s+/g, ' ').trim();
}
export async function scrapeBrowserDOM(browser, url, articleRe, wait = 9000) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' });
  // 反爬对抗：抹掉 headless 指纹（webdriver/chrome），避免被 Cloudflare/2firsts 识别为机器人
  await page.evaluateOnNewDocument(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch (e) {}
    try { window.chrome = { runtime: {} }; } catch (e) {}
  });
  // 只拦图片/媒体（省流量）。拦截 css/font 会让 SPA 渲染不全、更易触发反爬，故放行
  await page.setRequestInterception(true);
  page.on('request', (r) => { const t = r.resourceType(); (['image', 'media'].includes(t)) ? r.abort() : r.continue(); });
  try { await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 }); } catch (e) { }
  await new Promise((r) => setTimeout(r, wait));
  for (let i = 0; i < 8; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await new Promise((r) => setTimeout(r, 300)); }
  // 列表页内嵌数据（2firsts 等 Vue 站把 description / create_time 写在页面脚本里），用于补摘要与日期
  const html = await page.content();
  const idMeta = extractEmbedMeta(html);
  const raw = await page.evaluate((reStr) => {
    const re = new RegExp(reStr);
    // 从链接向上找「最外层的卡片容器」：class 含 article-card / news-item / post 的祖先里取最顶层，
    // 避免误命中 article-card__preview 这类子元素（那样会漏掉同级的日期/摘要）。
    function cardOf(el) {
      const cand = [];
      let n = el;
      while (n && n !== document.body) {
        const cls = (n.className || '').toString().split(/\s+/);
        if (cls.some((c) => /article[-_]?card/i.test(c) || /news[-_]?item/i.test(c) || /post[-_]?item/i.test(c) || /^post$/i.test(c))) cand.push(n);
        n = n.parentElement;
      }
      return cand.length ? cand[cand.length - 1] : (el.parentElement || el);
    }
    const links = [...document.querySelectorAll('a')].filter((a) => {
      const h = a.getAttribute('href') || '';
      if (!re.test(h)) return false;
      if (/(?:\/vape-news|\/news)\/?$/i.test(h)) return false;       // 排除栏目/板块入口
      if (a.closest('nav, header, [class*="menu__" i], [class*="sidebar" i], [class*="nav" i]')) return false; // 排除导航/菜单里的同名链接（仅 Vaping360 的 menu__ 结构，不影响 2firsts 正文列表）
      return true;
    });
    const out = [];
    for (const a of links) {
      const card = cardOf(a);
      let title = (a.innerText || '').trim();
      if (!title && a.getAttribute('aria-label')) title = a.getAttribute('aria-label').replace(/^Read article:\s*/i, '').trim();
      let dateText = '';
      const dateEl = card ? card.querySelector('[class*="date" i]') : null;
      if (dateEl) dateText = (dateEl.innerText || '').trim();
      let desc = '';
      const descEl = card ? card.querySelector('[class*="desc" i], [class*="excerpt" i], [class*="summary" i], [class*="teaser" i]') : null;
      if (descEl) desc = (descEl.innerText || '').trim();
      const cardText = card ? (card.innerText || '') : (a.innerText || '');
      out.push({ title, link: a.href, dateText: dateText.slice(0, 60), desc: desc.slice(0, 600), cardText: cardText.slice(0, 600) });
    }
    return out;
  }, articleRe);
  await page.close();
  const seen = new Set(); const out = [];
  for (const it of raw) {
    if (!it.title || it.title.length < 6) continue;
    const href = stripTracking(it.link);
    if (seen.has(href)) continue; seen.add(href);
    if (GENERIC.test(it.title)) continue;
    // 2firsts 等：链接里的 ?id=NNNNN 可去内嵌数据取真实摘要/日期兜底
    const idm = (href.match(/[?&]id=(\d+)/) || [])[1];
    const meta = idm ? idMeta[idm] : null;
    let d = parseDateFromText(it.dateText) || parseDateFromText(it.cardText) || parseRelativeOrShortDate(it.title, it.cardText);
    if (!d && meta && meta.date) d = new Date(meta.date);
    const pub = d ? d.toISOString().slice(0, 10) : '';
    const title = cleanTitle(it.title);
    let desc = (it.desc || '').replace(/\s+/g, ' ').trim();
    if ((!desc || desc.length < 10) && meta && meta.desc) desc = meta.desc.replace(/\s+/g, ' ').trim();
    desc = desc.slice(0, 400);
    out.push({ title, link: href, pub, desc });
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
(async () => {
 try {
  let newCount = 0;
  const rejected = [];
  // 每日自动抓取只针对「行业资讯」：真实近期新闻 + AI 写顾问视角。
  // 专业提升(insights)是精选常青分析（已有完整 core/view/action），不放进每日抓取的半成品池。
  for (const grp of ['news']) {
    for (const s of sources[grp]) {
      try {
        let txt = '';
        let items = [];
        if (s.type === 'browser') {
          // WAF/反爬站：普通 fetch 被 403，改用本机 Chrome 渲染后，直接在 DOM 里抽取「链接+标题+日期+摘要」。
          // 关键：日期与摘要都在列表页的卡片上（Vaping360 有 .article-card__date / .article-card__desc；
          // 2firsts 等 Vue 站把日期写在标题/卡片文本里，如 "10-22" 或 "4小时前"），根本不必回源被墙的文章页。
          // 每个浏览器源单独起一个全新浏览器实例：避免 Vaping360 触发 Cloudflare 后，同一个浏览器会话把
          // 2firsts 也一并拦掉（实测共用浏览器会让后跑的源连续吃挑战页）。
          let browser = null;
          try {
            const puppeteer = loadPuppeteer();
            browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
            let lastErr = '';
            const maxTry = 3;
            for (let attempt = 0; attempt < maxTry; attempt++) {
              items = await scrapeBrowserDOM(browser, s.url, s.articleRe || '[a-z0-9\\-]+/[a-z0-9\\-]+', (s.wait || 9000) + attempt * 6000);
              if (items.length > 0) break;
              lastErr = `第${attempt + 1}次渲染得 0 条`;
              // 冷却再重试：Cloudflare 对高频请求会直接喂挑战页，间隔拉大可降低被标记概率
              if (attempt < maxTry - 1) await new Promise((r) => setTimeout(r, 15000));
            }
            if (items.length === 0 && lastErr) console.log(`\n=== [${grp}] ${s.name} 浏览器渲染连续 ${maxTry} 次得 0 条(反爬拦截，已跳过): ${lastErr} ===`);
          } catch (be) {
            console.log(`\n=== [${grp}] ${s.name} 浏览器渲染失败(已跳过该源，不影响其他): ${be.message} ===`);
            items = [];
          } finally { if (browser) { try { await browser.close(); } catch (e) {} } }
        } else {
          txt = await getText(s.url);
          if (s.type === 'rss') items = parseRSS(txt, s.url);
          else if (s.type === 'listdate') items = parseListDate(txt, s.url, s.sel || '');
          else items = parseHTML(txt, s.url, s.sel || '');
        }
        console.log(`\n=== [${grp}] ${s.name} (${s.type}) 抓到 ${items.length} 条 ===`);
        items.slice(0, 4).forEach((it) => console.log(`  • ${it.title}\n    ${it.link}`));
        if (writeBack && feed) {
          const arr = feed[grp] || [];
          const seen = new Set(arr.map((x) => x.link));
          const add = [];
          for (const it of items) {
            if (seen.has(it.link)) continue;
            // 内容兜底：非烟草/电子烟内容不归入行业资讯（应属专业提升），直接丢弃由 insights 源补充
            if (!isTobacco(it, s.name)) { rejected.push(`[${grp}] ${it.title} -> 非烟草/电子烟内容，不归入行业资讯（应属专业提升）`); continue; }
            // 质量闸门：链接必须是真实深链
            const lq = (await import('./validate-feed.mjs')).linkQuality(it.link);
            if (!lq.ok) { rejected.push(`[${grp}] ${it.title} -> ${lq.reason}`); continue; }
            await new Promise((r) => setTimeout(r, 150)); // 礼貌抓取：避免高频回源被目标站限流（曾致整源 0 条）
            const summary = await deriveSummary(it.link, it.desc);
            if (!summary) { rejected.push(`[${grp}] ${it.title} -> 摘要为空，已拦截`); continue; }
            // 真实发布日期：列表页已给出就用（parseBrowser/parseListDate/parseRSS 已在列表页取到）；
            // 列表页没有才回源文章页抓；再取不到就放弃这条（绝不伪造「今天」冒充发布日）
            let pubDate = null;
            if (it.pub) { const pd = new Date(it.pub); if (!isNaN(pd) && pd <= new Date()) pubDate = pd; }
            if (!pubDate) { try { pubDate = await deriveDate(it.link); } catch (e) {} }
            if (!pubDate) { rejected.push(`[${grp}] ${it.title} -> 无真实发布日期(已回源文章页仍找不到)，已跳过`); continue; }
            // A 标准闸门（静态·零 token）：新内容时间真实且不过期、非标题党才入池
            const gres = gateNewItem({ title: it.title, summary, date: pubDate.toISOString().slice(0, 10) }, grp, {});
            if (!gres.ok) { rejected.push(`[${grp}] ${it.title} -> ${gres.reason}`); continue; }
            // 抓正文（零 token）：用于厚度门槛与前端展示
            const body = await deriveBody(it.link);
            // 全部留存：不再按时间丢弃（用户 2026-09-08 要求）
            add.push({
              title: it.title,
              link: it.link,
              source: s.name,
              cat: s.cat || autoCat(it, s.name),
              dimension: s.dimension || '',
              region: s.region || '',
              summary,
              body,
              date: pubDate.toISOString().slice(0, 10),
              impact: '',   // 留空，由 AI 解读步骤(enrich)填充后再过闸门
              action: '',
              origin: s.name,
            });
            seen.add(it.link);
          }
          feed[grp] = add.concat(arr); // 全部留存：不再设条数上限（用户 2026-09-08 要求）
          newCount += add.length;
          if (add.length) console.log(`  >> 新增 ${add.length} 条`);
        }
      } catch (e) {
        console.log(`\n=== [${grp}] ${s.name} 失败: ${e.message} ===`);
      }
    }
  }
  if (writeBack && feed) {
    // 写入前再过一次闸门：任何致命问题都阻止发布（impact 暂空由 AI 后续填充，故放行）
    const report = validate(feed, { skipImpactEmpty: true });
    if (!report.ok) {
      console.log('\n❌ 质量闸门未通过，已拒绝写入暂存草稿。致命问题：');
      report.critical.slice(0, 30).forEach((c) => console.log('  ✗ ' + c));
      if (rejected.length) { console.log('本次抓取被拦截：'); rejected.forEach((r) => console.log('  – ' + r)); }
      fs.writeFileSync(path.join(ROOT, 'data/feed-quarantine.json'), JSON.stringify({ rejected, critical: report.critical }, null, 2));
      process.exit(1);
    }
    // 只写暂存草稿，绝不直接动线上 feed.json；impact 待 AI 填充、严格质检通过后才由流水线发布
    fs.writeFileSync(path.join(ROOT, 'data/feed-draft.json'), JSON.stringify(feed, null, 2));
    if (newCount > 0) console.log(`\n✅ 已写入暂存草稿 feed-draft.json（新增 ${newCount} 条，impact 待 AI 填充），未动线上 feed.json`);
    else console.log('\n✅ 暂存草稿已更新（本次无新增条目）');
  } else {
    console.log('\n（仅预览，未写回 feed.json；加 --write 才会合并并过闸门）');
  }
  if (rejected.length) { console.log(`\n⚠️ 本次抓取拦截 ${rejected.length} 条不合格内容（未进线上）`); }
 } finally {
  await closeSharedBrowser();
 }
})();
}
