// 英语阅读「每日自动更新」流水线
// 从多维度英文信源抓取最新真实文章 -> 转成阅读条目(自动标生词) -> 写出 feed.json
// 设计原则：① 内容多维(科技/商业/文化/心理/科学/社会)；② 每天至少新增 1 篇；③ 不覆盖手写精选(标记 curated)
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^﻿/, '');
function readJson(p) {
  try { return JSON.parse(read(p)); } catch (e) { return null; }
}
function writeJson(p, obj) {
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(obj, null, 2));
}

// 常见词过滤：这些词不标成生词（约 260 个最高频词）
const STOP = new Set('the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is are was were been being have has had do does did shall should may might must will would could would than then once more very really still let men end put things world life hand part child eye woman man place case company group number right study government water school state family student country problem system program question woman house service friend father mother brother sister son daughter night morning evening week month car food money home city book word story fact head foot hand foot back front left right top bottom side face hand heart mind soul spirit body word letter name person people child children baby boy girl man woman men women husband wife parent kid baby team player game sport music song art film show picture color light dark red blue green yellow white black water fire earth air wind rain snow sun moon star sky sea river mountain tree plant animal dog cat bird fish tree flower grass leaf wood stone metal gold silver iron steel glass paper cloth book pen pencil table chair door window roof wall floor road street city town village house room bed sleep dream wake live die born grow old young big small long short wide tall high low hot cold warm cool fast slow quick quiet loud soft hard easy difficult rich poor free busy open close win lose buy sell pay cost price value true false yes no not never always often sometimes rarely maybe perhaps probably certainly sure certain clear clean dirty wet dry happy sad angry afraid tired hungry thirst peace war love hate fear hope wish need help hurt heal build break send receive hold carry move stop start begin finish learn teach know understand believe doubt think feel sense hear see smell taste touch speak talk listen read write draw paint sing play work rest wait walk run jump fly fall rise set shine burn grow bend stretch press pull push lift drop throw catch keep lose find miss lose gain win lose change stay remain leave return arrive enter exit pass fail succeed try attempt effort energy power force speed weight mass volume area length width height depth time space moment memory dream goal plan idea thought reason cause result effect fact truth lie story news information data knowledge skill talent gift chance luck fate destiny nature world universe life death birth age youth health disease pain pleasure joy sorrow grief comfort pain'.split(/\s+/).filter(Boolean));

function dec(s) {
  return String(s || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
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

function parseItems(xml) {
  const items = [];
  const re = /<item[\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[0];
    const g = function (tag) {
      const rr = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i');
      const mm = block.match(rr);
      return mm ? mm[1] : '';
    };
    const title = stripHtml(g('title'));
    const link = dec(stripHtml(g('link') || g('guid'))).trim();
    const desc = stripHtml(g('description') || g('content:encoded') || g('summary'));
    const pub = (g('pubDate') || g('dc:date') || '').trim();
    if (title && link) items.push({ title: title, link: link, desc: desc, pub: pub });
  }
  return items;
}

function detectVocab(text) {
  const raw = text.match(/[A-Za-z][A-Za-z'-]{4,}/g) || [];
  const seen = new Set();
  const out = [];
  raw.forEach(function (tok, idx) {
    const ww = tok.toLowerCase().replace(/[^a-z]/g, '');
    if (ww.length < 5) return;
    if (STOP.has(ww)) return;
    // 跳过专有名词（首字母大写且非句首），减少人名地名噪音
    if (/^[A-Z]/.test(tok) && idx > 0) return;
    if (seen.has(ww)) return;
    seen.add(ww);
    out.push({ w: ww, p: '', t: '', en: '', lv: '阅读生词' });
    if (out.length >= 14) return;
  });
  return out;
}

function buildBody(text, vocab) {
  const paras = text.split(/\n+/).filter(function (p) { return p.trim().length > 40; }).slice(0, 4);
  let body = paras.map(function (p) { return '<p>' + p.trim() + '</p>'; }).join('\n');
  for (const v of vocab) {
    const re = new RegExp('\\b(' + v.w + ')\\b', 'i');
    if (re.test(body)) body = body.replace(re, '<u>' + '$1' + '</u>');
  }
  return body;
}

const DRY = process.argv.includes('--dry');
const MAX_AUTO = 14;

async function main() {
  const cfg = readJson('data/reading-sources.json');
  if (!cfg || !cfg.sources) { console.error('X 未找到 data/reading-sources.json'); process.exit(1); }

  const feed = readJson('data/feed.json') || {};
  let readings = feed.readings || [];
  // 迁移：首次运行时把现有（手写）阅读标记为 curated，避免被滚动窗口清掉
  if (!readings.some(function (r) { return 'curated' in r; })) {
    readings.forEach(function (r) { r.curated = true; });
  }
  const curated = readings.filter(function (r) { return r.curated; });
  const auto = readings.filter(function (r) { return !r.curated; });
  const seen = new Set(auto.map(function (r) { return r.link; }).filter(Boolean));

  const candidates = [];
  for (const src of cfg.sources) {
    const xml = await fetchText(src.url);
    if (!xml) { console.log('  - 跳过 ' + src.name + '：抓取失败'); continue; }
    const items = parseItems(xml);
    let pick = null;
    for (const it of items) {
      if (seen.has(it.link)) continue;
      if (curated.some(function (c) { return c.link === it.link; })) continue;
      if (it.desc.length < 120) continue;
      pick = it; break;
    }
    if (!pick) { console.log('  - ' + src.name + '：暂无新文章'); continue; }
    const vocab = detectVocab(pick.desc);
    const entry = {
      title: pick.title,
      source: src.name,
      tag: src.tag,
      cat: src.cat,
      curated: false,
      link: pick.link,
      date: pick.pub || new Date().toISOString().slice(0, 10),
      body: buildBody(pick.desc, vocab),
      vocab: vocab,
    };
    candidates.push({ src: src.name, entry: entry });
  }

  // 每天最多新增 2 篇（保证「每天更新」且不过载）
  candidates.sort(function (a, b) { return (b.entry.date || '').localeCompare(a.entry.date || ''); });
  const add = candidates.slice(0, 2);
  for (const c of add) {
    auto.unshift(c.entry);
    seen.add(c.entry.link);
    console.log('  + 新增阅读「' + c.entry.title + '」(' + c.src + ')，生词 ' + c.entry.vocab.length + ' 个');
  }
  while (auto.length > MAX_AUTO) auto.pop();

  feed.readings = curated.concat(auto);
  if (DRY) {
    console.log('\n[DRY] 将写入 ' + add.length + ' 篇新阅读；curated=' + curated.length + ', auto=' + auto.length);
    console.log(JSON.stringify(add.length ? add[0].entry : {}, null, 2).slice(0, 900));
  } else {
    writeJson('data/feed.json', feed);
    console.log('\nOK 已写回 data/feed.json：curated=' + curated.length + ', auto=' + auto.length + ', 今日新增=' + add.length);
  }
}
main();
