// 专业提升「每日自动抓取」：从 sources.json 的 insights 组抓最新深度分析文章
// -> 生成 insights 条目(core/view/action 暂空) -> 由 ai-enrich(DeepSeek) 填三栏 -> 严格质检后发布。
// 保留现有精选不删，每天追加 1-3 篇新分析，保证「专业提升每天有更新」。
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { validate, linkQuality, gateNewItem } from './validate-feed.mjs';

const ROOT = path.resolve('.');
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/sources.json'), 'utf-8'));
const writeBack = process.argv.includes('--write');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function stripTracking(link) {
  try {
    const u = new URL(link);
    const del = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'spm'];
    let changed = false;
    del.forEach((k) => { if (u.searchParams.has(k)) { u.searchParams.delete(k); changed = true; } });
    return changed ? u.toString() : link;
  } catch { return link; }
}
function clean(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}
// 标题护栏：个别源（如 NIQ 的 sitemap/JSON-LD 页）会把整篇正文误当标题抓进来。
// 这里只做"防撑爆存储"的硬截断（>300字截到300），真正的中文短标题由 ai-enrich 在富集阶段生成。
function sanitizeTitle(raw) {
  const t = clean(raw || '');
  if (!t) return '';
  if (t.length > 300) return t.slice(0, 300).trim();
  return t;
}

// —— 浏览器渲染抓取（type:"browser"）：针对 JS 动态站（WHO / Bain / NielsenIQ 等），
// 普通 fetch 拿不到内容，改用本机 Chrome 渲染后再抽取文章链接。仅当源配置为 browser 时才加载 puppeteer。
// 跨平台加载 puppeteer（关键修复）：
//   本机(Windows) 装在 WorkBuddy 的 Node 工作区；云端(Linux/CI) 用项目内 node_modules。
//   原写法 createRequire('C:/Users/...') 在 Linux 上不是绝对路径 → 脚本一启动就抛错 →
//   整个「专业提升抓取」被 daily-pipeline 的 tryRun 静默跳过 → 云端每天 0 新增、线上专业提升停更。
function loadPuppeteer() {
  const bases = [
    'C:/Users/VOOPOO/.workbuddy/binaries/node/workspace/', // 本机已装 Chrome 缓存的 Node 工作区
    path.join(ROOT, 'node_modules'),                       // CI/云端 `npm i puppeteer` 后的位置
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
async function fetchBrowserHTML(url, waitMs = 7000) {
  let browser;
  try {
    const puppeteer = loadPuppeteer();
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setRequestInterception(true);
    page.on('request', (r) => { const t = r.resourceType(); (['image', 'font', 'stylesheet', 'media'].includes(t)) ? r.abort() : r.continue(); });
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }); } catch (e) { /* 重型 JS 站常超时，继续抓已加载的 DOM */ }
    await new Promise((r) => setTimeout(r, waitMs));
    for (let i = 0; i < 10; i++) { await page.evaluate(() => window.scrollBy(0, 1500)); await new Promise((r) => setTimeout(r, 500)); }
    await new Promise((r) => setTimeout(r, 2500));
    return await page.content();
  } finally { try { if (browser) await browser.close(); } catch (e) { /* 关闭时偶发 EBUSY 等，忽略，不向外抛，避免拖垮整个 insights 抓取 */ } }
}
// 从 <a> 锚文本里抽取「真实标题」：个别站（如 NIQ）把整张卡片(标题+摘要正文)包进 <a>，
// clean 后就是几百字的整篇文章。这里做护栏，优先级：标题级元素 > class 含 title 的元素 > URL slug 还原。
function deriveTitleFromAnchor(anchorHtml, href) {
  let title = clean(anchorHtml);
  if (title.length <= 120) return title; // 正常长度直接采用，不触发护栏
  // 1) 卡片内的标题级元素（h1~h4）
  const h = anchorHtml.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
  if (h) { const t = clean(h[1]); if (t.length >= 6 && t.length <= 150) return t; }
  // 2) class 含 title 的元素（如 <span class="card-title">）
  const tMatch = anchorHtml.match(/<[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\//i);
  if (tMatch) { const t = clean(tMatch[1]); if (t.length >= 6 && t.length <= 150) return t; }
  // 3) URL slug 还原（NIQ 等 kebab slug 即真实标题，零网络）
  try {
    const seg = new URL(href).pathname.split('/').filter(Boolean);
    const slug = seg[seg.length - 1] || '';
    if (slug.includes('-') && !/\d{6,}/.test(slug)) {
      const t = slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ').trim();
      if (t.length >= 8 && t.split(' ').length >= 2) return t;
    }
  } catch (e) { /* ignore */ }
  return title; // 上述都失败，保留原始（仍可能偏长，但至少不主动造垃圾）
}
// 用 articleRe（来自源配置）精确匹配文章链接，避免误抓栏目/导航页
function parseBrowser(html, base, articleRe) {
  const out = [];
  const re = new RegExp('<a[^>]+href="([^"]*(?:' + articleRe + ')[^"]*)"[^>]*>([\\s\\S]*?)</a>', 'gi');
  let m;
  while ((m = re.exec(html))) {
    try {
      const href = stripTracking(new URL(m[1], base).href);
      const title = deriveTitleFromAnchor(m[2], href);
      if (!title || title.length < 6) continue;
      if (GENERIC.test(title)) continue;
      out.push({ title, link: href, pub: '', desc: '' });
    } catch (e) { }
  }
  const seen = new Set(); const uniq = [];
  for (const x of out) { if (!seen.has(x.link)) { seen.add(x.link); uniq.push(x); } }
  return uniq;
}
const GENERIC = /^(首页|更多|登录|注册|联系我们|关于我们|订阅|隐私|条款|Home|More|Menu|Search|Contact|Privacy|Terms|CTP Newsroom|Press Office|Press Announcements|Press Releases|Industry news|Subscribe|Newsletter|Read More|News and Events|Sign Up for Email Updates|Categories|Topics|RSS|媒体中心|聚焦中国|全球视野|贝恩专著|Global|Europe|Asia|Americas|North America|Latin America|APAC|EMEA|About|Working at Innova|Vacancies|Global Reach|All news|Business|New product development|Download|Newsletter subscription|Careers|Media Kit|Advertise|Contact us|Terms of Use|Privacy Policy|Cookie Policy)$/i;
// 地区导航页/平台概览页 URL 模式（不是真正的文章或报告）
const NAV_URL_RE = /\/(?:region|country|platform|about|overview|solutions|services|topics|careers|subscribe|newsletter|contact|privacy|terms|media-kit|advertise)\/$/i;
// Ipsos 等站 RSS 会把「栏目/主题聚合页」(如 /en-us/future/technology-society) 当成 <item> 吐出；
// 真实文章路径是 /en-us/<slug>（locale 之后仅 1 段）。locale 之后 ≥2 段或命中 hub 一律视为栏目页，不入池（修不删·防复发）。
const SECTION_HUB_RE = /\/(?:future|what-we-do|our-thinking|topics|insights|expertise|sectors|categories|subjects|knowledge-centre|knowledge-center|our-expertise)\//i;

// 内容兜底路由：涉及「电子烟 / 烟草 / 尼古丁替代」的只归行业资讯(news)，若误入专业提升则丢弃，由 news 源补充。
const TOBACCO_RE = /电子烟|电子雾|烟草|尼古丁|烟油|烟弹|雾化|雾化物|悦刻|RELX|思摩尔|SMOORE|雾芯|PMTA|加热不燃烧|HNB|无烟烟草|口含烟|snus|嚼烟|vape|vaping|e-cig|e-cigarette|tobacco|cigarette|hookah|水烟/i;
function isTobacco(it) {
  const s = [it.title, it.summary, it.desc, it.source, it.origin].filter(Boolean).join(' ');
  return TOBACCO_RE.test(s);
}

// 感官研究关键词：sensory:true 的源（ScienceDaily 感知/食品、Google News 感官）只收命中这些词的文章，统一标「感官研究」标签（聚焦味觉/嗅觉/风味/质地，不捞大脑/视觉等泛感知）
const SENSORY_RE = /sensory|taste|smell|flavor|flavour|olfactory|aroma|texture|mouthfeel|odor|fragrance|味觉|嗅觉|风味|香气|香精|口感|质地|感官/i;
// 感官源排除词：医疗/疾病/大脑决策类（desc 常含 sensory 字样误伤，如自闭症、大脑决策研究）
const SENSORY_EXCLUDE = /autism|disease|therapy|clinical|patient|disorder|alzheimer|parkinson|psychiatric|diagnos|brain.*decision|decision.*brain/i;

// 专业提升的自动主题分类：源配置未给 cat/dimension 时，按标题+摘要关键词推断，兜底「行业洞察」
function autoTopic(text) {
  const t = ' ' + (text || '') + ' ';
  if (/感官|嗅觉|味觉|香精|香料|风味|香气|sensory|olfactory|flavor|fragrance/i.test(t)) return '感官研究';
  if (/包装|包材|可持续包装|循环经济|包装设计|packaging/i.test(t)) return '包装趋势';
  if (/食品|饮料|乳品|零食|酒|咖啡|茶饮|food|beverage|snack|drink/i.test(t)) return '食品饮料';
  if (/零售|电商|新零售|渠道|门店|retail|e-commerce|commerce/i.test(t)) return '零售渠道';
  if (/消费电子|手机|智能硬件|可穿戴|3C|家电|electronics/i.test(t)) return '消费电子';
  if (/市场研究|消费者洞察|消费趋势|调研|消费者调研|survey|consumer|insight|CMI|市场数据/i.test(t)) return '市场洞察';
  if (/品牌|营销|广告|brand|marketing|advertis/i.test(t)) return '品牌营销';
  if (/快消|日化|个护|美妆|清洁|家居|FMCG|beauty|cosmetic|personal care/i.test(t)) return '快消日化';
  if (/餐饮|外卖|餐厅|餐企|foodservice/i.test(t)) return '餐饮消费';
  if (/出海|全球化|海外市场|跨境|export/i.test(t)) return '出海趋势';
  return '行业洞察';
}

async function getText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, redirect: 'follow', signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    clearTimeout(t);
    return txt;
  } catch (e) { clearTimeout(t); throw e; }
}
// Google News RSS 的链接是跳转链接（news.google.com/rss/articles/...），请求一次拿到真实文章 URL；拿不到返回空
async function resolveReal(link) {
  try {
    const r = await fetch(link, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    return r.url || '';
  } catch (e) { return ''; }
}
// 国家标准全文公开系统(openstd.samr.gov.cn)「感官」检索 → 最新 GB 感官分析标准动态
async function parseGBStd(listHtml) {
  const out = [];
  const pairs = [...listHtml.matchAll(/onclick="showInfo\('([A-F0-9]+)'\);">([^<]+)<\/a>/g)].map((m) => ({ hcno: m[1], text: m[2].trim() }));
  const stds = [];
  for (let i = 0; i < pairs.length - 1; i++) {
    if (/^GB\//.test(pairs[i].text) && !pairs[i + 1].text.startsWith('GB/')) { stds.push({ no: pairs[i].text, title: pairs[i + 1].text, hcno: pairs[i].hcno }); i++; }
  }
  for (const s of stds.slice(0, 5)) {
    const link = 'https://openstd.samr.gov.cn/bzgk/gb/newGbInfo?hcno=' + s.hcno;
    let pub = '', impl = '';
    try {
      const d = await getText(link);
      const dates = [...d.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((m) => m[1]).filter((x) => x >= '2020');
      pub = dates[0] || ''; impl = dates[1] || '';
    } catch (e) { }
    const date = pub || (s.no.match(/-(20\d{2})/)?.[1] + '-06-30') || '2026-01-01';
    out.push({
      title: `国家标准 ${s.no}《${s.title}》发布` + (impl ? `，${impl}实施` : ''),
      link, date,
      summary: `GB 感官分析标准动态：${s.no}《${s.title}》${pub ? '于' + pub + '发布' : ''}${impl ? '，' + impl + '实施' : ''}。详情见国家标准全文公开系统。`,
    });
  }
  return out;
}
async function deriveSummary(link, fallback) {
  if (fallback && fallback.length >= 40) return clean(fallback).slice(0, 160);
  try {
    const html = await getText(link);
    const ps = html.match(/<p[\s\S]*?<\/p>/gi) || [];
    for (const p of ps) { const t = clean(p); if (t.length >= 40) return t.slice(0, 160); }
  } catch (e) { }
  return fallback ? clean(fallback).slice(0, 160) : '';
}
function parseRSS(xml) {
  const out = [];
  const items = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
  for (const it of items) {
    const title = clean((it.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    let link = (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || clean((it.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]);
    link = stripTracking(link);
    const pub = clean((it.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
      it.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) ||
      it.match(/<published[^>]*>([\s\S]*?)<\/published>/i) || [])[1]);
    const desc = clean((it.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
      it.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) ||
      it.match(/<content[^>]*>([\s\S]*?)<\/content>/i) || [])[1]);
    if (title && link) out.push({ title, link: link.trim(), pub, desc: desc.slice(0, 160) });
  }
  return out;
}
function parseHTML(html, base, sel) {
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
// 抓正文（零 token）：取文章页前若干 <p> 拼成正文（≤2000字），用于"厚度门槛"与前端展示
async function deriveBody(link, maxLen = 2000) {
  try {
    const html = await getText(link);
    const ps = html.match(/<p[\s\S]*?<\/p>/gi) || [];
    const parts = [];
    for (const p of ps) {
      const t = clean(p);
      if (t.length >= 30) { parts.push(t); if (parts.join(' ').length >= maxLen) break; }
    }
    return parts.join(' ').slice(0, maxLen);
  } catch (e) { return ''; }
}

// 回源文章页抓真实发布日期（同 fetch-news 策略）：meta published_time / <time datetime> / 文本日期
async function deriveDate(link) {
  try {
    const html = await getText(link);
    const metaRe = /<meta[^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|og:published_time|datePublished)["'][^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|og:published_time|datePublished)["']/i;
    const m = html.match(metaRe);
    if (m) { const d = new Date(m[1] || m[2]); if (!isNaN(d) && d <= new Date() && d.getFullYear() >= 2015) return d; }
    const timeTags = html.match(/<time[^>]+datetime=["']([^"']+)["']/gi) || [];
    for (const tt of timeTags) { const dm = tt.match(/datetime=["']([^"']+)["']/i); if (dm) { const d = new Date(dm[1]); if (!isNaN(d) && d <= new Date() && d.getFullYear() >= 2015) return d; } }
    const text = html.replace(/<[^>]+>/g, ' ');
    const months = { january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const pats = [/\b([A-Z][a-z]{2,8})\s+(\d{1,2}),?\s+(\d{4})\b/, /\b(\d{1,2})\s+([A-Z][a-z]{2,8}),?\s+(\d{4})\b/, /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/];
    for (const p of pats) {
      const mm = text.match(p); if (!mm) continue;
      let d;
      if (p === pats[2]) d = new Date(+mm[1], +mm[2] - 1, +mm[3]);
      else { const isFirstMonth = months[mm[1].toLowerCase()] !== undefined; const mon = isFirstMonth ? mm[1].toLowerCase() : mm[2].toLowerCase(); const day = isFirstMonth ? +mm[2] : +mm[1]; const yr = +mm[3]; if (months[mon] === undefined) continue; d = new Date(yr, months[mon], day); }
      if (!isNaN(d) && d <= new Date() && d.getFullYear() >= 2015) return d;
    }
  } catch (e) { }
  return null;
}
// JSON 接口取数（FoodTalks 等 SPA 站：列表/详情均走后端 API，无 RSS、DOM 无文章链接）
async function getJson(url, extraHeaders = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json', ...extraHeaders }, redirect: 'follow', signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
// FoodTalks：上海辛巴旗下食品媒体平台（FBIF 内容也发表于此，author/sourceName=FBIF）。
// 列表接口分页拿最新，详情接口取标题/发布时间/摘要/正文；链接用真实文章页 https://www.foodtalks.cn/news/{id}
async function parseFoodTalks(s) {
  const H = { 'User-Agent': UA, 'Referer': s.url || 'https://www.foodtalks.cn/' };
  const apiBase = s.apiBase || 'https://api-we.foodtalks.cn';
  const cutoff = Date.now() - 45 * 864e5;
  const items = [];
  let current = 1;
  while (items.length < 25 && current <= 8) {
    let j;
    try { j = await getJson(`${apiBase}/news/news/page?current=${current}&size=20&language=ZH`, H); }
    catch (e) { console.log(`  (FoodTalks 列表页 ${current} 失败: ${e.message})`); break; }
    const page = j?.data || {};
    const list = page.list || page.records || page.data || [];
    if (!list.length) break;
    let gotRecent = false;
    for (const it of list) {
      const t = new Date((it.publishTime || '').replace(/-/g, '/')).getTime();
      if (isNaN(t) || t < cutoff) continue;
      gotRecent = true;
      let detail = {};
      if (!it.summary) { try { detail = (await getJson(`${apiBase}/news/news/${it.id}?language=ZH`, H))?.data || {}; } catch (_) { } }
      const summary = clean(detail.summary || it.summary || '').slice(0, 160);
      if (!summary) continue;
      items.push({
        title: clean(it.title),
        link: `https://www.foodtalks.cn/news/${it.id}`,
        pub: (it.publishTime || '').slice(0, 10),
        desc: summary,
      });
      if (items.length >= 25) break;
    }
    if (!gotRecent) break;
    current++;
  }
  return items;
}
// 通用 sitemap + JSON-LD 取数（凯度 Kantar 等 SPA 站：sitemap 给文章 URL，文章页服务端直出 JSON-LD 含标题/日期/摘要）
async function parseSitemapJsonLd(s) {
  const xml = await getText(s.url);
  const entries = [...xml.matchAll(/<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)]
    .map((m) => ({ u: m[1], d: m[2] || '' }));
  const cutoff = Date.now() - 45 * 864e5;
  const isArt = (u) => !/\.(png|jpg|jpeg|gif|css|js|xml|pdf)$/i.test(u);
  const artRe = s.articleRe ? new RegExp(s.articleRe) : null;
  const arts = entries.filter((e) => isArt(e.u) && (!artRe || artRe.test(e.u)));
  const recent = arts.filter((e) => e.d && new Date(e.d).getTime() >= cutoff);
  const pool = (recent.length ? recent : arts).slice(0, 40);
  const items = [];
  for (const e of pool) {
    try {
      const html = await getText(e.u);
      let title = '', desc = '', date = '';
      const ld = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i)?.[1];
      if (ld) { try { const o = JSON.parse(ld); const a = Array.isArray(o) ? o[0] : o; title = clean(a.headline); desc = clean(a.description); date = a.datePublished || ''; } catch (_) { } }
      if (!title) title = clean((html.match(/<title>([^<]+)<\/title>/i) || [])[1]);
      if (!desc) desc = clean((html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) || [])[1]);
      if (!date) { const m = html.match(/datePublished["']?\s*[:=]\s*["']([^"']+)["']/i); if (m) date = m[1]; }
      if (!title || !desc) continue;
      items.push({ title, link: e.u, pub: (date || e.d || '').slice(0, 10), desc: desc.slice(0, 160) });
    } catch (_) { }
    if (items.length >= 20) break;
  }
  return items;
}
// 流水线已先跑 news 时，draft 里已含最新 news；insights 应在此基础上追加，而非覆盖
function readFeed() {
  for (const f of ['data/feed-draft.json', 'data/feed.json']) {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf-8').replace(/^\uFEFF/, '')); } catch (e) { }
  }
  return { news: [], insights: [], readings: [], dialogs: [] };
}

(async () => {
  let newCount = 0;
  const rejected = [];
  const feed = readFeed();
  for (const grp of ['insights']) {
    for (const s of sources[grp]) {
      try {
        let txt = '';
        let items = [];
        if (s.type === 'foodtalks') {
          // SPA 站：列表/详情走后端 JSON 接口（FoodTalks）
          items = await parseFoodTalks(s);
        } else if (s.type === 'sitemap') {
          // SPA 站：sitemap 给文章 URL + 文章页 JSON-LD（凯度等）
          items = await parseSitemapJsonLd(s);
        } else {
          // 单源容错：浏览器源(Bain/WHO/NielsenIQ 等)单独包一层 try，避免个别源渲染超时崩溃拖垮整个 insights 抓取
          if (s.type === 'browser') {
            try { txt = await fetchBrowserHTML(s.url, s.wait || 7000); }
            catch (be) { console.log(`\n=== [${grp}] ${s.name} 浏览器渲染失败(已跳过该源，不影响其他): ${be.message} ===`); txt = ''; }
          } else {
            txt = await getText(s.url);
          }
          if (s.type === 'rss') items = parseRSS(txt);
          else if (s.type === 'browser' && s.articleRe) items = parseBrowser(txt, s.url, s.articleRe);
          else items = parseHTML(txt, s.url, s.sel || '');
        }
        console.log(`\n=== [${grp}] ${s.name} (${s.type}) 抓到 ${items.length} 条 ===`);
        items.slice(0, 4).forEach((it) => console.log(`  • ${it.title}\n    ${it.link}`));
        if (writeBack) {
          const arr = feed[grp] || [];
          const seen = new Set(arr.map((x) => x.link));
          const add = [];
          // 国家标准源：直接用专用解析（openstd 列表→详情），不走通用网页检查
          if (s.type === 'gbstd') {
            try {
              const gbItems = await parseGBStd(txt);
              for (const it of gbItems) {
                if (seen.has(it.link)) continue;
                add.push({ title: it.title, source: s.name, link: it.link, topic: '感官研究', cat: '', dimension: '', region: '中国', summary: it.summary, date: it.date, core: '', view: '', action: '', origin: s.name });
                seen.add(it.link);
              }
            } catch (e) { console.log(`=== [${grp}] ${s.name} gbstd 失败: ${e.message} ===`); }
            continue;
          }
          for (const it of items) {
            if (seen.has(it.link)) continue;
            // 感官研究专属源：先用标题+摘要过滤（避免对无关文章做链接解析，省请求）
            if (s.sensory && (!SENSORY_RE.test(it.title + ' ' + (it.desc || '') + ' ' + (it.summary || '')) || SENSORY_EXCLUDE.test(it.title + ' ' + (it.desc || '')))) { rejected.push(`[${grp}] ${it.title} -> 非感官研究主题`); continue; }
            // Google News RSS 的链接是跳转链接，先解析为真实文章 URL（解析不到就丢弃）
            let itLink = it.link;
            if (/news\.google\.com/.test(itLink)) {
              itLink = await resolveReal(itLink);
              if (!itLink || /news\.google\.com/.test(itLink)) { rejected.push(`[${grp}] ${it.title} -> Google News 链接解析失败`); continue; }
            }
            // 过滤地区导航页/平台概览页（不是真正的文章或报告）
            if (NAV_URL_RE.test(itLink)) { rejected.push(`[${grp}] ${it.title} -> 地区/导航页，非文章(${itLink})`); continue; }
            // 栏目/方案路径（Innova /topics/、NielsenIQ /solutions/ 是主题聚合页，非单篇文章）
            if (/\/topics\/|\/solutions\//.test(itLink)) { rejected.push(`[${grp}] ${it.title} -> 栏目/方案聚合页，非文章`); continue; }
            // 单段路径 = 栏目/导航页（如 Innova /enhanced-by-ai/、PackagingInsights /policy-and-regulation.html），文章页通常 ≥2 段
            const _up = new URL(itLink, s.url).pathname.replace(/\/+$/, '');
            if (_up.split('/').filter(Boolean).length === 1) { rejected.push(`[${grp}] ${it.title} -> 单段栏目页，非文章`); continue; }
            // Ipsos 栏目/主题聚合页防护（修不删·防复发）：Ipsos RSS 把 /en-us/future/<topic> 这类栏目页当文章吐出，
            // 真实文章为 /en-us/<slug>（locale 之后仅 1 段）；locale 之后 ≥2 段或命中 hub 即视为栏目页，非文章
            if (s.name === 'Ipsos') {
              const _seg = _up.split('/').filter(Boolean);
              const _after = _seg.length > 1 ? _seg.slice(1) : _seg;
              if (_after.length >= 2 || SECTION_HUB_RE.test(itLink)) { rejected.push(`[${grp}] ${it.title} -> Ipsos 栏目/聚合页，非文章`); continue; }
            }
            // 内容兜底：涉及烟草/电子烟的内容不归入专业提升（应属行业资讯），直接丢弃由 news 源补充
            if (isTobacco(it)) { rejected.push(`[${grp}] ${it.title} -> 含烟草/电子烟内容，不归入专业提升（应属行业资讯）`); continue; }
            const lq = linkQuality(itLink);
            if (!lq.ok) { rejected.push(`[${grp}] ${it.title} -> ${lq.reason}`); continue; }
            const summary = await deriveSummary(itLink, it.desc);
            if (!summary) { rejected.push(`[${grp}] ${it.title} -> 摘要为空，已拦截`); continue; }
            let pubDate = null;
            if (it.pub) { const pd = new Date(it.pub); if (!isNaN(pd) && pd <= new Date()) pubDate = pd; }
            if (!pubDate) { try { pubDate = await deriveDate(itLink); } catch (e) { } }
            if (!pubDate) { rejected.push(`[${grp}] ${it.title} -> 无真实发布日期，已跳过`); continue; }
            // A 标准闸门（静态·零 token）：新内容时间真实且不过期、非标题党才入池
            const gres = gateNewItem({ title: it.title, summary, date: pubDate.toISOString().slice(0, 10) }, grp, {});
            if (!gres.ok) { rejected.push(`[${grp}] ${it.title} -> ${gres.reason}`); continue; }
            // 抓正文（零 token）：用于厚度门槛与前端展示
            const body = await deriveBody(itLink);
            // 全部留存：不再按时间丢弃（用户 2026-09-08 要求）
            add.push({
              title: sanitizeTitle(it.title), source: s.name, link: itLink,
              topic: s.cat || s.dimension || (SENSORY_RE.test(it.title + ' ' + it.summary) && !SENSORY_EXCLUDE.test(it.title + ' ' + (it.summary || '')) ? '感官研究' : autoTopic(it.title + ' ' + it.summary)), cat: s.cat || '', dimension: s.dimension || '', region: s.region || '',
              summary, body, date: pubDate.toISOString().slice(0, 10),
              core: '', view: '', action: '', origin: s.name,
            });
            seen.add(itLink);
          }
          // 全部留存：去掉「每源每天 3 条」与「120 条上限」（用户 2026-09-08 要求）
          feed[grp] = add.concat(arr);
          newCount += add.length;
          if (add.length) console.log(`  >> 新增 ${add.length} 条`);
        }
      } catch (e) { console.log(`\n=== [${grp}] ${s.name} 失败: ${e.message} ===`); }
    }
  }
  if (writeBack) {
    // 草稿阶段：core/view/action 待 DeepSeek 填充，放行；严格发布阶段会再卡
    const report = validate(feed, { skipImpactEmpty: true });
    if (!report.ok) {
      console.log('\n❌ 质量闸门未通过，已拒绝写入草稿。致命问题：');
      report.critical.slice(0, 30).forEach((c) => console.log('  ✗ ' + c));
      fs.writeFileSync(path.join(ROOT, 'data/feed-quarantine.json'), JSON.stringify({ rejected, critical: report.critical }, null, 2));
      process.exit(1);
    }
    fs.writeFileSync(path.join(ROOT, 'data/feed-draft.json'), JSON.stringify(feed, null, 2));
    if (newCount > 0) console.log(`\n✅ 已写入暂存草稿 feed-draft.json（新增 ${newCount} 条 insights，core/view/action 待 DeepSeek 填充）`);
    else console.log('\n✅ 暂存草稿已更新（本次无新增 insights）');
  } else {
    console.log('\n（仅预览，加 --write 才会合并并过闸门）');
  }
  if (rejected.length) console.log(`\n⚠️ 本次抓取拦截 ${rejected.length} 条不合格内容`);
})();
