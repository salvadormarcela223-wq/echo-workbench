// 立即发布现有草稿（零 DeepSeek 调用，用于「改完闸门后马上刷新线上」或手动补发）
// 用法：node scripts/publish-now.mjs
// 行为：读取 data/feed-draft.json → 丢弃富集失败的空字段条目 → 校验 → 复制到 feed.json + 刷新 feed.js 版本号
//       → git add/commit/push（仅 feed.json 与 feed.js，绝不附带其它未拍板改动）→ 读取桌面令牌（只读取、不删除）
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

function run(cmd) { console.log('\n$ ' + cmd); execSync(cmd, { cwd: ROOT, stdio: 'inherit' }); }

// 1) 读取草稿 + 自愈丢弃空字段条目
const raw = fs.readFileSync(DRAFT, 'utf-8').replace(/^﻿/, '');
const draft = JSON.parse(raw);
const { cleaned, dropped } = dropUnfillable(draft);
if (dropped.length) {
  console.log(`♻️ 丢弃 ${dropped.length} 条富集失败的条目（其余照常发布）：`);
  dropped.slice(0, 40).forEach((t) => console.log('  - ' + t));
  fs.writeFileSync(DRAFT, JSON.stringify(cleaned, null, 2));
}

// 2) 严格校验（丢弃后应通过；若仍有非空白类致命问题则如实中止）
const report = validate(cleaned, {});
if (!report.ok) {
  console.log('\n❌ 校验未通过（非空白类致命问题），中止发布。致命问题：');
  report.critical.slice(0, 40).forEach((c) => console.log('  ✗ ' + c));
  process.exit(2);
}
console.log('\n✅ 校验通过（空字段已自愈，其余内容均已由 DeepSeek 填充）');

// 3) 草稿 → 线上 feed.json + 刷新缓存版本号
fs.copyFileSync(DRAFT, LIVE);
let js = fs.readFileSync(FEEDJS, 'utf-8').replace(/^﻿/, '');
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '') + 'd' + Date.now().toString(36).slice(-4);
js = js.replace(/feed\.json\?v=[0-9a-z]+/, 'feed.json?v=' + stamp);
fs.writeFileSync(FEEDJS, js);
console.log('✅ 已发布到 feed.json（缓存版本 ' + stamp + '）');

// 4) 提交 + 推送（仅 feed.json 与 feed.js，绝不附带其它未拍板改动；桌面令牌只读取、不删除）
try { execSync('git config user.email "github-actions[bot]@users.noreply.github.com"', { cwd: ROOT, stdio: 'inherit' }); } catch (e) {}
try { execSync('git config user.name "github-actions[bot]"', { cwd: ROOT, stdio: 'inherit' }); } catch (e) {}
run('git add data/feed.json assets/js/feed.js');
try {
  execSync('git commit -m "每日自动更新：抓取真实近期行业资讯 + DeepSeek 生成顾问视角（自愈丢弃空字段条目）"', { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.log('（无内容变更，跳过提交）');
  process.exit(0);
}

let token = '';
try {
  const t = fs.readFileSync(TOKEN_FILE, 'utf-8').replace(/\r/g, '');
  token = (t.match(/github_pat_[A-Za-z0-9_]+/) || [])[0] || '';
} catch (e) { }
if (!token) {
  console.log('⚠️ 未找到桌面令牌（' + TOKEN_FILE + '），跳过推送。改动已提交，稍后手动推即可。');
  process.exit(0);
}
const url = 'https://' + token + '@github.com/salvadormarcela223-wq/echo-workbench.git';
// 推送前先合并远端（避免与本地未推送提交撞车导致 non-fast-forward 丢失；冲突以本流水线最新产出为准）
try { execSync('git pull --no-rebase -X ours ' + url + ' master', { cwd: ROOT, stdio: 'inherit' }); } catch (e) { console.log('（合并远端提示，可忽略：' + ((e && e.message) || e) + '）'); }
run('git push ' + url + ' master');
console.log('✅ 已推送到线上');
