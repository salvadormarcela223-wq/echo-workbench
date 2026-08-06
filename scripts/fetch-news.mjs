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

const GENERIC = /^(首页|更多|登录|注册|联系我们|关于我们|订阅|隐私|条款|Home|More|Menu|Search|Contact|Privacy|Terms|CTP Newsroom|Press Office|Categories|Topics|RSS)$/i;

async function getText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.text();
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
            // 质量闸门：链接必须是真实深链
            const lq = (await import('./validate-feed.mjs')).linkQuality(it.link);
            if (!lq.ok) { rejected.push(`[${grp}] ${it.title} -> ${lq.reason}`); continue; }
            const summary = await deriveSummary(it.link, it.desc);
            if (!summary) { rejected.push(`[${grp}] ${it.title} -> 摘要为空，已拦截`); continue; }
            // 真实发布日期：拿不到就不伪造，直接跳过（绝不把旧文标成今天）
            let pubDate = null;
            if (it.pub) { const pd = new Date(it.pub); if (!isNaN(pd) && pd <= new Date()) pubDate = pd; }
            if (!pubDate) { rejected.push(`[${grp}] ${it.title} -> 无真实发布日期，已跳过(不伪造日期)`); continue; }
            // 陈旧过滤：超过 45 天的一律不要
            const ageDays = Math.round((Date.now() - pubDate) / 86400000);
            if (ageDays > 45) { rejected.push(`[${grp}] ${it.title} -> 已陈旧(${ageDays}天)，已跳过`); continue; }
            add.push({
              title: it.title,
              link: it.link,
              source: s.name,
              cat: s.cat || '',
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
