// 手动精读开关（框架 v4 定本：AI 解读平时停发，用户点名哪篇就精读哪篇）
//
// 用法（二选一）：
//   node scripts/deepread.mjs --link "https://example.com/article"           # 按链接找（news/insights 都会找）
//   node scripts/deepread.mjs --link "..." --force                           # 条目无正文时仍尝试（默认正文抓不到就中止，不编造）
//
// 行为：抓文章正文 → DeepSeek 以「15 年市场用户研究/感官专家」身份精读全文 →
//   news 条目填 impact；insights 条目按 lens 填 core + viewCMI/viewSensory + action。
// 直接写回 data/feed.json（存量冻结原则不适用：这是你点名要的解读）。前端刷新缓存版本后可见。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const LIVE = path.join(ROOT, 'data/feed.json');
const KEY_FILE = process.env.DEEPSEEK_KEY_FILE || 'C:/Users/VOOPOO/Desktop/DeepSeek API.txt';

const iLink = process.argv.indexOf('--link');
const LINK = iLink !== -1 ? process.argv[iLink + 1] : '';
const FORCE = process.argv.includes('--force');
if (!LINK) { console.log('用法：node scripts/deepread.mjs --link <文章链接> [--force]'); process.exit(1); }

function loadKey() {
  if (process.env.DEEPSEEK_API_KEY && /^sk-/.test(process.env.DEEPSEEK_API_KEY.trim())) return process.env.DEEPSEEK_API_KEY.trim();
  const raw = fs.readFileSync(KEY_FILE, 'utf-8');
  const m = raw.match(/sk-[A-Za-z0-9]{20,}/);
  if (!m) throw new Error('未能提取 DeepSeek key');
  return m[0];
}

async function askDeepSeek(sys, user) {
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + loadKey() },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0.5, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(180000),
  });
  if (!r.ok) throw new Error('DeepSeek HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return (await r.json())?.choices?.[0]?.message?.content || '';
}

async function fetchBody(url) {
  const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Accept': 'text/html,*/*' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('正文抓取 HTTP ' + r.status);
  const html = await r.text();
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

const SYS = `你是一位拥有 15 年经验的资深专家，兼具「市场与用户研究（CMI）」与「感官科学」双重背景，清楚两者的边界：
- CMI 关注消费者行为、市场趋势、竞争格局、品牌/渠道/定价、生意增长逻辑（外部市场视角）。
- 感官研究关注产品感官属性（风味/质地/香气等）、人的感知机制、描述性与偏爱性测评方法（产品与感知视角）。
任务：精读给定的全文，以旁观者身份做客观、克制、有深度的中文分析——引用文中的具体证据与数据支撑观点，可指出数据与立场的局限；跳脱单条信息看结构性趋势，以小见大给长期启发。
铁律：绝不编造文中不存在的数据/事实；只能基于全文本身；语言精炼、拒绝空话套话。
只输出一个 JSON 对象（不要 markdown）：
{"lens":"cmi|sensory|both|neither",
 "core":"60-90字中心论点与核心结论，点出关键证据与为什么重要",
 "viewCMI":"lens 为 cmi/both 时给 120-160 字 CMI 维度分析，否则空字符串",
 "viewSensory":"lens 为 sensory/both 时给 120-160 字感官维度分析，否则空字符串",
 "action":"60-90字值得长期追问的方向/思维框架，不给一次性战术建议",
 "impact":"120-160字宏观影响解读（news 条目用）：行业大趋势或结构性变化+长期启发"}`;

(async () => {
  const feed = JSON.parse(fs.readFileSync(LIVE, 'utf-8').replace(/^\uFEFF/, ''));
  let hit = null, group = '';
  for (const g of ['news', 'insights']) {
    const it = (feed[g] || []).find((x) => x.link === LINK);
    if (it) { hit = it; group = g; break; }
  }
  if (!hit) { console.log('✗ 在 feed.json 的 news/insights 里都没找到该链接：' + LINK); process.exit(1); }
  console.log(`找到条目 [${group}] ${String(hit.title).slice(0, 60)}`);

  const body = await fetchBody(LINK);
  if (body.length < 400 && !FORCE) {
    console.log(`✗ 正文只抓到 ${body.length} 字（疑似权限墙/动态渲染），默认中止——止损不编造。确认要硬读可用 --force（将基于已有摘要+截断正文分析）。`);
    process.exit(2);
  }
  console.log(`正文 ${body.length} 字，送 DeepSeek 精读...`);
  const user = `标题：${hit.title}\n来源：${hit.source || hit.origin || ''}\n全文：\n${body.slice(0, 12000)}`;
  const out = JSON.parse((await askDeepSeek(SYS, user)).match(/\{[\s\S]*\}/)[0]);

  if (group === 'news') {
    hit.impact = out.impact || hit.impact || '';
  } else {
    hit.lens = out.lens || hit.lens || '';
    if (out.core) hit.core = out.core;
    if (out.viewCMI) hit.viewCMI = out.viewCMI;
    if (out.viewSensory) hit.viewSensory = out.viewSensory;
    if (out.action) hit.action = out.action;
  }
  hit.deepReadAt = new Date().toISOString();
  fs.writeFileSync(LIVE, JSON.stringify(feed, null, 2), 'utf-8');
  console.log(`✅ 已精读并写回 data/feed.json：lens=${hit.lens || '(news 无 lens)'}`);
  console.log('   注意：前端有缓存版本号，下次流水线发布会自动 bump；若要立即可见请手动 bump feed.js 的 ?v= 版本串。');
})().catch((e) => { console.log('✗ 失败：' + e.message); process.exit(1); });
