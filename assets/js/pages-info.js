/* ============================================================
   板块一【行业资讯】· 板块二【专业提升】
   ============================================================ */
(function () {
  'use strict';
  window.Pages = window.Pages || {};
  const S = window.Store;
  const U = window.UI;
  const esc = U.esc, ico = U.ico;

  // 7 主题 MECE（定本 v5）——只用于「文献深读」子区。与 scripts/topic7.mjs 保持一致，改一处须同步另一处。
  const TOPIC7 = ['产业动态', '政策与标准', '市场与数据', '消费者与用户', '产品与感官', '趋势与前瞻', '战略与方法'];
  const T7_COLOR = { '产业动态': 'c5', '政策与标准': 'c4', '市场与数据': 'c2', '消费者与用户': 'c1', '产品与感官': 'c3', '趋势与前瞻': 'c1', '战略与方法': 'c2' };
  // 六领域标签（框架 v4 定本 2026-11-10）——只用于情报题录（行业资讯板块 + 专业提升的情报条目）。
  // 双标签方案（用户拍板）：6 领域管情报；7 主题只管「文献深读」（专业提升里与六领域同栏的独立筛选项）。
  const DOMAINS = ['感官科学', '品牌营销', '消费者洞察', '政策法规', '市场数据', '企业战略'];
  const D_COLOR = { '感官科学': 'c3', '品牌营销': 'c5', '消费者洞察': 'c1', '政策法规': 'c4', '市场数据': 'c2', '企业战略': 'c2' };
  // 旧桶名 → 7 主题：仅「展示层归一」，让存量条目仍能被 7 主题筛到，feed.json 数据绝不改写
  const LEGACY7 = {
    '政策法规': '政策与标准', '监管执法': '政策与标准', '海外监管': '政策与标准',
    '欧洲监管': '政策与标准', '控烟监管': '政策与标准', '烟草监管': '政策与标准',
    '出口贸易': '产业动态', '巨头动向': '产业动态', '企业动态': '产业动态',
    '市场数据': '市场与数据', '市场动态': '市场与数据', '趋势洞察': '趋势与前瞻', '产品技术': '产品与感官', '电子烟': '产品与感官',
    '感官研究': '产品与感官', '感官分析': '产品与感官', '包装趋势': '产品与感官',
    '食品饮料': '产品与感官', '快消日化': '产品与感官', '技术 · 工具': '产品与感官', '消费电子': '产品与感官',
    '消费者洞察': '消费者与用户', '体验设计': '消费者与用户', '餐饮消费': '消费者与用户',
    '市场洞察': '市场与数据', '零售渠道': '市场与数据',
    '出海趋势': '趋势与前瞻', '食品科学 · 趋势': '趋势与前瞻',
    '行业洞察': '战略与方法', '行业态势': '战略与方法', '学术 · 争议': '战略与方法',
    '方法论 · AI': '战略与方法', '品牌营销': '战略与方法'
  };
  function topic7Of(v, group) {
    if (TOPIC7.indexOf(v) >= 0) return v;
    if (v && LEGACY7[v]) return LEGACY7[v];
    return group === 'news' ? '产业动态' : '市场与数据';
  }
  // 条目领域标签：只读 domain（阀门 L2/L3 打标）。存量条目没有该字段 → 显示「—」，不硬归任何领域
  // （此前我自行拍的「7主题→6领域」映射已按用户 2026-11-10 指令删除）
  function domainOf(n) {
    return DOMAINS.indexOf(n.domain) >= 0 ? n.domain : '';
  }
  // 题录展示：优先中文短标题/中译摘要（L3 产出），规则直过条目回退原标题/原摘要
  const showTitle = (n) => n.zhTitle || n.title;
  const showSummary = (n) => n.zhSummary || n.summary;
  const NEWS_CATS = DOMAINS; // 行业资讯的筛选/表单用六领域（框架 v4）
function tagColor(map, key) {
  if (map[key]) return map[key];
  // 未定义颜色：按哈希稳定分配 c1-c5
  const pool = ['c1','c2','c3','c4','c5'];
  let h = 0;
  const k = String(key || '');
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}

  const TOPICS = TOPIC7;
  const T_COLOR = T7_COLOR;

  const heatBar = n => '<span class="heat">' + [1, 2, 3, 4, 5].map(i => '<i class="' + (i <= (n || 3) ? 'on' : '') + '"></i>').join('') + '</span>';

  // 长文本 3 行折叠 + 「展开」（用户 2026-11-12：排版须美观易读，不做大量左右/上下拖动）
  function clampHtml(txt) {
    // 显示层兜底：摘要在抓取时可能混入 HTML 标签/图片地址（含截断在标签中间的 <img... 无闭合 >），纯文本化后再展示
    const t = String(txt || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/<[^>]*$/, ' ')
      .replace(/\s+/g, ' ').trim();
    if (!t) return '<span style="color:var(--color-text-tertiary)">—</span>';
    return '<div class="clamp3" data-clamp>' + esc(t) + '</div>' + (t.length > 64 ? '<span class="clamp-x" data-x>展开</span>' : '');
  }
  function bindClamp(box) {
    box.querySelectorAll('[data-x]').forEach(el => el.onclick = () => {
      const open = el.previousElementSibling.classList.toggle('open');
      el.textContent = open ? '收起' : '展开';
    });
  }

  /* ================= 板块一 · 行业资讯（情报题录流，框架 v4） ================= */
  let nFilter = '全部', nQuery = '', nShow = 30; // nShow：分页——每次多加载 30 条（全部留存后的性能兜底）

  window.Pages.news = function (view) {
    view.innerHTML = '<div class="scroll"><div class="wrap page" id="pgBody"></div></div>';
    paintNews();
  };

  function paintNews() {
    const box = document.getElementById('pgBody');
    if (!box) return;
    const all = S.s.news;
    const list = all.filter(n => {
      if (nFilter !== '全部' && domainOf(n) !== nFilter) return false;
      if (nQuery) {
        const q = nQuery.toLowerCase();
        return (n.title + (n.zhTitle || '') + n.summary + (n.zhSummary || '') + n.source).toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    // 筛选器 = 六领域（框架 v4：6 领域管情报）；存量条目无领域标签，仅在「全部」下可见
    const cats = ['全部'].concat(DOMAINS);
    const hot = all.filter(n => (n.heat || 0) >= 5).length;
    const mo = new Date().toISOString().slice(0, 7);
    // 本月新增：优先按入库日期(addedAt)统计真实抓取量，无 addedAt 的旧条目退回文章日期
    const thisMonth = all.filter(n => String(n.addedAt || n.date || '').startsWith(mo)).length;

    box.innerHTML =
      '<div class="stats stagger">' +
      stat('情报总量', all.length, '条') +
      stat('本月新增', thisMonth, '条') +
      stat('高热度', hot, '条') +
      stat('覆盖领域', cats.length - 1, '类') +
      '</div>' +

      '<div class="sec-head">' +
      '<div class="sec-title">情报清单 · 六领域速递</div>' +
      '<div class="sec-note">进门经四级阀门把关（时效/完整性/领域/值得读）· 点标题看原文</div>' +
      '<div class="spacer"></div>' +
      '<button class="btn primary" id="nAdd">' + ico('plus') + '添加</button>' +
      '</div>' +

      '<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">' +
      '<div class="chips">' + cats.map(c =>
        '<button class="chip' + (c === nFilter ? ' on' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' +
      '<input class="inp" id="nQ" placeholder="搜索标题、来源或关键词…" style="max-width:230px;margin-left:auto" value="' + esc(nQuery) + '">' +
      '</div>' +

      (list.length ? '<div class="tbl-wrap"><div class="tbl-scroll"><table class="tbl" style="table-layout:fixed">' +
        '<thead><tr><th style="width:8%">日期</th><th style="width:33%">资讯标题</th>' +
        '<th style="width:30%">要点摘要</th><th style="width:20%">解读</th><th style="width:4%">热度</th><th style="width:56px"></th></tr></thead><tbody>' +
        list.slice(0, nShow).map(n =>
          '<tr>' +
          '<td class="td-date">' + esc(n.date) + '</td>' +
          '<td><div class="td-title">' + (n.link ? '<a href="' + esc(n.link) + '" target="_blank" rel="noopener">' + esc(showTitle(n)) + '</a>' : esc(showTitle(n))) + '</div>' +
          '<div class="td-sub">' + esc(n.source) + (domainOf(n) ? ' · <span class="tag ' + tagColor(D_COLOR, domainOf(n)) + '">' + esc(domainOf(n)) + '</span>' : '') + '</div></td>' +
          '<td>' + clampHtml(showSummary(n)) + '</td>' +
          // 框架 v4：情报条目不做 AI 解读（用户拍板）。存量已有解读的照旧显示，一字不动。
          '<td>' + (n.impact ? '<div class="quote">' + esc(n.impact) + '</div>' : '<span style="color:var(--color-text-tertiary)">—</span>') + '</td>' +
          '<td>' + heatBar(n.heat) + '</td>' +
          '<td><div class="row-act">' +
          '<button class="icon-btn" data-ed="' + n.id + '">' + ico('edit') + '</button>' +
          '<button class="icon-btn del" data-rm="' + n.id + '">' + ico('trash') + '</button>' +
          '</div></td></tr>').join('') +
        '</tbody></table></div></div>' + (list.length > nShow ? '<div style="text-align:center;margin:14px 0"><button class="btn" id="nMore">加载更多 · 已显示 ' + Math.min(nShow, list.length) + ' / ' + list.length + '</button></div>' : '')
        : emptyBox('没有匹配的资讯'));

    box.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { nFilter = b.dataset.cat; nShow = 30; paintNews(); });
    const q = document.getElementById('nQ');
    q.oninput = () => { nQuery = q.value; nShow = 30; const p = q.selectionStart; paintNews(); const q2 = document.getElementById('nQ'); q2.focus(); q2.setSelectionRange(p, p); };
    const moreN = document.getElementById('nMore');
    if (moreN) moreN.onclick = () => { nShow += 30; paintNews(); };
    document.getElementById('nAdd').onclick = () => newsForm(null);
    bindClamp(box);
    box.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => newsForm(S.find('news', b.dataset.ed)));
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      U.confirmBox('删除资讯', '确定删除这条情报吗？', () => { S.remove('news', b.dataset.rm); paintNews(); window.rerender(); });
    });
  }

  function newsForm(n) {
    const d = n || { date: S.today(), title: '', source: '', domain: '市场数据', summary: '', impact: '', heat: 3, link: '' };
    U.modal({
      title: n ? '编辑资讯' : '添加资讯',
      body:
        '<div class="grid2"><div class="field"><label>日期</label><input class="inp" id="f_date" value="' + esc(d.date) + '" placeholder="2026-07-31"></div>' +
        '<div class="field"><label>领域</label><select class="sel" id="f_cat">' + NEWS_CATS.map(c => '<option' + (c === (d.domain || d.cat) ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div></div>' +
        '<div class="field"><label>标题</label><input class="inp" id="f_title" autofocus value="' + esc(d.title) + '"></div>' +
        '<div class="grid2"><div class="field"><label>来源</label><input class="inp" id="f_src" value="' + esc(d.source) + '"></div>' +
        '<div class="field"><label>热度 1-5</label><input class="inp" id="f_heat" type="number" min="1" max="5" value="' + (d.heat || 3) + '"></div></div>' +
        '<div class="field"><label>要点摘要</label><textarea class="txa" id="f_sum">' + esc(d.summary) + '</textarea></div>' +
        '<div class="field"><label>解读（可选，留空即纯题录）</label><textarea class="txa" id="f_imp">' + esc(d.impact) + '</textarea></div>' +
        '<div class="field"><label>原文链接（可选）</label><input class="inp" id="f_link" value="' + esc(d.link || '') + '"></div>',
      onOk: m => {
        const v = id => (m.querySelector('#' + id).value || '').trim();
        if (!v('f_title')) { U.toast('标题不能为空'); return false; }
        const obj = {
          date: v('f_date') || S.today(), title: v('f_title'), source: v('f_src'),
          domain: v('f_cat'), cat: '',
          summary: v('f_sum'), impact: v('f_imp'), heat: Math.max(1, Math.min(5, +v('f_heat') || 3)),
          link: v('f_link'), custom: true
        };
        if (n) S.update('news', n.id, obj); else S.add('news', obj);
        paintNews(); window.rerender(); U.toast('已保存', 'ok');
      }
    });
  }

  /* ================= 板块二 · 专业提升（框架 v4，用户 2026-11-10 明确布局） =================
     单一情报流：「文献深读」与六领域标签放在同一栏 chip 里，不是独立子区。
     点「文献深读」→ 显示文献条目，其下第二行为 7 主题筛选（双标签方案：7 主题只管文献）。 */
  let iFilter = '全部', iQuery = '', iShow = 30;   // iFilter：'全部' | 六领域之一 | '文献深读'
  let dFilter = '全部', dShow = 30;                // 文献深读视图下的 7 主题筛选

  window.Pages.insight = function (view) {
    view.innerHTML = '<div class="scroll"><div class="wrap page" id="pgBody"></div></div>';
    paintInsight();
  };

  function dualView(n) {
    const c = (n.viewCMI || '').trim();
    const s = (n.viewSensory || '').trim();
    if (!c && !s) return '<div class="quote">' + esc(n.view || '—') + '</div>';
    const block = (label, color, txt) =>
      '<div style="border-left:3px solid ' + color + ';padding:4px 0 4px 10px;margin:5px 0">' +
      '<div style="font-size:11px;font-weight:500;color:' + color + ';margin-bottom:3px">' + label + '</div>' +
      '<div style="font-size:12.5px;line-height:1.55;color:var(--color-text-primary)">' + clampHtml(txt) + '</div></div>';
    let h = '';
    if (c) h += block('CMI 视角', '#185FA5', c);
    if (s) h += block('感官视角', '#3B6D11', s);
    return h;
  }

  function paintInsight() {
    const box = document.getElementById('pgBody');
    if (!box) return;
    const all = S.s.insights;
    const deep = iFilter === '文献深读';   // true = 文献深读视图；false = 情报题录视图
    const list = (deep ? all.filter(n => !!n.lit) : all.filter(n => !n.lit)).filter(n => {
      if (deep) {
        // 文献题录（未获取全文）没有 7 主题归类，不参与具体主题筛选，只在「全部」下可见
        if (dFilter !== '全部' && (n.lit === 'citation' || topic7Of(n.topic, 'insights') !== dFilter)) return false;
      } else {
        if (iFilter !== '全部' && domainOf(n) !== iFilter) return false;
      }
      if (iQuery) {
        const q = iQuery.toLowerCase();
        return (n.title + (n.zhTitle || '') + n.summary + (n.zhSummary || '') + n.core + n.origin + (n.view || '') + (n.viewCMI || '') + (n.viewSensory || '') + (n.action || '')).toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    // 筛选栏：六领域 + 「文献深读」同一栏（用户明确要求）
    const chips = ['全部'].concat(DOMAINS).concat(['文献深读']);
    const mo = new Date().toISOString().slice(0, 7);
    const intelCount = all.filter(n => !n.lit).length;
    const deepCount = all.length - intelCount;

    box.innerHTML =
      '<div class="stats stagger">' +
      stat('情报总量', intelCount, '条') +
      stat('本月新增', all.filter(x => String(x.addedAt || x.date || '').startsWith(mo)).length, '条') +
      stat('文献深读', deepCount, '篇') +
      stat('覆盖领域', DOMAINS.length, '类') +
      '</div>' +

      '<div class="sec-head">' +
      '<div class="sec-title">专业提升 · 六领域情报 + 文献深读</div>' +
      '<div class="sec-note">' + (deep
        ? '文献经 AI 精读全文 · 15 年市场用户研究 / 感官专家视角 · CMI / 感官双维度'
        : '进门经四级阀门把关（时效 7 天 / 信息完整 / 领域相关 / 值得读）· 点标题看原文') + '</div>' +
      '<div class="spacer"></div>' +
      '<button class="btn primary" id="iAdd">' + ico('plus') + '添加</button>' +
      '</div>' +

      '<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">' +
      '<div class="chips">' + chips.map(c =>
        '<button class="chip' + (c === iFilter ? ' on' : '') + '" data-tp="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' +
      '<input class="inp" id="iQ" placeholder="搜索标题、来源或关键词…" style="max-width:230px;margin-left:auto" value="' + esc(iQuery) + '">' +
      '</div>' +

      // 文献深读视图：第二行 7 主题 chips（双标签方案：7 主题只筛文献）
      (deep ? '<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">' +
      '<div class="chips">' + ['全部'].concat(TOPIC7).map(c =>
        '<button class="chip' + (c === dFilter ? ' on' : '') + '" data-dp="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' +
      '</div>' : '') +

      (deep
        ? (list.length ? '<div class="tbl-wrap"><div class="tbl-scroll"><table class="tbl" style="table-layout:fixed">' +
          '<thead><tr><th style="width:7%">时间</th><th style="width:27%">原文标题 / 来源</th>' +
          '<th style="width:23%">核心内容</th><th style="width:26%">CMI / 感官视角</th><th style="width:11%">长期启发</th><th style="width:56px"></th></tr></thead><tbody>' +
          list.slice(0, iShow).map(n =>
            '<tr>' +
            '<td class="td-date">' + esc(n.date) + '</td>' +
            '<td><div class="td-title" style="font-family:var(--font-serif);font-size:13.4px">' +
            (n.link ? '<a href="' + esc(n.link) + '" target="_blank" rel="noopener">' + esc(n.title) + '</a>' : esc(n.title)) + '</div>' +
            '<div class="td-sub">' + esc(n.origin) + (n.region ? ' · ' + esc(n.region) : '') +
            (n.lit === 'citation'
              ? ' · <span style="color:var(--amber, #BA7517)">仅题录 · 未获取全文</span>' + (n.litClasses && n.litClasses.length ? ' · 命中方向：' + esc(n.litClasses.join(' / ')) : '')
              : (topic7Of(n.topic, 'insights') ? ' · <span class="tag ' + tagColor(T_COLOR, topic7Of(n.topic, 'insights')) + '">' + esc(topic7Of(n.topic, 'insights')) + '</span>' : '')) + '</div></td>' +
            (n.lit === 'citation'
              ? '<td colspan="3" style="color:var(--color-text-secondary);font-size:12.5px;line-height:1.6">' +
                '该文献未获取到全文，按你的要求只保留题录、不生成解读。点上方标题打开原文自行获取资源。' +
                '</td>'
              : '<td>' + clampHtml(n.core) + '</td>' +
                '<td>' + dualView(n) + '</td>' +
                '<td style="color:var(--sage);font-weight:500">' + clampHtml(n.action || '—') + '</td>') +
            '<td><div class="row-act">' +
            '<button class="icon-btn" data-ed="' + n.id + '">' + ico('edit') + '</button>' +
            '<button class="icon-btn del" data-rm="' + n.id + '">' + ico('trash') + '</button>' +
            '</div></td></tr>').join('') +
          '</tbody></table></div></div>' : emptyBox('没有匹配的文献'))
        : (list.length ? '<div class="tbl-wrap"><div class="tbl-scroll"><table class="tbl" style="table-layout:fixed">' +
          '<thead><tr><th style="width:7%">时间</th><th style="width:30%">标题 / 来源</th>' +
          '<th style="width:33%">要点摘要</th><th style="width:24%">解读</th><th style="width:56px"></th></tr></thead><tbody>' +
          list.slice(0, iShow).map(n =>
            '<tr>' +
            '<td class="td-date">' + esc(n.date) + '</td>' +
            '<td><div class="td-title" style="font-family:var(--font-serif);font-size:13.4px">' +
            (n.link ? '<a href="' + esc(n.link) + '" target="_blank" rel="noopener">' + esc(showTitle(n)) + '</a>' : esc(showTitle(n))) + '</div>' +
            '<div class="td-sub">' + esc(n.origin) + (n.region ? ' · ' + esc(n.region) : '') + (domainOf(n) ? ' · <span class="tag ' + tagColor(D_COLOR, domainOf(n)) + '">' + esc(domainOf(n)) + '</span>' : '') + '</div></td>' +
            '<td>' + clampHtml(showSummary(n)) + '</td>' +
            '<td>' + ((n.core || n.view || n.viewCMI || n.viewSensory || n.action)
              ? (n.core ? '<div style="margin-bottom:4px">' + esc(n.core) + '</div>' : '') + dualView(n) + (n.action ? '<div style="margin-top:4px;color:var(--sage);font-size:12px">' + esc(n.action) + '</div>' : '')
              : '<span style="color:var(--color-text-tertiary)">—</span>') + '</td>' +
            '<td><div class="row-act">' +
            '<button class="icon-btn" data-ed="' + n.id + '">' + ico('edit') + '</button>' +
            '<button class="icon-btn del" data-rm="' + n.id + '">' + ico('trash') + '</button>' +
            '</div></td></tr>').join('') +
          '</tbody></table></div></div>' : emptyBox('没有匹配的情报'))) +

      (list.length > iShow ? '<div style="text-align:center;margin:14px 0"><button class="btn" id="iMore">加载更多 · 已显示 ' + Math.min(iShow, list.length) + ' / ' + list.length + '</button></div>' : '');

    box.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { iFilter = b.dataset.tp; dFilter = '全部'; iShow = 30; paintInsight(); });
    box.querySelectorAll('[data-dp]').forEach(b => b.onclick = () => { dFilter = b.dataset.dp; iShow = 30; paintInsight(); });
    const q = document.getElementById('iQ');
    q.oninput = () => { iQuery = q.value; iShow = 30; const p = q.selectionStart; paintInsight(); const q2 = document.getElementById('iQ'); q2.focus(); q2.setSelectionRange(p, p); };
    const moreI = document.getElementById('iMore');
    if (moreI) moreI.onclick = () => { iShow += 30; paintInsight(); };
    document.getElementById('iAdd').onclick = () => insightForm(null);
    bindClamp(box);
    box.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => insightForm(S.find('insights', b.dataset.ed)));
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      U.confirmBox('删除条目', '确定删除这条内容吗？', () => { S.remove('insights', b.dataset.rm); paintInsight(); window.rerender(); });
    });
  }

  function insightForm(n) {
    const d = n || { date: S.today(), topic: '消费者与用户', title: '', origin: '', region: '', core: '', view: '', viewCMI: '', viewSensory: '', action: '', link: '' };
    U.modal({
      title: n ? '编辑情报' : '添加情报',
      body:
        '<div class="grid2"><div class="field"><label>时间</label><input class="inp" id="g_date" value="' + esc(d.date) + '"></div>' +
        '<div class="field"><label>主题</label><select class="sel" id="g_tp">' + TOPICS.map(c => '<option' + (c === d.topic ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div></div>' +
        '<div class="field"><label>原文标题（保留英文）</label><input class="inp" id="g_title" autofocus value="' + esc(d.title) + '"></div>' +
        '<div class="grid2"><div class="field"><label>来源机构 / 作者</label><input class="inp" id="g_org" value="' + esc(d.origin) + '"></div>' +
        '<div class="field"><label>地区</label><input class="inp" id="g_rg" value="' + esc(d.region || '') + '"></div></div>' +
        '<div class="field"><label>核心内容（中文）</label><textarea class="txa" id="g_core">' + esc(d.core) + '</textarea></div>' +
        '<div class="field"><label>CMI 视角（消费者与市场洞察）</label><textarea class="txa" id="g_viewcmi">' + esc(d.viewCMI || '') + '</textarea></div>' +
        '<div class="field"><label>感官视角（感官研究）</label><textarea class="txa" id="g_viewSensory">' + esc(d.viewSensory || '') + '</textarea></div>' +
        '<div class="field"><label>长期启发</label><input class="inp" id="g_act" value="' + esc(d.action || '') + '"></div>' +
        '<div class="field"><label>链接（可选）</label><input class="inp" id="g_link" value="' + esc(d.link || '') + '"></div>',
      onOk: m => {
        const v = id => (m.querySelector('#' + id).value || '').trim();
        if (!v('g_title')) { U.toast('标题不能为空'); return false; }
        const hasNew = v('g_viewcmi') || v('g_viewSensory');
        const obj = {
          date: v('g_date') || S.today(), topic: v('g_tp'), title: v('g_title'), origin: v('g_org'),
          region: v('g_rg'), core: v('g_core'),
          view: hasNew ? '' : (n ? (n.view || '') : ''),
          viewCMI: v('g_viewcmi'), viewSensory: v('g_viewSensory'),
          action: v('g_act'), link: v('g_link'), custom: true
        };
        if (n) S.update('insights', n.id, obj); else S.add('insights', obj);
        paintInsight(); window.rerender(); U.toast('已保存', 'ok');
      }
    });
  }

  /* ================= 共用小件 ================= */
  function stat(k, v, unit) {
    return '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v">' + v + '<small>' + esc(unit || '') + '</small></div></div>';
  }
  function emptyBox(t) {
    return '<div class="card"><div class="empty">' + ico('inbox') + '<div>' + esc(t) + '</div></div></div>';
  }
  window.uiStat = stat;
  window.uiEmpty = emptyBox;
})();
