// 把英语阅读里【所有可点击生词】的「音标+英文释义+中文」烘焙成本地词库 data/words.json。
// 正文里每个英文单词都可点击（pages-english.js 第111行），所以这里提取全部单词，而非仅 <u> 词。
// 这样点击任何单词都离线有内容，从根上消灭「点击空白/无音标」。每日流水线会自动运行本脚本。
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const feed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/feed.json'), 'utf-8').replace(/^\uFEFF/, ''));

const words = new Set();
(feed.readings || []).forEach(r => {
  const text = (Array.isArray(r.body) ? r.body.join(' ') : (r.body || '')).replace(/<[^>]+>/g, ' ');
  (text.match(/[A-Za-z][A-Za-z'’-]*/g) || []).forEach(w => words.add(w.toLowerCase()));
  (r.vocab || []).forEach(v => { if (v.w) words.add(v.w.toLowerCase()); });
});

let bank = {};
try { bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/words.json'), 'utf-8')); } catch { }
const zhMap = {};
(feed.readings || []).forEach(r => (r.vocab || []).forEach(v => { if (v.w) zhMap[v.w.toLowerCase()] = v.t || ''; }));

const list = [...words];
let done = 0, missed = 0, skip = 0;
for (const w of list) {
  if (bank[w] && bank[w].ph) { skip++; continue; }
  try {
    const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w), { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) {
      const d = await r.json();
      let ph = '', en = '';
      if (Array.isArray(d) && d[0]) {
        ph = d[0].phonetic || ((d[0].phonetics || []).find(x => x.text) || {}).text || '';
        const m = d[0].meanings && d[0].meanings[0];
        en = (m && m.definitions && m.definitions[0] && m.definitions[0].definition) || '';
      }
      bank[w] = { ph, en, zh: zhMap[w] || (bank[w] && bank[w].zh) || '' };
      done++;
    } else { missed++; }
  } catch { missed++; }
}

fs.writeFileSync(path.join(ROOT, 'data/words.json'), JSON.stringify(bank, null, 2));
console.log(`words.json: 总词 ${Object.keys(bank).length}，本次补全音标 ${done}，跳过已存在 ${skip}，未取到 ${missed}`);
