// 四级内容阀门（框架 v4 定本 2026-11-10，用户逐条拍板后 100% 落地）
//
// 定本要点：
//   · 版块原样，阀门只做「内容级」把关，不删源；
//   · 值得读 = 信息完整 + 关注领域的最新资讯/趋势（六领域：感官科学/品牌营销/消费者洞察/政策法规/市场数据/企业战略）；
//   · 食安/菌/化学为内容级排除（词表 + 语义双保险），与源无关；
//   · 阀门前置到进门：判定发生在条目进平台之前，与全文解读无关；
//   · AI 解读对情报条目停发（token 大头砍掉）；只有「文献深读」子区（literature.mjs）保留 AI 精读，
//     另有 deepread.mjs 手动精读开关；
//   · 低消耗：L0-L2 全零 token；L3 每天最多一次批量调用（中文短标题 + 中译摘要同批顺带产出）。
//
// 四层（越便宜越先判，能定就不往上层走）：
//   L0 时效与可用性（0 token）：真实日期、7 天窗口、未来日期异常、同批标题去重
//   L1 信息完整   （0 token 三态：完整/残缺/疑似）：长度下限、截断特征、权限墙特征
//   L2 领域闸     （0 token 三态：命中/不命中/疑似）：六领域词表；食安负向词表命中直接拦
//   L3 语义闸     （AI，1 次批量）：信息是否充分 + 是否值得读 + 领域标签 + 中文短标题 + 中译摘要
//
// 判定结果写回条目：
//   valve:'pass'    → 进平台（题录）。规则直过的没有中文短标题/中译摘要（0 token 设计如此），前端回退原标题/原摘要
//   不值得/残缺/过期/重复/食安/L3未判定 → 从草稿移除 + 写入 data/valve-discards.jsonl（层标记 L3-pending，可复查）
//   L3 失败条目「本轮不入选 + 显式告警」，绝不静默放行；若次日源列表仍给出该条会重新进阀重判
//
// 用法：
//   node scripts/valve.mjs          # 完整跑（L3 会调 DeepSeek，全天仅 1 次批量）
//   node scripts/valve.mjs --dry    # 只跑 L0-L2（0 token），疑似留 pending，编排验证专用
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// 草稿路径可用环境变量 VALVE_DRAFT_FILE 覆盖（仅测试用；默认真实草稿）
const DRAFT = process.env.VALVE_DRAFT_FILE || path.join(ROOT, 'data/feed-draft.json');
const DISCARD_LOG = path.join(ROOT, 'data/valve-discards.jsonl');
const KEY_FILE = process.env.DEEPSEEK_KEY_FILE || 'C:/Users/VOOPOO/Desktop/DeepSeek API.txt';
const DRY = process.argv.includes('--dry');

const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'valve-config.json'), 'utf-8'));
const RE = {
  truncation: new RegExp(CFG.truncationRe, 'i'),
  paywall: new RegExp(CFG.paywallRe, 'i'),
  exclusion: new RegExp(CFG.exclusionRe, 'i'),
};
const DOMAIN_RES = Object.fromEntries(
  Object.entries(CFG.domainLexicon).map(([d, words]) => [d, new RegExp('(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'i')])
);

const clean = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const bodyLen = (it) => clean(it.body).replace(/\s+/g, '').length;
const normTitle = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9一-龥]+/g, '');

function loadKey() {
  if (process.env.DEEPSEEK_API_KEY && /^sk-/.test(process.env.DEEPSEEK_API_KEY.trim())) return process.env.DEEPSEEK_API_KEY.trim();
  const raw = fs.readFileSync(KEY_FILE, 'utf-8');
  const m = raw.match(/sk-[A-Za-z0-9]{20,}/);
  if (!m) throw new Error('未能提取 DeepSeek key');
  return m[0];
}

let KEY = null;
async function askDeepSeek(userPrompt, sys) {
  if (!KEY) KEY = loadKey();
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: sys }, { role: 'user', content: userPrompt }],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw new Error('DeepSeek HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  const c = j?.choices?.[0]?.message?.content;
  if (!c) throw new Error('返回结构异常');
  return c;
}

const discardLog = [];
function discard(it, group, layer, reason) {
  discardLog.push({ ts: new Date().toISOString(), group, layer, reason, title: clean(it.title).slice(0, 80), link: it.link || '' });
}

// —— 候选识别：只处理「新条目」——
// 新 = 没跑过阀门(valve 未标记)、非文献(lit 不归本阀门)、非手工添加(custom)、解读字段仍空(存量已填的不碰)
function candidates(feed) {
  const out = [];
  for (const g of ['news', 'insights']) {
    (feed[g] || []).forEach((it, idx) => {
      if (it.lit) return;                       // 文献深读归 literature.mjs
      if (it.valve === 'pass') return;          // 已放行，永不重判（存量冻结）
      if (it.custom) return;                    // 手工添加不归阀门管
      const noRead = g === 'news' ? !(it.impact && String(it.impact).trim()) : !(it.core && String(it.core).trim());
      if (!noRead) return;                      // 已有解读的存量条目一律不碰
      out.push({ it, g, idx });
    });
  }
  return out;
}

// —— L0：时效与可用性（0 token）——
function l0(c, seenTitles) {
  const it = c.it;
  const d = it.date ? new Date(it.date) : null;
  if (!d || isNaN(d)) { discard(it, c.g, 'L0', '无真实发布日期'); return false; }
  const now = new Date();
  if (d > now) { discard(it, c.g, 'L0', `日期异常（未来日期 ${it.date}）`); return false; }
  const age = (now - d) / 864e5;
  if (age > CFG.freshnessDays) { discard(it, c.g, 'L0', `发布日 ${it.date} 超 ${CFG.freshnessDays} 天窗口（${age.toFixed(1)}天）`); return false; }
  const nt = normTitle(it.title);
  if (nt && seenTitles.has(nt)) { discard(it, c.g, 'L0', '同事件重复（已有同题条目）'); return false; }
  if (nt) seenTitles.add(nt);
  return true;
}

// —— L1：信息完整（0 token，三态：ok / reject / suspect）——
function l1(c) {
  const it = c.it;
  const len = bodyLen(it) + clean(it.summary).replace(/\s+/g, '').length;
  const tail = clean(it.body).slice(-120);
  if (RE.paywall.test(clean(it.body).slice(0, 600) + ' ' + clean(it.summary))) {
    discard(it, c.g, 'L1', '残缺·权限墙特征（subscribe/sign-in/会员可见）'); return 'reject';
  }
  if (RE.truncation.test(tail)) {
    discard(it, c.g, 'L1', '残缺·正文截断特征'); return 'reject';
  }
  if (len < CFG.hardMinChars) {
    discard(it, c.g, 'L1', `残缺·信息量过少（${len} < ${CFG.hardMinChars} 字）`); return 'reject';
  }
  if (len >= (CFG.minBodyChars[c.g] || 600)) return 'ok';
  return 'suspect'; // 够不上完整线但又没踩残缺特征 → 交 L3 判「信息是否充分」
}

// —— L2：领域闸（0 token，三态）——
function l2(c) {
  const it = c.it;
  // 判定文本 = 标题 + 摘要（框架 v4 原样，不得扩到正文）
  const text = clean(it.title) + ' ' + clean(it.summary);
  if (RE.exclusion.test(text)) { discard(it, c.g, 'L2', '食安/菌/化学（内容级排除，用户 2026-11-10 拍板）'); return { state: 'reject' }; }
  let best = '', bestHits = 0;
  for (const [d, re] of Object.entries(DOMAIN_RES)) {
    const hits = (text.match(new RegExp(re.source, 'gi')) || []).length;
    if (hits > bestHits) { best = d; bestHits = hits; }
  }
  if (bestHits > 0) return { state: 'ok', domain: best };
  return { state: 'suspect' }; // 词表没接住 → 交 L3 兜底，防误杀新话题
}

// —— L3：语义闸（AI，1 次批量）——
const L3_SYS = `你是快消/烟草电子烟行业的情报把关人，替一位关注「感官科学与消费者/市场研究」的资深从业者筛选每日资讯。
对每条候选内容独立判断两点（这是仅有的两条准入判据）：
1. 信息是否充分：有事实、数据、结论或实质分析；通稿、活动/会议/报名、纯产品上新、标题党、旧闻复述、软文一律「信息不充分」。
2. 是否属于关注领域且值得读：六类领域——感官科学/品牌营销/消费者洞察/政策法规/市场数据/企业战略；必须是该领域的最新资讯或趋势，而非无关内容。
硬性排除：食安、微生物/菌群、化学分析（代谢组/挥发物/GC-MS）类内容一律 worth=false。
判定标准（务必从严）：两条都满足才 worth=true；有任何一条不满足即 worth=false。
对 worth=true 的条目顺带产出（严格按长度限制）：
- domain：六类之一（取最贴切的一类）
- zhTitle：不超过${CFG.zhTitleMax}字的中文短标题，准确概括核心，不加「报告：」「分析：」等前缀
- zhSummary：不超过${CFG.zhSummaryMax}字的中文要点摘要，只基于给定信息，绝不编造数据与事实
- reason：不超过 20 字的取舍理由
只输出一个 JSON 对象：{"items":[{"id":"候选id","worth":true/false,"domain":"...","zhTitle":"...","zhSummary":"...","reason":"..."}]}，worth=false 时 domain/zhTitle/zhSummary 输出空字符串。不要 markdown，不要解释文字。`;

async function l3(batch) {
  const payload = batch.map((c, i) => ({
    id: String(i),
    标题: clean(c.it.title),
    摘要: clean(c.it.summary).slice(0, 200),
    正文开头: clean(c.it.body).slice(0, CFG.bodyHeadForAI),
  }));
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const content = await askDeepSeek('候选清单：\n' + JSON.stringify(payload, null, 1), L3_SYS);
      const m = content.match(/\{[\s\S]*\}/);
      const obj = JSON.parse(m[0]);
      const items = Array.isArray(obj.items) ? obj.items : [];
      const byId = new Map(items.map((x) => [String(x.id), x]));
      return byId;
    } catch (e) {
      last = e;
      console.log(`  L3 第 ${attempt}/3 次失败：${e.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw last;
}

(async () => {
  if (!fs.existsSync(DRAFT)) { console.log('（valve）未找到 feed-draft.json，跳过'); process.exit(0); }
  const feed = JSON.parse(fs.readFileSync(DRAFT, 'utf-8').replace(/^\uFEFF/, ''));
  const cands = candidates(feed);
  console.log(`\n===== 情报阀门（框架 v4）===== 候选 ${cands.length} 条${DRY ? '（--dry：只跑 L0-L2，0 token）' : ''}`);
  if (!cands.length) { console.log('（无新候选，阀门直通）'); process.exit(0); }

  const stats = { L0: 0, L1: 0, L2: 0, rulePass: 0, aiPass: 0, pending: 0 };
  const seenTitles = new Set();
  // 「同事件多源只留一条」（框架 v3/v4）：草稿里已有的非候选条目标题全部算作已存在，
  // 防止跨天同事件报道（昨天已进一条、今天另一源再发）重复入平台
  {
    const candSet = new Set(cands.map((c) => c.it));
    for (const g of ['news', 'insights']) {
      (feed[g] || []).forEach((it) => {
        if (it.lit || it.custom || candSet.has(it)) return;
        const nt = normTitle(it.title);
        if (nt) seenTitles.add(nt);
      });
    }
  }
  const toL3 = [];
  for (const c of cands) {
    if (!l0(c, seenTitles)) { stats.L0++; continue; }
    const s1 = l1(c);
    if (s1 === 'reject') { stats.L1++; continue; }
    const s2 = l2(c);
    if (s2.state === 'reject') { stats.L2++; continue; }
    if (s1 === 'ok' && s2.state === 'ok') {
      // 规则直过（0 token）：无中文短标题/中译摘要（设计如此，前端回退原文）
      c.it.valve = 'pass';
      c.it.valveHow = 'rule';
      c.it.domain = s2.domain;
      c.it.zhTitle = '';
      c.it.zhSummary = '';
      stats.rulePass++;
      continue;
    }
    toL3.push(c);
  }
  console.log(`L0 拦 ${stats.L0} · L1 拦 ${stats.L1} · L2 拦 ${stats.L2} · 规则直过 ${stats.rulePass} · 待 L3 语义判定 ${toL3.length}`);

  if (toL3.length) {
    if (DRY) {
      // --dry 纯预览：不改草稿、不写回，疑似条目保持原样（0 副作用、0 token）
      console.log(`--dry：${toL3.length} 条疑似未判定（--dry 不调用 DeepSeek、不改草稿）`);
      stats.pending = toL3.length;
    } else if (toL3.length > CFG.batchCap) {
      // 超批量上限：只判最近 batchCap 条，其余本轮不入选（显式告警 + 写丢弃日志，下轮源列表通常还会给）
      const judged = toL3.slice(0, CFG.batchCap);
      const overflow = toL3.slice(CFG.batchCap);
      console.log(`⚠️ 待判 ${toL3.length} 条超过批量上限 ${CFG.batchCap}：本轮先判最近 ${CFG.batchCap} 条，其余 ${overflow.length} 条本轮不入选（显式告警，非静默）`);
      overflow.forEach((c) => { discard(c.it, c.g, 'L3-pending', '超批量上限，本轮未判定不入选'); c.it.__remove = true; });
      stats.pending = overflow.length;
      const byId = await l3(judged);
      applyL3(judged, byId, stats);
    } else {
      const byId = await l3(toL3);
      applyL3(toL3, byId, stats);
    }
  }

  function applyL3(batch, byId, stats) {
    for (const c of batch) {
      const r = byId.get(String(batch.indexOf(c)));
      if (!r) {
        // AI 未返回该条判定 → 本轮不入选（显式记录，不静默放行）
        discard(c.it, c.g, 'L3-pending', 'AI 未返回该条判定，本轮不入选');
        c.it.__remove = true; stats.pending++;
        continue;
      }
      if (r.worth === true) {
        if (!CFG.domains.includes(r.domain)) {
          // AI 放行但领域标签不合法 → 本轮不入选，不放无标签内容
          discard(c.it, c.g, 'L3-pending', 'AI 放行但领域标签缺失/非法（' + String(r.domain || '空') + '）');
          c.it.__remove = true; stats.pending++;
          continue;
        }
        c.it.valve = 'pass';
        c.it.valveHow = 'ai';
        c.it.domain = r.domain;
        c.it.zhTitle = String(r.zhTitle || '').trim().slice(0, CFG.zhTitleMax + 10);
        c.it.zhSummary = String(r.zhSummary || '').trim().slice(0, CFG.zhSummaryMax + 20);
        stats.aiPass++;
      } else {
        discard(c.it, c.g, 'L3', '不值得读：' + String(r.reason || '未给理由').slice(0, 40));
        c.it.__remove = true;
      }
    }
  }

  // 从草稿移除被拦条目（写丢弃日志，可复查误杀）；--dry 纯预览：不改草稿、不写回
  if (DRY) {
    console.log(`\n[--dry 预览] 规则直过 ${stats.rulePass} · 待 L3 判定 ${stats.pending} · L0-L2 已拦 ${stats.L0 + stats.L1 + stats.L2}（草稿未改动）`);
    process.exit(0);
  }
  for (const g of ['news', 'insights']) {
    const before = (feed[g] || []).length;
    feed[g] = (feed[g] || []).filter((it) => !it.__remove);
    if (feed[g].length !== before) console.log(`  [${g}] 移除被拦条目 ${before - feed[g].length} 条`);
  }
  if (discardLog.length) {
    fs.appendFileSync(DISCARD_LOG, discardLog.map((x) => JSON.stringify(x)).join('\n') + '\n');
  }

  fs.writeFileSync(DRAFT, JSON.stringify(feed, null, 2), 'utf-8');
  console.log(`\n阀门完成 → 规则直过 ${stats.rulePass} · AI 放行 ${stats.aiPass} · 未判定不入选 ${stats.pending} · 拦截/丢弃 ${discardLog.length}（明细见 data/valve-discards.jsonl）`);
  if (stats.pending > 0) {
    console.log(`⚠️⚠️ 显式告警：${stats.pending} 条本轮未判定、不入选（多数源列表保留数日，后续轮次会重新进来重判）。绝不静默放行。`);
  }
})();
