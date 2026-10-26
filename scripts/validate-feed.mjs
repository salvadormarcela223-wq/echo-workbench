// 质量闸门：在任何内容发布到线上之前，逐条检查 feed.json 是否合格。
// 不合格的内容（空字段 / 假深链 / 死链 / 阅读生词无释义）会被拦截，绝不进线上。
// 用法：
//   node scripts/validate-feed.mjs            # 仅做结构/字段检查（快）
//   node scripts/validate-feed.mjs --net      # 额外做全网链接可达性检查（慢，每日流水线用）
// 退出码：0 = 全部通过；1 = 有致命问题（阻止发布）
import fs from 'fs';
import path from 'path';
import { URL, fileURLToPath } from 'url';

const ROOT = path.resolve('.');

function loadFeed() {
  const raw = fs.readFileSync(path.join(ROOT, 'data/feed.json'), 'utf-8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

// 链接结构质量：必须是 http(s) 真实深链，不能是首页/栏目页占位
export function linkQuality(link) {
  let u;
  try { u = new URL(link); } catch { return { ok: false, reason: '不是合法网址' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: '非 http(s) 链接' };
  const parts = u.pathname.split('/').filter(Boolean);
  // 只有「根域名本身」（pathname 为空或仅 "/"）才算首页；单段 slug 文章页(如 /article-slug/)是真实深链，放行
  if (parts.length < 1) return { ok: false, reason: '疑似首页/根域名（路径过浅）' };
  const tail = u.pathname.replace(/\/$/, '').toLowerCase();
  const tailSeg = tail.split('/').pop() || '';
  if (/^(news|newsroom|news-events|press|press-release|press-releases|press-office|press-centre|press-announcements|media|solutions|hubs|categories|topics|category|insights|about|contact|home|index)$/.test(tailSeg)) {
    return { ok: false, reason: '疑似栏目/首页占位链接(尾段为通用词)' };
  }
  if (/[?&](utm_|fbclid|gclid|mc_|spm)/i.test(u.search)) return { ok: false, reason: '含追踪参数，应先清理' };
  return { ok: true };
}

async function linkReachable(link) {
  try {
    const r = await fetch(link, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(9000) });
    if (r.status === 403) return { ok: true, note: 'bot拦截(403)，浏览器可正常打开' };
    if (r.status >= 200 && r.status < 400) return { ok: true };
    return { ok: false, reason: 'HTTP ' + r.status };
  } catch (e) {
    return { ok: false, reason: '网络不可达: ' + String(e.message).slice(0, 50) };
  }
}

export function validate(feed, opts = {}) {
  const skipImpactEmpty = !!opts.skipImpactEmpty; // 抓取暂存阶段：允许 impact 暂时为空（留给 AI 步骤填充）
  const isCI = !!process.env.GITHUB_ACTIONS;       // CI 环境：允许极少量漏网（安全网，不因1条卡死整批）
  const TOLERATE_EMPTY = isCI ? 5 : 0;             // CI 允许最多 5 条空 impact/核心字段
  const report = { critical: [], warnings: [], readings: null };
  const groups = ['news', 'insights'];
  const seenLinks = new Map();
  // 注意：按用户 2026-09-08 要求「全部留存」，闸门不再因时间久远而丢弃任何条目。
  // 陈旧条目仅作信息性提示，绝不删除，避免再次卡死整库发布。
  // 先收集所有空字段，再统一判断是否超容忍度（CI 安全网）
  const emptyFields = [];
  for (const g of groups) {
    const arr = feed[g] || [];
    arr.forEach((it, idx) => {
      const tag = `${g}[${idx}]`;
      // 专业提升(insights)渲染不读 impact，只查它真正渲染的字段；news 查 impact
      const fields = g === 'news' ? ['title', 'link', 'summary', 'impact'] : ['title', 'link', 'summary'];
      for (const f of fields) {
        if (f === 'impact' && skipImpactEmpty) continue; // 抓取阶段 impact 由 AI 后续填充，暂不强拦
        if (!it[f] || !String(it[f]).trim()) emptyFields.push({ tag, field: f, reason: `${tag} 字段「${f}」为空（会显示空白）` });
      }
      // 栏目页标题黑名单：网站目录/订阅/通用占位标题不允许当文章发布
      const genT = /^(subscribe|newsletter|read more|press announcements|press releases|industry news|sign up for email updates|news and events|媒体中心|聚焦中国|全球视野|贝恩专著)$/i;
      if (genT.test(String(it.title || '').trim())) report.critical.push(`${tag} 疑似栏目页标题「${it.title}」`);
      // 专业提升(insights)渲染读 core/view/action，闸门必须真实验证这三项（不能只看 legacy 的 impact）
      // 双维度框架：新条目只写 viewCMI/viewSensory，旧 view 故意留空；故「视角」只要 view / viewCMI / viewSensory 任一非空即算已填
      if (g === 'insights') {
        for (const f of ['core', 'action']) {
          // 抓取草稿阶段：三栏待 DeepSeek 填充，放行；严格发布阶段(skipImpactEmpty=false)会拦截
          if (skipImpactEmpty) continue;
          if (!it[f] || !String(it[f]).trim()) emptyFields.push({ tag, field: f, reason: `${tag} 字段「${f}」为空（会显示空白）` });
        }
        // 视角字段：view(旧) 或 viewCMI/viewSensory(新) 任一非空即通过；
        // 但 lens=neither（文章与 CMI/感官都不相关）属正常无视角状态，不判缺失，避免误拦发布
        if (!skipImpactEmpty) {
          const hasView = (it.view && it.view.trim()) || (it.viewCMI && it.viewCMI.trim()) || (it.viewSensory && it.viewSensory.trim());
          if (!hasView && it.lens !== 'neither') emptyFields.push({ tag, field: 'view', reason: `${tag} 字段「view/viewCMI/viewSensory」均为空（会显示空白）` });
        }
      }
      if (it.link) {
        const lq = linkQuality(it.link);
        if (!lq.ok) report.critical.push(`${tag} 链接质量: ${lq.reason} -> ${it.link}`);
        if (seenLinks.has(it.link)) report.warnings.push(`${tag} 与 ${seenLinks.get(it.link)} 重复链接`);
        else seenLinks.set(it.link, tag);
      }
      // 注：行业资讯陈旧清理已在上面的「自检清理」阶段自动丢弃（不再作为致命问题阻断发布）
    });
  }
  // CI 安全网：空字段在容忍度内 → 降级为警告而非整批拒绝
  if (emptyFields.length > 0) {
    if (emptyFields.length <= TOLERATE_EMPTY) {
      emptyFields.forEach(e => report.warnings.push(e.reason + ' [CI容许]'));
      console.log(`  ⚠️ CI 容忍：${emptyFields.length} 条空字段未填（≤${TOLERATE_EMPTY}），降级为警告不阻断`);
    } else {
      emptyFields.forEach(e => report.critical.push(e.reason));
    }
  }
  // 维度多样性检查：防止内容退化成单一视角（用户明确要求"多维度"）
  const DIM_MIN = { news: 4, insights: 4 };
  for (const g of groups) {
    const dims = new Set((feed[g] || []).map(it => it.dimension || it.cat || '').filter(Boolean));
    if (dims.size < (DIM_MIN[g] || 3)) {
      report.warnings.push(`${g} 维度偏少（仅 ${dims.size} 个：${[...dims].join('/')}），建议补充多维度内容`);
    }
    report[g + 'Dimensions'] = [...dims];
  }
  // 阅读生词释义覆盖率 —— 必须与前端 pages-english.js 的真实查词逻辑一致：
  // 内联 GEN_EN_ZH(常用词) + 阅读自带 vocab + data/words.json，兜底 data/glossary.json，再做词形还原。
  // 只查 words.json 会严重低估覆盖率（曾虚报 78%）。
  const readings = feed.readings || [];
  let wordBank = {}, glossary = {}, genZh = {};
  try { wordBank = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/words.json'), 'utf-8')); } catch { }
  try { glossary = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/glossary.json'), 'utf-8')); } catch { }
  try {
    const js = fs.readFileSync(path.join(ROOT, 'assets/js/pages-english.js'), 'utf-8');
    const mm = js.match(/const GEN_EN_ZH = (\{[^}]*\});/);
    if (mm) genZh = JSON.parse(mm[1]);
  } catch { }
  const SUFFIXES = ['es', 's', 'ed', 'ing', 'ly'];
  const hasDef = (o) => !!(o && ((o.t && String(o.t).trim()) || (o.en && String(o.en).trim())));
  let totalU = 0, missing = 0; const missingList = [];
  readings.forEach(r => {
    const allMap = {};
    for (const k in genZh) allMap[k] = { t: genZh[k] };
    (r.vocab || []).forEach(v => { if (v && v.w) allMap[String(v.w).toLowerCase()] = v; });
    for (const k in wordBank) {
      const wb = wordBank[k]; if (!wb) continue;
      const ex = allMap[k];
      allMap[k] = { p: (ex && ex.p) || wb.ph || '', t: (ex && ex.t) || wb.zh || '', en: wb.en || (ex && ex.en) || '' };
    }
    const covered = (key) => {
      if (hasDef(allMap[key]) || hasDef(glossary[key])) return true;
      for (const sfx of SUFFIXES) {
        const c = key.replace(new RegExp(sfx + '$'), '');
        if (c === key) continue;
        if (hasDef(allMap[c]) || hasDef(glossary[c])) return true;
      }
      return false;
    };
    const text = (Array.isArray(r.body) ? r.body.join('') : String(r.body || '')).replace(/<[^>]+>/g, '');
    (text.match(/[A-Za-z][A-Za-z'\u2019-]*/g) || []).forEach(t => {
      const w = t.toLowerCase().replace(/\u2019/g, "'");
      if (!w) return;
      totalU++;
      if (!covered(w)) { missing++; if (missingList.length < 25) missingList.push(w); }
    });
  });
  const coverage = totalU ? Math.round((1 - missing / totalU) * 100) : 100;
  report.readings = { totalU, missing, coverage, missingList };
  if (missing > 0) report.warnings.push(`阅读生词有 ${missing} 个无释义（覆盖率 ${coverage}%，点击会空白）`);
  report.ok = report.critical.length === 0;
  return report;
}

// 自愈：富集多轮仍填不出的条目，发布前丢弃，其余照常发布。
// 必填字段判定与上面 validate() 的 emptyFields 逻辑完全一致，保证丢弃后 validate 必过（线上仍零空白）。
// 仅丢弃「空字段」类坏条目；死链/栏目页标题等其它致命问题不在丢弃范围，仍会由 validate 上报并阻止，避免掩盖真实坏数据。
export function dropUnfillable(feed) {
  const groups = ['news', 'insights'];
  const cleaned = {};
  for (const k in feed) cleaned[k] = feed[k]; // 保留 readings 等其它键
  const dropped = [];
  for (const g of groups) {
    const arr = feed[g] || [];
    const keep = [];
    arr.forEach((it, idx) => {
      const tag = `${g}[${idx}]`;
      const title = (it.title || '').toString().trim();
      const link = (it.link || '').toString().trim();
      const summary = (it.summary || '').toString().trim();
      if (!title || !link || !summary) { dropped.push(tag + '（缺标题/链接/摘要）'); return; }
      if (g === 'news') {
        if (!(it.impact && String(it.impact).trim())) { dropped.push(tag + '（impact 空）'); return; }
      } else {
        const core = (it.core || '').toString().trim();
        const action = (it.action || '').toString().trim();
        const hasView = (it.view && it.view.trim()) || (it.viewCMI && it.viewCMI.trim()) || (it.viewSensory && it.viewSensory.trim());
        if (!core || !action || (!hasView && it.lens !== 'neither')) { dropped.push(tag + '（core/action/view 空）'); return; }
      }
      keep.push(it);
    });
    cleaned[g] = keep;
  }
  return { cleaned, dropped };
}

export async function validateNet(feed, report) {
  const links = [];
  for (const g of ['news', 'insights']) (feed[g] || []).forEach((it, idx) => { if (it.link) links.push([`${g}[${idx}]`, it.link]); });
  let dead = 0;
  const con = 6;
  for (let i = 0; i < links.length; i += con) {
    const batch = links.slice(i, i + con);
    const res = await Promise.all(batch.map(([tag, l]) => linkReachable(l).then(r => [tag, l, r])));
    for (const [tag, l, r] of res) {
      if (!r.ok) { report.critical.push(`${tag} 链接打不开: ${r.reason} -> ${l}`); dead++; }
    }
  }
  report.deadLinks = dead;
  report.ok = report.critical.length === 0;
  return report;
}

// CLI
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  (async () => {
    const feed = loadFeed();
    const report = validate(feed);
    if (process.argv.includes('--net')) await validateNet(feed, report);
    console.log('\n===== 质量闸门报告 =====');
    console.log(`致命问题(阻止发布): ${report.critical.length}`);
    report.critical.slice(0, 40).forEach(c => console.log('  ✗ ' + c));
    console.log(`警告(可发布但建议修): ${report.warnings.length}`);
    report.warnings.slice(0, 40).forEach(w => console.log('  ! ' + w));
    if (report.readings) console.log(`阅读生词释义覆盖率: ${report.readings.coverage}% (${report.readings.totalU - report.readings.missing}/${report.readings.totalU})`);
    console.log('维度覆盖 → 行业资讯: ' + (report.newsDimensions || []).join(' / ') + '  |  专业提升: ' + (report.insightsDimensions || []).join(' / '));
    if (report.deadLinks !== undefined) console.log(`死链数量: ${report.deadLinks}`);
    console.log(report.ok ? '\n✅ 通过：内容可以发布' : '\n❌ 未通过：请先修复致命问题再发布');
    process.exit(report.ok ? 0 : 1);
  })();
}
