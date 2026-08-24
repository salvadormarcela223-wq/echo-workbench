// 专业提升「每日自动抓取」：从 sources.json 的 insights 组抓最新深度分析文章
// -> 生成 insights 条目(core/view/action 暂空) -> 由 ai-enrich(DeepSeek) 填三栏 -> 严格质检后发布。
// 保留现有精选不删，每天追加 1-3 篇新分析，保证「专业提升每天有更新」。
import fs from 'fs';
import path from 'path';
import { validate, linkQuality } from './validate-feed.mjs';

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
const GENERIC = /^(首页|更多|登录|注册|联系我们|关于我们|订阅|隐私|条款|Home|More|Menu|Search|Contact|Privacy|Terms|CTP Newsroom|Press Office|Press Announcements|Press Releases|Industry news|Subscribe|Newsletter|Read More|News and Events|Sign Up for Email Updates|Categories|Topics|RSS|媒体中心|聚焦中国|全球视野|贝恩专著|Global|Europe|Asia|Americas|North America|Latin America|APAC|EMEA)$/i;
// 地区导航页/平台概览页 URL 模式（不是真正的文章或报告）
const NAV_URL_RE = /\/(?:region|country|platform|about|overview|solutions|services)\/$/i;

// 内容兜底路由：涉及「电子烟 / 烟草 / 尼古丁替代」的只归行业资讯(news)，若误入专业提升则丢弃，由 news 源补充。
const TOBACCO_RE = /电子烟|电子雾|烟草|尼古丁|烟油|烟弹|雾化|雾化物|悦刻|RELX|思摩尔|SMOORE|雾芯|PMTA|加热不燃烧|HNB|无烟烟草|口含烟|snus|嚼烟|vape|vaping|e-cig|e-cigarette|tobacco|cigarette|hookah|水烟/i;
function isTobacco(it) {
  const s = [it.title, it.summary, it.desc, it.source, it.origin].filter(Boolean).join(' ');
  return TOBACCO_RE.test(s);
}

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

async function getText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.text();
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
  return uniq.slice(0, 15);
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
        const txt = await getText(s.url);
        const items = s.type === 'rss' ? parseRSS(txt) : parseHTML(txt, s.url, s.sel || '');
        console.log(`\n=== [${grp}] ${s.name} (${s.type}) 抓到 ${items.length} 条 ===`);
        items.slice(0, 4).forEach((it) => console.log(`  • ${it.title}\n    ${it.link}`));
        if (writeBack) {
          const arr = feed[grp] || [];
          const seen = new Set(arr.map((x) => x.link));
          const add = [];
          for (const it of items) {
            if (seen.has(it.link)) continue;
            // 过滤地区导航页/平台概览页（不是真正的文章或报告）
            if (NAV_URL_RE.test(it.link)) { rejected.push(`[${grp}] ${it.title} -> 地区/导航页，非文章(${it.link})`); continue; }
            // 内容兜底：涉及烟草/电子烟的内容不归入专业提升（应属行业资讯），直接丢弃由 news 源补充
            if (isTobacco(it)) { rejected.push(`[${grp}] ${it.title} -> 含烟草/电子烟内容，不归入专业提升（应属行业资讯）`); continue; }
            const lq = linkQuality(it.link);
            if (!lq.ok) { rejected.push(`[${grp}] ${it.title} -> ${lq.reason}`); continue; }
            const summary = await deriveSummary(it.link, it.desc);
            if (!summary) { rejected.push(`[${grp}] ${it.title} -> 摘要为空，已拦截`); continue; }
            let pubDate = null;
            if (it.pub) { const pd = new Date(it.pub); if (!isNaN(pd) && pd <= new Date()) pubDate = pd; }
            if (!pubDate) { try { pubDate = await deriveDate(it.link); } catch (e) { } }
            if (!pubDate) { rejected.push(`[${grp}] ${it.title} -> 无真实发布日期，已跳过`); continue; }
            const ageDays = Math.round((Date.now() - pubDate) / 86400000);
            if (ageDays > 45) { rejected.push(`[${grp}] ${it.title} -> 已陈旧(${ageDays}天)，已跳过`); continue; }
            add.push({
              title: it.title, source: s.name, link: it.link,
              topic: s.cat || s.dimension || autoTopic(it.title + ' ' + it.summary), cat: s.cat || '', dimension: s.dimension || '', region: s.region || '',
              summary, date: pubDate.toISOString().slice(0, 10),
              core: '', view: '', action: '', origin: s.name,
            });
            seen.add(it.link);
          }
          const capped = add.slice(0, 3); // 深度分析，每天最多 3 篇
          feed[grp] = capped.concat(arr).slice(0, 60);
          newCount += capped.length;
          if (capped.length) console.log(`  >> 新增 ${capped.length} 条`);
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
