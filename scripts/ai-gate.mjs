// AI 解读准入评分器（零 token 规则，绝不调用 DeepSeek）
//
// 用途：在把文章送进 DeepSeek 解读之前，先用纯规则判断「这篇值不值得花 token 解读」。
//       流水线报道（通稿/产品上新/任命/活动日程/纯报告链接/标题党）在此被拦掉，不触发 AI。
//
// 四层：
//   第1层 硬排除：命中即 fail（事件报名 / 纯通稿 / 正文过短）
//   第2层 评分：  长度 + 研究数据信号 + 深度词 + 来源权重 + 主题权重，≥ 阈值才 pass
//   第3层 预算：  由调用方（ai-enrich buildTasks）按分数取 top，控制每日上限
//   第4层 轻量模型预审：默认关（预留开关）
//
// 所有可调项集中在下方 CONFIG，用户不改代码即可调。
//
// 原则：仅影响「未来新文章」（buildTasks 只把空字段的新条目送进来），
//       已发布且已有 AI 解读的存量条目不会被本闸门改动（符合「以前不补」）。

export const CONFIG = {
  // 第2层通过阈值（0~100）。低于此分直接不送 AI。
  // 校准原则：真实草稿含 body(≤2000字)，带正文的常规条目应默认通过；
  // 只有明显低价值(通稿/事件/纯产品上新且无论文/数据)才被拦。故长度权重高、阈值适中。
  passScore: 50,

  // 第3层每日预算（由 buildTasks 在单次调用内按分数取 top）。
  // 说明：每日真实新增量 news≈9/insights≈39，均低于上限，预算主要作安全网。
  budget: { news: 15, insights: 40 },

  // 第4层：轻量模型预审开关（预留，默认关）。开启后可用便宜小模型先筛一遍再交 DeepSeek。
  cheapPreFilter: false,

  // 高权重来源（命中 +SOURCE_W 分）：研究报告/监管类，通常值得解读。
  highValueSources: [
    'ipsos', 'mintel', 'nielseniq', 'bain', 'kantar',
    'fda', 'who', '国家烟草局', '东方烟草网', 'tobacco tactics', '2firsts',
    'foodaily', '小食代', 'foodtalks',
  ],

  // 第1层：事件/报名类（命中即 fail，非分析内容）。
  eventRe: /(register\s*now|sign\s*up\s*(here|now)|webinar\s*(?::|on|—)|conference\s+agenda|save\s+the\s+date|join\s+us\s+at\s+(?:our\s+)?booth|visit\s+us\s+at\s+booth| RSVP|register\b.*event)/i,

  // 第1层：纯通稿 boilerplate（标题像宣布 + 正文含 pleased to announce 类）。
  prRe: /(is\s+pleased\s+to\s+(?:announce|share)|we\s+are\s+pleased\s+to\s+(?:announce|share)|press\s+release|announces\s+(?:the\s+)?(?:appointment|addition|partnership|collaboration))/i,

  // 第2层：研究/数据信号（命中 +RESEARCH_W）。
  researchRe: /(study|studies|research|survey|report|findings|according\s+to|analysis|evidence|data\s+shows|peer[- ]?review|clinical\s+trial|experiment|statistic|percent\s+of|%\s+of|figure\s+shows|benchmark)/i,

  // 第2层：深度词（标题/摘要含 +DEPTH_W）。
  depthRe: /(why\s+|how\s+(?:does|will|can)|impact|implication|future\s+of|trend|deep\s+dive|what\s+(?:does|happens)|解读|深度|研究|报告|影响|趋势|为什么|如何|前瞻|洞察)/i,

  // 第2层：主题权重——正向（政策/消费者/市场/战略）。已扩充监管/法规词汇（guidance/rule/compliance/通知/公告/解读…）。
  topicPosRe: /(policy|regulation|regulatory|guidance|rule|compliance|directive|mandate|ban\b|restrict|standard|consumer|shopper|market\s+(?:trend|share|growth)|strategy|sustainab|health|tax|illicit|smugg|pricing|brand\s+building|渠道|消费|市场|政策|监管|战略|可持续|通知|公告|解读|规定|办法|条例|法规|标准)/i,

  // 政策/监管类高权重源：这些源发布的政策/监管内容应当必过（通稿/活动仍被第1层硬拦）。
  policySources: ['fda', 'who', '国家烟草局', '东方烟草网', 'tobacco tactics', '2firsts'],
  // 政策源 + 命中监管主题时的额外保护分（确保实质性政策内容必过，不依赖深度/研究词）。
  POLICY_W: 30,

  // 第2层：主题权重——负向（纯产品/行情/上新）。
  topicNegRe: /(new\s+(?:flavor|product|device|vape|e-?liquid|pod|range|line|sku)|launch(?:es|ed)?\s+(?:of|its|the)|now\s+(?:available|shipping)|pre-?order|unboxing|flavor\s+review)/i,

  // 长度阈值（cleaned 后「总非空白字符数」，中英文通用）。低于此直接第1层 fail（无实质内容）。
  // 说明：不能只数中文字——英文源(Mintel/Ipsos/NIQ/Bain/Dive系)几乎无中文字会被误杀。
  minChars: 60,

  // 各项分值
  LEN_HI: 40,   // 文本≥600字（带正文草稿的常见情况）
  LEN_MID: 30,  // 文本≥300字
  LEN_LO: 15,   // 文本≥150字
  RESEARCH_W: 20,
  DEPTH_W: 15,
  SOURCE_W: 12,
  TOPIC_POS_W: 10,
  TOPIC_NEG_W: -15,
};

function cleanCtx(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function srcMatch(name, list) {
  const n = (name || '').toLowerCase();
  return list.some((k) => n.includes(k.toLowerCase()));
}

/**
 * 评估一条条目是否值得送 AI 解读。
 * @param {object} item 条目（含 title/summary/body/source 等）
 * @param {string} group 'news' | 'insights'
 * @returns {{pass:boolean, score:number, reason:string, excluded?:boolean}}
 */
export function aiWorthiness(item, group = 'news') {
  const title = cleanCtx(item.title);
  const summary = cleanCtx(item.summary);
  const body = cleanCtx(item.body);
  const text = (title + ' ' + summary + ' ' + body).trim();
  const charLen = text.replace(/\s+/g, '').length; // 总非空白字符数（中英文通用）
  const src = item.source || item.origin || '';

  // ---- 第1层：硬排除 ----
  if (charLen < CONFIG.minChars) {
    return { pass: false, score: 0, reason: `正文过短(${charLen}字<${CONFIG.minChars})`, excluded: true };
  }
  if (CONFIG.eventRe.test(title + ' ' + summary)) {
    return { pass: false, score: 0, reason: '事件/报名类(非分析)', excluded: true };
  }
  if (CONFIG.prRe.test(title + ' ' + summary + ' ' + body)) {
    return { pass: false, score: 0, reason: '纯通稿 boilerplate', excluded: true };
  }

  // ---- 第2层：评分 ----
  let score = 0;
  const reasons = [];
  if (charLen >= 600) { score += CONFIG.LEN_HI; reasons.push(`长文+${CONFIG.LEN_HI}`); }
  else if (charLen >= 300) { score += CONFIG.LEN_MID; reasons.push(`中等长度+${CONFIG.LEN_MID}`); }
  else if (charLen >= 150) { score += CONFIG.LEN_LO; reasons.push(`短但达标+${CONFIG.LEN_LO}`); }

  if (CONFIG.researchRe.test(text)) { score += CONFIG.RESEARCH_W; reasons.push(`研究/数据+${CONFIG.RESEARCH_W}`); }
  if (CONFIG.depthRe.test(title + ' ' + summary)) { score += CONFIG.DEPTH_W; reasons.push(`深度词+${CONFIG.DEPTH_W}`); }
  if (srcMatch(src, CONFIG.highValueSources)) { score += CONFIG.SOURCE_W; reasons.push(`高权重源+${CONFIG.SOURCE_W}`); }
  if (CONFIG.topicPosRe.test(text)) { score += CONFIG.TOPIC_POS_W; reasons.push(`正向主题+${CONFIG.TOPIC_POS_W}`); }
  if (srcMatch(src, CONFIG.policySources) && CONFIG.topicPosRe.test(text)) { score += CONFIG.POLICY_W; reasons.push(`政策源+监管主题+${CONFIG.POLICY_W}`); }
  if (CONFIG.topicNegRe.test(title + ' ' + summary)) { score += CONFIG.TOPIC_NEG_W; reasons.push(`纯产品/行情${CONFIG.TOPIC_NEG_W}`); }

  const pass = score >= CONFIG.passScore;
  return {
    pass,
    score,
    reason: (pass ? '通过(' : '未过阈(') + score + '≥' + CONFIG.passScore + '): ' + reasons.join(', '),
  };
}
