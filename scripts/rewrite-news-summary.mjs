// 把 feed.json 里仍为纯英文的新闻摘要，逐条用 DeepSeek 改写为中文要点摘要。
// 同时移除不符合「10 分钟阅读体量」的短讯阅读（minutes<6 或 正文<2段，当前为 #11-16 新闻快讯）。
// 不读 seed、不伪造日期，只做字段语言转换 + 清理。
import fs from 'fs';

const KEY_FILE = process.env.DEEPSEEK_KEY_FILE || 'C:/Users/VOOPOO/Desktop/DeepSeek API.txt';
let KEY = null;
function loadKey() {
  const raw = fs.readFileSync(KEY_FILE, 'utf-8');
  const m = raw.match(/sk-[A-Za-z0-9]{20,}/);
  if (!m) throw new Error('找不到 DeepSeek key（桌面 DeepSeek API.txt 中需有一行 sk- 开头）');
  return m[0];
}
const SYS = `你是一位资深 FMCG（快消品）感官研究与消费者市场洞察（CMI）顾问。
请把给定的英文行业资讯标题与摘要，翻译并改写为简洁专业的中文要点摘要（2-3句，面向企业市场研究人员，不空话）。
规则：
1) 绝不编造原文没有的数据、日期、事实；只能基于给定标题与摘要做专业提炼。
2) 只输出一个 JSON 对象 {"summary":"中文摘要"}，不要 markdown 代码块，不要任何多余文字。`;
async function ask(userPrompt) {
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: userPrompt }],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) { const t = await r.text(); throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 200)); }
  const j = await r.json();
  const c = j?.choices?.[0]?.message?.content;
  if (!c) throw new Error('空返回');
  return c;
}
function extractJSON(s) { const m = s.match(/\{[\s\S]*\}/); if (!m) throw new Error('无 JSON'); return JSON.parse(m[0]); }

async function main() {
  KEY = loadKey();
  const feed = JSON.parse(fs.readFileSync('data/feed.json', 'utf8'));
  const news = feed.news || [];
  let done = 0, skip = 0, fail = 0;
  for (let i = 0; i < news.length; i++) {
    const n = news[i];
    const s = n.summary || '';
    if (/[一-龥]/.test(s)) { skip++; continue; }
    if (!s.trim()) { skip++; continue; }
    const prompt = `英文标题：${n.title || ''}\n英文摘要：${s}\n\n请输出中文要点摘要 JSON {"summary":"..."}。`;
    let ok = false;
    for (let a = 0; a < 3 && !ok; a++) {
      try {
        const c = await ask(prompt);
        const j = extractJSON(c);
        if (j.summary && j.summary.trim()) { n.summary = j.summary.trim(); done++; ok = true; }
      } catch (e) { console.log(`  #${i} 重试${a + 1}: ${String(e.message).slice(0, 80)}`); await new Promise(r => setTimeout(r, 1500 * (a + 1))); }
    }
    if (!ok) { console.log(`  #${i} 失败，保留英文：${(n.title || '').slice(0, 40)}`); fail++; }
    else console.log(`  #${i} OK：${(n.title || '').slice(0, 40)}`);
    await new Promise(r => setTimeout(r, 300));
  }

  // 清理不符合 10 分钟体量的短讯阅读（仅 1 段 / <6 分钟的新闻快讯）
  const before = (feed.readings || []).length;
  feed.readings = (feed.readings || []).filter(a => (a.minutes && a.minutes >= 6) || (Array.isArray(a.body) && a.body.length >= 2));
  const removed = before - feed.readings.length;
  console.log(`阅读短讯移除 ${removed} 篇，保留 ${feed.readings.length} 篇`);

  fs.writeFileSync('data/feed.json', JSON.stringify(feed, null, 2));
  console.log(`完成：重写 ${done} 条，跳过(已中文/空) ${skip} 条，失败 ${fail} 条`);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
