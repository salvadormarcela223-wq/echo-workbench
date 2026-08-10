// 一次性补漏：给 feed.json 中「生词中文释义(t)为空」的条目补全中文（调 DeepSeek）。
// 同时沉淀进 glossary.json，避免重复消耗 token。仅填充空字段，绝不覆盖已有内容。
import fs from 'fs';
import path from 'path';
import { translateWords } from './ai-enrich.mjs';

const ROOT = process.cwd();
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } };
const writeJson = (p, o) => fs.writeFileSync(path.join(ROOT, p), JSON.stringify(o, null, 2));

const feed = readJson('data/feed.json');
const glossary = readJson('data/glossary.json') || {};
const readings = feed.readings || [];

// 收集所有缺中文(t)的生词（去重）
const needByWord = new Map();
for (const a of readings) {
  for (const v of (a.vocab || [])) {
    if (!v.t || !String(v.t).trim()) {
      const w = String(v.w).toLowerCase();
      if (!needByWord.has(w)) needByWord.set(w, v);
    }
  }
}
const words = [...needByWord.keys()];
console.log(`缺中文释义的生词总数：${words.length}`);

// 分批翻译（每批 ~70 词，避免单次 prompt 过大）
const BATCH = 70;
for (let i = 0; i < words.length; i += BATCH) {
  const chunk = words.slice(i, i + BATCH);
  const map = await translateWords(chunk);
  let filled = 0;
  for (const w of chunk) {
    const r = map[w];
    const v = needByWord.get(w);
    if (r && r.t) {
      v.p = v.p || r.p || '';
      v.t = r.t;
      v.en = v.en || r.en || '';
      glossary[w] = { p: v.p, t: v.t, en: v.en };
      filled++;
    }
  }
  console.log(`  批次 ${Math.floor(i / BATCH) + 1}：翻译 ${chunk.length} 词，成功补全 ${filled} 个`);
}

// 回写 feed.json（只动了 vocab 的 t/p/en，正文/cn 等原样保留）
writeJson('data/feed.json', feed);
writeJson('data/glossary.json', glossary);

const stillEmpty = readings.reduce((n, a) => n + (a.vocab || []).filter(v => !v.t || !String(v.t).trim()).length, 0);
console.log(`\n完成。仍缺中文的生词：${stillEmpty}（应为 0）`);
