// 回填脚本：把 feed.json 里「每篇阅读自己存的生词」中文为空的项补全。
// 优先级：glossary.json（DeepSeek 中文词典）→ words.json 的 zh → 仍空则调 DeepSeek 翻译并沉淀进 glossary。
// 目的：让文章数据本身带中文（真正的源头正确），而非依赖前端兜底。
import { translateWords } from './ai-enrich.mjs';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, '');
const readJson = (p) => { try { return JSON.parse(read(p)); } catch (e) { return null; } };
const writeJson = (p, obj) => fs.writeFileSync(path.join(ROOT, p), JSON.stringify(obj, null, 2));

const feed = readJson('data/feed.json');
const words = readJson('data/words.json') || {};
const glossary = readJson('data/glossary.json') || {};

let total = 0, alreadyZh = 0, filledDict = 0, needDeepSeek = 0;
const needList = [];

for (const a of (feed.readings || [])) {
  for (const v of (a.vocab || [])) {
    total++;
    const w = (v.w || '').toLowerCase();
    if (v.t && String(v.t).trim()) { alreadyZh++; continue; }
    // 1) glossary 优先
    const g = glossary[w];
    if (g && g.t && String(g.t).trim()) {
      v.p = v.p || g.p || ''; v.t = g.t; v.en = v.en || g.en || '';
      filledDict++; continue;
    }
    // 2) words.json zh
    const wb = words[w];
    if (wb && wb.zh && String(wb.zh).trim()) {
      v.p = v.p || wb.ph || ''; v.t = wb.zh; v.en = v.en || wb.en || '';
      filledDict++;
      glossary[w] = { p: v.p, t: v.t, en: v.en };
      continue;
    }
    // 3) 待 DeepSeek
    needList.push(v);
  }
}

console.log(`生词总数 ${total}，已有中文 ${alreadyZh}，词典补全 ${filledDict}，待 DeepSeek ${needList.length}`);

if (needList.length) {
  const map = await translateWords(needList.map((v) => v.w));
  for (const v of needList) {
    const r = map[v.w];
    if (r) {
      v.p = v.p || r.p || '';
      v.t = r.t || v.t;
      v.en = v.en || r.en || '';
      const w = v.w.toLowerCase();
      glossary[w] = { p: v.p, t: v.t, en: v.en };
      needDeepSeek++;
    }
  }
  console.log(`DeepSeek 补全 ${needDeepSeek} 个`);
}

writeJson('data/glossary.json', glossary);
writeJson('data/feed.json', feed);

// 最终复验
let stillEmpty = 0;
for (const a of (feed.readings || [])) for (const v of (a.vocab || [])) if (!v.t || !String(v.t).trim()) stillEmpty++;
console.log(`回填完成。feed.json 中生词仍无中文的数量：${stillEmpty}（应为 0）`);
console.log(`glossary 总词数：${Object.keys(glossary).length}`);
