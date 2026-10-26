// 把英语阅读里【所有可点击生词】的「音标+中文释义+英文释义」烘焙成本地词库 data/words.json。
// 正文里每个英文单词都可点击（pages-english.js），所以这里提取全部单词，而非仅 <u> 词。
// 这样点击任何单词都离线有内容，从根上消灭「点击空白 / 无音标」。
//
// 数据来源（全部免费公开，不消耗任何付费额度、不调用 DeepSeek）：
//   1) 已有 data/words.json —— 只增不删，保住历史成果
//   2) 阅读条目自带的 vocab 中文 —— 权威，优先
//   3) 有道免费词典接口 dict.youdao.com/jsonapi —— 中文释义 + 音标（含专有名词）
//   4) 兜底 api.dictionaryapi.dev —— 免费英文释义
// 每日流水线会自动运行本脚本（只补缺口，已完整的不重复请求）。
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const FEED = path.join(ROOT, 'data/feed.json');
const WORDS = path.join(ROOT, 'data/words.json');

const feed = JSON.parse(fs.readFileSync(FEED, 'utf-8').replace(/^\uFEFF/, ''));

// ---- 1) 提取阅读里全部可点击词（弯引号 ’ 统一成直引号 '，与前端一致）----
const words = new Set();
const zhMap = {};
(feed.readings || []).forEach((r) => {
  const text = (Array.isArray(r.body) ? r.body.join('') : String(r.body || '')).replace(/<[^>]+>/g, '');
  (text.match(/[A-Za-z][A-Za-z'\u2019-]*/g) || []).forEach((w) =>
    words.add(w.toLowerCase().replace(/\u2019/g, "'"))
  );
  (r.vocab || []).forEach((v) => {
    if (!v || !v.w) return;
    const k = String(v.w).toLowerCase().replace(/\u2019/g, "'");
    words.add(k);
    if (v.t) zhMap[k] = v.t;
  });
});

// ---- 2) 已有词库：只增不删 ----
let bank = {};
try {
  bank = JSON.parse(fs.readFileSync(WORDS, 'utf-8'));
} catch { }

const normPh = (p) => {
  const s = String(p || '').split(';')[0].trim();
  if (!s) return '';
  return s.startsWith('/') ? s : '/' + s + '/';
};

// 第 3 步：有道免费词典（中文 + 音标）
async function youdao(w) {
  const r = await fetch('https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(w), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!r.ok) return null;
  const d = await r.json();
  const ec = d.ec && d.ec.word && d.ec.word[0];
  const sw = d.simple && d.simple.word && d.simple.word[0];
  const ph = normPh((ec && (ec.usphone || ec.ukphone)) || (sw && (sw.usphone || sw.ukphone || sw.phone)));
  let zh = '';
  if (ec && Array.isArray(ec.trs)) {
    const parts = [];
    for (const t of ec.trs) {
      const tr = (t.tr || [])[0];
      const items = (tr && tr.l && tr.l.i) || [];
      if (items.length) parts.push(items.slice(0, 3).join('；'));
      if (parts.join('；').length > 90) break;
    }
    zh = parts.join('；');
  }
  if (!zh) {
    // 简易词典兜底字段
    const sl = d.simple && d.simple.word && d.simple.word[0] && d.simple.word[0].trs;
    if (sl) zh = String(sl).slice(0, 60);
  }
  if (zh.length > 110) zh = zh.slice(0, 108) + '…';
  if (!ph && !zh) return null;
  return { ph, zh };
}

// 第 4 步：免费在线英文词典兜底
async function dictApi(w) {
  const r = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(w), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!r.ok) return null;
  const d = await r.json();
  if (!Array.isArray(d) || !d[0]) return null;
  const ph = (d[0].phonetic || ((d[0].phonetics || []).find((x) => x.text) || {}).text || '');
  const m = d[0].meanings && d[0].meanings[0];
  const en = (m && m.definitions && m.definitions[0] && m.definitions[0].definition) || '';
  if (!ph && !en) return null;
  return { ph: normPh(ph), en };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 找出缺口：缺中文释义的才算缺口（有音标但没中文也要补）----
const list = [...words];
const todo = list.filter((w) => {
  const b = bank[w];
  const hasZh = (b && b.zh && String(b.zh).trim()) || zhMap[w];
  return !hasZh;
});

console.log(`词库烘焙：正文可点击词 ${list.length} 个，其中缺中文释义待补 ${todo.length} 个`);

let okYd = 0, okDict = 0, fail = 0, done = 0;
const CONC = 4;

async function worker(queue) {
  while (queue.length) {
    const w = queue.shift();
    let got = null;
    for (let attempt = 0; attempt < 2 && !got; attempt++) {
      try {
        got = await youdao(w);
      } catch { got = null; }
      if (!got) await sleep(300 + Math.random() * 300);
    }
    let extra = null;
    if (!got || !got.ph) {
      try { extra = await dictApi(w); } catch { extra = null; }
    }
    const prev = bank[w] || {};
    const merged = {
      ph: (got && got.ph) || (extra && extra.ph) || prev.ph || '',
      en: prev.en || (extra && extra.en) || '',
      zh: zhMap[w] || (got && got.zh) || prev.zh || '',
    };
    if (merged.ph || merged.en || merged.zh) {
      bank[w] = merged;
      if (got && got.zh) okYd++; else if (extra && (extra.ph || extra.en)) okDict++;
    } else {
      fail++;
    }
    done++;
    if (done % 100 === 0) console.log(`  ...已处理 ${done}/${todo.length}`);
    await sleep(80 + Math.random() * 120);
  }
}

const queue = [...todo];
await Promise.all(Array.from({ length: CONC }, () => worker(queue)));

fs.writeFileSync(WORDS, JSON.stringify(bank, null, 2));
console.log(`words.json: 总词条 ${Object.keys(bank).length}，本次有道补上 ${okYd}，英文词典兜底 ${okDict}，仍无结果 ${fail}`);
