// 英语阅读「每日自动更新」流水线
// 从多维度英文信源抓最新**完整文章**(非摘要) -> 自动标生词(本地词库优先 + DeepSeek 补中文释义) -> 写回 feed。
// 设计原则：
//   ① 内容多维(心理/科学/文化/科技/社会…)；② 每天从各源各抓 1 篇（5 源 = 5 篇，天然维持 Mix1 的 1专业:4通识 占比）；
//   ③ 全部自动抓取，**绝不手写/保留任何手写文章**（用户硬性要求：readings 必须为自动抓取内容）；
//   ④ 生词必须有音标/中文释义/英文释义之一（本地词库优先，词库没有的用 DeepSeek 补，并回写词库）；
//   ⑤ **必须抓完整文章正文（≥400 词），不能只拿 RSS 摘要。**
import fs from 'fs';
import path from 'path';
import { translateWords, translateFullText, extractPhrases } from './ai-enrich.mjs';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, '');
function readJson(p) { try { return JSON.parse(read(p)); } catch (e) { return null; } }
function writeJson(p, obj) { fs.writeFileSync(path.join(ROOT, p), JSON.stringify(obj, null, 2)); }

// 双字典合并：words.json（本地烘焙）+ glossary.json（DeepSeek 批量补全的中文词典）
// glossary 中文优先，专门填补 words.json 中 zh 为空的词（从源头避免生词带空中文）
function loadWords() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data/words.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { return {}; }
}
function loadGlossary() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data/glossary.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { return {}; }
}
function loadBank() {
  const w = loadWords();
  const g = loadGlossary();
  const merged = {};
  const merge = (k, wb, gb) => { merged[k] = { ph: (wb && wb.ph) || (gb && gb.p) || '', zh: (wb && wb.zh && wb.zh.trim()) ? wb.zh : ((gb && gb.t) || ''), en: (wb && wb.en) || (gb && gb.en) || '' }; };
  for (const k in w) merge(k, w[k], g[k]);
  for (const k in g) if (!merged[k]) merge(k, null, g[k]);
  return merged;
}

// 稳定 id：由链接/标题派生，保证手机与电脑两端对同一条文章识别一致（已读状态才能同步）
function stableId(link) {
  let h = 0;
  const s = String(link || '');
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return 'r-' + h.toString(36);
}

// 常见高频词过滤（约 200 个，避免把 the/been/world 之类标成生词）
const STOP = new Set(('the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is are was were been being has had does did shall should may might must would could once more very really still let end put things world life hand part child eye woman man place case company group number right study government water school state family student country problem system program question house service friend father mother brother sister son daughter night morning evening week month car food money home city book word story fact head foot face heart mind soul spirit body letter name person children baby boy girl men women husband wife parent kid team player game sport music song art film show picture color light dark red blue green yellow white black fire earth air wind rain snow sun moon star sky sea river mountain tree plant animal dog cat bird fish flower grass leaf wood stone metal gold silver iron steel glass paper cloth pen pencil table chair door window roof wall floor road street town village room bed sleep dream wake live die born grow old young big small long short wide tall high low hot cold warm cool fast slow quick quiet loud soft hard easy difficult rich poor free busy open close win lose buy sell pay cost price value true false yes no never always often sometimes rarely maybe perhaps probably certainly sure clear clean dirty wet dry happy sad angry afraid tired hungry peace war love hate fear hope wish need help hurt heal').split(/\s+/).filter(Boolean));

function dec(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}
function stripHtml(s) {
  return dec(String(s || ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// Google News 代理源的 <link> 是 news.google.com 跳转地址，必须解成真实文章网址才能抓正文
async function resolveRealUrl(url) {
  if (!url || !/news\.google\.com/.test(url)) return url;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Accept': 'text/html,*/*' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (r.url && r.url !== url && !/news\.google\.com/.test(r.url)) return r.url;
    return url;
  } catch (e) { return url; }
}

async function fetchText(url, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, timeoutMs);
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; }
  finally { clearTimeout(t); }
}

// ═══════════════════════════════════════════════════
//  从文章原文网页抓取完整正文（非 RSS 摘要）
//  多策略提取：article 标签 → 常见内容 class → schema.org → 启发式最长块
// ═══════════════════════════════════════════════════
const CONTENT_SELECTORS = [
  'article',                           // HTML5 <article>
  '[role="article"]',                  // ARIA role
  '.article-body', '.post-content',   // 常见 CMS
  '.entry-content', '.content-body',
  '.article__body', '.post-body',
  '.story-body', '.article-content',
  '#article-body',
  // 特定网站
  '.article-text',                    // Aeon/Psyche
  '.wysiwyg--article',                // Wired
  '.body__inner-container',           // Nature
  '.c-article-body',                  // Vox
  '.content__article-body',           // Guardian
];

function extractArticleHtml(html) {
  // 策略1: <article> 标签
  let m = html.match(/<article[\s\S]*?<\/article>/i);
  if (m && m[0].length > 500) return cleanArticleHtml(m[0]);

  // 策略2: 常见内容选择器（用正则模拟 DOM 查询）
  for (const sel of CONTENT_SELECTORS) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      // 匹配 class 包含该名称的 div/section/main
      const re = new RegExp('<(?:div|section|main|aside)[^>]*class="[^"]*\\b' + cls + '\\b[^"]*"[^>]*>([\\s\\S]{200,})<\\/\\1>', 'i');
      m = html.match(re);
      if (m && m[0].length > 500) return cleanArticleHtml(m[0]);
    }
  }

  // 策略3: schema.org Article 或 NewsArticle 的 articleBody
  m = html.match(/"articleBody"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m && m[1].length > 300) return m[1].replace(/\\n/g, '\n');

  // 策略4: 启发式——找包含最多 <p> 标签的容器
  const blocks = html.match(/<(?:div|section|main)[^>]*>([\s\S]{300,}?)<\/\1>/gi) || [];
  let best = '', bestScore = 0;
  for (const block of blocks) {
    const pCount = (block.match(/<p[\s>]/g) || []).length;
    const textLen = stripHtml(block).length;
    const score = pCount * 10 + textLen;
    if (score > bestScore) { bestScore = score; best = block; }
  }
  if (best.length > 500) return cleanArticleHtml(best);

  return null;
}

function cleanArticleHtml(html) {
  // 去掉 script/style/nav/header/footer/sidebar/广告等噪音
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<figure[\s\S]*?<\/figure>/gi, '')       // 图片说明等
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/class="[^"]*(?:share|social|related|comment|newsletter|ad|promo|subscription|signup)[^"]*"[^>]*>[\s\S]*?<\/(div|span|ul|li)>/gi, '');
  return out;
}

async function fetchFullArticle(articleUrl, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) { console.log('    ↻ 重试(', attempt + 1, '/2)...'); await new Promise(r => setTimeout(r, 3000)); }
    console.log('    ↳ 抓取原文:', articleUrl.slice(0, 80));
    const html = await fetchText(articleUrl, timeoutMs);
    if (!html) continue;

    const extracted = extractArticleHtml(html);
    if (!extracted) {
      console.log('    ⚠️ 无法从页面提取正文');
      continue;
    }

    const plain = stripHtml(extracted);
    const wordCount = plain.split(/\s+/).filter(Boolean).length;
    if (wordCount < 400) {
      console.log('    ⚠️ 正文过短(', wordCount, '词)，丢弃');
      continue;
    }

    console.log('    ✓ 提取到完整正文:', wordCount, '词');
    return plain;
  }
  return null;
}

// 同时支持 RSS(<item>) 与 Atom(<entry>)；Atom 的 <link href="..."> 也要解析
function parseItems(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks) {
    const g = (tag) => { const rr = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i'); const mm = block.match(rr); return mm ? mm[1] : ''; };
    let title = stripHtml(g('title'));
    let link = dec(stripHtml(g('link') || g('guid'))).trim();
    if (!link) { const lm = block.match(/<link[^>]+href="([^"]+)"/i); if (lm) link = lm[1].trim(); }
    const desc = stripHtml(g('description') || g('content:encoded') || g('content') || g('summary'));
    const pub = (g('pubDate') || g('dc:date') || g('updated') || g('published') || '').trim();
    if (title && link) items.push({ title, link, desc, pub });
  }
  return items;
}

// 从正文抽生词，先用本地词库填 p/t/en
function buildVocab(text, bank) {
  const raw = text.match(/[A-Za-z][A-Za-z'-]{4,}/g) || [];
  const seen = new Set();
  const out = [];
  raw.forEach((tok, idx) => {
    const ww = tok.toLowerCase().replace(/[^a-z]/g, '');
    if (ww.length < 5) return;
    if (STOP.has(ww)) return;
    if (/^[A-Z]/.test(tok) && idx > 0) return; // 跳过句中专有名词
    if (seen.has(ww)) return;
    seen.add(ww);
    const wb = bank[ww];
    out.push({ w: ww, p: (wb && wb.ph) || '', t: (wb && wb.zh) || '', en: (wb && wb.en) || '', lv: '阅读生词' });
    if (out.length >= 30) return;
  });
  return out;
}

// 生词只要缺中文就调 DeepSeek 补（含「有英文没中文」的词，从源头消除空中文）
// 补完同时沉淀进 glossary.json（全局复用，下次不再重复调用 DeepSeek）
async function enrichVocab(vocab, bank, glossary) {
  const need = vocab.filter((v) => !v.t || !v.t.trim());
  if (!need.length) return;
  const map = await translateWords(need.map((v) => v.w));
  need.forEach((v) => {
    const r = map[v.w];
    if (r) {
      v.p = v.p || r.p || '';
      v.t = r.t || v.t;
      v.en = v.en || r.en || '';
      if (glossary) glossary[v.w] = { p: v.p, t: v.t, en: v.en };
    }
  });
}

function buildBody(text, vocab) {
  // 完整文章：最多 30 段（约 1500–2500 词的量）；短文保持原逻辑
  const paras = String(text || '').split(/\n+/).filter((p) => p.trim().length > 40);
  const maxParas = Math.min(paras.length, paras.length > 10 ? 30 : 8);
  let body = paras.slice(0, maxParas).map((p) => '<p>' + p.trim() + '</p>').join('\n');
  for (const v of vocab) {
    const re = new RegExp('\\b(' + v.w + ')\\b', 'gi');
    body = body.replace(re, '<u>' + '$1' + '</u>');
  }
  return body.split('\n').filter(Boolean); // 数组：前端直接 join，避免字符串 .join() 崩溃
}

const DRY = process.argv.includes('--dry');
const USE_DRAFT = process.argv.includes('--draft');
const MAX_AUTO = 14;

function readFeed() {
  if (USE_DRAFT) { try { return JSON.parse(read('data/feed-draft.json')); } catch (e) { } }
  return readJson('data/feed.json') || {};
}
function writeFeed(feed) {
  if (USE_DRAFT) writeJson('data/feed-draft.json', feed);
  else writeJson('data/feed.json', feed);
}

async function main() {
  const cfg = readJson('data/reading-sources.json');
  if (!cfg || !cfg.sources) { console.error('X 未找到 data/reading-sources.json'); process.exit(1); }
  const bank = loadBank();
  const glossary = loadGlossary();
  const feed = readFeed();
  let readings = feed.readings || [];
  // 全部自动抓取：不保留任何手写(curated)文章；无 id 的补稳定 id（跨设备状态可对应）
  readings.forEach((r) => { if (!r.id) r.id = stableId(r.link || r.title); });
  const auto = readings;
  const seen = new Set(auto.map((r) => r.link).filter(Boolean));

  const candidates = [];
  for (let si = 0; si < cfg.sources.length; si++) {
    const src = cfg.sources[si];
    // 防限流：每个信源之间等 2 秒
    if (si > 0) { await new Promise(r => setTimeout(r, 2000)); }
    const xml = await fetchText(src.url);
    if (!xml) { console.log('  - 跳过 ' + src.name + '：抓取失败'); continue; }
    const items = parseItems(xml);
    let pick = null;
    for (const it of items) {
      if (seen.has(it.link)) continue;
      if (it.desc.length < 10) continue;   // 仅跳过空摘要；正文长度由后续全文抓取 + 400 词门槛把关（避免误杀 Vox 等短摘要长正文源）
      pick = it; break;
    }
    if (!pick) { console.log('  - ' + src.name + '：暂无新文章'); continue; }

    // ★ 核心改动：去原文网页抓完整正文，不再只用 RSS 摘要
    let fullText = null;
    pick.link = await resolveRealUrl(pick.link);   // 解 Google News 跳转 -> 真实文章网址
    if (pick.link && !pick.link.startsWith('data:')) {
      fullText = await fetchFullArticle(pick.link);
    }
    // 如果全文抓取失败，回退到 RSS 摘要（但标记为短文）
    const articleText = fullText || stripHtml(pick.desc).replace(/\n{2,}/g, '\n').trim();
    const wordCount = articleText.split(/\s+/).filter(Boolean).length;

    // 质量门槛：正文少于 400 词的不要（除非是 curated 手写精选）
    if (!fullText && wordCount < 400) {
      console.log('  - ' + src.name + '：「' + pick.title.slice(0, 30) + '」仅', wordCount, '词，跳过');
      continue;
    }

    const vocab = buildVocab(articleText, bank);
    await enrichVocab(vocab, bank, glossary);
    let cn = '', phrases = [];
    try {
      if (articleText.length >= 20) {
        cn = await translateFullText(articleText);
        phrases = await extractPhrases(articleText);
        console.log('  ✓ 已生成中文翻译(' + cn.length + '字)与地道表达(' + phrases.length + '个)');
      }
    } catch (e) {
      console.log('  ! 翻译失败: ' + e.message);
    }
    const entry = {
      id: stableId(pick.link),
      title: pick.title,
      source: src.name,
      tag: src.tag,
      cat: src.cat,
      curated: false,
      link: pick.link,
      date: pick.pub || new Date().toISOString().slice(0, 10),
      body: buildBody(articleText, vocab),
      cn: cn,
      phrases: phrases,
      minutes: Math.max(5, Math.min(15, Math.round(wordCount / 180))),  // 按实际词数估算阅读时间
      vocab: vocab,
    };
    candidates.push({ src: src.name, entry: entry });
  }

  // 每个信源各取 1 篇（5 源 = 5 篇，天然维持 Mix1 的 1专业:4通识 占比）
  candidates.sort((a, b) => (b.entry.date || '').localeCompare(a.entry.date || ''));
  const add = candidates.slice(0, cfg.sources.length);
  for (const c of add) {
    auto.unshift(c.entry);
    seen.add(c.entry.link);
    const filled = c.entry.vocab.filter((v) => v.t || v.en || v.p).length;
    console.log('  + 新增阅读「' + c.entry.title + '」(' + c.src + ')，生词 ' + c.entry.vocab.length + ' 个，含释义 ' + filled + ' 个');
  }
  while (auto.length > MAX_AUTO) auto.pop();

  feed.readings = auto;
  // 回写全局中文词典（累积每日新词，下次复用、省 token；words.json 保持原样由 glossary 兜底）
  writeJson('data/glossary.json', glossary);

  if (DRY) {
    console.log('\n[DRY] 将写入 ' + add.length + ' 篇新阅读；auto=' + auto.length);
  } else {
    writeFeed(feed);
    console.log('\nOK 已写回：auto=' + auto.length + ', 今日新增=' + add.length);
  }
}
main();
