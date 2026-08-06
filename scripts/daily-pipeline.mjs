// Echo 每日流水线（端到端自动更新）：
//   1) 抓取真实近期行业资讯 → 暂存草稿 feed-draft.json（impact 暂空）
//   2) 调用 DeepSeek(deepseek-chat) 为草稿里的空 impact 生成中文「顾问视角」
//   3) 严格质量闸门（impact 必须已填，否则中止）
//   4) 草稿 → 线上 feed.json + 刷新缓存版本号
//   5) 提交并推送（读取桌面令牌，不删除）
// 用法：
//   node scripts/daily-pipeline.mjs           # 完整跑（含发布+推送）
//   node scripts/daily-pipeline.mjs --test    # 只跑 1~3（抓取+AI填充+质检），不发布不推送，用于验证
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { enrich } from './ai-enrich.mjs';
import { validate } from './validate-feed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRAFT = path.join(ROOT, 'data/feed-draft.json');
const LIVE = path.join(ROOT, 'data/feed.json');
const FEEDJS = path.join(ROOT, 'assets/js/feed.js');
const TOKEN_FILE = 'C:/Users/VOOPOO/Desktop/GitHub pat.txt';
const TEST = process.argv.includes('--test');

function run(cmd) {
  console.log('\n$ ' + cmd);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

(async () => {
  console.log('===== Echo 每日流水线 ' + (TEST ? '(TEST 模式)' : '(发布模式)') + ' =====');

  // 1. 抓取 → 暂存草稿
  run('node scripts/fetch-news.mjs --write');

  // 2. AI 填充解读（DeepSeek）
  await enrich(DRAFT);

  // 3. 严格质检（impact 必须已填）
  const draft = JSON.parse(fs.readFileSync(DRAFT, 'utf-8').replace(/^﻿/, ''));
  // 3.5 发布前清理超过 45 天的旧行业资讯（保持新鲜，避免单条陈旧拦住整库发布）
  const before = (draft.news || []).length;
  draft.news = (draft.news || []).filter((it) => {
    if (!it.date) return true;
    const age = Math.round((Date.now() - new Date(it.date)) / 86400000);
    return age <= 45;
  });
  const pruned = before - (draft.news || []).length;
  if (pruned > 0) {
    fs.writeFileSync(DRAFT, JSON.stringify(draft, null, 2));
    console.log(`🧹 已清理 ${pruned} 条超 45 天的陈旧行业资讯`);
  }
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

  // 5. 提交 + 推送（读取桌面令牌，不删）
  run('git add data/feed.json assets/js/feed.js');
  try {
    execSync('git commit -m "每日自动更新：抓取真实近期行业资讯 + DeepSeek 生成顾问视角"', { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    console.log('（无内容变更，跳过提交）');
  }
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
})();
