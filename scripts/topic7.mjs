/* ============================================================
   7 主题 MECE 分类器 · 唯一定本 v5（零 token 静态判定）
   ------------------------------------------------------------
   依据：根目录《内容入选与主题分类标准.md》（2026-11-09 用户拍板）
   - 两板块共用同一套 7 主题，不拆两套；按「内容主知识对象」归入唯一一类
   - 仅作用于「今后新抓取」的条目；存量数据一个字段都不改
   - 前端 assets/js/pages-info.js 内有等价的 legacyToTopic7（展示层归一），两处改动需同步
   ============================================================ */

export const TOPIC7 = Object.freeze([
  '产业动态',       // ① Corporate & Industry Dynamics
  '政策与标准',     // ② Policy, Regulation & Standards
  '市场与数据',     // ③ Market & Data Intelligence
  '消费者与用户',   // ④ Consumer & User Insights
  '产品与感官',     // ⑤ Product & Sensory Science
  '趋势与前瞻',     // ⑥ Trends & Foresight
  '战略与方法',     // ⑦ Strategy & Methodology
]);

export function isTopic7(v) {
  return typeof v === 'string' && TOPIC7.includes(v);
}

// 旧桶名 → 7 主题：仅用于「展示层归一」，让存量条目仍能被 7 主题筛选到，数据本身不改写
const LEGACY_MAP = {
  // news 旧 cat
  '政策法规': '政策与标准', '监管执法': '政策与标准', '海外监管': '政策与标准',
  '欧洲监管': '政策与标准', '控烟监管': '政策与标准', '烟草监管': '政策与标准',
  '出口贸易': '产业动态', '巨头动向': '产业动态', '企业动态': '产业动态',
  '市场数据': '市场与数据', '市场动态': '市场与数据',
  '趋势洞察': '趋势与前瞻', '产品技术': '产品与感官', '电子烟': '产品与感官',
  // insights 旧 topic
  '感官研究': '产品与感官', '感官分析': '产品与感官', '包装趋势': '产品与感官',
  '食品饮料': '产品与感官', '快消日化': '产品与感官', '技术 · 工具': '产品与感官',
  '消费电子': '产品与感官',
  '消费者洞察': '消费者与用户', '体验设计': '消费者与用户', '餐饮消费': '消费者与用户',
  '市场洞察': '市场与数据', '零售渠道': '市场与数据',
  '出海趋势': '趋势与前瞻', '食品科学 · 趋势': '趋势与前瞻',
  '行业洞察': '战略与方法', '行业态势': '战略与方法', '学术 · 争议': '战略与方法',
  '方法论 · AI': '战略与方法', '品牌营销': '战略与方法',
};

// 板块侧重兜底（无关键词、无源命中时）：news 偏 ①，insights 偏 ③
const GROUP_FALLBACK = { news: '产业动态', insights: '市场与数据' };

/** 把任意旧桶名归一到 7 主题之一（展示层用，不改数据） */
export function legacyToTopic7(old, group) {
  if (isTopic7(old)) return old;
  if (old && LEGACY_MAP[old]) return LEGACY_MAP[old];
  return GROUP_FALLBACK[group] || '产业动态';
}

// 关键词规则：按「主知识对象」有序判定，命中即返回（保证互斥）
const KEYWORD_RULES = [
  [/法规|监管|国标|标准|合规|禁令|税收|政策|认证|食品安全|召回|regulat|ban\b|tax\b|standard|complian|FDA|WHO|policy|directive|legislat|recall|approval/i, '政策与标准'],
  [/感官|风味|口感|质地|香气|嗅觉|味觉|包装|配方|新品|口味|sensory|flavor|flavour|texture|aroma|olfact|packag|formulat|taste|mouthfeel|ingredient/i, '产品与感官'],
  [/消费者|用户|需求|痛点|画像|细分|消费行为|态度|调研|consumer|shopper|behavio|attitude|survey|segment|preference|perception|panelist/i, '消费者与用户'],
  [/市场规模|份额|增速|零售|电商|价格|销量|销售|数据|market share|sales|growth|forecast|retail|data|index| Nielsen|Kantar/i, '市场与数据'],
  [/趋势|前瞻|未来|创新|演化|trend|forecast|future|innovation|outlook|emerging/i, '趋势与前瞻'],
  [/方法论|研究规划|策略|战略|框架|洞察方法|strategy|methodolog|framework|approach|Bain|McKinsey/i, '战略与方法'],
  [/并购|财报|营收|产能|人事|任命|合作|渠道|上市|推出|收购|merger|acquisition|earnings|revenue|appoint|partnership|launch|CEO/i, '产业动态'],
];

// 源名 → 默认主题（关键词都不命中时的兜底，取定本「典型源」与侧重画像）
const SOURCE_DEFAULT = [
  [/NielsenIQ|Kantar|凯度|Supermarket News|Food Dive|Retail Dive/i, '市场与数据'],
  [/Ipsos|小食代/i, '消费者与用户'],
  [/Mintel|Foodaily|每日食品|Innova/i, '趋势与前瞻'],
  [/Bain|Marketing Dive|贝恩/i, '战略与方法'],
  [/国家烟草局|烟草专卖|Tobacco Tactics|FDA|WHO|Food Safety News|东方烟草网|GB 感官|感官分析标准/i, '政策与标准'],
  [/OpenAlex|PubMed|Crossref|Sensory Studies|Texture Studies|Food Quality and Preference|ScienceDaily 感知|ScienceDaily 食品|Packaging Dive/i, '产品与感官'],
];

/** 新条目分类：标题+摘要关键词优先 → 源默认 → 板块侧重兜底；返回值恒为 7 主题之一（MECE） */
export function classifyTopic7(text, srcName, group) {
  const t = String(text || '');
  for (const [re, topic] of KEYWORD_RULES) if (re.test(t)) return topic;
  const s = String(srcName || '');
  for (const [re, topic] of SOURCE_DEFAULT) if (re.test(s)) return topic;
  return GROUP_FALLBACK[group] || '产业动态';
}
