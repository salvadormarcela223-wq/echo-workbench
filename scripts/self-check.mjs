// =============================================================================
//  Echo 工作台 · 全盘自检机制（交付前必跑）
// -----------------------------------------------------------------------------
//  用途：把用户对"内容质量"的所有硬性要求变成可自动验证的检查项，
//        逐项打 ✅/❌，确保"改一处不会破坏别处"。
//  用法：
//    node scripts/self-check.mjs            # 检查【线上】当前部署状态（默认）
//    node scripts/self-check.mjs --local    # 检查【本地】data/feed.json（推送前自查）
//  退出码：0 = 全过；1 = 有未过项；2 = 脚本出错
// =============================================================================
import fs from 'fs';
import path from 'path';
import https from 'https';

const LOCAL = process.argv.includes('--local');
const API_URL = 'https://raw.githubusercontent.com/salvadormarcela223-wq/echo-workbench/master/data/feed.json';
const LOCAL_PATH = path.join(process.cwd(), 'data/feed.json');

// 烟草类关键词（行业资讯专属）：覆盖烟草公司、凉味剂等边界概念
const TOB = /电子烟|烟草|尼古丁|vape|e-cig|雾化|加热不燃烧|HNB|IQOS|烟油|卷烟|雪茄|口含烟|嚼烟|鼻烟|低温本草|雾化器|烟弹|雾化物|KT&G|凉味剂|凉感|薄荷醇|薄荷|烟草公司|烟草巨头|烟草商|菲莫|英美烟草|帝烟|日本烟草|中烟/i;

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'echo-selfcheck' } }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => {
        if (url.includes('api.github.com')) {
          try { const j = JSON.parse(d); res(Buffer.from(j.content, 'base64').toString('utf8')); }
          catch (e) { rej(e); }
        } else res(d);
      });
    }).on('error', rej);
  });
}

function loadLocal() { return fs.readFileSync(LOCAL_PATH, 'utf8').replace(/^﻿/, ''); }

const isEmpty = v => { const s = (v || '').trim(); return !s || s.includes('待补充') || s === '—' || s.includes('每日自动'); };

function check(name, cond, detail = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`);
  return cond;
}

(async () => {
  const raw = LOCAL ? loadLocal() : await get(API_URL);
  const feed = JSON.parse(raw);
  const news = feed.news || [];
  const ins = feed.insights || [];
  const readings = feed.readings || [];
  const today = new Date();

  let pass = 0, fail = 0;
  const inc = c => c ? pass++ : fail++;

  console.log('══════════════════════════════════════════════');
  console.log('   Echo 工作台 · 全盘自检报告  ' + (LOCAL ? '（本地）' : '（线上）'));
  console.log('══════════════════════════════════════════════\n');

  console.log('【A. 分类规则（铁律）】');
  let newsBad = news.filter(it => !TOB.test((it.title || '') + (it.summary || '')));
  inc(check(`行业资讯全部为烟草/电子烟相关 (${news.length}条)`, newsBad.length === 0, newsBad.length ? `疑似错分: ` + newsBad.slice(0, 3).map(x => x.title.slice(0, 30)).join(' / ') : '全部命中'));
  let insBad = ins.filter(it => TOB.test((it.title || '') + (it.core || '') + (it.summary || '')));
  inc(check(`专业提升全部为非烟草 (${ins.length}条)`, insBad.length === 0, insBad.length ? `疑似错分: ` + insBad.slice(0, 3).map(x => x.title.slice(0, 30)).join(' / ') : '全部不含'));

  console.log('\n【B. 字段完整性】');
  inc(check('行业资讯 summary 无空', news.filter(it => isEmpty(it.summary)).length === 0));
  inc(check('行业资讯 impact(顾问解读) 无空', news.filter(it => isEmpty(it.impact)).length === 0));
  inc(check('专业提升 core 无空', ins.filter(it => isEmpty(it.core)).length === 0));
  inc(check('专业提升 view 无空', ins.filter(it => isEmpty(it.view)).length === 0));
  inc(check('专业提升 action 无空', ins.filter(it => isEmpty(it.action)).length === 0));

  console.log('\n【C. 英语阅读模块】');
  inc(check('英语阅读 body 均为数组(防手机崩溃)', readings.filter(it => !Array.isArray(it.body)).length === 0));
  let rCn = readings.filter(it => isEmpty(it.cn));
  inc(check('英语阅读 cn(中文翻译) 无空', rCn.length === 0, rCn.length ? `空: ` + rCn.map(x => x.title.slice(0, 40)).join(' / ') : '0 条'));
  inc(check('英语阅读 phrases 为数组', readings.filter(it => !Array.isArray(it.phrases)).length === 0));

  // 英语阅读正文长度：
  //  - 手写精选(curated)：允许完整短文，≥80 词即可（它们是完整文章，只是篇幅短）
  //  - 自动抓取(auto)：必须抓到完整长文，≥400 词（防 RSS 摘要浑水摸鱼）
  const wordOf = (it) => {
    const t = Array.isArray(it.body) ? it.body.join('') : (it.body || '');
    return t.split(/\s+/).filter(Boolean).length;
  };
  const autoShort = readings.filter(it => !it.curated && wordOf(it) < 400);
  const curShort = readings.filter(it => it.curated && wordOf(it) < 80);
  inc(check('自动抓取阅读正文 ≥400 词（完整长文，非摘要）', autoShort.length === 0,
    autoShort.length ? `过短 ${autoShort.length} 篇` : '全部达标'));
  inc(check('手写精选阅读正文完整(≥80词)', curShort.length === 0,
    curShort.length ? `过短 ${curShort.length} 篇` : '全部完整'));

  // ═══ 阅读信源覆盖（Mix1 占比铁律）：必须凑齐全部信源，且含专业源 ═══
  let srcCfg = { sources: [] };
  try { srcCfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/reading-sources.json'), 'utf8')); } catch (e) {}
  const srcNames = (srcCfg.sources || []).map(s => s.name);
  const profSrc = (srcCfg.sources || []).filter(s => s.professional).map(s => s.name);
  const readingSrcs = [...new Set(readings.map(r => r.source || r.tag))];
  const missingSrc = srcNames.filter(n => !readingSrcs.includes(n));
  inc(check(`英语阅读覆盖全部信源(${srcNames.length}源 Mix1)`, missingSrc.length === 0,
    missingSrc.length ? (`缺: ` + missingSrc.join(' / ')) : '全部覆盖'));
  const profCount = readings.filter(r => profSrc.includes(r.source || r.tag)).length;
  inc(check('英语阅读含专业源(1专业:4通识)', profCount >= 1,
    profCount ? (`专业源 ${profCount} 篇`) : (`缺少专业源(${profSrc.join('/')})`)));
  // 生词中文释义覆盖（防"生词全英文"浑水摸鱼）
  const vocTotal = readings.reduce((n, r) => n + (r.vocab || []).length, 0);
  const vocNoZh = readings.reduce((n, r) => n + (r.vocab || []).filter(v => !v.t || !String(v.t).trim()).length, 0);
  inc(check('英语阅读生词均有中文释义', vocNoZh === 0,
    vocNoZh ? (`缺中文 ${vocNoZh} 个`) : `全部有中文(${vocTotal}个)`));

  console.log('\n【D. 日期真实性】');
  let badDate = 0, future = 0;
  [...news, ...ins].forEach(it => {
    if (!it.date) { badDate++; return; }
    const dt = new Date(it.date);
    if (isNaN(dt)) badDate++;
    else if (dt > today) future++;
  });
  inc(check('所有条目均有有效日期', badDate === 0, `${badDate} 条无效`));
  inc(check('无未来日期(未伪造)', future === 0, `${future} 条未来`));

  console.log('\n【E. 模块数量概览】');
  console.log(`   行业资讯: ${news.length} 条 | 专业提升: ${ins.length} 条 | 英语阅读: ${readings.length} 条 | 微信: ${(feed.dialogs || []).length} 条`);

  console.log('\n══════════════════════════════════════════════');
  console.log(`   通过 ${pass} 项 ｜ 未通过 ${fail} 项`);
  console.log('══════════════════════════════════════════════\n');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('核查程序出错:', e.message); process.exit(2); });
