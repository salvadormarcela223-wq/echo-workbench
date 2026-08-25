// 每日自动抓取：从可信源抓真实近期行业资讯 → 过滤假深链/空字段/陈旧内容 → 写入暂存草稿 feed-draft.json。
// 关键：写入草稿前先过「质量闸门」(validate-feed.mjs, 暂放行空 impact)。impact 由 AI 解读步骤(enrich)填充、
// 再过严格闸门后，才由 daily-pipeline.mjs 发布到线上 feed.json。任何空字段/假链接/死链都不会进线上。
import fs from 'fs';
import path from 'path';
import { validate } from './validate-feed.mjs';

const ROOT = path.resolve('.');
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/sources.json'), 'utf-8'));
const writeBack = process.argv.includes('--write');
let feed = null;
try { feed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/feed.json'), 'utf-8').replace(/^\uFEFF/, '')); } catch (e) {}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 剥离追踪参数（utm_/fbclid/gclid/mc_/spm），保留真实查询参数（如 ?id=）
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

const GENERIC = /^(首页|更多|登录|注册|联系我们|关于我们|订阅|隐私|条款|Home|More|Menu|Search|Contact|Privacy|Terms|CTP Newsroom|Press Office|Press Announcements|Press Releases|Industry news|Subscribe|Newsletter|Read More|News and Events|Sign Up for Email Updates|Categories|Topics|RSS|媒体中心|聚焦中国|全球视野|贝恩专著)$/i;

// 内容兜底路由：判断一条内容是否涉及「电子烟 / 烟草 / 尼古丁替代」——这类只归行业资讯(news)，
// 其余（FMCG、餐饮、包装、市场研究、消费电子、官方平台、CMI/感官）归专业提升(insights)。
const TOBACCO_RE = /电子烟|电子雾|烟草|尼古丁|烟油|烟弹|雾化|雾化物|悦刻|RELX|思摩尔|SMOORE|雾芯|PMTA|加热不燃烧|HNB|无烟烟草|口含烟|snus|嚼烟|vape|vaping|e-cig|e-cigarette|tobacco|cigarette|hookah|水烟/i;
// 强非烟草主题（烟草媒体偶尔也发跨界新闻，如新能源/出海/汽车）。内容命中这些且无任何烟草词时，视为非烟草，不归入行业资讯。
const NONTOB_STRONG = /新能源|电动车|电动汽车|纯电动|混动|续航|动力电池|锂电池|出海|巴西|滴滴|汽车|车企|整车|乘用车|vehicle|electric vehicle|\bEV\b|automaker|tesla|比亚迪|蔚来|小鹏|理想|新能源汽车|智能驾驶|自动驾驶|光伏|储能/i;
function isTobacco(it) {
  const content = [it.title, it.summary, it.desc].filter(Boolean).join(' ');
  const meta = [it.source, it.origin].filter(Boolean).join(' ');
  // 内容明显是非烟草主题且无任何烟草词 -> 非烟草（拦截烟草媒体发的跨界新闻，如「滴滴出海·新能源」）
  if (NONTOB_STRONG.test(content) && !TOBACCO_RE.test(content)) return false;
  return TOBACCO_RE.test(content) || TOBACCO_RE.test(meta);
}

// 自动分类：当源配置未指定 cat 时，根据标题关键词+来源推断分类
function autoCat(it, srcName) {
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

async function getText(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

// 从文章页抽取第一段作为要点摘要（保证不为空）
async function deriveSummary(link, fallback) {
  if (fallback && fallback.length >= 40) return clean(fallback).slice(0, 160);
  try {
    const html = await getText(link);
    const ps = html.match(/<p[\s\S]*?<\/p>/gi) || [];
    for (const p of ps) {
      const t = clean(p);
      if (t.length >= 40) return t.slice(0, 160);
    }
  } catch (e) { }
  return fallback ? clean(fallback).slice(0, 160) : '';
}

// 回源文章页抓取真实发布日期：优先 <meta article:published_time/og:published_time/datePublished>，
// 其次 <time datetime>，最后退回正文文本里的日期模式（January 5, 2026 / 5 January 2026 / 2026-01-05）。
// 尽力而为，拿不到返回 null（由上层决定跳过，绝不伪造）。
async function deriveDate(link) {
  try {
    const html = await getText(link);
    const metaRe = /<meta[^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|og:published_time|datePublished)["'][^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|og:published_time|datePublished)["']/i;
    const m = html.match(metaRe);
    if (m) { const d = new Date(m[1] || m[2]); if (!isNaN(d) && d <= new Date() && d.getFullYear() >= 2015) return d; }
    const timeTags = html.match(/<time[^>]+datetime=["']([^"']+)["']/gi) || [];
    for (const tt of timeTags) {
      const dm = tt.match(/datetime=["']([^"']+)["']/i);
      if (dm) { const d = new Date(dm[1]); if (!isNaN(d) && d <= new Date() && d.getFullYear() >= 2015) return d; }
    }
    const text = html.replace(/<[^>]+>/g, ' ');
    // 中文日期格式（如「2026年8月24日」）：取正文中最大的日期（最新发布日通常 >= 正文提到的其他日期）
    const cnDates = [...text.matchAll(/\b(\d{4})年(\d{1,2})月(\d{1,2})日\b/g)]
      .map((m) => new Date(+m[1], +m[2] - 1, +m[3]))
      .filter((d) => !isNaN(d) && d <= new Date() && d.getFullYear() >= 2015);
    if (cnDates.length) { cnDates.sort((a, b) => b - a); return cnDates[0]; }
    const months = { january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const pats = [
      /\b([A-Z][a-z]{2,8})\s+(\d{1,2}),?\s+(\d{4})\b/,
      /\b(\d{1,2})\s+([A-Z][a-z]{2,8}),?\s+(\d{4})\b/,
      /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
    ];
    for (const p of pats) {
      const mm = text.match(p);
      if (!mm) continue;
      let d;
      if (p === pats[2]) d = new Date(+mm[1], +mm[2] - 1, +mm[3]);
      else {
        const isFirstMonth = months[mm[1].toLowerCase()] !== undefined;
        const mon = isFirstMonth ? mm[1].toLowerCase() : mm[2].toLowerCase();
        const day = isFirstMonth ? +mm[2] : +mm[1];
        const yr = +mm[3];
        if (months[mon] === undefined) continue;
        d = new Date(yr, months[mon], day);
      }
      if (!isNaN(d) && d <= new Date() && d.getFullYear() >= 2015) return d;
    }
  } catch (e) { }
  return null;
}

function parseRSS(xml) {
  const out = [];
  const items = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
  for (const it of items) {
    const title = clean((it.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    let link = (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] ||
      clean((it.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]);
    link = stripTracking(link);
    const pub = clean((it.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
      it.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) || [])[1]);
    const desc = clean((it.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
      it.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1]);
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
  return uniq.slice(0, 15);
}

(async () => {
  let newCount = 0;
  const rejected = [];
  // 每日自动抓取只针对「行业资讯」：真实近期新闻 + AI 写顾问视角。
  // 专业提升(insights)是精选常青分析（已有完整 core/view/action），不放进每日抓取的半成品池。
  for (const grp of ['news']) {
    for (const s of sources[grp]) {
      try {
        const txt = await getText(s.url);
        const items = s.type === 'rss' ? parseRSS(txt) : parseHTML(txt, s.url, s.sel || '');
        console.log(`\n=== [${grp}] ${s.name} (${s.type}) 抓到 ${items.length} 条 ===`);
        items.slice(0, 4).forEach((it) => console.log(`  • ${it.title}\n    ${it.link}`));
        if (writeBack && feed) {
          const arr = feed[grp] || [];
          const seen = new Set(arr.map((x) => x.link));
          const add = [];
          for (const it of items) {
            if (seen.has(it.link)) continue;
            // 内容兜底：非烟草/电子烟内容不归入行业资讯（应属专业提升），直接丢弃由 insights 源补充
            if (!isTobacco(it)) { rejected.push(`[${grp}] ${it.title} -> 非烟草/电子烟内容，不归入行业资讯（应属专业提升）`); continue; }
            // 质量闸门：链接必须是真实深链
            const lq = (await import('./validate-feed.mjs')).linkQuality(it.link);
            if (!lq.ok) { rejected.push(`[${grp}] ${it.title} -> ${lq.reason}`); continue; }
            // Tobacco Insider 的栏目/品牌页（无日期段的单段 slug，如 /esse/、/china-tobacco-international-news/）不是文章
            if (/tobaccoinsider\.com/.test(it.link) && !/\/20\d\d\//.test(it.link)) { rejected.push(`[${grp}] ${it.title} -> Tobacco Insider 栏目页非文章`); continue; }
            const summary = await deriveSummary(it.link, it.desc);
            if (!summary) { rejected.push(`[${grp}] ${it.title} -> 摘要为空，已拦截`); continue; }
            // 真实发布日期：RSS/HTML 没给就回源文章页抓，再不行才放弃（绝不伪造日期）
            let pubDate = null;
            if (it.pub) { const pd = new Date(it.pub); if (!isNaN(pd) && pd <= new Date()) pubDate = pd; }
            if (!pubDate) { try { pubDate = await deriveDate(it.link); } catch (e) {} }
            if (!pubDate) { rejected.push(`[${grp}] ${it.title} -> 无真实发布日期(已回源文章页仍找不到)，已跳过`); continue; }
            // 陈旧过滤：超过 45 天的一律不要
            const ageDays = Math.round((Date.now() - pubDate) / 86400000);
            if (ageDays > 45) { rejected.push(`[${grp}] ${it.title} -> 已陈旧(${ageDays}天)，已跳过`); continue; }
            add.push({
              title: it.title,
              link: it.link,
              source: s.name,
              cat: s.cat || autoCat(it, s.name),
              dimension: s.dimension || '',
              region: s.region || '',
              summary,
              date: pubDate.toISOString().slice(0, 10),
              impact: '',   // 留空，由 AI 解读步骤(enrich)填充后再过闸门
              action: '',
              origin: s.name,
            });
            seen.add(it.link);
          }
          feed[grp] = add.concat(arr).slice(0, 60);
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
})();
