/* ============================================================
   专业文献专属处理（唯一定本 v5 ·「专业文献支」）
   ------------------------------------------------------------
   只作用于下面 LIT_SOURCES 的 4 个源；其余内容（行业资讯、其他专业提升源、英语阅读）
   一律不碰、保持原路径。判定入口：isLitSource(name)。

   逐环节（用户 2026-11-09 定稿，供逐条检查）：
   ① 源头收窄：sources.json 里 PubMed query 改三类精确短语 + NOT 排除（抓取前，零 token）
   ② 进门判三类：sensory / consumer / marketing —— AI 轻量归类，只看标题+摘要，不写解读【花少量 token】
      · 非三类 → 当场舍弃；三类 → 全部入选平台（不再问全文）
   ③ 抓正文：程序动作，零 token
   ④ 核对「是不是整篇全文」：五条硬特征，零 token
      1 末尾参考文献  2 完整章节  3 长度与收尾  4 页面类型(全文/PDF vs 摘要/落地页)  5 FullText/PDF 入口与订阅墙
      · 五条全齐 → 全文；缺一或拿不准 → 按「不是全文」办
   ⑤A 全文 → AI 通读全文精读【花 token】（15 年专家视角、引用证据、禁编造、CMI/感官双维、归 7 主题）
   ⑤B 非全文 → 只留题录（标题/来源/可点链接/真实日期/「未获取全文」标记），不送 AI、不写解读【零 token】
   ⑥ 发布前查证据链（validate-feed 里给题录放行，不查空解读字段）
   ============================================================ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isTopic7 } from './topic7.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DRAFT = path.join(ROOT, 'data/feed-draft.json');
const KEY_FILE = process.env.DEEPSEEK_KEY_FILE || 'C:/Users/VOOPOO/Desktop/DeepSeek API.txt';
let KEY = null;

// ── 环节 0：分流名单（唯一真源）──────────────────────────────
export const LIT_SOURCES = [
  'OpenAlex · 感官科学(主题精选)',
  'PubMed 感官与食品研究',
  'Food Quality and Preference (Crossref)',
  'J. Sensory Studies / J. Texture Studies (Crossref)',
];
export function isLitSource(name) {
  const s = String(name || '').trim();
  if (s.length < 8) return false;   // 空/过短来源不能被误判为文献源（避免 "Fo" 之类前缀误命中）
  return LIT_SOURCES.some((n) => s === n || s.startsWith(n) || n.startsWith(s));
}
export function isLitItem(it) {
  return isLitSource(it?.source || it?.origin || '');
}

// ── 环节 ②：三类准入（AI 轻量归类）───────────────────────────
// 三类：sensory(感官研究) / consumer(消费者研究) / marketing(营销)
// 明确排除：食安/召回/污染、菌/微生物/发酵、食品化学/成分分析/加工、纯医学临床
export const CLASSIFY_SYS = `你是专业文献分类助手。只判断下面这篇文献的「主题归属」，不做任何内容解读。
三类（命中任一即 inScope=true）：
- sensory：感官评价/描述性分析/感官panel/CATA/偏好测试/感知机制/风味质地测评方法
- consumer：消费者行为/偏好/接受度/购买意愿/细分/用户调研/消费心理
- marketing：品牌/广告/定价/渠道/传播/市场策略/消费营销
明确排除（excluded=true，仅用户点名的三类）：食品安全/召回/污染、细菌/微生物/发酵/菌种、食品化学/成分分析。
除上述外，一律只按「是否属于 sensory / consumer / marketing 三类」判定，不扩大排除范围。
只输出一个 JSON 对象：{"inScope":true|false,"classes":["sensory"],"excluded":true|false,"reason":"一句中文理由"}。
不要 markdown、不要解释文字。`;

export function buildClassifyPrompt(it) {
  // 框架 2.2：只看标题＋摘要，轻量判三类，不写解读。不掺入来源等其它输入。
  return `标题：${String(it?.title || '').slice(0, 300)}\n摘要：${String(it?.summary || '').slice(0, 500)}\n请判断主题归属。`;
}

// 解析 AI 返回（纯函数，便于本地零 token 测试）
export function parseClassify(obj, it) {
  const classes = Array.isArray(obj?.classes) ? obj.classes.filter((c) => ['sensory', 'consumer', 'marketing'].includes(c)) : [];
  const excluded = obj?.excluded === true;
  const declared = obj?.inScope === true;
  return { pass: declared && !excluded && classes.length > 0, classes, excluded, reason: String(obj?.reason || '') };
}

// ── 环节 ③④：抓正文 + 五条硬特征 ─────────────────────────────
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// 抓正文：不截断（deriveBody 有 2000 字上限，这里不用它）。零 token。
export async function fetchFullArticle(link) {
  const out = { text: '', html: '', status: 0, linkType: 'unknown' };
  try {
    const r = await fetch(link, { redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(20000) });
    out.status = r.status;
    const html = await r.text();
    out.html = html.slice(0, 150000);
    const finalUrl = r.url || link;
    // 正文：取所有 <p>，剥标签，拼起来（不截断）
    const ps = html.match(/<p[\s\S]*?<\/p>/gi) || [];
    const parts = [];
    for (const p of ps) {
      const t = p.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
      if (t.length >= 30) parts.push(t);
    }
    out.text = parts.join(' ').trim();
    // 页面类型（框架环节 3.2 / 4.4）：只记录「这次抓取实际落在什么页面」这个抓取当场即知的客观事实。
    //   不用原始链接字面猜（doi.org 会 302 跳到期刊正文页），也不掺入正文长度 / 参考文献
    //   （那是硬特征第 1、3 条的事）。「是不是整篇全文」由环节 4 的五条硬特征判定，此处不判。
    const intercepted = out.status !== 200 || /cookies-required|just a moment|enable javascript|access denied|cf-challenge|verify you are human/i.test(out.html);
    const abstractPage = /pubmed\.ncbi\.nlm\.nih\.gov|\/abstract\b|cookies-required/i.test(finalUrl);
    out.linkType = (intercepted || abstractPage) ? 'abstract' : 'fulltext';
  } catch (e) { out.error = String(e.message || e).slice(0, 80); }
  return out;
}

// 五条硬特征判定（纯函数）。全部满足才是「整篇全文」；缺一或拿不准 → 不是全文。
export function checkFullText({ text = '', html = '', linkType = 'unknown', status = 0 }) {
  const t = String(text || '');
  const h = String(html || '');
  const low = t.toLowerCase();

  // 1) 末尾是否有参考文献列表
  const hasRefs = /references|bibliography|参考文献|cited (literature|references)|literature cited/i.test(low.slice(-6000));

  // 2) 是否有完整章节结构（引言/方法/结果/讨论，至少 3 个独立章节标记）
  const secHits = ['introduction', 'materials and methods', 'methods', 'results', 'discussion', 'conclusion', '引言', '方法', '结果', '讨论', '结论']
    .filter((w) => low.includes(w)).length;
  const hasSections = secHits >= 3;

  // 3) 长度与收尾：正文够长、有正常结尾、不是断在半截
  const longEnough = t.length >= 3000;
  const endsClean = /[.!?。！？]$/.test(t.slice(-1)) || /[.!?。！？]["')]?\s*$/.test(t.slice(-3));
  const hasLength = longEnough && endsClean;

  // 4) 页面类型：抓的是全文/PDF 页面（不是摘要页/落地页）
  const isFullPage = linkType === 'fulltext';

  // 5) 页面标记：有 Full Text/PDF 入口，且正文没被订阅墙挡住
  const hasFullEntry = /full text|download pdf|view pdf|get pdf|read full|阅读全文|下载全文|pdf\b/i.test(h);
  const paywalled = /subscribe to (read|access)|purchase (this|the) article|institutional (access|login)|sign in to (read|access|view)|buy this article|订阅后阅读|登录后查看|购买全文/i.test(h);
  const hasEntry = hasFullEntry && !paywalled;

  const checks = { refs: hasRefs, sections: hasSections, length: hasLength, pageType: isFullPage, entry: hasEntry };
  const passed = Object.values(checks).filter(Boolean).length;
  return { isFull: passed === 5, checks, passed, textLen: t.length };
}

// ── 环节 ⑤A：AI 通读全文精读 ──────────────────────────────────
export const DEEPREAD_SYS = `你是一位拥有 15 年经验的「市场与用户研究 / 感官研究」专家。请精读下面给出的【整篇文献正文】，用中文做专业解读。
硬性要求：
1) 只依据正文里实际写到的证据、数据、方法、结论，绝不编造；正文没给就明说不足。
2) CMI（消费者与市场洞察）与感官研究是两个独立维度，只写真正相关的，不硬编。
3) 视角客观、克制、有深度；跳脱单条信息看结构性趋势，给长期启发，拒绝空话与就事论事的临时建议。
4) 严格只输出一个 JSON 对象，字段见任务说明。`;

export function buildDeepReadPrompt(it, fullText) {
  return `【文献】\n标题：${String(it?.title || '').slice(0, 300)}\n来源：${String(it?.source || it?.origin || '')}\n\n【整篇正文】\n${String(fullText || '').slice(0, 30000)}\n\n请精读以上全文，一次性输出 JSON：{
"core":"60-90字，中心论点与核心结论，点出关键证据/数据支撑，专业准确",
"viewCMI":"仅当与消费者与市场洞察相关时填写：120-160字的 CMI 维度分析；否则空字符串",
"viewSensory":"仅当与感官研究相关时填写：120-160字的感官维度分析；否则空字符串",
"lens":"严格取其一：cmi / sensory / both",
"action":"60-90字，值得长期追问的方向或思维框架，不要一次性战术动作",
"topic":"严格取其一：产业动态 / 政策与标准 / 市场与数据 / 消费者与用户 / 产品与感官 / 趋势与前瞻 / 战略与方法",
"evidence":"一句中文，指出解读引用的正文中最关键的一处证据"
}。不要 markdown、不要解释文字。`;
}

async function askDeepSeek(userPrompt, sys) {
  if (!KEY) {
    if (process.env.DEEPSEEK_API_KEY && /^sk-/.test(process.env.DEEPSEEK_API_KEY.trim())) KEY = process.env.DEEPSEEK_API_KEY.trim();
    else {
      const raw = fs.readFileSync(KEY_FILE, 'utf-8');
      const m = raw.match(/sk-[A-Za-z0-9]{20,}/);
      if (!m) throw new Error('未能从桌面文件提取 DeepSeek key');
      KEY = m[0];
    }
  }
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: sys }, { role: 'user', content: userPrompt }], temperature: 0.5, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error('DeepSeek HTTP ' + r.status);
  const j = await r.json();
  const c = j?.choices?.[0]?.message?.content;
  if (!c) throw new Error('DeepSeek 返回结构异常');
  const m = c.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('返回未含 JSON');
  return JSON.parse(m[0]);
}

// ── 题录构造（环节 ⑤B）：只留框架 5B.1 指定的基本信息，不写解读、不做归类 ──────
// 框架 5B.1：标题、来源、可点开的原文链接、真实日期 ＋「未获取全文」标记。
// 不写 topic：7 主题归类按你 16:12 的要求只能在通读全文后做（环节 5A），题录没有全文，不静态猜类别。
export function buildCitation(it, classes) {
  return {
    title: String(it?.title || '').trim(),
    link: String(it?.link || '').trim(),
    source: String(it?.source || it?.origin || '').trim(),
    origin: String(it?.origin || it?.source || '').trim(),
    date: String(it?.date || '').trim(),
    addedAt: String(it?.addedAt || new Date().toISOString().slice(0, 10)).trim(),
    summary: String(it?.summary || '').trim(),
    region: String(it?.region || '国际').trim(),
    lit: 'citation',       // 题录标记：无解读、不送 AI（闸门/富集据此放行）
    litClasses: classes,   // 环节 2 的三类命中结果
    litFullText: false,    // 未获取全文
    fullTextNote: '未获取全文',
  };
}

// ── 主流程：只重写草稿里「专业文献源」的 insights 条目 ─────────
// 返回统计；opts 可注入 classify/fetch/deepread 供本地零 token 测试。
export async function processLiterature(feed, opts = {}) {
  const classify = opts.classify || (async (it) => parseClassify(await askDeepSeek(buildClassifyPrompt(it), CLASSIFY_SYS), it));
  const fetchArt = opts.fetch || fetchFullArticle;
  const deepRead = opts.deepRead || (async (it, fullText) => askDeepSeek(buildDeepReadPrompt(it, fullText), DEEPREAD_SYS));
  const log = opts.log || (() => {});

  const src = feed.insights || [];
  const keep = [];
  const stat = { total: 0, lit: 0, admitted: 0, dropped: 0, full: 0, citation: 0, readFail: 0, parseFail: 0 };

  for (const it of src) {
    stat.total++;
    if (!isLitItem(it)) { keep.push(it); continue; }   // 其它条目原样不动
    stat.lit++;

    // 环节 ②：三类准入（框架 0.2/2.6：先于一切、对每一条统一执行、与有没有全文无关）
    // AI 偶发失败是技术故障，重试让「每条都判三类」真正执行到位（不是新业务规则）。
    let cls = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { cls = await classify(it); break; } catch (e) { /* 重试 */ }
    }
    if (!cls) {
      // 判定始终没完成：本条尚未确认属于三类，不能放进平台（守 0.3：非三类绝不混入）；
      // 也不伪装成「非三类舍弃」静默丢掉——显式告警、单独计数，下次日更重新抓取判定。
      stat.parseFail++;
      log(`  [三类判定失败·非舍弃] 本轮暂不入选、下次重判：${String(it.title).slice(0, 40)}`);
      continue;
    }
    if (!cls.pass) { stat.dropped++; log(`  [非三类] 舍弃：${String(it.title).slice(0, 40)} — ${cls.reason}`); continue; }
    stat.admitted++;

    // 环节 ③④：抓正文 + 五条硬特征
    const art = await fetchArt(it.link);
    const ft = checkFullText({ text: art.text, html: art.html, linkType: art.linkType, status: art.status });

    if (ft.isFull && art.text) {
      // 环节 ⑤A：全文 → AI 通读精读
      try {
        const d = await deepRead(it, art.text);
        // 7 主题归类由「通读全文的 AI」产出（框架 5A.5）；AI 未给合法主题时不静态猜、留空由展示层归一。
        const topic = isTopic7(d.topic) ? d.topic : '';
        keep.push({
          ...it, topic, lit: 'full', litClasses: cls.classes, litFullText: true,
          core: String(d.core || '').trim(), viewCMI: String(d.viewCMI || '').trim(),
          viewSensory: String(d.viewSensory || '').trim(), view: '',
          lens: ['cmi', 'sensory', 'both'].includes(d.lens) ? d.lens : 'cmi',
          action: String(d.action || '').trim(), evidence: String(d.evidence || '').trim(),
        });
        stat.full++;
      } catch (e) {
        // 精读失败 → 保守降级为题录（绝不编造解读）
        stat.readFail++;
        keep.push(buildCitation(it, cls.classes));
        stat.citation++;
      }
    } else {
      // 环节 ⑤B：非全文 → 只留题录
      keep.push(buildCitation(it, cls.classes));
      stat.citation++;
    }
  }
  feed.insights = keep;
  return { feed, stat };
}

// CLI：供 daily-pipeline 串接
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  (async () => {
    const raw = fs.readFileSync(DRAFT, 'utf-8').replace(/^\uFEFF/, '');
    const feed = JSON.parse(raw);
    const { feed: out, stat } = await processLiterature(feed, { log: (m) => console.log(m) });
    fs.writeFileSync(DRAFT, JSON.stringify(out, null, 2), 'utf-8');
    console.log(`[专业文献] 草稿共 ${stat.total} 条 | 文献源 ${stat.lit} | 三类准入 ${stat.admitted} | 舍弃 ${stat.dropped} | 全文精读 ${stat.full} | 题录 ${stat.citation} | 精读失败降级 ${stat.readFail}`);
  })().catch((e) => { console.error('[专业文献] 失败：' + e.message); process.exit(1); });
}
