/* ============================================================
   板块四【英语学习】· 情景对话库（每日随机，约 10 分钟精读+跟读）
   场景覆盖：旅行 / 日常 / 感官研究与 CMI 专业场景
   ============================================================ */
window.SEED_DIALOGS = [
  {
    id: 'd-01',
    scene: '专业 · 感官评估',
    title: 'Briefing a Descriptive Panel',
    zhTitle: '为描述性感官评价小组做导入简报',
    minutes: 10,
    goal: '掌握主持感官评价小组时的标准指令语言与"去引导化"表达。',
    lines: [
      { r: 'You', en: "Good morning, everyone. Before we start, a quick reminder: we are not looking for whether you like the sample. We are looking for what you perceive.", zh: '早上好。开始之前提醒一下：我们不是要知道你喜不喜欢这个样品，而是要知道你感知到了什么。' },
      { r: 'Panelist', en: "So we should keep preference out of it entirely?", zh: '所以我们要完全把偏好排除在外？' },
      { r: 'You', en: "Exactly. Intensity, not preference. If something is very sweet and you personally hate it, the score is still high.", zh: '正是。评的是强度，不是喜好。如果某样东西很甜而你个人讨厌它，分数依然要打高。' },
      { r: 'Panelist', en: "Understood. And the order of the samples?", zh: '明白了。样品顺序呢？' },
      { r: 'You', en: "Balanced and randomised, as always. Please cleanse your palate with water and the unsalted cracker between each one, and wait ninety seconds.", zh: '照例是平衡随机化的。每个样品之间请用清水和无盐饼干清口，并等待 90 秒。' },
      { r: 'Panelist', en: "What if I pick up an attribute that is not on the ballot?", zh: '如果我感知到一个评分表上没有的属性怎么办？' },
      { r: 'You', en: "Write it in the open field. Honestly, those are often the most useful lines on the whole sheet.", zh: '写在开放栏里。说实话，那些往往是整张表上最有价值的内容。' },
      { r: 'Panelist', en: "Should I try to match the vocabulary we agreed on in training?", zh: '我需要尽量用我们培训时统一的词汇吗？' },
      { r: 'You', en: "Use the lexicon where it fits, but do not force it. A forced term hides more than it reveals.", zh: '合适的地方就用词典里的术语，但别硬套。硬套的术语掩盖的比揭示的多。' },
      { r: 'You', en: "One last thing — no discussion during evaluation. We compare notes only in the debrief.", zh: '最后一点——评价过程中不要交流。我们只在总结环节比对结果。' }
    ],
    keys: [
      { en: 'intensity, not preference', zh: '评强度，不评偏好（感官分析第一原则）' },
      { en: 'cleanse your palate', zh: '清口' },
      { en: 'balanced and randomised', zh: '平衡随机化（样品呈送设计）' },
      { en: 'ballot', zh: '（感官评价的）评分表' },
      { en: 'lexicon', zh: '感官词典 / 术语表' },
      { en: 'debrief', zh: '（研究结束后的）复盘、总结会' }
    ]
  },
  {
    id: 'd-02',
    scene: '专业 · 客户汇报',
    title: 'Presenting Findings the Client Did Not Want',
    zhTitle: '汇报一个客户不想听到的结论',
    minutes: 10,
    goal: '练习在坏消息中保持专业与建设性的商务表达。',
    lines: [
      { r: 'Client', en: "So, bottom line — does the new formulation win?", zh: '所以，直接说结论——新配方赢了吗？' },
      { r: 'You', en: "Not on the measure you asked about. But I would argue you were asking about the wrong measure.", zh: '在你问的那个指标上没有。但我认为，你问的可能不是该问的那个指标。' },
      { r: 'Client', en: "Go on.", zh: '你说。' },
      { r: 'You', en: "Overall liking is flat — statistically indistinguishable. However, the new formulation scores significantly higher on perceived care and product quality cues.", zh: '总体喜好度持平，统计上无差异。但新配方在"感知到的用心程度"和"品质线索"上显著更高。' },
      { r: 'Client', en: "Does that translate into anything commercial?", zh: '这能转化成商业结果吗？' },
      { r: 'You', en: "It correlates strongly with repurchase intent in this category. Liking predicts the first purchase; quality cues predict the fourth.", zh: '在这个品类里，它与复购意向高度相关。喜好度预测第一次购买，品质线索预测第四次。' },
      { r: 'Client', en: "That is a bolder claim than I expected from you.", zh: '这比我预期的你会说的话要大胆。' },
      { r: 'You', en: "It is in the appendix with the regression. I would rather show you the uncomfortable version now than the comfortable one in six months.", zh: '附录里有回归结果。我宁愿现在给你看那个不舒服的版本，也不想六个月后给你看那个舒服的版本。' },
      { r: 'Client', en: "Fair. What would you do if this were your decision?", zh: '有道理。如果是你来定，你会怎么做？' },
      { r: 'You', en: "Ship it, but rewrite the claim. You are selling reassurance, not novelty.", zh: '上市，但改掉宣称。你卖的是安心感，不是新奇感。' }
    ],
    keys: [
      { en: 'bottom line', zh: '结论是 / 底线是' },
      { en: 'statistically indistinguishable', zh: '统计上无显著差异' },
      { en: 'repurchase intent', zh: '复购意向' },
      { en: 'correlates strongly with', zh: '与……高度相关' },
      { en: 'I would rather ... than ...', zh: '我宁愿……也不愿……' },
      { en: 'ship it', zh: '（产品）发布上市' }
    ]
  },
  {
    id: 'd-03',
    scene: '旅行 · 机场',
    title: 'A Tight Connection',
    zhTitle: '中转时间很紧',
    minutes: 9,
    goal: '掌握机场改签、行李与登机口相关的高频表达。',
    lines: [
      { r: 'You', en: "Excuse me, my inbound flight was delayed and I have fifty minutes to make my connection. Will I be all right?", zh: '打扰一下，我来程航班延误了，中转只剩 50 分钟。来得及吗？' },
      { r: 'Agent', en: "It is tight but doable. Are you checked through to your final destination?", zh: '有点紧但可以。您的行李是直挂到终点的吗？' },
      { r: 'You', en: "Yes, my luggage is tagged all the way through. Do I need to clear security again?", zh: '是的，行李直挂到底。我需要重新过安检吗？' },
      { r: 'Agent', en: "You will, at the transfer point. Follow the purple signs, and mention your connection time at the desk — they can fast-track you.", zh: '需要，在中转处。跟着紫色指示牌走，在柜台说明您的中转时间，他们可以帮您走快速通道。' },
      { r: 'You', en: "That is a relief. And if I miss it, what are my options?", zh: '那我就放心了。万一没赶上，我有什么选择？' },
      { r: 'Agent', en: "You would be rebooked on the next available flight at no charge, since the delay was ours.", zh: '因为延误是我们造成的，您会被免费改签到下一个有位的航班。' },
      { r: 'You', en: "Could you note my seat preference now, just in case? Aisle, towards the front.", zh: '能不能现在先记下我的座位偏好，以防万一？靠走道，靠前一点。' },
      { r: 'Agent', en: "Noted. Here is your boarding pass. Gate B22 — boarding closes twenty minutes before departure.", zh: '记下了。这是您的登机牌。B22 登机口，起飞前 20 分钟停止登机。' },
      { r: 'You', en: "Thank you. One more thing — is there anywhere to grab a quick coffee on the way?", zh: '谢谢。还有一件事——路上有地方能快速买杯咖啡吗？' },
      { r: 'Agent', en: "There is a kiosk right past security. Honestly, with fifty minutes, I would skip it.", zh: '过了安检就有个小店。不过说实话，只有 50 分钟的话，我建议您别去了。' }
    ],
    keys: [
      { en: 'make my connection', zh: '赶上中转航班' },
      { en: 'checked through to', zh: '（行李）直挂至' },
      { en: 'clear security', zh: '通过安检' },
      { en: 'fast-track', zh: '走快速通道' },
      { en: 'rebook at no charge', zh: '免费改签' },
      { en: 'boarding closes', zh: '停止登机' }
    ]
  },
  {
    id: 'd-04',
    scene: '日常 · 社交',
    title: 'Explaining What You Do at a Dinner Party',
    zhTitle: '在饭局上解释你到底是做什么的',
    minutes: 9,
    goal: '练习用非专业语言介绍专业工作，这是最难也最有用的能力。',
    lines: [
      { r: 'Friend', en: "So what do you actually do? Something with market research?", zh: '你到底是做什么的？跟市场调研有关？' },
      { r: 'You', en: "Sort of. I work on how products feel — taste, texture, smell — and why people prefer one over another.", zh: '算是吧。我研究产品给人的感受——味道、质地、气味——以及人们为什么更偏爱其中一个。' },
      { r: 'Friend', en: "Wait, that is a real job? Who pays for that?", zh: '等等，这是个真实存在的职业？谁会为这个付钱？' },
      { r: 'You', en: "Anyone who makes something you put in your mouth or on your skin. If two products cost the same, the one that feels right wins.", zh: '任何做入口或上脸产品的公司。两个产品价格一样，感觉对的那个就赢了。' },
      { r: 'Friend', en: "Give me an example.", zh: '举个例子。' },
      { r: 'You', en: "Sure. Think about the sound a jar makes when you first open it. That pop is engineered, and it makes the food taste fresher.", zh: '好。想想第一次拧开一个罐子时的声音。那声"啵"是设计出来的，它会让食物尝起来更新鲜。' },
      { r: 'Friend', en: "You are telling me I have been manipulated by a lid.", zh: '你是说我一直在被一个盖子操纵。' },
      { r: 'You', en: "I would say informed by a lid. Your brain uses every clue it can get, and sound is a very cheap clue.", zh: '我会说是被一个盖子"告知"了。你的大脑会用上一切能拿到的线索，而声音是最廉价的一种。' },
      { r: 'Friend', en: "Does knowing all this ruin it for you?", zh: '知道这些会不会让你失去乐趣？' },
      { r: 'You', en: "Occasionally. But mostly it does the opposite — it turns an ordinary Tuesday breakfast into something worth paying attention to.", zh: '偶尔会。但大多数时候是反过来的——它让一个普通周二的早餐变成值得留意的东西。' }
    ],
    keys: [
      { en: 'sort of', zh: '算是吧（口语缓冲）' },
      { en: 'the one that feels right wins', zh: '感觉对的那个就赢了' },
      { en: 'engineered', zh: '被刻意设计出来的' },
      { en: 'manipulated / informed', zh: '被操纵 / 被告知（一组有分寸感的对比）' },
      { en: 'ruin it for you', zh: '让你失去乐趣' },
      { en: 'worth paying attention to', zh: '值得留意的' }
    ]
  },
  {
    id: 'd-05',
    scene: '专业 · 跨部门协作',
    title: 'Pushing Back on an Impossible Timeline',
    zhTitle: '拒绝一个不可能的排期',
    minutes: 10,
    goal: '练习职场中"有边界感但不对抗"的英文表达。',
    lines: [
      { r: 'PM', en: "We need the consumer test results by the fifteenth. Can you make that work?", zh: '我们需要在 15 号前拿到消费者测试结果。你能做到吗？' },
      { r: 'You', en: "Let me walk you through what fifteenth would require, and then you can decide.", zh: '我先带你过一遍 15 号意味着什么，然后你来决定。' },
      { r: 'PM', en: "Okay.", zh: '好。' },
      { r: 'You', en: "Recruitment alone is eight working days for this profile. That leaves two days for fieldwork and one for analysis.", zh: '光是招募这类人群就要 8 个工作日。剩下 2 天做执行，1 天做分析。' },
      { r: 'PM', en: "Could we shorten recruitment?", zh: '招募能压缩吗？' },
      { r: 'You', en: "We could, but then we take whoever is available, and 'whoever is available' is a real bias, not a rounding error.", zh: '可以，但那样我们只能要"谁有空要谁"，而"谁有空"是一个真实的偏差，不是舍入误差。' },
      { r: 'PM', en: "What would you propose?", zh: '你的建议是？' },
      { r: 'You', en: "Two options. A directional read on the fifteenth with a clear health warning, or a defensible result on the twenty-second.", zh: '两个选项。15 号给一个方向性判断，并附明确的局限说明；或者 22 号给一个经得起挑战的结论。' },
      { r: 'PM', en: "The steering committee meets on the eighteenth.", zh: '指导委员会 18 号开会。' },
      { r: 'You', en: "Then take the directional read, and let me write the caveat slide myself. If someone quotes it out of context in a board deck, we both pay for it.", zh: '那就用方向性判断，但局限说明那页让我自己写。如果有人把它断章取义放进董事会材料，我们两个都要付代价。' },
      { r: 'PM', en: "Deal.", zh: '成交。' }
    ],
    keys: [
      { en: 'walk you through', zh: '带你梳理一遍' },
      { en: 'directional read', zh: '方向性判断（非定论性结论）' },
      { en: 'defensible result', zh: '经得起质疑的结论' },
      { en: 'health warning / caveat', zh: '（结论的）局限提示' },
      { en: 'quote it out of context', zh: '断章取义地引用' },
      { en: 'not a rounding error', zh: '不是可以忽略的小误差' }
    ]
  },
  {
    id: 'd-06',
    scene: '旅行 · 酒店与餐厅',
    title: 'A Room With a Problem',
    zhTitle: '房间出了点问题',
    minutes: 8,
    goal: '练习礼貌而坚定的投诉与协商。',
    lines: [
      { r: 'You', en: "Hi, I checked in about an hour ago into 704. I am afraid the room is not going to work.", zh: '你好，我大约一小时前入住 704。恐怕这个房间不太行。' },
      { r: 'Staff', en: "I am sorry to hear that. May I ask what the issue is?", zh: '很抱歉。方便问一下是什么问题吗？' },
      { r: 'You', en: "There is a persistent smell of damp, and the air conditioning is quite loud. I have an early start tomorrow.", zh: '有一股持续的潮味，空调也挺吵。我明天要早起。' },
      { r: 'Staff', en: "Let me see what else we have. We are fairly full tonight.", zh: '我看看还有什么房。今晚我们几乎满房。' },
      { r: 'You', en: "I appreciate that. I am not asking for an upgrade — just somewhere quiet and dry.", zh: '我理解。我不是要求升级——只想要一个安静干燥的房间。' },
      { r: 'Staff', en: "I can offer you 1102. It is a similar layout, higher floor, away from the lift shaft.", zh: '我可以给您 1102。户型相近，楼层更高，远离电梯井。' },
      { r: 'You', en: "That sounds much better. Could someone help me move the bags?", zh: '那好多了。能安排人帮我搬一下行李吗？' },
      { r: 'Staff', en: "Of course. And I will note a late checkout on your booking for the inconvenience.", zh: '当然。另外我会在您的订单上备注延迟退房，作为对不便的补偿。' },
      { r: 'You', en: "That is very kind — thank you for sorting it out so quickly.", zh: '太贴心了——谢谢你这么快就处理好。' }
    ],
    keys: [
      { en: 'is not going to work', zh: '（这个安排）不太行（委婉表达）' },
      { en: 'persistent smell of damp', zh: '持续的潮湿气味' },
      { en: 'I am not asking for an upgrade', zh: '我并不是要求升级（降低对抗感）' },
      { en: 'away from the lift shaft', zh: '远离电梯井' },
      { en: 'late checkout', zh: '延迟退房' },
      { en: 'sort it out', zh: '把事情解决好' }
    ]
  },
  {
    id: 'd-07',
    scene: '专业 · 行业社交',
    title: 'Small Talk at a Conference Coffee Break',
    zhTitle: '会议茶歇上的专业闲聊',
    minutes: 9,
    goal: '练习从寒暄自然过渡到有价值的专业交流。',
    lines: [
      { r: 'Stranger', en: "That last session was a bit of a sales pitch, was it not?", zh: '刚那场基本就是个推销吧？' },
      { r: 'You', en: "A little. Though the bit about implicit measurement was worth staying for.", zh: '有一点。不过关于内隐测量的那一段还是值得留下来听的。' },
      { r: 'Stranger', en: "Are you on the client side or agency?", zh: '你是甲方还是乙方？' },
      { r: 'You', en: "Client side — I look after sensory and consumer insights for a personal care portfolio.", zh: '甲方——我负责一个个护品类组合的感官与消费者洞察。' },
      { r: 'Stranger', en: "Then you must be dealing with the AI question constantly.", zh: '那你肯定天天在面对 AI 那个问题。' },
      { r: 'You', en: "Constantly. My working position is that AI is excellent before fieldwork and dangerous after it.", zh: '天天。我目前的立场是：AI 在田野之前很好用，在田野之后很危险。' },
      { r: 'Stranger', en: "That is a neat way of putting it. Where do you draw the line exactly?", zh: '这个说法很精炼。你具体在哪里划这条线？' },
      { r: 'You', en: "Anything that generates hypotheses, yes. Anything that generates respondents, no.", zh: '任何用来生成假设的，可以。任何用来生成受访者的，不行。' },
      { r: 'Stranger', en: "I might steal that for my next steering group.", zh: '我下次开指导会可能要借用一下这句。' },
      { r: 'You', en: "Please do. Are you around for the afternoon panel? I would be curious what you make of it.", zh: '尽管用。你下午的圆桌还在吗？我挺想听听你怎么看。' }
    ],
    keys: [
      { en: 'a bit of a sales pitch', zh: '有点像推销' },
      { en: 'worth staying for', zh: '值得留下来听' },
      { en: 'client side / agency side', zh: '甲方 / 乙方' },
      { en: 'my working position is', zh: '我目前的（暂定）立场是' },
      { en: 'where do you draw the line', zh: '你在哪里划界限' },
      { en: 'what you make of it', zh: '你怎么看待它' }
    ]
  }
  ,
  {
    id: 'd-08',
    scene: '专业 · 焦点小组',
    title: 'Moderating a Focus Group',
    zhTitle: '主持一场焦点小组访谈',
    minutes: 11,
    goal: '练习在焦点小组中保持中立、追问而不引导、妥善处理冷场与分歧。',
    lines: [
      { r: 'Moderator', en: "Let's start simple — when you first tasted this, what was the very first thing that came to mind?", zh: '咱们从简单处开始——你第一口尝到时，最先冒出来的念头是什么？' },
      { r: 'Respondent A', en: "It felt… clean? Like, not heavy on the tongue.", zh: '感觉……很干净？就是说，舌头上不厚重。' },
      { r: 'Moderator', en: "Clean — can you stay with that word for a second? What makes it feel clean versus, say, watery?", zh: '“干净”——你能就这个词再多说一点吗？它和所谓“寡淡”的区别在哪？' },
      { r: 'Respondent B', en: "For me clean means no aftertaste. Watery would be thin and forgettable.", zh: '对我来说干净就是没有余味。寡淡则是单薄、喝完就忘了。' },
      { r: 'Moderator', en: "Good distinction. Anyone feel something different in the aftertaste?", zh: '这个区分很好。有人对余味有不同感受吗？' },
      { r: 'Respondent C', en: "There's a slight bitterness at the end. Not bad, just… present.", zh: '尾段有一点苦。不讨厌，就是……存在感。' },
      { r: 'Moderator', en: "Noted — a late bitterness. And does that bitterness make you want to take another sip, or stop?", zh: '记下了——尾段苦。这种苦是让你想再喝一口，还是想停下？' },
      { r: 'Respondent A', en: "Actually it makes me curious. I'd go again.", zh: '其实它让我有点好奇。我会再喝。' },
      { r: 'Moderator', en: "Curious is interesting. So the bitterness isn't a reject signal here?", zh: '“好奇”这个点有意思。所以这里的苦并不是拒绝信号？' },
      { r: 'Respondent C', en: "No, it feels intentional. Like the product knows what it's doing.", zh: '不是，它感觉是刻意的。像产品心里有数。' }
    ],
    keys: [
      { en: 'first thing that came to mind', zh: '最先想到的（念头）' },
      { en: 'stay with that word', zh: '就这个词再展开' },
      { en: 'aftertaste', zh: '余味 / 后味' },
      { en: 'late bitterness', zh: '尾段苦感' },
      { en: 'reject signal', zh: '（消费者的）拒绝信号' }
    ]
  },
  {
    id: 'd-09',
    scene: '日常 · 咖啡店',
    title: 'Ordering at a Café',
    zhTitle: '在咖啡店点单',
    minutes: 8,
    goal: '掌握点单、定制规格、堂食外带与确认等待时间的日常高频表达。',
    lines: [
      { r: 'Barista', en: "Hi! What can I get for you?", zh: '您好！要点点什么？' },
      { r: 'You', en: "Could I get a medium flat white, please? With oat milk if you have it.", zh: '麻烦来一杯中杯澳白，可以的话用燕麦奶。' },
      { r: 'Barista', en: "Sure — oat milk, medium flat white. Anything to eat?", zh: '好的——燕麦奶，中杯澳白。要配点吃的吗？' },
      { r: 'You', en: "Maybe one of those almond croissants. Is it still warm?", zh: '来一个那个杏仁可颂吧。现在还是热的吗？' },
      { r: 'Barista', en: "Just came out of the oven. Want it heated a little more?", zh: '刚出炉。要再加热一下吗？' },
      { r: 'You', en: "That'd be great, thank you. And could I get that to stay, not takeaway?", zh: '那太好了，谢谢。这杯我要堂食，不要外带。' },
      { r: 'Barista', en: "For here. Name for the cup?", zh: '堂食。杯子写什么名字？' },
      { r: 'You', en: "It's Echo. How long should I expect to wait?", zh: '写 Echo。大概要等多久？' },
      { r: 'Barista', en: "About four minutes — I'll bring it over to your table.", zh: '大概四分钟——我给你送到座位上。' },
      { r: 'You', en: "Perfect, thanks so much.", zh: '太好了，非常感谢。' }
    ],
    keys: [
      { en: 'medium flat white', zh: '中杯澳白' },
      { en: 'oat milk', zh: '燕麦奶' },
      { en: 'to stay / for here', zh: '堂食' },
      { en: 'takeaway', zh: '外带' },
      { en: 'bring it over', zh: '送过来（到座位）' }
    ]
  },
  {
    id: 'd-10',
    scene: '专业 · 供应商规格',
    title: 'Negotiating a Specification With a Supplier',
    zhTitle: '与供应商谈一份感官规格',
    minutes: 12,
    goal: '练习就感官规格、批次公差与交付节奏与供应商沟通，守住品质底线。',
    lines: [
      { r: 'Supplier', en: "So you want the sweetness capped at level 3 on your scale?", zh: '所以你们希望甜度上限压在你们量表的 3 级？' },
      { r: 'You', en: "Level 3, and critically — no more than a half-step variance between batches.", zh: '3 级，而且关键是——批次之间波动不能超过半级。' },
      { r: 'Supplier', en: "Half a step is tight. That means we re-calibrate the line every run.", zh: '半级很紧。那意味着每批我们都要重新校准产线。' },
      { r: 'You', en: "I understand the cost. But the consumer test showed anything above 3.5 drops purchase intent.", zh: '成本我理解。但消费者测试显示，超过 3.5 购买意向就掉。' },
      { r: 'Supplier', en: "Fair. What if we hold 3.0 to 3.3 and flag anything outside?", zh: '合理。那我们控制在 3.0 到 3.3，超出的做标记，行吗？' },
      { r: 'You', en: "That works, as long as the flag triggers a hold, not a shipment.", zh: '可以，前提是标记触发的是“扣留”，不是“发货”。' },
      { r: 'Supplier', en: "Agreed — out-of-band goes to quarantine, not the truck.", zh: '同意——超范围的进待检区，不上车。' },
      { r: 'You', en: "And lead time? We can't promise the same volume if batches fail.", zh: '那交期呢？如果批次出问题，我们给不了同样产量。' },
      { r: 'Supplier', en: "We'll build in a 10% buffer stock. You get first refusal on it.", zh: '我们会留 10% 缓冲库存。你们有优先调配权。' },
      { r: 'You', en: "Good. Let's put the tolerance in writing before pilot.", zh: '好。试点前我们把公差写进合同。' }
    ],
    keys: [
      { en: 'capped at level 3', zh: '上限控制在 3 级' },
      { en: 'variance between batches', zh: '批次间差异 / 波动' },
      { en: 'purchase intent', zh: '购买意向' },
      { en: 'out-of-band', zh: '超出规格范围' },
      { en: 'quarantine', zh: '（品质）待检 / 隔离' }
    ]
  },
  {
    id: 'd-11',
    scene: '旅行 · 问路',
    title: 'Getting Directions on the Street',
    zhTitle: '在街上问路',
    minutes: 9,
    goal: '掌握问路、确认距离、交通方式切换与表达感谢的实用句型。',
    lines: [
      { r: 'You', en: "Excuse me, is the metro station far from here?", zh: '打扰一下，地铁站离这儿远吗？' },
      { r: 'Local', en: "Which one? There are two within walking distance.", zh: '哪个站？步行范围内有两个。' },
      { r: 'You', en: "The one near the museum — line 4, I think.", zh: '博物馆旁边那个——应该是 4 号线。' },
      { r: 'Local', en: "That's about a ten-minute walk, straight down this street, then left at the church.", zh: '走过去大概十分钟，沿这条街一直走，到教堂左转。' },
      { r: 'You', en: "Straight, then left at the church. And is it signposted?", zh: '一直走，教堂左转。那儿有路牌指示吗？' },
      { r: 'Local', en: "Mostly. But the sign's small — look up, not at the shops.", zh: '基本有。但牌子小——抬头看，别盯店铺。' },
      { r: 'You', en: "Got it. Could I take a bus instead, if I get lost?", zh: '明白了。万一迷路，我能坐公交吗？' },
      { r: 'Local', en: "Bus 11 stops right there. But walking's quicker at this hour.", zh: '11 路公交就在那儿停。不过这会儿走路更快。' },
      { r: 'You', en: "Perfect, I'll walk. Thank you, you saved me.", zh: '太好了，我走过去。谢谢你，帮了大忙。' },
      { r: 'Local', en: "No problem — enjoy the museum.", zh: '不客气——博物馆好好玩。' }
    ],
    keys: [
      { en: 'within walking distance', zh: '步行可达' },
      { en: 'straight down', zh: '一直沿着……走' },
      { en: 'signposted', zh: '有指示牌的' },
      { en: 'at this hour', zh: '这个时候 / 这会儿' },
      { en: 'saved me', zh: '帮了大忙' }
    ]
  },
  {
    id: 'd-12',
    scene: '商务 · 邮件协调',
    title: 'Scheduling a Meeting by Email',
    zhTitle: '用邮件约一场会议',
    minutes: 10,
    goal: '练习礼貌提议时间、协调多人日程、提前同步议程与跟进。',
    lines: [
      { r: 'You', en: "Hi Mark, hoping to sync on the Q3 research plan — do you have 30 minutes next week?", zh: 'Mark 你好，想就三季度研究计划对齐一下——下周你有 30 分钟吗？' },
      { r: 'Mark', en: "Wednesday looks open. Morning your time?", zh: '周三好像有空。你那边上午？' },
      { r: 'You', en: "Wednesday 10am works. Should we include Lena from insights?", zh: '周三上午十点可以。要把洞察部的 Lena 也拉上吗？' },
      { r: 'Mark', en: "Yes, she owns the consumer data. Send the invite and I'll add her.", zh: '要，消费数据是她负责的。你发邀约，我来加她。' },
      { r: 'You', en: "Done. I'll share the agenda beforehand so we don't wander.", zh: '发了。我会提前发议程，免得跑题。' },
      { r: 'Mark', en: "Please do — last time we spent 20 minutes on the wrong slide.", zh: '务必——上次我们拿错幻灯片耗了 20 分钟。' },
      { r: 'You', en: "Noted. I'll keep it to three points: scope, timeline, owners.", zh: '记下了。我控制三个点：范围、时间线、责任人。' },
      { r: 'Mark', en: "That's the Mark I like. Anything you need from me before?", zh: '这才对味。会前你需要我做什么？' },
      { r: 'You', en: "Just your take on the budget ceiling. I don't want to over-promise.", zh: '就你对预算上限的看法。我不想过度承诺。' },
      { r: 'Mark', en: "I'll send a one-liner by Tuesday. Talk Wednesday.", zh: '周二前我发一句话给你。周三聊。' }
    ],
    keys: [
      { en: 'sync on', zh: '对齐 / 同步讨论' },
      { en: 'open', zh: '（日程）有空' },
      { en: 'beforehand', zh: '提前 / 事前' },
      { en: 'wander', zh: '（会议）跑题' },
      { en: 'budget ceiling', zh: '预算上限' }
    ]
  }

];
