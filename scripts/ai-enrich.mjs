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
  let raw = '';
  try { raw = fs.readFileSync(KEY_FILE, 'utf-8'); } catch (e) { throw new Error('找不到 DeepSeek key 文件: ' + KEY_FILE); }
  const m = raw.match(/sk-[A-Za-z0-9]{20,}/);
  if (!m) throw new Error('未能从文件提取 sk- 开头的 DeepSeek key（请确认文件里有一行以 sk- 开头的 key）');
  return m[0];
}

const SYS = `你是一位资深 FMCG（快消品）感官研究与消费者市场洞察（CMI）顾问，深耕电子烟/雾化及广义快消行业。
你的任务是针对给定的行业资讯或专业洞察，产出专业、务实、可执行的中文分析。
规则：
1) 绝不编造数据、统计数字、日期或不存在的事实；只能基于给定的标题与摘要进行专业解读与推断。
2) 语言精炼、有顾问语气，面向企业市场研究人员，不要空话套话。
3) 严格只输出一个 JSON 对象（不要 markdown 代码块、不要任何解释文字），字段含义见各任务说明。`;

function extractJSON(s) {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('返回内容未包含 JSON: ' + s.slice(0, 160));
  try { return JSON.parse(m[0]); } catch (e) { throw new Error('JSON 解析失败: ' + s.slice(0, 160)); }
}

async function askDeepSeek(userPrompt, sys = SYS) {
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) { const t = await r.text(); throw new Error('DeepSeek HTTP ' + r.status + ' ' + t.slice(0, 300)); }
  const j = await r.json();
  const content = j?.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek 返回结构异常');
  return content;
}

async function askWithRetry(prompt, sys = SYS, n = 3) {
  let last;
  for (let i = 0; i < n; i++) {
    try { return await askDeepSeek(prompt, sys); }
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

function buildPrompt(it, group, missing) {
  const label = group === 'news' ? '分类' : '主题';
  const dim = group === 'news' ? (it.cat || it.dimension || '') : (it.topic || '');
  const base = `标题：${it.title || ''}\n来源：${it.source || it.origin || ''}\n${label}：${dim}\n` +
    (it.summary ? `摘要：${it.summary}\n` : '') +
    (it.region ? `地区：${it.region}\n` : '');
  if (group === 'news' && missing.includes('summary')) {
    return base + `\n请基于以上资讯标题与内容，用中文写出「要点摘要」：80-140字，概括核心事实与影响，专业准确，不要出现网页导航文字，不要输出任何多余内容。\n只输出 JSON：{"summary":"中文要点摘要"}`;
  }
  if (group === 'news' && missing.includes('impact')) {
    return base + `\n请基于以上资讯，用中文产出「顾问视角解读」。\n只输出 JSON：{"impact":"80-120字，说明这条资讯对FMCG感官研究/CMI工作的影响与含义，务实专业，不编造数据"}`;
  }
  const parts = [];
  if (missing.includes('core')) parts.push('"core":"50-80字核心内容概括（这条洞察讲了什么）"');
  if (missing.includes('view')) parts.push('"view":"80-120字顾问视角（对FMCG感官研究/CMI意味着什么）"');
  if (missing.includes('action')) parts.push('"action":"50-80字行动建议（接下来该做什么）"');
  return base + `\n请基于以上洞察，用中文产出专业分析。\n只输出 JSON：{${parts.join(', ')}}`;
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
      const out = await askWithRetry(`你是专业翻译。把下面这段英文翻译成通顺地道的中文，保持段落结构，用"##段落"分隔原段落，只输出译文，不要任何解释。\n\n${c}`);
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

export async function enrich(feedPath) {
  if (!KEY) KEY = loadKey();
  const feed = JSON.parse(fs.readFileSync(feedPath, 'utf-8').replace(/^\uFEFF/, ''));
  const tasks = [];
  (feed.news || []).forEach((it, idx) => {
    const miss = [];
    if (isEmpty(it.impact)) miss.push('impact');
    if (isBadSummary(it.summary)) miss.push('summary');
    if (miss.length) tasks.push({ group: 'news', idx, missing: miss });
  });
  (feed.insights || []).forEach((it, idx) => {
    const miss = [];
    if (isEmpty(it.core)) miss.push('core');
    if (isEmpty(it.view)) miss.push('view');
    if (isEmpty(it.action)) miss.push('action');
    if (miss.length) tasks.push({ group: 'insights', idx, missing: miss });
  });

  let ok = 0, fail = 0;
  console.log(`\n[ai-enrich] 待富集条目：${tasks.length}`);
  for (const t of tasks) {
    const it = feed[t.group][t.idx];
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
  return { total: tasks.length, ok, fail };
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
