// Echo 每日流水线（端到端自动更新）：
//   1) 抓取真实近期行业资讯 → 暂存草稿 feed-draft.json
//   2) 情报阀门（框架 v4 定本）：L0-L2 零 token 规则 → L3 每天一次批量 AI 判「值得读」+ 中文短标题/中译摘要
//   3) 严格质量闸门（题录条目查题录字段，不再要求解读字段）
//   4) 草稿 → 线上 feed.json + 刷新缓存版本号
//   5) 提交并推送（读取桌面令牌，不删除）
// 说明：情报条目（news/insights 非文献）停发 AI 解读（用户 2026-11-10 拍板）；
//       AI 精读只存在于「文献深读」（literature.mjs）与手动开关 deepread.mjs。
// 用法：
//   node scripts/daily-pipeline.mjs           # 完整跑（含发布+推送）
//   node scripts/daily-pipeline.mjs --test    # 只跑到质检，不发布不推送
//   node scripts/daily-pipeline.mjs --dry     # 只跑抓取+阀门L0-L2，绝不调用 DeepSeek（0 token），验证抓取/编排改动首选
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validate, dropUnfillable } from './validate-feed.mjs';

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

// 原子写：先写临时文件再 rename，避免写入中途被中断导致 feed.json / feed.js 半截损坏（M 项）
function atomicWrite(target, data) {
  const tmp = target + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, target);
}

// 单版块独立执行：失败只跳过该版块，不影响其他版块继续抓取与最终发布
// 根治「串跑隐患」：任一步报错（如某网站临时打不开）不再冻结整站更新
// N 项：失败版块显式记入 failedSections，发布前统一告警，确保「非静默缺失」（线上保留上一版该版块内容）
const failedSections = [];
function tryRun(cmd, label) {
  try {
    console.log('\n$ ' + cmd);
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    return true;
  } catch (e) {
    console.log(`\n⚠️⚠️ [版块失败] ${label} 执行失败（已跳过该版块；线上保留上一版对应内容，非静默缺失）：${(e && e.message) || e}`);
    failedSections.push(label);
    return false;
  }
}

(async () => {
  console.log('===== Echo 每日流水线 ' + (DRY ? '(DRY 模式：只抓取·不调用 AI)' : TEST ? '(TEST 模式)' : '(发布模式)') + ' =====');

  // 0. 根因修复（2026-09-24 暴露）：先同步线上最新版本，
  //    否则本机停留在旧提交、会在旧底子上重复抓取并重复调用 DeepSeek（曾导致一天白烧 244 次 AI 调用）。
  //    仅当「本机落后远程 且 无未提交改动」时对齐远程；有未提交改动则跳过并警告（绝不动用户手头工作）。
  try {
    execSync('git fetch origin', { cwd: ROOT, stdio: 'inherit' });
    const behind = execSync('git rev-list --count HEAD..origin/master', { cwd: ROOT }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
    if (behind !== '0' && dirty === '') {
      execSync('git reset --hard origin/master', { cwd: ROOT, stdio: 'inherit' });
      console.log('✅ 已对齐线上最新版本（避免旧底子重复调用 DeepSeek）');
    } else if (behind !== '0' && dirty !== '') {
      console.log('⚠️ 本地落后远程但存在未提交改动，跳过自动对齐（将在当前底子运行，可能重复富集——建议先处理改动）');
    }
  } catch (e) {
    console.log('⚠️ 同步线上版本失败（不影响抓取，但可能在本机旧底子运行）：' + ((e && e.message) || e));
  }

  // 1. 三版块一起抓取 → 暂存草稿（news 行业资讯 / insights 专业提升 / readings 英语阅读，均每日更新）
  //    各版块独立抓取：任一块失败只跳过该块，不再因单点故障冻结整站更新
  tryRun('node scripts/fetch-news.mjs --write', '行业资讯抓取');
  // 微信行业资讯通道为已知死通道（搜狗反爬全拦，永远 0 条），且每词重试等待会让整条流水线卡 50+ 分钟；
  // 已禁用，待找到可用抓取方式再恢复。禁用不损失任何覆盖（该通道向来贡献 0 条）。
  // tryRun('node scripts/fetch-wechat.mjs --write', '微信行业资讯抓取');
  tryRun('node scripts/fetch-insights.mjs --write', '专业提升抓取');
  tryRun('node scripts/fetch-readings.mjs --draft' + (DRY ? ' --dry' : ''), '英语阅读抓取');

  // 1b. 专业文献专属处理（唯一定本 v5）：只作用于 4 个专业文献源，其余条目原样不动。
  //     三类准入 → 全文核对 → 全文精读 / 题录两路。内部会调用 DeepSeek，故 --dry（零 token 编排验证）时跳过。
  if (!DRY) tryRun('node scripts/literature.mjs', '专业文献处理');

  // 1c. 情报阀门（框架 v4 定本 2026-11-10）：L0-L2 零 token，L3 每天最多一次批量 AI。
  //     --dry 时阀门纯预览（不改草稿、0 token）。
  tryRun('node scripts/valve.mjs' + (DRY ? ' --dry' : ''), '情报阀门');

  // N 项：抓取阶段失败版块统一告警（不静默缺失）
  if (failedSections.length) {
    console.log(`\n⚠️⚠️ 本次以下版块抓取失败，线上将保留上一版对应内容（已显式标记，非静默缺失）：${failedSections.join('、')}`);
  }

  // 2. 情报条目不再送 AI 写解读（框架 v4：阀门已把关，解读停发，token 大头砍掉）。
  //    --dry：只统计 pending 数，绝不调用 DeepSeek（0 token 消耗），验证抓取/编排改动一律用它
  if (DRY) {
    const dryFeed = JSON.parse(fs.readFileSync(DRAFT, 'utf-8').replace(/^\uFEFF/, ''));
    const newsPend = (dryFeed.news || []).filter((n) => n.valve === 'pending').length;
    const insPend = (dryFeed.insights || []).filter((n) => n.valve === 'pending').length;
    console.log('\n（--dry 模式：未调用 DeepSeek，本次 0 次 AI 调用、0 token 消耗）');
    console.log('[预览] 阀门疑似待 L3 判定（--dry 纯预览，未改草稿）：行业资讯 ' + newsPend + ' / 专业提升 ' + insPend);
    console.log('\n✅ 抓取编排验证完成（--dry 不发布、不推送）');
    process.exit(0);
  }

  // 3. 严格质检 + 自愈：题录条目（valve=pass / lit=citation）只查题录字段；
  //    残余的富集空白类坏条目（极旧存量）先丢弃，其余照常发布
  const draftRaw = JSON.parse(fs.readFileSync(DRAFT, 'utf-8').replace(/^﻿/, ''));
  // 全部留存：按用户 2026-09-08 要求，发布前不再清理任何陈旧条目（原 45 天 prune 逻辑已移除）
  const { cleaned, dropped } = dropUnfillable(draftRaw);
  if (dropped.length) {
    console.log(`\n♻️ 自愈：丢弃 ${dropped.length} 条富集失败的条目（其余照常发布）：`);
    dropped.slice(0, 40).forEach((t) => console.log('  - ' + t));
    atomicWrite(DRAFT, JSON.stringify(cleaned, null, 2));
  }
  const report = validate(cleaned, {});
  if (!report.ok) {
    // 仍失败说明存在非空白类致命问题（如死链、栏目页标题），不掩盖、如实中止并报告
    console.log('\n❌ 严格质检未通过（非空白类致命问题），中止发布。致命问题：');
    report.critical.slice(0, 40).forEach((c) => console.log('  ✗ ' + c));
    process.exit(2);
  }
  console.log('\n✅ 严格质检通过（空字段已自愈，其余内容均已由 DeepSeek 填充）');

  if (TEST) {
    console.log('\n（TEST 模式：不发布、不推送。草稿在 ' + DRAFT + '）');
    process.exit(0);
  }

  // 4. 草稿 → 线上 feed.json + 刷新缓存版本号
  atomicWrite(LIVE, fs.readFileSync(DRAFT));
  let js = fs.readFileSync(FEEDJS, 'utf-8').replace(/^﻿/, '');
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '') + 'd' + Date.now().toString(36).slice(-4);
  js = js.replace(/feed\.json\?v=[0-9a-z]+/, 'feed.json?v=' + stamp);
  atomicWrite(FEEDJS, js);
  console.log('✅ 已发布到 feed.json（缓存版本 ' + stamp + '）');

  // 5. 提交 + 推送
  run('git add data/feed.json assets/js/feed.js data/words.json data/glossary.json');
  // 先配置提交人身份（必须放在 commit 之前，否则 git 报 empty ident 导致 commit 失败、每天空转）
  const isCI = !!process.env.GITHUB_ACTIONS;
  try { execSync('git config user.email "github-actions[bot]@users.noreply.github.com"', { cwd: ROOT, stdio: 'inherit' }); } catch (e) {}
  try { execSync('git config user.name "github-actions[bot]"', { cwd: ROOT, stdio: 'inherit' }); } catch (e) {}
  try {
    execSync('git commit -m "每日自动更新：抓取真实近期资讯 + 阀门把关（框架 v4）"', { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    console.log('（无内容变更，跳过提交）');
  }

  if (isCI) {
    // 服务器环境：用 GitHub 自带的 GITHUB_TOKEN 推送（无需桌面令牌，网站自行更新）
    // 推送前先合并远端（避免与本机/另一条工作流的提交撞车，non-fast-forward 推不上去）；
    // 冲突时以「刚生成的最新 feed.json」为准（-X ours），因为那是本流水线刚产出的最新内容。
    try {
      execSync('git pull --no-rebase --no-edit -X ours origin master', { cwd: ROOT, stdio: 'inherit' });
    } catch (e) {
      console.log('（同步远端时提示，可忽略：' + ((e && e.message) || e) + '）');
    }
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
    // 推送前先合并远端（避免与本地未推送提交/多设备撞车导致 non-fast-forward 丢失；冲突以本流水线最新产出为准）
    try { execSync('git pull --no-rebase -X ours ' + url + ' master', { cwd: ROOT, stdio: 'inherit' }); } catch (e) { console.log('（合并远端提示，可忽略：' + ((e && e.message) || e) + '）'); }
    run('git push ' + url + ' master');
    console.log('✅ 已推送到线上');
  }
})();
