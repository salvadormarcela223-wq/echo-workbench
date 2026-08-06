/**
 * fill-glossary-gap.mjs
 * 补全 glossary.json 中仍缺中文释义的单词（words.json 有记录但 zh 为空 + glossary 也没有）
 * 分批调用 DeepSeek API 翻译，写入 glossary.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readKey(path) {
  return readFileSync(path, 'utf8').replace(/\r/g, '').trim();
}

function askDeepSeek(messages, json = false) {
  const key = readKey("C:/Users/VOOPOO/Desktop/DeepSeek API.txt");
  const body = {
    model: 'deepseek-chat',
    messages,
    temperature: 0.3,
    max_tokens: 4096,
  };
  if (json) body.response_format = { type: 'json_object' };
  const res = fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  }).then(r => r.json());
  return res;
}

async function translateBatch(words) {
  const prompt = `以下是英语单词列表，请为每个单词提供：
1. 音标（IPA）
2. 中文释义（简洁准确，1-8个字）
3. 英文释义（简短，3-10个单词）

严格返回 JSON 对象，key 为小写单词，value 为对象 {"p":"音标","t":"中文释义","en":"英文释义"}。
只返回 JSON，不要其他文字。

单词列表：${words.join(', ')}`;

  const resp = await askDeepSeek([{ role: 'user', content: prompt }], true);
  const text = resp.choices?.[0]?.message?.content || '{}';
  try {
    // 清理可能的 markdown 代码块
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/,'').replace(/\n?```$/,'');
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn('  解译失败: ' + text.slice(0, 80));
    return {};
  }
}

async function main() {
  const glossary = JSON.parse(readFileSync(resolve(root, 'data/glossary.json'), 'utf8'));
  const words = JSON.parse(readFileSync(resolve(root, 'data/words.json'), 'utf8'));

  // 收集所有缺中文的词：words.json 有但 zh 空 + glossary 没有
  const gap = [];
  for (const k in words) {
    const w = words[k];
    if ((!w.zh || !w.zh.trim()) && !glossary[k]) {
      gap.push(k);
    }
  }
  console.log(`需补全词数: ${gap.length}`);

  if (gap.length === 0) { console.log('无需补全'); return; }

  const BATCH = 30;
  let totalAdded = 0;
  for (let i = 0; i < gap.length; i += BATCH) {
    const batch = gap.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(gap.length / BATCH);
    console.log(`\n批次 ${batchNum}/${totalBatches} (${batch.length} 词)...`);
    try {
      const result = await translateBatch(batch);
      let added = 0;
      for (const [k, v] of Object.entries(result)) {
        if (v && typeof v === 'object' && v.t) {
          glossary[k] = { p: v.p || '', t: v.t, en: v.en || '' };
          added++;
        }
      }
      totalAdded += added;
      console.log(`  本批成功: ${added}/${batch.length}`);
    } catch (e) {
      console.error(`  本批异常: ${e.message}`);
    }
    // 避免速率限制
    if (i + BATCH < gap.length) await new Promise(r => setTimeout(r, 1200));
  }

  writeFileSync(resolve(root, 'data/glossary.json'), JSON.stringify(glossary, null, 2), 'utf8');
  console.log(`\n完成! glossary 总词数: ${Object.keys(glossary).length}, 新增: ${totalAdded}`);
}

main().catch(e => { console.error(e); process.exit(1); });
