/* ============================================================
   板块四【英语学习】· 每日阅读 / 情景对话 / 单词本
   ============================================================ */
(function () {
  'use strict';
  window.Pages = window.Pages || {};
  const S = window.Store, U = window.UI;
  const esc = U.esc, ico = U.ico;
  /* 本地烘焙词库：点击单词永远有音标+释义，不再依赖会失败的联网查询 */
  let WORDS_BANK = {};
  let GLOSSARY = {};
  try { fetch('data/words.json?v=' + (window.FEED_VER || Date.now())).then(r => r.ok ? r.json() : null).then(j => { if (j && typeof j === 'object') WORDS_BANK = j; }).catch(() => {}); } catch (e) {}
  try { fetch('data/glossary.json?v=' + (window.FEED_VER || Date.now())).then(r => r.ok ? r.json() : null).then(j => { if (j && typeof j === 'object') GLOSSARY = j; }).catch(() => {}); } catch (e) {}

  let tab = 'read';
  let viewType = null;   /* 'read' | 'dlg'：是否正在从面板查看某条 */
  let viewItemId = null; /* 正在查看的具体条目 id */

  /* 每日轮换：按日期取模，保证同一天固定，跨天自动换 */
  function dayIndex(len) {
    const d = new Date(S.today());
    return Math.abs(Math.floor(d.getTime() / 864e5)) % Math.max(1, len);
  }
  /* ===== 阅读/对话 状态管理：已读/未读/删除 ===== */
  /* 稳定 id：优先数据自带 id；缺 id 时用链接/标题派生，保证手机与电脑对同一条识别一致 */
  function artId(x) {
    if (x && x.id) return x.id;
    const key = String((x && (x.link || x.title)) || '');
    return 'r:' + key.replace(/[^a-z0-9]/gi, '').slice(0, 40);
  }
  function statusOf(id) {
    const m = S.s.english.status;
    return (m && m[id] && m[id].s) || '';
  }
  function isUnread(id) { const s = statusOf(id); return s !== 'read' && s !== 'deleted'; }
  function setStatus(id, s) {
    S.s.english.status = S.s.english.status || {};
    S.s.english.status[id] = { s: s, at: Date.now() };
  }
  function clearStatus(id) { if (S.s.english.status && S.s.english.status[id]) delete S.s.english.status[id]; }
  function firstUnreadFrom(arr, from) {
    const n = arr.length; if (!n) return 0;
    for (let i = 0; i < n; i++) { const idx = (from + i) % n; if (isUnread(artId(arr[idx]))) return idx; }
    return from;
  }
  function nextUnread(arr, from) { return firstUnreadFrom(arr, from + 1); }
  function countByStatus(arr) {
    let unread = 0, read = 0, del = 0;
    arr.forEach(x => { const s = statusOf(artId(x)); if (s === 'read') read++; else if (s === 'deleted') del++; else unread++; });
    return { unread: unread, read: read, del: del };
  }


  /* ============ 已读/未读/删除 状态栏与面板 UI ============ */
  function markBtnsHTML(st, prefix) {
    if (st === 'deleted') return '<button class="btn sm" id="' + prefix + 'Restore">↩ 恢复</button>';
    if (st === 'read') return '<button class="btn sm" id="' + prefix + 'Unread">↩ 标回未读</button><button class="btn sm" id="' + prefix + 'Del2">🗑 删除</button>';
    return '<button class="btn sm" id="' + prefix + 'Read">✓ 标记已读</button><button class="btn sm" id="' + prefix + 'Del">🗑 删除</button>';
  }
  function engStatusHTML(type, arr) {
    const ct = countByStatus(arr);
    return '<div class="eng-statusbar">' +
      '<span class="eng-count">未读 <b>' + ct.unread + '</b> · 已读 <b>' + ct.read + '</b> · 已删 <b>' + ct.del + '</b></span>' +
      '<div style="margin-left:auto;display:flex;gap:6px">' +
      '<button class="btn xs" data-pmode="read" data-ptype="' + type + '">已读清单 (' + ct.read + ')</button>' +
      '<button class="btn xs" data-pmode="del" data-ptype="' + type + '">回收站 (' + ct.del + ')</button>' +
      '</div></div><div id="engPanel"></div>';
  }
  function engPanelHTML(type, mode, arr) {
    const list = arr.filter(x => mode === 'read' ? statusOf(artId(x)) === 'read' : statusOf(artId(x)) === 'deleted');
    const title = mode === 'read' ? '已读清单' : '回收站';
    if (!list.length) return '<div class="eng-panel"><div class="sec-title">' + title + '</div><div class="eng-empty">这里还没有内容</div></div>';
    return '<div class="eng-panel"><div class="sec-title">' + title + '</div>' +
      list.map(x => '<div class="eng-row" data-open="' + artId(x) + '"><div class="eng-row-t">' + esc(x.title) + '</div>' +
        (mode === 'read' ? '<button class="btn xs" data-unread="' + artId(x) + '">标回未读</button>' : '<button class="btn xs" data-restore="' + artId(x) + '">恢复</button>') +
        '</div>').join('') + '</div>';
  }
  function wireEngPanel(c, type, arr) {
    const el = document.getElementById('engPanel'); if (!el) return;
    el.querySelectorAll('[data-open]').forEach(r => r.onclick = () => { viewType = type; viewItemId = r.dataset.open; if (type === 'read') paintRead(c); else paintDlg(c); });
    el.querySelectorAll('[data-unread]').forEach(b => b.onclick = e => { e.stopPropagation(); clearStatus(b.dataset.unread); if (type === 'read') paintRead(c); else paintDlg(c); });
    el.querySelectorAll('[data-restore]').forEach(b => b.onclick = e => { e.stopPropagation(); clearStatus(b.dataset.restore); if (type === 'read') paintRead(c); else paintDlg(c); });
  }
  function wireStatusButtons(c, prefix, arr, curId, repaint, curObj) {
    const mk = id => document.getElementById(id);
    const rRead = mk(prefix + 'Read');
    if (rRead) rRead.onclick = () => { setStatus(curId, 'read'); S.save(); viewType = null; viewItemId = null; repaint(); };
    const rDel = mk(prefix + 'Del');
    if (rDel) rDel.onclick = () => { setStatus(curId, 'deleted'); S.save(); viewType = null; viewItemId = null; repaint(); };
    const rUnread = mk(prefix + 'Unread');
    if (rUnread) rUnread.onclick = () => { clearStatus(curId); S.save(); viewType = null; viewItemId = null; repaint(); };
    const rDel2 = mk(prefix + 'Del2');
    if (rDel2) rDel2.onclick = () => { setStatus(curId, 'deleted'); S.save(); viewType = null; viewItemId = null; repaint(); };
    const rRestore = mk(prefix + 'Restore');
    if (rRestore) rRestore.onclick = () => { clearStatus(curId); S.save(); viewType = null; viewItemId = null; repaint(); };
    c.querySelectorAll('[data-pmode]').forEach(b => b.onclick = () => {
      const mode = b.dataset.pmode, type = b.dataset.ptype;
      const panelEl = document.getElementById('engPanel');
      const key = mode + '-' + type;
      if (panelEl.dataset.shown === key) { panelEl.innerHTML = ''; panelEl.dataset.shown = ''; return; }
      panelEl.innerHTML = engPanelHTML(type, mode, arr); panelEl.dataset.shown = key;
      wireEngPanel(c, type, arr);
    });
  }

  function curReading() {
    const arr = window.SEED_READINGS || [];
    const e = S.s.english;
    if (e.stamp !== S.today()) { e.stamp = S.today(); e.readIdx = dayIndex(arr.length); e.dlgIdx = dayIndex(arr.length + 3) % Math.max(1, (window.SEED_DIALOGS || []).length); S.save(true); }
    if (viewType === 'read' && viewItemId) { const i = arr.findIndex(x => artId(x) === viewItemId); if (i >= 0) return arr[i]; }
    if (arr.length) e.readIdx = firstUnreadFrom(arr, e.readIdx);
    return arr[e.readIdx % Math.max(1, arr.length)] || null;
  }
  function curDialog() {
    curReading();
    const arr = window.SEED_DIALOGS || [];
    const e = S.s.english;
    if (viewType === 'dlg' && viewItemId) { const i = arr.findIndex(x => artId(x) === viewItemId); if (i >= 0) return arr[i]; }
    if (arr.length) e.dlgIdx = firstUnreadFrom(arr, e.dlgIdx);
    return arr[e.dlgIdx % Math.max(1, arr.length)] || null;
  }

  window.Pages.english = function (view) {
    view.innerHTML = '<div class="scroll"><div class="wrap page" id="pgBody"></div></div>';
    paint();
  };

  function paint() {
    const box = document.getElementById('pgBody');
    if (!box) return;
    box.innerHTML =
      '<div class="tabs">' +
      '<button class="tab' + (tab === 'read' ? ' on' : '') + '" data-tb="read">每日阅读</button>' +
      '<button class="tab' + (tab === 'dlg' ? ' on' : '') + '" data-tb="dlg">情景对话</button>' +
      '<button class="tab' + (tab === 'word' ? ' on' : '') + '" data-tb="word">单词本 · ' + S.s.words.length + '</button>' +
      '</div><div id="engBody"></div>';
    box.querySelectorAll('[data-tb]').forEach(b => b.onclick = () => { tab = b.dataset.tb; paint(); });
    const c = document.getElementById('engBody');
    if (tab === 'read') paintRead(c);
    else if (tab === 'dlg') paintDlg(c);
    else paintWords(c);
  }

  /* ================= 每日阅读 ================= */
const GEN_EN_ZH = {"the": "定冠词（这/那）", "a": "一个（不定冠词）", "is": "是（第三人称单数）", "of": "…的", "to": "向/去；不定式符号", "it": "它", "in": "在…里；在…中", "not": "不；没", "that": "那个；引导从句", "and": "和；并且", "are": "是（复数/你/我们）", "what": "什么", "they": "他们；它们", "was": "是（过去式）", "for": "为了；对于", "on": "在…上；关于", "you": "你；你们", "who": "谁", "have": "有；吃", "its": "它的", "quiet": "安静的；安静", "work": "工作；运作", "has": "有（第三人称单数）", "this": "这个", "third": "第三（的）", "place": "地方；放置", "will": "将；会", "from": "从；来自", "do": "做；干", "when": "当…时；何时", "people": "人们；人", "be": "是；存在", "new": "新的", "about": "关于；大约", "but": "但是", "as": "如同；作为；因为", "than": "比", "hiring": "雇佣；招聘", "city": "城市", "one": "一个；一", "with": "和；用；带有", "because": "因为", "most": "大多数；最", "by": "被；由；通过", "more": "更多；更", "their": "他们的；她们的", "had": "有（过去式）", "did": "做（过去式）", "were": "是（过去式复数）", "at": "在（某处/时刻）", "does": "做（第三人称单数）", "we": "我们", "feeling": "感觉；感受", "where": "在哪里；那里", "an": "一个（元音前）", "them": "他们（宾格）", "being": "存在；本质", "things": "事物；东西", "without": "没有；无", "procrastination": "拖延；拖延症", "lid": "盖子", "research": "研究", "team": "团队", "story": "故事；叙述", "i": "我", "plan": "计划；规划", "product": "产品", "question": "问题；询问", "can": "能；可以", "first": "第一的；首先", "so": "所以；如此", "like": "喜欢；像", "same": "相同的；一样", "person": "人；个人", "next": "下一个的；紧接着", "residents": "居民", "platforms": "平台", "problem": "问题；难题", "which": "哪一个；哪些", "if": "如果；是否", "those": "那些", "would": "将会；愿意", "public": "公众；公共的", "time": "时间；次数", "nairobi": "内罗毕（地名）", "asked": "问；询问（过去式）", "sensory": "感官的；知觉的", "instead": "反而；代替", "scale": "量表；规模；刻度", "sense": "感觉；感官；意义", "only": "仅仅；只有", "second": "第二的；秒", "here": "这里；此处", "model": "模型；模范", "moment": "时刻；瞬间", "answer": "回答；答案", "data": "数据", "ask": "问；请求", "old": "老的；旧的", "role": "角色；作用", "doing": "做（进行式）", "know": "知道；认识", "discipline": "学科；纪律；训练", "researchers": "研究者；科研人员", "trained": "受过训练的；培训过的", "been": "已经（be的过去分词）", "evidence": "证据；迹象", "these": "这些", "any": "任何；一些", "between": "在…之间", "wrong": "错误的；不对的", "end": "结束；尽头", "no": "不；没有", "now": "现在", "internal": "内部的；内在的", "need": "需要", "organisation": "组织；机构", "all": "全部；所有", "questions": "问题（复数）", "company": "公司", "actually": "实际上；其实", "or": "或者；否则", "something": "某物；某事", "am": "是（第一人称）", "helsinki": "赫尔辛基（地名）", "strategy": "战略；策略", "plans": "计划（复数）", "specific": "具体的；特定的", "provide": "提供；供给", "against": "反对；靠着；以防", "experience": "经验；体验；经历", "into": "进入；到…里", "attributes": "属性；特质", "good": "好的；益处", "already": "已经", "framing": "框架；构建；表述", "found": "发现；建立（过去式）", "rather": "相当；宁愿", "small": "小的", "different": "不同的；各式各样的", "finding": "发现；研究结果", "market": "市场；集市", "just": "只是；刚刚；正义的", "enough": "足够的；充足", "lesson": "教训；课", "never": "从不；绝不", "tell": "告诉；讲述", "job": "工作；职位", "make": "制作；使得", "three": "三；三个", "existing": "现有的；已存在的", "signal": "信号；示意", "done": "完成（过去分词）", "organisations": "组织（复数）", "use": "使用；用途", "point": "要点；点；指向", "promises": "承诺（复数）", "makes": "使得；制作（三单）", "many": "许多的", "employees": "员工；雇员", "up": "向上；起来", "re-deployment": "重新部署；重新调配", "workplace": "职场；工作场所", "two": "二；两个", "hired": "雇用的；受聘的", "open": "打开；开放的", "corrections": "修正；改正", "city's": "城市的", "silence": "沉默；寂静", "better": "更好的；更好地", "difficult": "困难的", "discomfort": "不适；不安", "life": "生活；生命", "caf": "咖啡馆", "corner": "角落；拐角", "back": "回来；背面；支持", "consumers": "消费者", "questionnaire": "问卷；调查表", "lexicon": "词汇表；专门辞典", "made": "制作；使得（过去式）", "put": "放；摆；书写", "study": "研究；学习；研究（名）", "well": "好；很好地", "still": "仍然；静止的", "language": "语言", "there": "那里；存在", "current": "当前的；流行的", "us": "我们（宾格）", "humility": "谦逊；谦卑", "then": "然后；那么", "implication": "含义；暗示；牵连", "honest": "诚实的；坦诚的", "less": "更少；较小", "decade": "十年", "narrative": "叙述；叙事", "pay": "支付；付出", "gaps": "差距；空白", "half": "一半", "employee": "员工；雇员", "skills": "技能；技巧", "outside": "在外面；外部", "why": "为什么", "writing": "写作；书写", "opportunity": "机会；机遇", "growth": "增长；成长", "human": "人类的；人", "cost": "成本；代价", "almost": "几乎；差不多", "knowledge": "知识；认知", "uncomfortable": "不舒服的；不自在的", "through": "通过；穿过", "called": "被称为；叫做", "response": "回应；反应", "hard": "困难的；坚硬的", "execute": "执行；实施", "advance": "前进；先进；进展", "before": "在…之前", "trying": "尝试；努力", "avoidance": "回避；躲避", "avoiding": "回避（进行时）", "fear": "恐惧；害怕", "failure": "失败", "action": "行动；行为", "thing": "事情；东西", "noticing": "注意到", "pub": "酒吧；酒馆", "bar": "酒吧；条；障碍", "forms": "形式；表格", "describe": "描述；形容", "spent": "花费；度过（过去式）", "panel": "小组；专家组", "sound": "声音；听起来", "precisely": "精确地；准确地", "how": "如何；怎样", "years": "年（复数）", "built": "建立；建造（过去式）", "blind": "盲的；视而不见的", "everything": "一切；所有事物", "texture": "质地；纹理；口感", "works": "工作；作品；运作", "read": "阅读；读", "signals": "信号（复数）", "entirely": "完全地；彻底地", "yet": "然而；还（未）", "design": "设计", "checklist": "检查清单；核对表", "ten": "十；十个", "brief": "简报；简短的", "none": "没有一个；毫无", "means": "意味着；方法", "minutes": "分钟", "every": "每个；每一", "could": "能；可能（过去式）", "always": "总是；一直", "way": "方式；道路", "original": "原始的；最初的；原创的", "practical": "实用的；实际的", "framework": "框架；体系", "loyalty": "忠诚；忠诚度", "terms": "术语；条件；条款", "resistance": "抵抗；阻力；抗拒", "engagement": "参与；约定；投入", "produce": "生产；产生", "changes": "变化；改变（复数）", "community": "社区；群体", "era": "时代；纪元", "resist": "抵抗；抗拒", "real": "真实的；真正的", "try": "尝试；努力", "conversation": "对话；交谈", "higher": "更高的", "pandemic": "大流行（病）", "contract": "合同；收缩", "ways": "方式（复数）", "report": "报告；报道", "show": "展示；表明", "headline": "头条；标题", "project": "项目；工程", "nothing": "没有东西；无关紧要", "changed": "改变（过去式）", "document": "文件；记录", "development": "发展；开发", "fails": "失败（三单）", "labour": "劳动力；劳动", "decision": "决定；决策", "changing": "改变（进行时）", "return": "返回；回报", "part": "部分；角色", "institute's": "（研究）机构的", "form": "形式；表格；形成", "whether": "是否", "platform": "平台", "definition": "定义", "argued": "争论；主张（过去式）", "firm": "公司；坚定的", "reason": "原因；理由", "may": "可能；可以", "exercise": "练习；行使；运用", "run": "运行；经营；跑", "draft": "草稿；起草", "out": "外面；出；熄灭", "places": "地方（复数）", "library": "图书馆", "population": "人口；群体", "planning": "规划；计划", "veil": "面纱；掩饰", "assumption": "假设；假定", "your": "你的；你们的", "own": "自己的；拥有", "neighbourhood": "社区；邻里", "see": "看见；理解", "correct": "正确的；纠正", "requires": "要求；需要（三单）", "cities": "城市（复数）", "easier": "更容易的", "publishes": "出版；发布（三单）", "finished": "完成（过去式）", "execution": "执行；实施", "technique": "技巧；技术", "lazy": "懒惰的", "fix": "修复；固定", "scroll": "滚动；卷轴", "emotion": "情绪；情感", "regulation": "调节；规则；监管", "telling": "告诉（进行时）；显著的", "cycle": "循环；周期", "exist": "存在", "encounter": "遇到；遭遇", "social": "社会的；社交的", "replaced": "替换；取代（过去式）", "listening": "倾听；聆听", "aesthetic": "美学的；审美的", "away": "离开；远离", "toothpaste": "牙膏", "expected": "预期的；预计的", "vocabulary": "词汇；词汇量", "mint": "薄荷", "intensity": "强度；强烈", "freshness": "新鲜度；清新", "lasts": "持续（三单）", "weeks": "周；星期", "preparing": "准备（进行时）", "promise": "承诺；允诺", "nobody": "没有人", "lids": "盖子（复数）", "argue": "争论；主张", "recent": "最近的；近来的", "industry": "行业；工业", "measured": "测量；衡量（过去式）", "marketing": "营销；市场推广", "rigorous": "严谨的；严格的", "also": "也；同样", "measure": "测量；衡量", "thought": "认为；想法（过去式/名）", "knows": "知道（三单）", "structurally": "在结构上；结构上", "else": "其他；别的", "expensive": "昂贵的", "say": "说；表明", "again": "再次；又", "invisible": "看不见的；无形的", "active": "活跃的；积极的", "ingredients": "成分；配料", "senses": "感官；感觉（复数）", "become": "成为；变得", "slow": "慢的；缓慢的", "learned": "学到的；有学问的", "cultural": "文化的", "brands": "品牌（复数）", "consumer": "消费者", "used": "用过的；习惯于", "ai": "人工智能", "moderator": "主持人；调解者", "change": "改变；变化", "sounds": "声音（复数）；听起来", "practice": "实践；练习", "emerged": "出现；浮现（过去式）", "cared": "关心；在意（过去式）", "surprise": "惊讶；使吃惊", "seconds": "秒", "interview": "访谈；面试", "usually": "通常", "statistically": "在统计上", "likely": "可能的", "useful": "有用的", "breaks": "打破；休息（复数）", "method": "方法；办法", "leave": "离开；留下", "test": "测试；检验", "worth": "值得；价值", "matter": "事情；要紧", "act": "行动；表演", "redesigns": "重新设计（三单）", "fit": "适合；符合", "directly": "直接地", "client": "客户；委托人", "roadmap": "路线图；规划", "having": "拥有（进行时）", "appeared": "出现（过去式）", "intention": "意图；打算", "name": "名字；命名", "closure": "关闭；合上；闭合", "briefs": "简报（复数）", "qualitative": "定性的；质的", "depth": "深度；深刻", "departments": "部门（复数）", "discovered": "发现（过去式）", "home": "家；家庭", "once": "一旦；一次", "tools": "工具（复数）", "products": "产品（复数）", "brand": "品牌", "capture": "捕捉；捕获", "happening": "发生（进行时）", "solution": "解决方案；解决", "look": "看；看起来", "require": "要求；需要", "counts": "计数；重要（三单）", "last": "最后的；持续", "talent": "人才；天赋", "great": "伟大的；极好的", "workers": "工人；劳动者", "motion": "运动；动作", "jobs": "工作（复数）", "sometimes": "有时", "went": "去（过去式）", "quieter": "更安静的", "linkedin": "领英（平台）", "filling": "填写；填充"};

  function closeWordPop(){ const p=document.querySelector('.kw-pop'); if(p) p.remove(); }
  function openWordPop(el, v, fromTitle){
    closeWordPop();
    const rect = el.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'kw-pop';
    pop.innerHTML = '<div class="kw-pop-w">'+esc(v.w)+' <span class="kw-pop-p" id="kwph">'+esc(v.p||'')+'</span></div>'+
      '<div class="kw-pop-t" id="kwt">'+(v.t?esc(v.t):(v.en?'<span class="kw-en">'+esc(v.en)+'</span><div class="kw-online">暂无中文，英文释义仅供参考</div>':'<i>正在查询释义…</i>'))+'</div>'+
      '<div class="kw-pop-actions"><button class="kw-add">加入单词本</button><button class="kw-close">关闭</button></div>';
    document.body.appendChild(pop);
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 6;
    if (left + pw > window.innerWidth - 10) left = window.innerWidth - pw - 10;
    if (top + ph > window.innerHeight + window.scrollY - 10) top = rect.top + window.scrollY - ph - 6;
    pop.style.left = left+'px'; pop.style.top = top+'px';
    pop.querySelector('.kw-add').onclick = (e)=>{ e.stopPropagation(); const y = window.scrollY; addWord(v, fromTitle); el.classList.add('saved'); closeWordPop(); window.scrollTo(0, y); };
    pop.querySelector('.kw-close').onclick = (e)=>{ e.stopPropagation(); closeWordPop(); };
    setTimeout(()=>{ document.addEventListener('click', closeWordPop, {once:true}); }, 0);
    fetchWordOnline(v, pop);
  }

  /* 在线词典兜底：补足音标；本地无释义时取英文释义 */
  function fetchWordOnline(v, pop){
    const phEl = pop.querySelector('#kwph');
    const tEl = pop.querySelector('#kwt');
    if (!phEl || !tEl) return;
    const url = 'https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(v.w.toLowerCase());
    fetch(url).then(r => r.ok ? r.json() : null).then(d => {
      if (!Array.isArray(d) || !d[0]) { if (!v.t && !v.en) tEl.innerHTML = '<i class="kw-online">该词暂未收录，可加入单词本后补充</i>'; return; }
      let ph = d[0].phonetic || '';
      if (!ph && d[0].phonetics) { const p = d[0].phonetics.find(x => x.text); if (p) ph = p.text; }
      if (ph && phEl && !phEl.textContent) phEl.textContent = ph;
      if (!v.t && !v.en) {
        const m = d[0].meanings && d[0].meanings[0];
        const def = m && m.definitions && m.definitions[0] && m.definitions[0].definition;
        if (def) tEl.innerHTML = '<span class="kw-en">' + esc(def) + '</span><div class="kw-online">在线英文释义</div>';
      }
    }).catch(()=>{});
  }

  function paintRead(c) {
    const a = curReading();
    if (!a) { c.innerHTML = window.uiEmpty('暂无文章'); return; }
    const saved = new Set(S.s.words.map(w => w.w.toLowerCase()));
    const allMap = {};
    for (const k in GEN_EN_ZH) allMap[k] = { w: k, p: '', t: GEN_EN_ZH[k], lv: '通用' };
    (a.vocab || []).forEach(v => allMap[v.w.toLowerCase()] = v);
    for (const k in WORDS_BANK) {
      const wb = WORDS_BANK[k]; if (!wb) continue;
      const ex = allMap[k];
      allMap[k] = { w: k, p: (ex && ex.p) || wb.ph || '', t: (ex && ex.t) || wb.zh || '', en: wb.en || (ex && ex.en) || '', lv: (ex && ex.lv) || '阅读生词' };
    }
    function resolveWord(key){
      if (allMap[key]) return allMap[key];
      const gk = GLOSSARY[key];
      if (gk) return { w: key, p: gk.p || '', t: gk.t || '', en: gk.en || '', lv: '阅读生词' };
      for (const sfx of ['es','s','ed','ing','ly']) {
        const c = key.replace(new RegExp(sfx + '$'), '');
        if (c !== key && allMap[c]) return allMap[c];
        if (c !== key && GLOSSARY[c]) return { w: key, p: GLOSSARY[c].p || '', t: GLOSSARY[c].t || '', en: GLOSSARY[c].en || '', lv: '阅读生词' };
      }
      return null;
    }

    // 正文每个英文单词都变成可点击词（保留 <p>/<u>/<b> 等标签）
    // 容错：body 可能是数组（推荐）或字符串（旧数据），统一转数组再拼接
    const bodyArr = Array.isArray(a.body) ? a.body : String(a.body || '').split(/\n+/);
    const body = bodyArr.join('').replace(/(<[^>]+>)|([A-Za-z][A-Za-z'-]*)/g, (m, tag, word) => {
      if (tag) return tag;
      const key = word.toLowerCase();
      return '<span class="kw' + (saved.has(key) ? ' saved' : '') + '" data-w="' + esc(key) + '">' + esc(word) + '</span>';
    });

    const cnHTML = a.cn
      ? '<div class="card card-pad" style="padding:22px 26px"><div class="sec-title">全文中文翻译</div><div class="cn-text">' +
        '<p>' + esc(a.cn).replace(/\n+/g, '</p><p>') + '</p>' +
        '</div></div>'
      : '';
    const phrasesHTML = '<div class="card card-pad" style="padding:22px 26px"><div class="sec-title">地道表达</div>' +
      (a.phrases || []).map(p =>
        '<div class="vocab-item"><div><div class="vocab-w" style="font-family:var(--font-serif);font-weight:500">' + esc(p.en) + '</div>' +
        '<div class="vocab-t">' + esc(p.zh) + '</div></div></div>').join('') +
      '</div>';

    const readsArr = window.SEED_READINGS || [];
    c.innerHTML =
      '<div class="page" style="display:grid;grid-template-columns:1fr;gap:16px">' +
      engStatusHTML('read', readsArr) +
      '<div class="card card-pad" style="padding:28px 32px">' +
      '<div style="display:flex;align-items:center;gap:9px;margin-bottom:12px;flex-wrap:wrap">' +
      '<span class="tag c1">' + esc(a.tag) + '</span>' +
      '<span class="td-date">约 ' + a.minutes + ' 分钟</span>' +
      '<span class="td-date">' + S.today() + '</span>' +
      '<div style="margin-left:auto;display:flex;gap:6px">' +
      markBtnsHTML(statusOf(artId(a)), 'r') +
      '<button class="btn sm" id="rNext">' + ico('refresh') + '换一篇</button>' +
      '<button class="btn sm" id="rAll">重点词入本</button></div></div>' +
      '<h2 style="font-family:var(--font-serif);font-size:26px;line-height:1.35;margin-bottom:4px">' + esc(a.title) + '</h2>' +
      '<div style="color:var(--ink-3);font-size:13px;margin-bottom:20px">' + esc(a.subtitle) + '</div>' +
      '<div style="font-size:11.5px;color:var(--ink-4);background:var(--surface-2);padding:9px 13px;border-radius:10px;margin-bottom:20px">' +
      '文中每个英文单词都可点击查看中文释义，点「加入单词本」即可收藏；也可选中任意文字后点击浮起的「加入单词本」。' +
      '</div>' +
      '<div class="article" id="artBody">' + body + '</div>' +
      '</div>' +
      cnHTML + phrasesHTML +
      '</div>';

    /* 点击高亮词 */
    c.querySelectorAll('.kw').forEach(el => el.onclick = (ev) => {
      ev.stopPropagation();
      const key = el.dataset.w;
      openWordPop(el, resolveWord(key) || { w: key, p: '', t: '', lv: '阅读生词' }, a.title);
    });
    c.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      const v = (a.vocab || []).find(x => x.w === b.dataset.add);
      addWord(v, a.title); paintRead(c);
    });
    document.getElementById('rAll').onclick = () => {
      let n = 0;
      (a.vocab || []).forEach(v => { if (addWord(v, a.title, true)) n++; });
      S.save(); paintRead(c); window.rerender();
      U.toast(n ? '已加入 ' + n + ' 个新词' : '这些词都已在单词本里', 'ok');
    };
    viewType = null; viewItemId = null;
    document.getElementById('rNext').onclick = () => {
      const arr = window.SEED_READINGS || [];
      if (countByStatus(arr).unread === 0) { U.toast('都已读完，去「已读清单」重读', 'ok'); return; }
      S.s.english.readIdx = nextUnread(arr, S.s.english.readIdx);
      S.save(); paintRead(c);
    };
    wireStatusButtons(c, 'r', readsArr, artId(a), () => paintRead(c));

    /* 划词加入 */
    setupSelection(document.getElementById('engBody'), a.title);
  }

  function lvColor(lv) {
    return lv === 'TOEFL' ? 'c4' : lv === 'IELTS' ? 'c3' : lv === '商务' ? 'c2' : lv === '学术' ? 'c5' : '';
  }

  function addWord(v, from, silent) {
    if (!v || !v.w) return false;
    const key = v.w.toLowerCase().trim();
    if (S.s.words.some(w => w.w.toLowerCase() === key)) { if (!silent) U.toast('已在单词本中'); return false; }
    const item = { id: S.uid(), w: v.w, p: v.p || '', t: v.t || '', lv: v.lv || '阅读生词', from: from || '', mastered: false, createdAt: Date.now() };
    S.s.words.unshift(item);
    if (!silent) { S.save(); U.toast('「' + v.w + '」已入单词本', 'ok'); }
    return true;
  }

  /* 划词浮层 */
  let bubble = null;
  function setupSelection(scopeEl, from) {
    if (!scopeEl) return;
    const kill = () => { if (bubble) { bubble.remove(); bubble = null; } };
    scopeEl.onmouseup = scopeEl.ontouchend = () => {
      setTimeout(() => {
        const sel = window.getSelection();
        const txt = (sel ? sel.toString() : '').trim();
        kill();
        if (!txt || txt.length > 40 || !/[a-zA-Z]/.test(txt)) return;
        const r = sel.getRangeAt(0).getBoundingClientRect();
        bubble = document.createElement('button');
        bubble.className = 'btn primary sm';
        bubble.style.cssText = 'position:fixed;z-index:300;box-shadow:var(--sh-3)';
        bubble.innerHTML = ico('plus') + '加入单词本';
        bubble.style.left = Math.max(10, Math.min(window.innerWidth - 130, r.left + r.width / 2 - 60)) + 'px';
        bubble.style.top = (r.top - 40) + 'px';
        bubble.onclick = e => {
          e.stopPropagation();
          const y = window.scrollY;
          addWord({ w: txt, lv: '阅读生词' }, from);
          kill(); sel.removeAllRanges();
          window.scrollTo(0, y);
        };
        document.body.appendChild(bubble);
      }, 10);
    };
    document.addEventListener('mousedown', e => { if (bubble && e.target !== bubble && !bubble.contains(e.target)) kill(); });
  }

  /* ================= 情景对话 ================= */
  function paintDlg(c) {
    const d = curDialog();
    if (!d) { c.innerHTML = window.uiEmpty('暂无对话'); return; }
    c.innerHTML =
      '<div class="page card card-pad" style="padding:28px 32px">' +
      '<div style="display:flex;align-items:center;gap:9px;margin-bottom:12px;flex-wrap:wrap">' +
      '<span class="tag c2">' + esc(d.scene) + '</span>' +
      '<span class="td-date">约 ' + d.minutes + ' 分钟</span>' +
      '<div style="margin-left:auto;display:flex;gap:6px">' + markBtnsHTML(statusOf(artId(d)), 'd') + '<button class="btn sm" id="dNext">' + ico('refresh') + '换一个场景</button></div></div>' +
      '<h2 style="font-family:var(--font-serif);font-size:23px;line-height:1.35;margin-bottom:3px">' + esc(d.title) + '</h2>' +
      '<div style="color:var(--ink-3);font-size:13px;margin-bottom:6px">' + esc(d.zhTitle) + '</div>' +
      '<div style="font-size:12px;color:var(--sage);background:var(--sage-wash);padding:8px 13px;border-radius:10px;margin:14px 0 20px">' +
      '训练目标：' + esc(d.goal) + '</div>' +
      '<div id="dlgBody">' + d.lines.map(l =>
        '<div class="dlg-line' + (l.r === 'You' ? ' me' : '') + '">' +
        '<div class="dlg-r">' + esc(l.r) + '</div>' +
        '<div class="dlg-c"><div class="dlg-en">' + esc(l.en) + '</div><div class="dlg-zh">' + esc(l.zh) + '</div></div></div>').join('') +
      '</div>' +
      '<div style="margin-top:24px;border-top:1px solid var(--line);padding-top:18px">' +
      '<div class="sec-title" style="margin-bottom:10px">关键表达</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 18px" class="grid2">' +
      d.keys.map(k =>
        '<div style="display:flex;gap:8px;align-items:baseline;padding:5px 0;border-bottom:1px dashed var(--line-soft)">' +
        '<span style="font-family:var(--font-serif);font-size:13.5px;font-weight:600">' + esc(k.en) + '</span>' +
        '<span style="font-size:12px;color:var(--ink-3);margin-left:auto;text-align:right">' + esc(k.zh) + '</span></div>').join('') +
      '</div></div></div>';

    viewType = null; viewItemId = null;
    const dlgArr = window.SEED_DIALOGS || [];
    document.getElementById('dNext').onclick = () => {
      if (countByStatus(dlgArr).unread === 0) { U.toast('都已读完，去「已读清单」重读', 'ok'); return; }
      S.s.english.dlgIdx = nextUnread(dlgArr, S.s.english.dlgIdx);
      S.save(); paintDlg(c);
    };
    wireStatusButtons(c, 'd', dlgArr, artId(d), () => paintDlg(c));
    setupSelection(document.getElementById('dlgBody'), d.title);
  }

  /* ================= 单词本 ================= */
  let wFilter = 'all';
  function paintWords(c) {
    const all = S.s.words;
    let list = all.slice();
    if (wFilter === 'new') list = list.filter(w => !w.mastered);
    if (wFilter === 'ok') list = list.filter(w => w.mastered);

    c.innerHTML =
      '<div class="page">' +
      '<div class="stats stagger">' +
      window.uiStat('总词数', all.length, '个') +
      window.uiStat('未掌握', all.filter(w => !w.mastered).length, '个') +
      window.uiStat('已掌握', all.filter(w => w.mastered).length, '个') +
      window.uiStat('今日新增', all.filter(w => new Date(w.createdAt).toISOString().slice(0, 10) === S.today()).length, '个') +
      '</div>' +
      '<div class="sec-head"><div class="sec-title">我的单词本</div>' +
      '<div class="sec-note">来自每日阅读的划词，会自动带上出处</div>' +
      '<div class="spacer"></div>' +
      '<div class="chips">' +
      '<button class="chip' + (wFilter === 'all' ? ' on' : '') + '" data-wf="all">全部</button>' +
      '<button class="chip' + (wFilter === 'new' ? ' on' : '') + '" data-wf="new">未掌握</button>' +
      '<button class="chip' + (wFilter === 'ok' ? ' on' : '') + '" data-wf="ok">已掌握</button>' +
      '</div><button class="btn primary" id="wAdd" style="margin-left:8px">' + ico('plus') + '手动添加</button></div>' +
      (list.length
        ? '<div class="card" style="overflow:hidden">' + list.map(w =>
          '<div class="word-card' + (w.mastered ? ' mastered' : '') + '">' +
          '<button class="cbx' + (w.mastered ? ' done' : '') + '" data-wt="' + w.id + '" title="标记掌握">' + ico('tick') + '</button>' +
          '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">' +
          '<span class="vocab-w">' + esc(w.w) + '</span>' +
          (w.p ? '<span class="vocab-p">' + esc(w.p) + '</span>' : '') +
          '<span class="tag ' + lvColor(w.lv) + '">' + esc(w.lv) + '</span></div>' +
          '<div class="vocab-t">' + esc(w.t || '（点击右侧铅笔补充释义）') + '</div>' +
          (w.from ? '<div style="font-size:10.5px;color:var(--ink-4);margin-top:2px">出自：' + esc(w.from) + '</div>' : '') +
          '</div>' +
          '<div class="row-act" style="opacity:1">' +
          '<button class="icon-btn" data-we="' + w.id + '">' + ico('edit') + '</button>' +
          '<button class="icon-btn del" data-wr="' + w.id + '">' + ico('trash') + '</button></div></div>').join('') + '</div>'
        : window.uiEmpty('单词本还是空的，去「每日阅读」划几个词吧')) +
      '</div>';

    c.querySelectorAll('[data-wf]').forEach(b => b.onclick = () => { wFilter = b.dataset.wf; paintWords(c); });
    c.querySelectorAll('[data-wt]').forEach(b => b.onclick = () => {
      const w = S.find('words', b.dataset.wt);
      S.update('words', w.id, { mastered: !w.mastered }); paintWords(c); window.rerender();
    });
    c.querySelectorAll('[data-wr]').forEach(b => b.onclick = () => { S.remove('words', b.dataset.wr); paintWords(c); window.rerender(); });
    c.querySelectorAll('[data-we]').forEach(b => b.onclick = () => wordForm(S.find('words', b.dataset.we), c));
    document.getElementById('wAdd').onclick = () => wordForm(null, c);
  }

  function wordForm(w, c) {
    const d = w || { w: '', p: '', t: '', lv: '阅读生词', from: '' };
    U.modal({
      title: w ? '编辑单词' : '添加单词',
      body:
        '<div class="grid2"><div class="field"><label>单词</label><input class="inp" id="w_w" autofocus value="' + esc(d.w) + '"></div>' +
        '<div class="field"><label>音标</label><input class="inp" id="w_p" value="' + esc(d.p) + '"></div></div>' +
        '<div class="field"><label>释义</label><input class="inp" id="w_t" value="' + esc(d.t) + '"></div>' +
        '<div class="grid2"><div class="field"><label>等级标注</label><select class="sel" id="w_l">' +
        ['TOEFL', 'IELTS', '商务', '学术', '专业', '基础', '阅读生词'].map(x => '<option' + (x === d.lv ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>出处</label><input class="inp" id="w_f" value="' + esc(d.from) + '"></div></div>',
      onOk: m => {
        const val = id => m.querySelector('#' + id).value.trim();
        if (!val('w_w')) { U.toast('单词不能为空'); return false; }
        const obj = { w: val('w_w'), p: val('w_p'), t: val('w_t'), lv: val('w_l'), from: val('w_f') };
        if (w) S.update('words', w.id, obj); else S.add('words', Object.assign({ mastered: false }, obj));
        paintWords(c); window.rerender(); U.toast('已保存', 'ok');
      }
    });
  }

  window.EnglishAddWord = addWord;
})();
