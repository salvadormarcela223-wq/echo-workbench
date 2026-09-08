// Echo 每日流水线（端到端自动更新）：
//   1) 抓取真实近期行业资讯 → 暂存草稿 feed-draft.json（impact 暂空）
//   2) 调用 DeepSeek(deepseek-chat) 为草稿里的空 impact 生成中文「顾问视角」
//   3) 严格质量闸门（impact 必须已填，否则中止）
//   4) 草稿 → 线上 feed.json + 刷新缓存版本号
//   5) 提交并推送（读取桌面令牌，不删除）
// 用法：
//   node scripts/daily-pipeline.mjs           # 完整跑（含发布+推送）
//   node scripts/daily-pipeline.mjs --test    # 只跑 1~3（抓取+AI填充+质检），不发布不推送（⚠️ 会真实消耗 DeepSeek）
//   node scripts/daily-pipeline.mjs --dry     # 只跑抓取，绝不调用 DeepSeek（0 token 消耗），验证抓取/编排改动首选
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { enrich, buildTasks } from './ai-enrich.mjs';
import { validate } from './validate-feed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRAFT = path.join(ROOT, 'data/feed-draft.json');
const LIVE = path.join(ROOT, 'data/feed.json');
const FEEDJS = path.join(ROOT, 'assets/js/feed.js');
const TOKEN_FILE = 'C:/Users/VOOPOO/Desktop/GitHub pat.txt';
const TEST = process.argv.includes('--test');
// --dry：只跑抓取、绝不调用 DeepSeek（0 token 消耗）
// 验证「抓取/编排」类改动一律用 --dry，别再用 --test（曾因此白烧 89 次 AI 调用）
const DRY = process.argv.includes('--dry');

function run(cmd) {
  console.log('\n$ ' + cmd);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

// 单版块独立执行：失败只跳过该版块，不影响其他版块继续抓取与最终发布
// 根治「串跑隐患」：任一步报错（如某网站临时打不开）不再冻结整站更新
function tryRun(cmd, label) {
  try {
    console.log('\n$ ' + cmd);
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    return true;
  } catch (e) {
    console.log(`⚠️ ${label} 执行失败（已跳过该版块，继续其余版块）：${(e && e.message) || e}`);
    return false;
  }
}

(async () => {
  console.log('===== Echo 每日流水线 ' + (DRY ? '(DRY 模式：只抓取·不调用 AI)' : TEST ? '(TEST 模式)' : '(发布模式)') + ' =====');

  // 1. 三版块一起抓取 → 暂存草稿（news 行业资讯 / insights 专业提升 / readings 英语阅读，均每日更新）
  //    各版块独立抓取：任一块失败只跳过该块，不再因单点故障冻结整站更新
  tryRun('node scripts/fetch-news.mjs --write', '行业资讯抓取');
  tryRun('node scripts/fetch-wechat.mjs --write', '微信行业资讯抓取');   // 微信通道为已知死通道，失败不再拖垮全站
  tryRun('node scripts/fetch-insights.mjs --write', '专业提升抓取');
  tryRun('node scripts/fetch-readings.mjs --draft' + (DRY ? ' --dry' : ''), '英语阅读抓取');

  // 2. AI 填充解读（DeepSeek）——循环补填直到全满或连续失败
  //    单轮可能因速率限制/超时漏掉部分条目（如首次跑64/86条），必须自动追补
  // --dry：只统计待富集条数，绝不调用 DeepSeek（0 token 消耗），验证抓取/编排改动一律用它
  if (DRY) {
    const dryFeed = JSON.parse(fs.readFileSync(DRAFT, 'utf-8').replace(/^\uFEFF/, ''));
    const pend = buildTasks(dryFeed);
    const newsPend = pend.filter((t) => t.group === 'news').length;
    const insPend = pend.filter((t) => t.group === 'insights').length;
    console.log('\n（--dry 模式：未调用 DeepSeek，本次 0 次 AI 调用、0 token 消耗）');
    console.log(`[预览] 若正式发布，将向 DeepSeek 发送 ${pend.length} 条（行业资讯 ${newsPend} / 专业提升 ${insPend}）`);
    console.log('\n✅ 抓取编排验证完成（--dry 不发布、不推送）');
    process.exit(0);
  }

  // TEST 模式会真实调用 DeepSeek，先报个数，避免又稀里糊涂烧掉一大笔
  if (TEST) {
    const t = buildTasks(JSON.parse(fs.readFileSync(DRAFT, 'utf-8').replace(/^\uFEFF/, '')));
    console.log(`\n⚠️ TEST 模式会真实调用 DeepSeek，预计发送 ${t.length} 条（会产生 token 消耗）`);
    console.log('   若只是验证抓取/编排，请改用 --dry（0 消耗）');
  }

  const MAX_ENRICH_ROUNDS = 3;
  // 每条最多送 2 次 AI（单次调用内部已各自重试 3 次），防止顽固条目每轮都被重发、白烧 token
  const MAX_ATTEMPTS_PER_ITEM = 2;
  const attempts = new Map(); // key -> 已尝试次数
  for (let round = 1; round <= MAX_ENRICH_ROUNDS; round++) {
    console.log(`\n--- AI 填充 第 ${round}/${MAX_ENRICH_ROUNDS} 轮 ---`);
    const skip = new Set([...attempts.entries()].filter(([, n]) => n >= MAX_ATTEMPTS_PER_ITEM).map(([k]) => k));
    const res = await enrich(DRAFT, { skip });
    (res.attempted || []).forEach((k) => attempts.set(k, (attempts.get(k) || 0) + 1));
    if (res.fail > 0) console.log(`⚠️ 本轮 ${res.fail} 条失败`);

    // 每轮结束后检查还有多少空字段
    const check = JSON.parse(fs.readFileSync(DRAFT, 'utf-8').replace(/^﻿/, ''));
    const emptyImpacts = (check.news || []).filter(n => !n.impact || !n.impact.trim()).length;
    const emptyCores = (check.insights || []).filter(n =>
      !n.core || !n.core.trim() || !n.view || !n.view.trim() || !n.action || !n.action.trim()
    ).length;
    console.log(`本轮结束 → 剩余空 impact: ${emptyImpacts}, 空核心字段: ${emptyCores}`);

    if (emptyImpacts === 0 && emptyCores === 0) {
      console.log('✅ 所有字段已填满，无需继续');
      break;
    }
    if (round < MAX_ENRICH_ROUNDS) {
      console.log(`🔄 还有空字段，3s 后开始第 ${round + 1} 轮补填...`);
      await new Promise(r => setTimeout(r, 3000));
    } else {
      console.log(`⚠️ 已达最大轮次(${MAX_ENRICH_ROUNDS})，仍有 ${emptyImpacts} 条空 impact / ${emptyCores} 条空核心字段`);
    }
  }

  // 3. 严格质检（impact 必须已填）
  const draft = JSON.parse(fs.readFileSync(DRAFT, 'utf-8').replace(/^﻿/, ''));
  // 全部留存：按用户 2026-09-08 要求，发布前不再清理任何陈旧条目（原 45 天 prune 逻辑已移除）
  const report = validate(draft, {});
  if (!report.ok) {
    console.log('\n❌ 严格质检未通过，中止发布。致命问题：');
    report.critical.slice(0, 40).forEach((c) => console.log('  ✗ ' + c));
    process.exit(2);
  }
  console.log('\n✅ 严格质检通过（行业资讯 impact 已全部由 DeepSeek 填充）');

  if (TEST) {
    console.log('\n（TEST 模式：不发布、不推送。草稿在 ' + DRAFT + '）');
    process.exit(0);
  }

  // 4. 草稿 → 线上 feed.json + 刷新缓存版本号
  fs.copyFileSync(DRAFT, LIVE);
  let js = fs.readFileSync(FEEDJS, 'utf-8').replace(/^﻿/, '');
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '') + 'd' + Date.now().toString(36).slice(-4);
  js = js.replace(/feed\.json\?v=[0-9a-z]+/, 'feed.json?v=' + stamp);
  fs.writeFileSync(FEEDJS, js);
  console.log('✅ 已发布到 feed.json（缓存版本 ' + stamp + '）');

  // 5. 提交 + 推送
  run('git add data/feed.json assets/js/feed.js data/words.json data/glossary.json');
  // 先配置提交人身份（必须放在 commit 之前，否则 git 报 empty ident 导致 commit 失败、每天空转）
  const isCI = !!process.env.GITHUB_ACTIONS;
  try { execSync('git config user.email "github-actions[bot]@users.noreply.github.com"', { cwd: ROOT, stdio: 'inherit' }); } catch (e) {}
  try { execSync('git config user.name "github-actions[bot]"', { cwd: ROOT, stdio: 'inherit' }); } catch (e) {}
  try {
    execSync('git commit -m "每日自动更新：抓取真实近期行业资讯 + DeepSeek 生成顾问视角"', { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    console.log('（无内容变更，跳过提交）');
  }

  if (isCI) {
    // 服务器环境：用 GitHub 自带的 GITHUB_TOKEN 推送（无需桌面令牌，网站自行更新）
    run('git push origin HEAD:master');
    console.log('✅ 已推送到线上（GitHub Actions 自动运行，无需你的电脑）');
  } else {
    // 本地/手动：读取桌面令牌，不删
    let token = '';
    try {
      const raw = fs.readFileSync(TOKEN_FILE, 'utf-8').replace(/\r/g, '');
      token = (raw.match(/github_pat_[A-Za-z0-9_]+/) || [])[0] || '';
    } catch (e) { }
    if (!token) {
      console.log('⚠️ 未找到桌面令牌（' + TOKEN_FILE + '），跳过推送。改动已提交，稍后手动推即可。');
      process.exit(0);
    }
    const url = 'https://' + token + '@github.com/salvadormarcela223-wq/echo-workbench.git';
    run('git push ' + url + ' master');
    console.log('✅ 已推送到线上');
  }
})();
