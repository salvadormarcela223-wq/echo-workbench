# -*- coding: utf-8 -*-
import json

P = 'data/feed.json'
raw = open(P, 'rb').read()
if raw[:3] == b'\xef\xbb\xbf':
    raw = raw[3:]
feed = json.loads(raw)

# ---------- 1) 给现有 13 条专业提升补 dimension 维度标签 ----------
def map_dim(title):
    t = (title or '')
    if any(k in t for k in ['法规', '禁止', '禁令', '监管', '合规', '政策', '条例']):
        return '法规合规'
    if any(k in t for k in ['包装', '设计', '透明', '拆箱']):
        return '包装与设计'
    if any(k in t for k in ['感官', '风味', '凉', '闻', '质构', '香气']):
        return '感官与风味'
    if any(k in t for k in ['AI', '人工', '科技', '智能', '创新', '家电']):
        return 'FMCG创新'
    if any(k in t for k in ['市场', '报告', 'GLP', '消费趋势', '购物者', '亿', '数据']):
        return '市场与报告'
    if any(k in t for k in ['消费者', '趋势', '洞察', '食饮', '预测']):
        return '消费者洞察'
    return '消费者洞察'

for it in feed['insights']:
    if not it.get('dimension'):
        it['dimension'] = map_dim(it.get('title', ''))
print('现有专业提升维度:', sorted({i.get('dimension') for i in feed['insights']}))

# ---------- 2) 新增专业提升（补齐缺失维度：法规合规 + 强化包装/感官） ----------
new_insights = [
    {
        "title": "欧盟 TPD 修订进入新阶段：在线反馈征询释放监管信号",
        "link": "https://ec.europa.eu/info/law/better-regulation/have-your-say/initiatives_en",
        "source": "欧盟委员会",
        "cat": "国际监管",
        "dimension": "法规合规",
        "summary": "欧盟烟草产品指令(TPD)修订启动意见征询，重点涉及一次性产品、口味限制与追踪溯源，将重塑出口欧洲企业的合规边界。",
        "date": "2026-08-01",
        "impact": "对面向欧洲市场的企业：配方与口味策略需提前做合规预案；包装警示与追溯系统要在 2027 前就位。对 CMI：监管收紧会直接改变消费者可接触的产品组合，研究设计须纳入'可得性'变量。",
        "origin": "欧盟委员会"
    },
    {
        "title": "Sensory Unboxing：拆箱体验成为 2026 包装设计核心维度",
        "link": "https://www.packaginginsights.com/special-reports/top-packaging-trends-2026-sustainability-digital-innovation.html",
        "source": "Packaging Insights",
        "cat": "包装设计",
        "dimension": "包装与设计",
        "summary": "Innova 将'感官拆箱(Sensory Unboxing)'列为 2026 包装首要趋势：触觉、声音、开启仪式感共同构成品牌第一印象。",
        "date": "2026-07-28",
        "impact": "包装不再是保护功能，而是感官触点。CMI 研究应把'开箱瞬间'纳入体验测量；新品开发早期就要定义开合的阻尼、声音与确认感（参见阅读文 r-01 盖子研究）。",
        "origin": "Packaging Insights"
    },
    {
        "title": "风味科学的下一步：凉感(凉味剂)正在重构感官评价体系",
        "link": "https://vapetrends360.com/why-ice-flavors-are-winning-the-2026-disposable-market/",
        "source": "Vape Trends 360",
        "cat": "感官风味",
        "dimension": "感官与风味",
        "summary": "Z 世代对'冰感/凉感'的偏好推动凉味剂从附属香型升级为主角，感官评价量表需要新增'凉感强度/持续时间'等维度。",
        "date": "2026-07-20",
        "impact": "对感官研究：传统风味轮无法描述凉感的时间维度，需建立新的描述词表；对产品：凉感成为差异化杠杆，但需避免'凉到麻木'的负面拐点。",
        "origin": "Vape Trends 360"
    },
]
feed['insights'] = new_insights + feed['insights']
print('专业提升现总条数:', len(feed['insights']), '维度:', sorted({i.get('dimension') for i in feed['insights']}))

# ---------- 3) 新增英语阅读（多主题，覆盖商业/感官/营销/研究方法） ----------
new_readings = [
    {
        "id": "r-06",
        "tag": "零售与CMI · 商业",
        "title": "The Quiet Rise of Private Labels",
        "subtitle": "自有品牌的静默崛起",
        "minutes": 9,
        "body": [
            "<p>Walk down any <u>supermarket</u> aisle and you will notice a quiet <u>shift</u>: the store's own brand now sits at eye level, priced below the <u>multinational</u> giants but dressed in packaging that looks anything but cheap.</p>",
            "<p>This is not an accident. Private labels have <u>evolved</u> from 'budget backup' into a <u>strategic</u> weapon. Retailers use them to control margin, test trends faster than national brands, and capture the data of what shoppers actually put in the cart.</p>",
            "<p>For consumer-insight teams, the lesson is uncomfortable: the <u>traditional</u> brand tracker, built around famous names, increasingly misses where growth really happens. The most <u>revealing</u> competitor is often the one with the store's logo on it.</p>",
            "<p>The winning move is to study private labels as a <u>signal</u>, not a threat—they reveal which categories consumers will trade down in, and which they will never compromise on.</p>"
        ],
        "vocab": [
            {"w": "supermarket", "p": "/ˈsuːpəmɑːkɪt/", "t": "n. 超市", "lv": "基础"},
            {"w": "shift", "p": "/ʃɪft/", "t": "n. 转变", "lv": "基础"},
            {"w": "multinational", "p": "/ˌmʌltiˈnæʃənl/", "t": "adj./n. 跨国的（公司）", "lv": "CET6"},
            {"w": "evolved", "p": "/ɪˈvɒlvd/", "t": "v. 进化、演变（evolve过去式）", "lv": "CET6"},
            {"w": "strategic", "p": "/strəˈtiːdʒɪk/", "t": "adj. 战略性的", "lv": "CET6"},
            {"w": "traditional", "p": "/trəˈdɪʃənl/", "t": "adj. 传统的", "lv": "基础"},
            {"w": "revealing", "p": "/rɪˈviːlɪŋ/", "t": "adj. 透露真相的、有启示的", "lv": "雅思"},
            {"w": "signal", "p": "/ˈsɪɡnəl/", "t": "n. 信号、征兆", "lv": "基础"},
            {"w": "compromise", "p": "/ˈkɒmprəmaɪz/", "t": "v. 妥协、退让", "lv": "CET6"}
        ],
        "phrases": [
            {"en": "eye level", "zh": "视线齐平的位置（货架黄金位）"},
            {"en": "trade down", "zh": "降级消费、买更便宜的"},
            {"en": "capture the data", "zh": "捕获（消费）数据"}
        ],
        "cn": "走进任何一家超市的货架通道，你都会注意到一个安静的转变：商店自有品牌现在摆在视线齐平的位置，价格低于那些跨国巨头，但包装看起来一点都不廉价。这并非偶然。自有品牌已经从‘低价备胎’演变成战略武器。零售商用它来控制利润、比全国性品牌更快地试水趋势，并捕获消费者真正放进购物车的数据。对消费者洞察团队来说，这个教训令人不安：围绕知名品牌建立的、传统的品牌监测，越来越难捕捉增长真正发生的地方。最有揭示性的竞争对手，往往是那个印着商店 logo 的产品。制胜之举是把自有品牌当作信号而非威胁来研究——它们揭示了消费者会在哪些品类降级消费，又绝不愿在哪些品类妥协。"
    },
    {
        "id": "r-07",
        "tag": "感官科学 · 健康",
        "title": "Why Texture Is the New Flavor",
        "subtitle": "质地为何成了新的风味",
        "minutes": 10,
        "body": [
            "<p>For decades, food science treated <u>flavor</u> as the hero and texture as the <u>supporting</u> act. That hierarchy is collapsing.</p>",
            "<p>Consumers now describe a yogurt by its <u>creaminess</u>, a snack by its <u>crunch</u>, a drink by its <u>mouthfeel</u>. These words are not <u>decoration</u>—they are how people judge quality when they cannot see the ingredients.</p>",
            "<p>Sensory panels must therefore build <u>lexicons</u> for touch, not just taste. A product that feels 'thin' fails even if it tastes perfect; one that feels 'premium' can <u>justify</u> a higher price.</p>",
            "<p>The practical takeaway: stop asking only 'does it taste good?' Start asking 'how does it feel?'—because for the shopper, feeling is believing.</p>"
        ],
        "vocab": [
            {"w": "flavor", "p": "/ˈfleɪvə/", "t": "n. 风味、味道", "lv": "基础"},
            {"w": "supporting", "p": "/səˈpɔːtɪŋ/", "t": "adj. 辅助的、配角的", "lv": "CET6"},
            {"w": "creaminess", "p": "/ˈkriːminəs/", "t": "n. 奶油般顺滑的口感", "lv": "雅思"},
            {"w": "crunch", "p": "/krʌntʃ/", "t": "n. 脆感、嚼碎的声音", "lv": "CET6"},
            {"w": "mouthfeel", "p": "/ˈmaʊθfiːl/", "t": "n. 口感（食物在嘴里的触感）", "lv": "专业"},
            {"w": "decoration", "p": "/ˌdekəˈreɪʃn/", "t": "n. 装饰", "lv": "CET4"},
            {"w": "lexicons", "p": "/ˈleksɪkɒnz/", "t": "n. 词汇表（lexicon复数）", "lv": "雅思"},
            {"w": "justify", "p": "/ˈdʒʌstɪfaɪ/", "t": "v. 证明…合理", "lv": "CET6"},
            {"w": "premium", "p": "/ˈpriːmiəm/", "t": "adj. 高端的、优质的", "lv": "CET6"}
        ],
        "phrases": [
            {"en": "supporting act", "zh": "配角、辅助角色"},
            {"en": "hierarchy is collapsing", "zh": "等级秩序正在崩塌"},
            {"en": "feeling is believing", "zh": "感受即相信（化用 seeing is believing）"}
        ],
        "cn": "几十年来，食品科学把风味当作主角，把质地当作配角。这种等级正在崩塌。如今的消费者用酸奶的‘丝滑’、零食的‘脆’、饮料的‘口感’来描述产品。这些词不是装饰——当消费者看不见配料表时，它们正是人们判断品质的方式。因此，感官小组必须建立关于‘触觉’而不仅是‘味觉’的词表。一款感觉‘单薄’的产品，即使味道完美也会失败；一款感觉‘高端’的产品，则能为更高定价提供理由。实际结论：别只问‘好吃吗’，要开始问‘感觉如何’——因为对购物者而言，感受即相信。"
    },
    {
        "id": "r-08",
        "tag": "营销心理 · 文化",
        "title": "The Psychology of 'New and Improved'",
        "subtitle": "'新升级'背后的心理学",
        "minutes": 8,
        "body": [
            "<p>Why does adding the word 'new' to a package <u>lift</u> sales, even when the recipe barely changed? The answer lives in how the brain <u>processes</u> novelty.</p>",
            "<p>Novelty triggers a small <u>dopamine</u> response—a tiny promise that something better might be inside. Marketers <u>exploit</u> this by refreshing labels far more often than the product itself.</p>",
            "<p>But there is a risk. If 'new' appears too often, it loses <u>credibility</u> and the brand starts to sound <u>desperate</u>. The smart play is to pair novelty with a real, <u>perceptible</u> difference a shopper can actually feel.</p>",
            "<p>For researchers, the task is to separate genuine <u>innovation</u> from theatrical relaunch—because only the former builds loyalty.</p>"
        ],
        "vocab": [
            {"w": "lift", "p": "/lɪft/", "t": "v. 提升（销量）", "lv": "基础"},
            {"w": "processes", "p": "/ˈprəʊsesɪz/", "t": "v. 处理、加工（process单三）", "lv": "基础"},
            {"w": "dopamine", "p": "/ˈdəʊpəmiːn/", "t": "n. 多巴胺（ neurotransmitters）", "lv": "专业"},
            {"w": "exploit", "p": "/ɪkˈsplɔɪt/", "t": "v. 利用、开发", "lv": "CET6"},
            {"w": "credibility", "p": "/ˌkredəˈbɪləti/", "t": "n. 可信度", "lv": "雅思"},
            {"w": "desperate", "p": "/ˈdespərət/", "t": "adj. 绝望的、急切的", "lv": "CET4"},
            {"w": "perceptible", "p": "/pəˈseptəbl/", "t": "adj. 可感知的", "lv": "雅思"},
            {"w": "innovation", "p": "/ˌɪnəˈveɪʃn/", "t": "n. 创新", "lv": "CET4"}
        ],
        "phrases": [
            {"en": "theatrical relaunch", "zh": "噱头式重新上市"},
            {"en": "pair novelty with", "zh": "把新鲜感与…配对"},
            {"en": "build loyalty", "zh": "建立忠诚度"}
        ],
        "cn": "为什么在包装上加一个‘新’字就能拉升销量，即便配方几乎没变？答案藏在大脑如何处理‘新奇’之中。新奇会触发一小波多巴胺反应——一个‘里面可能有更好的东西’的微小承诺。营销者正是通过比产品本身频繁得多的换标，来利用这一点。但风险在于：如果‘新’出现得太频繁，它会失去可信度，品牌听起来像在 desperation（ desperation）。聪明的做法是把新奇感与消费者真正能感受到的、实在的差异配对。对研究者而言，任务是区分真正的创新与噱头式重新上市——因为唯有前者能建立忠诚。"
    },
    {
        "id": "r-09",
        "tag": "研究方法 · 科技",
        "title": "When the AI Becomes the Respondent",
        "subtitle": "当 AI 成为受访者",
        "minutes": 10,
        "body": [
            "<p>Research teams are now using large language models as <u>stand-in</u> consumers—cheap, fast, and available at any hour. It feels like a <u>breakthrough</u>.</p>",
            "<p>But a model can only <u>interpolate</u> from what it has already read. It will faithfully <u>reproduce</u> the biases of past surveys and never surprise you with the insight you did not think to ask for.</p>",
            "<p>The most valuable moments in real research are <u>anomalies</u>—the respondent who mishears the question, or answers from left field. Models are trained precisely not to do that.</p>",
            "<p>So treat AI as a <u>drafting</u> partner, never the <u>population</u>. Use it to sharpen the brief; use humans to break it.</p>"
        ],
        "vocab": [
            {"w": "stand-in", "p": "/ˈstændɪn/", "t": "n. 替身、代替者", "lv": "专业"},
            {"w": "breakthrough", "p": "/ˈbreɪkθruː/", "t": "n. 突破", "lv": "CET4"},
            {"w": "interpolate", "p": "/ɪnˈtɜːpəleɪt/", "t": "v. 插值、推算", "lv": "专业"},
            {"w": "reproduce", "p": "/ˌriːprəˈdjuːs/", "t": "v. 复制、再现", "lv": "CET4"},
            {"w": "anomalies", "p": "/əˈnɒməliz/", "t": "n. 异常、反常（anomaly复数）", "lv": "雅思"},
            {"w": "drafting", "p": "/ˈdrɑːftɪŋ/", "t": "adj. 起草的（draft的现在分词）", "lv": "CET6"},
            {"w": "population", "p": "/ˌpɒpjuˈleɪʃn/", "t": "n. 总体、人口（研究中的被访总体）", "lv": "CET4"}
        ],
        "phrases": [
            {"en": "stand-in consumers", "zh": "替代消费者的角色"},
            {"en": "from left field", "zh": "突如其来、出人意料（源自棒球）"},
            {"en": "sharpen the brief", "zh": "打磨研究简报"}
        ],
        "cn": "研究团队现在把大语言模型当作‘替身消费者’来用——便宜、快速、随时可用。这感觉像一次突破。但模型只能从它已读过的东西里插值，它会忠实地再现过去问卷的偏见，永远不会用你没想到的洞察来惊喜你。真实研究中最有价值的时刻，恰恰是那些异常——听错问题的受访者，或者答非所问的人。而模型恰恰被训练得不去那样做。所以，把 AI 当作起草伙伴，绝不要当作被访总体。用它来打磨简报，用人类来打破简报。"
    },
]
feed['readings'] = feed['readings'] + new_readings
print('英语阅读现总篇数:', len(feed['readings']), '主题:', [r.get('tag') for r in feed['readings']])

# 写回（保持无 BOM 的 utf-8）
with open(P, 'wb') as f:
    f.write(json.dumps(feed, ensure_ascii=False, indent=2).encode('utf-8'))
print('feed.json 已写回（无 BOM）')
