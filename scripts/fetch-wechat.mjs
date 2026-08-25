// 每日自动抓取：搜狗微信搜索 → 抓电子烟行业公众号文章 → 追加进 feed-draft.json 的 news。
// 好处：全自动、零服务器、零微信登录，直接复用现有 daily-pipeline 的 AI 解读(impact)与质检闸门。
// 用法：
//   node scripts/fetch-wechat.mjs          # 只解析并打印（不写文件），用于验证
//   node scripts/fetch-wechat.mjs --write  # 追加进 feed-draft.json（由 daily-pipeline 调用）
import fs from 'fs';
import path from 'path';
import { validate } from './validate-feed.mjs';

const ROOT = path.resolve('.');
const DRAFT = path.join(ROOT, 'data/feed-draft.json');
const LIVE = path.join(ROOT, 'data/feed.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const WRITE = process.argv.includes('--write');

// 覆盖你常看的电烟行业公众号 + 通用行业词
const QUERIES = ['电子烟', '雾化', '蓝洞新消费', '格物消费', '2firsts', '思摩尔', '悦刻', '电子烟 出海', 'PMTA', '雾化器', '电子雾圈', '维思雾化出海', '雾谷圈', '雾化派', '一色观察', '反常识研究所', '蒸汽新消费', '电子烟资讯', '电子烟在线', '雾化新势力', '雾化观察', '电子雾化资讯', '雾次方', 'Steve全球雾化观察局'];
const INDUSTRY = /电子烟|雾化|烟油|PMTA|烟草|合规|门店|渠道|出海|代工|悦刻|思摩尔|FEELM|蓝洞|格物|2firsts|vape|vaping|新型烟草|加热不燃烧|HNB|烟弹|雾化器|国标|监管|RELX|思摩尔国际|新消费/i;
const ACCOUNT_OK = /蓝洞|格物|2firsts|雾次方|合普|FEELM|思摩尔|悦刻|电子烟|雾化|vape|vaping|新势力|新消费|电子雾圈|维思雾化出海|雾谷圈|雾化派|一色观察|反常识研究所|电子烟资讯|电子烟在线|蒸汽新消费/i;
const ACCOUNT_BLOCK = /禁毒|绿剑|公安|警方|健康科普|生活|情感|酸菜|四十七度|翠花|育儿|美食|时尚|八卦|娱乐|养生|人民日报|央视|新华/i; // 非行业媒体直接排除
const HARD = /PMTA|门店|渠道|代工|出海|合规|国标|思摩尔|悦刻|RELX|FEELM|蓝洞|格物|2firsts|雾次方|合普|烟油|雾化器|烟弹|新型烟草|加热不燃烧|市场份额|经销商|融资|招股|财报|产能|供应链|零售|监管|政策/i; // 硬行业词，非行业媒体号命中也可保留
const SOCIAL = /死缓|血案|杀害|身亡|致死|吸毒|毒品犯罪|家庭纠纷/i; // 社会/法制新闻排除
const RECENT_DAYS = 30;

function clean(s) {
  return (s || '')
    .replace(/<!--red_beg-->/g, '').replace(/<!--red_end-->/g, '')
    .replace(/<em>/g, '').replace(/<\/em>/g, '')
    .replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“')
    .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
async function getText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' }, redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.text();
}
function tsOf(html) {
  const m = html.match(/timeConvert\('(\d+)'\)/);
  return m ? +m[1] * 1000 : 0;
}

async function search(q) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = 'https://weixin.sogou.com/weixin?type=2&query=' + encodeURIComponent(q);
    let html = '';
    try { html = await getText(url); }
    catch (e) {
      if (attempt === 2) { console.log(`  · 搜「${q}」网络失败: ${e.message}`); return []; }
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    if (/验证码|访问过于频繁|antipat/.test(html)) {
      if (attempt === 2) { console.log(`  ⚠️ 搜狗频限，跳过「${q}」（下次运行会补）`); return []; }
      console.log(`  · 搜「${q}」频限，${5 * (attempt + 1)}s 后重试(${attempt + 1}/3)...`);
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    const out = [];
    const blocks = html.split(/<li id="sogou_vr_11002601_box_/).slice(1);
    for (const b of blocks) {
      try {
        const aTag = b.match(/<a[^>]*uigs="article_title_\d+"[^>]*>/);
        if (!aTag) continue;
        const hm = aTag[0].match(/href="([^"]+)"/);
        const href = hm ? hm[1] : '';
        const ttm = b.match(/uigs="article_title_\d+"[^>]*>([\s\S]*?)<\/a>/);
        const title = ttm ? clean(ttm[1]) : '';
        if (!title || !href) continue;
        const sa = b.match(/class="txt-info"[^>]*>([\s\S]*?)<\/p>/);
        const summary = sa ? clean(sa[1]) : '';
        const na = b.match(/class="all-time-y2">([^<]+)<\/span>/);
        const account = na ? clean(na[1]) : '微信公众号';
        const ts = tsOf(b);
        out.push({ title, href, summary, account, ts });      } catch (e) { /* 单条失败忽略 */ }
    }
    return out;
  }
  return [];
}

// 解析搜狗中转链接 → 公众号原文链接（搜狗中转有时效/反爬会失效，原文 mp.weixin.qq.com/s/ 长期有效；解析不到返回空，由上层丢弃，绝不让坏链接进库）
async function resolveReal(sogouLink) {
  try {
    const r = await fetch(sogouLink, { headers: { 'User-Agent': UA, 'Referer': 'https://weixin.sogou.com/' }, redirect: 'follow' });
    if (r.url && /mp\.weixin\.qq\.com\/s\//.test(r.url)) return r.url;
  } catch (e) { }
  return '';
}

(async () => {
  console.log('===== 微信资讯抓取（搜狗微信搜索）=====');
  const collected = [];
  for (const q of QUERIES) {
    try {
      const items = await search(q);
      console.log(`· 搜「${q}」得到 ${items.length} 条`);
      collected.push(...items);
    } catch (e) {
      console.log(`· 搜「${q}」失败: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 4000)); // 加大间隔，降低搜狗频限风险
  }

  // 去重 + 过滤（近30天 + 行业相关 + 非社会新闻）
  const seenTitles = new Set();
  const now = Date.now();
  const filtered = [];
  for (const it of collected) {
    if (seenTitles.has(it.title)) continue;
    seenTitles.add(it.title);
    if (/^(分享图片|分享视频|链接分享|链接)$/.test((it.title || '').trim())) continue; // 纯图片/视频分享不是文章
    if (!it.ts) continue;                       // 无日期丢弃
    const age = Math.round((now - it.ts) / 86400000);
    if (age > RECENT_DAYS || age < 0) continue;  // 太旧或未来时间
    if (ACCOUNT_BLOCK.test(it.account)) continue;       // 非行业媒体直接排除
    if (SOCIAL.test(it.title + it.summary)) continue;
    if (!(ACCOUNT_OK.test(it.account) || HARD.test(it.title + it.summary))) continue;
    filtered.push(it);
  }

  console.log(`\n解析 ${collected.length} 条 → 过滤后 ${filtered.length} 条（近${RECENT_DAYS}天且行业相关）`);
  if (!WRITE) {
    filtered.slice(0, 15).forEach((it, i) =>
      console.log(`  ${i + 1}. [${it.account}] ${it.title}  (${new Date(it.ts).toISOString().slice(0, 10)})`));
    console.log('\n（未写文件，加 --write 才写入草稿）');
    return;
  }

  // 写入草稿：读现有 draft（fetch-news 已写好），追加并去重
  let draft;
  try { draft = JSON.parse(fs.readFileSync(DRAFT, 'utf8').replace(/^﻿/, '')); }
  catch (e) {
    try { draft = JSON.parse(fs.readFileSync(LIVE, 'utf8').replace(/^﻿/, '')); }
    catch (e2) { draft = { news: [], insights: [], readings: [], dialogs: [] }; }
  }
  draft.news = draft.news || [];
  const existLinks = new Set(draft.news.map((n) => n.link));
  const existTitles = new Set(draft.news.map((n) => n.title));
  let add = 0;
  for (const it of filtered) {
    const sogouLink = /^https?:/i.test(it.href) ? it.href : 'https://weixin.sogou.com' + it.href;
    const link = await resolveReal(sogouLink); // 解析为公众号原文链接，长期有效
    if (!link) { console.log(`  · 跳过失效/被反爬的微信链接: ${it.title.slice(0, 24)}`); continue; }
    if (existLinks.has(link) || existTitles.has(it.title)) continue;
    draft.news.unshift({
      title: it.title,
      link,
      summary: it.summary || it.title,
      impact: '',                 // 留空，由 AI 解读步骤(enrich)填充
      source: it.account,
      cat: '电子烟/微信',
      origin: '搜狗微信搜索',
      date: new Date(it.ts).toISOString().slice(0, 10),
    });
    existLinks.add(link);
    existTitles.add(it.title);
    add++;
  }
  fs.writeFileSync(DRAFT, JSON.stringify(draft, null, 2));
  console.log(`\n✅ 已追加 ${add} 条微信资讯进 feed-draft.json（impact 待 AI 填充）`);
})();
