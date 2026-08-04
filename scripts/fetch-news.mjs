import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('.');
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/sources.json'), 'utf-8'));
const writeBack = process.argv.includes('--write');
let feed = null;
try { feed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/feed.json'), 'utf-8').replace(/^\uFEFF/, '')); } catch (e) {}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function clean(s) {
  return (s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const GENERIC = /^(首页|更多|登录|注册|联系我们|关于我们|订阅|隐私|条款|Home|More|Menu|Search|Contact|Privacy|Terms|CTP Newsroom|Press Office|Categories|Topics|RSS)$/i;

async function getText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': '*/*' }, redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.text();
}

function parseRSS(xml) {
  const out = [];
  const items = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
  for (const it of items) {
    const title = clean((it.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    let link = (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] ||
      clean((it.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]);
    const pub = clean((it.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
      it.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) || [])[1]);
    const desc = clean((it.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
      it.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1]);
    if (title && link) out.push({ title, link: link.trim(), pub, desc: desc.slice(0, 160) });
  }
  return out;
}

function parseHTML(html, base, sel) {
  const out = [];
  const esc = (sel || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('<a[^>]+href="([^"]*' + esc + '[^"]*)"[^>]*>([\\s\\S]*?)</a>', 'gi');
  let m;
  let basePath = '';
  try { basePath = new URL(base).pathname.replace(/\/$/, ''); } catch (e) {}
  while ((m = re.exec(html))) {
    try {
      const href = new URL(m[1], base).href;
      const u = new URL(href);
      const title = clean(m[2]);
      if (!title || title.length < 4) continue;
      if (GENERIC.test(title)) continue;
      if (u.pathname.replace(/\/$/, '') === basePath) continue; // 跳过自身/导航首页
      if (!/^(首页|更多|登录|注册)/i.test(title)) {
        out.push({ title, link: href, pub: '', desc: '' });
      }
    } catch (e) {}
  }
  const seen = new Set();
  const uniq = [];
  for (const x of out) { if (!seen.has(x.link)) { seen.add(x.link); uniq.push(x); } }
  return uniq.slice(0, 15);
}

(async () => {
  let newCount = 0;
  for (const grp of ['news', 'insights']) {
    for (const s of sources[grp]) {
      try {
        const txt = await getText(s.url);
        const items = s.type === 'rss' ? parseRSS(txt) : parseHTML(txt, s.url, s.sel || '');
        console.log(`\n=== [${grp}] ${s.name} (${s.type}) 抓到 ${items.length} 条 ===`);
        items.slice(0, 4).forEach((it) => console.log(`  • ${it.title}\n    ${it.link}`));
        if (writeBack && feed) {
          const arr = feed[grp] || [];
          const seen = new Set(arr.map((x) => x.link));
          const add = items.filter((it) => !seen.has(it.link)).map((it) => ({
            title: it.title,
            link: it.link,
            source: s.name,
            cat: s.cat || '',
            summary: it.desc || '',
            date: it.pub ? new Date(it.pub).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
            impact: '',
            origin: s.name,
          }));
          feed[grp] = add.concat(arr).slice(0, 60);
          newCount += add.length;
          if (add.length) console.log(`  >> 新增 ${add.length} 条`);
        }
      } catch (e) {
        console.log(`\n=== [${grp}] ${s.name} 失败: ${e.message} ===`);
      }
    }
  }
  if (writeBack && feed) {
    fs.writeFileSync(path.join(ROOT, 'data/feed.json'), JSON.stringify(feed, null, 2));
    if (newCount > 0) {
      // 仅在有新增时刷新防缓存版本号（每次唯一，确保浏览器加载新内容）
      const fj = path.join(ROOT, 'assets/js/feed.js');
      let js = fs.readFileSync(fj, 'utf-8').replace(/^\uFEFF/, '');
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '') + 'r' + Date.now().toString(36).slice(-4);
      js = js.replace(/feed\.json\?v=[0-9a-z]+/, 'feed.json?v=' + stamp);
      fs.writeFileSync(fj, js);
      console.log(`\n✅ 已写回 feed.json（新增 ${newCount} 条），缓存版本号刷新为 ${stamp}`);
    } else {
      console.log('\n✅ feed.json 已重写（本次无新增条目）');
    }
  } else {
    console.log('\n（仅预览，未写回 feed.json；加 --write 才会合并）');
  }
})();
