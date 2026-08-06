// 补全 glossary.json：把 readings 正文+生词里所有「本地 words.json 与 glossary 都没有」的单词，
// 分批用 DeepSeek 翻译（音标+中文+英文释义）后写入 glossary.json，确保点击任意单词都有中文释义。
import fs from 'fs';

const KEY_FILE = 'C:/Users/VOOPOO/Desktop/DeepSeek API.txt';
let KEY = null;
function loadKey() {
  const raw = fs.readFileSync(KEY_FILE, 'utf-8');
  const m = raw.match(/sk-[A-Za-z0-9]{20,}/);
  if (!m) throw new Error('找不到 DeepSeek key');
  return m[0];
}
const DICT_SYS = `你是一位英语词典专家。为给定的英文单词列表提供：音标(英式 IPA，带斜杠如 /wɜːd/)、中文释义(简洁准确)、英文释义(简洁)。
只输出一个 JSON 数组，不要 markdown 代码块，不要任何多余文字。每个元素格式 {"w":"原词","p":"/音标/","t":"中文释义","en":"English gloss"}。`;
async function ask(prompt) {
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: DICT_SYS }, { role: 'user', content: prompt }],
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) { const t = await r.text(); throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 150)); }
  const j = await r.json();
  const c = j?.choices?.[0]?.message?.content;
  if (!c) throw new Error('空返回');
  return c;
}
function parseArr(s) {
  const m = s.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('未含数组');
  return JSON.parse(m[0]);
}

async function main() {
  KEY = loadKey();
  const feed = JSON.parse(fs.readFileSync('data/feed.json', 'utf8'));
  const words = JSON.parse(fs.readFileSync('data/words.json', 'utf8'));
  const glos = JSON.parse(fs.readFileSync('data/glossary.json', 'utf8'));
  const STOP = new Set('the and for are but not you all any can her was one our out has have had his him their they this that with from your will would there what when which who whom why how than then them also been being were said say into more most some such only just like about over after before because while where could should might must may do does did done get got getting make made making use used using see saw seen know knew known take took taken go went gone come came think thought look looked find found give gave given want need feel felt keep kept let put set seem seemed tell told ask show showed shown try work worked call called turn turned move moved live lived believe consider include involve require provide allow help begin start change increase decrease reduce improve develop create produce result occur affect indicate suggest report study research data analysis market consumer product brand company industry global new high low large small different important available recent various several many few first last next other these those each both between through during against under above below within without upon across around along among according due per via vs etc eg ie a an as at by in of on to up off is be it its he she we me my your his their them'.split(' '));
  function toks(t) {
    t = String(t).replace(/<[^>]+>/g, ' ');
    return (t.toLowerCase().match(/[a-z][a-z'-]*/g) || []).filter(w => w.length > 1 && !STOP.has(w));
  }
  const all = new Set();
  (feed.readings || []).forEach(r => {
    const body = Array.isArray(r.body) ? r.body.join(' ') : (r.body || '');
    toks(body).forEach(w => all.add(w));
    (r.vocab || []).forEach(v => { if (v && v.w) all.add(v.w.toLowerCase()); });
  });
  const miss = [...all].filter(w => !words[w] && !glos[w]);
  console.log('缺释义独立单词数:', miss.length);

  const B = 25;
  let added = 0;
  const totalBatches = Math.ceil(miss.length / B);
  for (let i = 0; i < miss.length; i += B) {
    const batch = miss.slice(i, i + B);
    const prompt = `单词列表：${JSON.stringify(batch)}\n请输出 JSON 数组，每个元素含 w/p/t/en。`;
    let ok = false, arr = [];
    for (let a = 0; a < 3 && !ok; a++) {
      try { arr = parseArr(await ask(prompt)); ok = true; }
      catch (e) { console.log(`  批${Math.floor(i / B) + 1}重试${a + 1}: ${e.message.slice(0, 60)}`); await new Promise(r => setTimeout(r, 1500 * (a + 1))); }
    }
    if (ok) {
      arr.forEach(o => {
        if (o && o.w && o.t) {
          const k = String(o.w).toLowerCase();
          if (!glos[k]) { glos[k] = { p: o.p || '', t: o.t, en: o.en || '' }; added++; }
        }
      });
      console.log(`  批${Math.floor(i / B) + 1}/${totalBatches} 累计新增 ${added}`);
    } else console.log(`  批${Math.floor(i / B) + 1} 失败`);
    await new Promise(r => setTimeout(r, 250));
  }
  fs.writeFileSync('data/glossary.json', JSON.stringify(glos, null, 2));
  console.log(`完成：新增 ${added} 词，glossary 总词数 ${Object.keys(glos).length}`);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
