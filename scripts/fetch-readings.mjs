// 英语阅读「每日自动更新」流水线
// 从多维度英文信源抓最新真实文章 -> 自动标生词(本地词库优先 + DeepSeek 补中文释义) -> 写回 feed。
// 设计原则：
//   ① 内容多维(心理/科学/文化/科技/社会…)；② 每天至少新增 1 篇；③ 不覆盖手写精选(标记 curated)；
//   ④ 生词必须有音标/中文释义/英文释义之一（本地词库优先，词库没有的用 DeepSeek 补，并回写词库）。
import fs from 'fs';
import path from 'path';
import { translateWords, translateFullText, extractPhrases } from './ai-enrich.mjs';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, '');
function readJson(p) { try { return JSON.parse(read(p)); } catch (e) { return null; } }
function writeJson(p, obj) { fs.writeFileSync(path.join(ROOT, p), JSON.stringify(obj, null, 2)); }

// 本地烘焙词库（words.json: { word:{ ph, zh, en } }）
function loadBank() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data/words.json'), 'utf8').replace(/^﻿/, '')); } catch (e) { return {}; }
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

async function fetchText(url, timeoutMs) {
  timeoutMs = timeoutMs || 12000;
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EchoWorkbench/1.0; +rss-reader)' },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) { return null; }
  finally { clearTimeout(t); }
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
    if (out.length >= 14) return;
  });
  return out;
}

// 本地词库无中文/英文释义的生词，调 DeepSeek 批量补，并回写词库（下次快查、省 token）
async function enrichVocab(vocab, bank) {
  const need = vocab.filter((v) => !v.t && !v.en);
  if (!need.length) return;
  const map = await translateWords(need.map((v) => v.w));
  need.forEach((v) => {
    const r = map[v.w];
    if (r) {
      v.p = r.p || v.p; v.t = r.t || v.t; v.en = r.en || v.en;
      bank[v.w] = { ph: v.p, zh: v.t, en: v.en };
    }
  });
}

function buildBody(text, vocab) {
  const paras = String(text || '').split(/\n+/).filter((p) => p.trim().length > 40).slice(0, 4);
  let body = paras.map((p) => '<p>' + p.trim() + '</p>').join('\n');
  for (const v of vocab) {
    const re = new RegExp('\\b(' + v.w + ')\\b', 'i');
    if (re.test(body)) body = body.replace(re, '<u>' + '$1' + '</u>');
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
  const feed = readFeed();
  let readings = feed.readings || [];
  // 迁移：首次运行时把现有（手写）阅读标记为 curated，避免被滚动窗口清掉；无 id 的补稳定 id（跨设备状态可对应）
  if (!readings.some((r) => 'curated' in r)) readings.forEach((r) => { r.curated = true; });
  readings.forEach((r) => { if (!r.id) r.id = stableId(r.link || r.title); });
  const curated = readings.filter((r) => r.curated);
  const auto = readings.filter((r) => !r.curated);
  const seen = new Set(auto.map((r) => r.link).filter(Boolean));

  const candidates = [];
  for (const src of cfg.sources) {
    const xml = await fetchText(src.url);
    if (!xml) { console.log('  - 跳过 ' + src.name + '：抓取失败'); continue; }
    const items = parseItems(xml);
    let pick = null;
    for (const it of items) {
      if (seen.has(it.link)) continue;
      if (curated.some((c) => c.link === it.link)) continue;
      if (it.desc.length < 60) continue;
      pick = it; break;
    }
    if (!pick) { console.log('  - ' + src.name + '：暂无新文章'); continue; }
    const vocab = buildVocab(pick.desc, bank);
    await enrichVocab(vocab, bank);
    const plain = String(pick.desc || '').replace(/<[^>]+>/g, '').replace(/\n{2,}/g, '\n').trim();
    let cn = '', phrases = [];
    try {
      if (plain && plain.length >= 20) {
        cn = await translateFullText(plain);
        phrases = await extractPhrases(plain);
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
      body: buildBody(pick.desc, vocab),
      cn: cn,
      phrases: phrases,
      minutes: Math.max(3, Math.min(10, Math.round(String(pick.desc || '').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length / 120))),
      vocab: vocab,
    };
    candidates.push({ src: src.name, entry: entry });
  }

  // 每天最多新增 2 篇（保证「每天更新」且不过载）
  candidates.sort((a, b) => (b.entry.date || '').localeCompare(a.entry.date || ''));
  const add = candidates.slice(0, 2);
  for (const c of add) {
    auto.unshift(c.entry);
    seen.add(c.entry.link);
    const filled = c.entry.vocab.filter((v) => v.t || v.en || v.p).length;
    console.log('  + 新增阅读「' + c.entry.title + '」(' + c.src + ')，生词 ' + c.entry.vocab.length + ' 个，含释义 ' + filled + ' 个');
  }
  while (auto.length > MAX_AUTO) auto.pop();

  feed.readings = curated.concat(auto);
  // 回写词库（累积新词，下次不重复调用 DeepSeek）
  writeJson('data/words.json', bank);

  if (DRY) {
    console.log('\n[DRY] 将写入 ' + add.length + ' 篇新阅读；curated=' + curated.length + ', auto=' + auto.length);
  } else {
    writeFeed(feed);
    console.log('\nOK 已写回：curated=' + curated.length + ', auto=' + auto.length + ', 今日新增=' + add.length);
  }
}
main();
