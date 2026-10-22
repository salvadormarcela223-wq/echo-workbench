// AI 解读富集：用 DeepSeek(deepseek-chat) 为 feed.json 中缺失解读的条目生成中文分析。
// 只填充「空字段」，绝不覆盖已有内容（保留人工兜底）。
// 用法：
//   node scripts/ai-enrich.mjs                 # 处理默认 data/feed.json
//   node scripts/ai-enrich.mjs --file X.json   # 处理指定文件（测试用）
// DeepSeek key 从桌面文件读取（不写死、不进仓库）；默认路径可被环境变量 DEEPSEEK_KEY_FILE 覆盖。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve('.');
const KEY_FILE = process.env.DEEPSEEK_KEY_FILE || 'C:/Users/VOOPOO/Desktop/DeepSeek API.txt';
let KEY = null; // 惰性加载，避免被 import 时即读取桌面文件

function resolveFeedPath() {
  const i = process.argv.indexOf('--file');
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return path.join(ROOT, 'data/feed.json');
}

function loadKey() {
  // 服务器/CI 环境：优先读环境变量（GitHub 仓库密钥），不依赖桌面文件
  if (process.env.DEEPSEEK_API_KEY && /^sk-/.test(process.env.DEEPSEEK_API_KEY.trim())) {
    return process.env.DEEPSEEK_API_KEY.trim();
  }
  let raw = '';
  try { raw = fs.readFileSync(KEY_FILE, 'utf-8'); } catch (e) { throw new Error('找不到 DeepSeek key（环境变量 DEEPSEEK_API_KEY 未设置，且桌面文件也不存在: ' + KEY_FILE + '）'); }
  const m = raw.match(/sk-[A-Za-z0-9]{20,}/);
  if (!m) throw new Error('未能从文件提取 sk- 开头的 DeepSeek key（请确认文件里有一行以 sk- 开头的 key，或在服务器设置环境变量 DEEPSEEK_API_KEY）');
  return m[0];
}

const SYS = `你是一位资深的 FMCG（快消品）感官研究与消费者市场洞察（CMI）行业观察者，具备宏观视野与独立判断力，常年跟踪全球快消、食品饮料、零售与消费者研究动向。
你的任务：针对给定的行业资讯或专业洞察，以「旁观者」身份做客观、克制、有深度的中文分析——不站队、不吹捧、可指出局限；善于从单条信息中跳脱出来，洞察背后的结构性趋势，并以小见大，给出对研究/品牌方具有长期启发意义的判断。
规则：
1) 绝不编造数据、统计数字、日期或不存在的事实；只能基于给定标题与摘要做专业推断。
2) 语言精炼、有洞察力，面向企业市场研究人员，拒绝空话套话与就事论事的临时战术建议。
3) 严格只输出一个 JSON 对象（不要 markdown 代码块、不要任何解释文字），字段含义见各任务说明。`;

function extractJSON(s) {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('返回内容未包含 JSON: ' + s.slice(0, 160));
  try { return JSON.parse(m[0]); } catch (e) { throw new Error('JSON 解析失败: ' + s.slice(0, 160)); }
}

async function askDeepSeek(userPrompt, sys = SYS, useJson = true) {
  const body = {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
  };
  if (useJson) body.response_format = { type: 'json_object' };
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) { const t = await r.text(); throw new Error('DeepSeek HTTP ' + r.status + ' ' + t.slice(0, 300)); }
  const j = await r.json();
  const content = j?.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek 返回结构异常');
  return content;
}

async function askWithRetry(prompt, sys = SYS, n = 3, useJson = true) {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await askDeepSeek(prompt, sys, useJson); }
    catch (e) { last = e; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  throw last;
}

// 英语阅读生词批量翻译：给一组单词补 音标(p) + 中文释义(t) + 英文释义(en)。
// 复用同一 DeepSeek key（桌面文件）。失败返回 {}，由调用方降级（本地词库/前端在线兜底）。
const DICT_SYS = `你是一位英语词典专家。为给定的英文单词提供：音标(英式 IPA，带斜杠如 /wɜːd/)、中文释义(简洁准确)、英文释义(简洁)。
只输出一个 JSON 数组，每个元素格式 {"w":"原词","p":"/音标/","t":"中文释义","en":"English gloss"}。不要 markdown 代码块，不要任何多余文字。`;

export async function translateWords(words) {
  if (!KEY) KEY = loadKey();
  const list = (words || []).map((w) => w.w || w).filter(Boolean);
  if (!list.length) return {};
  const prompt = `请为以下英文单词逐一给出音标、中文释义、英文释义。\n只输出一个 JSON 数组，元素 {"w":"原词","p":"/音标/","t":"中文释义","en":"English gloss"}，不要 markdown，不要多余文字。\n单词：` + list.join(', ');
  try {
    const content = await askWithRetry(prompt, DICT_SYS);
    // DeepSeek 返回的是 JSON 数组；先整体解析，失败再抓取数组片段，最后兜底对象形式
    let arr = null;
    try { arr = JSON.parse(content.trim()); } catch (e) {
      const m = content.match(/\[[\s\S]*\]/);
      if (m) { try { arr = JSON.parse(m[0]); } catch (e2) {} }
    }
    if (!Array.isArray(arr)) {
      const obj = extractJSON(content);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        arr = Object.keys(obj).map(k => ({ w: k, p: (obj[k] && obj[k].p) || '', t: (obj[k] && obj[k].t) || '', en: (obj[k] && obj[k].en) || '' }));
      }
    }
    if (!Array.isArray(arr)) return {};
    const map = {};
    arr.forEach((o) => { if (o && o.w) map[String(o.w).toLowerCase()] = { p: o.p || '', t: o.t || '', en: o.en || '' }; });
    return map;
  } catch (e) {
    console.log('  ✗ 词典翻译失败: ' + e.message);
    return {};
  }
}

// 把任意字段清洗为纯文本（剥离 HTML 标签与多余空白），避免把垃圾摘要当上下文喂给模型
function cleanCtx(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
// 标题是否「冗长 / 英文 / 像正文」（>40字 或含HTML 或多句）——仅对新条目触发重生成
function isBadTitle(v) {
  const s = (v || '').trim();
  if (!s) return true;
  if (/<[a-z][^>]*>/i.test(s)) return true;
  if (s.length > 40) return true;
  const sentences = (s.match(/[。.!?！？；;]/g) || []).length;
  if (sentences >= 3) return true; // 含多个句号的更像正文而非标题
  return false;
}

function buildPrompt(it, group, missing) {
  const label = group === 'news' ? '分类' : '主题';
  const dim = group === 'news' ? (it.cat || it.dimension || '') : (it.topic || '');
  // 摘要若为垃圾（HTML/导航残留）则丢弃，不让脏数据污染模型上下文；让其进入 missing 由模型基于标题重生成
  const sum = isBadSummary(it.summary) ? '' : cleanCtx(it.summary);
  const base = `标题：${cleanCtx(it.title || '')}\n来源：${it.source || it.origin || ''}\n${label}：${dim}\n` +
    (sum ? `摘要：${sum}\n` : '') +
    (it.region ? `地区：${it.region}\n` : '');
  // 标题冗长/英文/垃圾 → 生成简洁中文短标题（仅新条目触发，存量不动）
  if (missing.includes('title')) {
    return base + `\n请基于以上信息，提炼一个简洁的中文短标题（≤18字，准确概括核心，不要"报告：""分析："等前缀，不要标点堆砌）。\n只输出 JSON：{"title":"中文短标题"}`;
  }
  if (group === 'news' && missing.includes('summary')) {
    return base + `\n请基于以上资讯标题与内容，用中文写出「要点摘要」：80-140字，概括核心事实与影响，专业准确，不要出现网页导航文字或 HTML 残留，不要输出任何多余内容。\n只输出 JSON：{"summary":"中文要点摘要"}`;
  }
  if (group === 'news' && missing.includes('impact')) {
    return base + `\n请以「行业旁观者」身份，用中文产出「宏观影响解读」：\n1) 跳脱本条具体事件，指出它折射出的行业大趋势或结构性变化；\n2) 客观点评（不站队、可指出数据/立场的局限）；\n3) 对研究/品牌方的长期启发（不是临时战术动作）。\n只输出 JSON：{"impact":"120-160字，宏观视角、以小见大、长期启发，严禁出现'立即启动/建议监测本次事件'这类就事论事措辞"}`;
  }
  const parts = [];
  if (missing.includes('summary')) parts.push('"summary":"80-140字要点摘要，概括核心事实与影响，专业准确，不要出现网页导航/HTML文字"');
  if (missing.includes('core')) parts.push('"core":"60-90字，提炼本文中心论点与核心结论（不是泛泛「讲了什么」），点出关键证据/数据支撑与「为什么重要」，专业准确"');
  if (missing.includes('view')) parts.push('"view":"120-160字，以旁观者身份客观分析：（1）本文折射出的大趋势/结构性变化；（2）克制点评其立场与局限（不站队）；（3）从小见大，对「我们（研究/品牌方）如何重新看待这类议题」的长期启发。严禁「立即启动/建议监测本次事件」等就事论事措辞"');
  if (missing.includes('action')) parts.push('"action":"60-90字，给出值得长期追问的方向/思维框架，而非一次性战术动作；例如「哪些假设需要重新验证」「该建立什么长期监测视角」。不要给出「接下来该做X」的临时建议"');
  return base + `\n请基于以上洞察，以「行业旁观者」身份用中文产出专业分析。\n只输出 JSON：{${parts.join(', ')}}`;
}

// 全文中文翻译（长文分段，返回纯中文文本）
export async function translateFullText(plainText) {
  if (!KEY) KEY = loadKey();
  const text = String(plainText || '').replace(/<[^>]+>/g, '').replace(/\n{2,}/g, '\n').trim();
  if (!text || text.length < 20) return text;
  const chunks = [];
  for (let i = 0; i < text.length; i += 2800) chunks.push(text.slice(i, i + 2800));
  const parts = [];
  for (const c of chunks) {
    try {
      const out = await askWithRetry(`你是专业翻译。把下面这段英文翻译成通顺地道的中文，保持段落结构，用"##段落"分隔原段落，只输出译文，不要任何解释。\n\n${c}`, undefined, 3, false);
      parts.push(out.trim());
    } catch (e) {
      parts.push('（本段翻译失败）');
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return parts.join('\n\n');
}

// 提取地道表达（返回 [{en, zh}]）
export async function extractPhrases(plainText) {
  if (!KEY) KEY = loadKey();
  const text = String(plainText || '').replace(/<[^>]+>/g, '').replace(/\n{2,}/g, '\n').trim().slice(0, 6000);
  if (!text || text.length < 30) return [];
  try {
    const out = await askWithRetry(`阅读下面英文文章，提取 6-8 个值得学习的地道表达/搭配/短语（不要简单词如 go/make，要真正有价值的口语或书面表达）。\n严格JSON数组返回：[{"en":"英文表达","zh":"中文释义"}]\n\n文章：\n${text}`);
    const m = out.match(/\[[\s\S]*\]/);
    if (!m) return [];
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => x && x.en && x.zh).slice(0, 8).map((x) => ({ en: String(x.en).trim(), zh: String(x.zh).trim() }));
  } catch (e) {
    console.log('  ✗ 地道表达提取失败: ' + e.message);
    return [];
  }
}

// 判断是否为「待富集」的空/占位符内容
function isEmpty(v) {
  const s = (v || '').trim();
  return !s || s.includes('待补充') || s.includes('每日自动') || s === '—';
}

// 判断 news summary 是否为「截取式」劣质摘要（网页导航残留 / HTML 残留 / 纯英文截取）
function isBadSummary(v) {
  const s = (v || '').trim();
  if (!s) return true;
  if (s.includes('»') || s.includes('Home »') || s.includes('&raquo;')) return true;
  if (/<[a-z][^>]*>/i.test(s)) return true;                     // HTML 标签残留
  if (s.includes('Read more') || s.includes('Read More') || s.includes('Press Release') || s.includes('Press release')) return true;
  const chinese = (s.match(/[一-龥]/g) || []).length;
  const english = (s.match(/[a-zA-Z]/g) || []).length;
  // 中文字符很少、而英文很多 → 大概率是英文截取
  if (chinese < 5 && english > 60) return true;
  if (s.length > 250) return true;                               // 过长大概率是网页正文残留
  return false;
}

// 构建「待富集」任务清单（纯本地计算，绝不调用 DeepSeek）
// 供正式富集与 --dry 预览共用：在花 token 之前先看清楚要发多少条
// 关键：标题/摘要重生成只对「新条目」(fresh, 即本就缺 core/view/action/impact 的条目) 触发，
// 已填充的存量条目不会被重新富集，从而「存量不动、只改后续输出」。
export function buildTasks(feed) {
  const tasks = [];
  (feed.news || []).forEach((it, idx) => {
    const miss = [];
    if (isEmpty(it.impact)) miss.push('impact');
    if (isBadSummary(it.summary)) miss.push('summary');
    const fresh = miss.length > 0; // 已有影响解读的存量条目不再碰
    if (fresh && isBadTitle(it.title)) miss.push('title');
    if (miss.length) tasks.push({ group: 'news', idx, missing: miss, key: `news:${idx}` });
  });
  (feed.insights || []).forEach((it, idx) => {
    const miss = [];
    if (isEmpty(it.core)) miss.push('core');
    if (isEmpty(it.view)) miss.push('view');
    if (isEmpty(it.action)) miss.push('action');
    const fresh = miss.length > 0; // 已富集的存量条目（core/view/action 都满）不再碰
    if (fresh) {
      if (isBadTitle(it.title)) miss.push('title');   // 英文/冗长标题 → 生成中文短标题
      if (isBadSummary(it.summary)) miss.push('summary'); // 垃圾摘要 → 基于标题重生成
    }
    if (miss.length) tasks.push({ group: 'insights', idx, missing: miss, key: `insights:${idx}` });
  });
  return tasks;
}

// opts.skip: Set<key> —— 已尝试到上限、仍填不满的条目不再重复送 AI
// （防止顽固条目每轮都被重发，白烧 DeepSeek token）
export async function enrich(feedPath, opts = {}) {
  if (!KEY) KEY = loadKey();
  const feed = JSON.parse(fs.readFileSync(feedPath, 'utf-8').replace(/^\uFEFF/, ''));
  const skip = opts.skip || new Set();
  const all = buildTasks(feed);
  const tasks = all.filter((t) => !skip.has(t.key));
  const skipped = all.length - tasks.length;
  if (skipped > 0) console.log(`[ai-enrich] 跳过 ${skipped} 条已达尝试上限的条目（避免重复烧 token）`);

  let ok = 0, fail = 0;
  const attempted = [];
  console.log(`\n[ai-enrich] 待富集条目：${tasks.length}`);
  for (const t of tasks) {
    const it = feed[t.group][t.idx];
    attempted.push(t.key);
    try {
      const content = await askWithRetry(buildPrompt(it, t.group, t.missing));
      const obj = extractJSON(content);
      let filled = [];
      t.missing.forEach((k) => { if (obj[k] && String(obj[k]).trim()) { feed[t.group][t.idx][k] = String(obj[k]).trim(); filled.push(k); } });
      if (filled.length) { ok++; console.log(`  ✓ ${t.group}[${t.idx}] ${String(it.title || '').slice(0, 30)} -> 填充 ${filled.join('/')}`); }
      else { fail++; console.log(`  ! ${t.group}[${t.idx}] 模型未返回所需字段`); }
    } catch (e) {
      fail++;
      console.log(`  ✗ ${t.group}[${t.idx}] 失败: ${e.message}`);
    }
  }
  feed.updatedAt = new Date().toISOString();
  fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2), 'utf-8');
  console.log(`[ai-enrich] 完成：成功 ${ok}，失败 ${fail}，已写回 ${feedPath}`);
  return { total: tasks.length, ok, fail, attempted };
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  (async () => {
    const feedPath = resolveFeedPath();
    try {
      const res = await enrich(feedPath);
      process.exit(res.fail > 0 ? 2 : 0);
    } catch (e) {
      console.error('❌ 富集失败: ' + e.message);
      process.exit(1);
    }
  })();
}
