/* ============================================================
   板块一【行业资讯】· 板块二【专业提升】
   ============================================================ */
(function () {
  'use strict';
  window.Pages = window.Pages || {};
  const S = window.Store;
  const U = window.UI;
  const esc = U.esc, ico = U.ico;

  // 7 主题 MECE（定本 v5，两板块共用同一套）。与 scripts/topic7.mjs 保持一致，改一处须同步另一处。
  const TOPIC7 = ['产业动态', '政策与标准', '市场与数据', '消费者与用户', '产品与感官', '趋势与前瞻', '战略与方法'];
  const T7_COLOR = { '产业动态': 'c5', '政策与标准': 'c4', '市场与数据': 'c2', '消费者与用户': 'c1', '产品与感官': 'c3', '趋势与前瞻': 'c1', '战略与方法': 'c2' };
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
  const NEWS_CATS = TOPIC7;
  const CAT_COLOR = T7_COLOR;
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

  /* ================= 板块一 · 行业资讯 ================= */
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
      if (nFilter !== '全部' && topic7Of(n.cat, 'news') !== nFilter) return false;
      if (nQuery) {
        const q = nQuery.toLowerCase();
        return (n.title + n.summary + n.source + (n.impact || '')).toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    // 筛选器固定为 7 主题 MECE（定本 v5）；存量旧桶经 topic7Of 归一后仍能被对应主题筛到
    const cats = ['全部'].concat(TOPIC7);
    const hot = all.filter(n => (n.heat || 0) >= 5).length;
    const mo = new Date().toISOString().slice(0, 7);
    // 本月新增：优先按入库日期(addedAt)统计真实抓取量，无 addedAt 的旧条目退回文章日期
    const thisMonth = all.filter(n => String(n.addedAt || n.date || '').startsWith(mo)).length;

    box.innerHTML =
      '<div class="stats stagger">' +
      stat('情报总量', all.length, '条') +
      stat('本月新增', thisMonth, '条') +
      stat('高热度', hot, '条') +
      stat('覆盖分类', cats.length - 1, '类') +
      '</div>' +

      '<div class="sec-head">' +
      '<div class="sec-title">情报清单</div>' +
      '<div class="sec-note">全网检索 · 政策原文 / 2FIRSTS / 券商研报 / 财经媒体</div>' +
      '<div class="spacer"></div>' +
      '<button class="btn primary" id="nAdd">' + ico('plus') + '添加</button>' +
      '</div>' +

      '<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">' +
      '<div class="chips">' + cats.map(c =>
        '<button class="chip' + (c === nFilter ? ' on' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' +
      '<input class="inp" id="nQ" placeholder="搜索标题、来源或关键词…" style="max-width:230px;margin-left:auto" value="' + esc(nQuery) + '">' +
      '</div>' +

      (list.length ? '<div class="tbl-wrap"><div class="tbl-scroll"><table class="tbl">' +
        '<thead><tr><th style="min-width:82px">日期</th><th style="min-width:230px">资讯标题</th><th style="min-width:82px">分类</th>' +
        '<th style="min-width:300px">要点摘要</th><th style="min-width:250px">影响解读</th><th style="min-width:56px">热度</th><th style="width:66px"></th></tr></thead><tbody>' +
        list.slice(0, nShow).map(n =>
          '<tr>' +
          '<td class="td-date">' + esc(n.date) + '</td>' +
          '<td><div class="td-title">' + (n.link ? '<a href="' + esc(n.link) + '" target="_blank" rel="noopener">' + esc(n.title) + '</a>' : esc(n.title)) + '</div>' +
          '<div class="td-sub">' + esc(n.source) + '</div></td>' +
          '<td><span class="tag ' + tagColor(CAT_COLOR, topic7Of(n.cat, 'news')) + '">' + esc(topic7Of(n.cat, 'news')) + '</span></td>' +
          '<td>' + esc(n.summary) + '</td>' +
          '<td><div class="quote">' + esc(n.impact || '—') + '</div></td>' +
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
    box.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => newsForm(S.find('news', b.dataset.ed)));
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      U.confirmBox('删除资讯', '确定删除这条情报吗？', () => { S.remove('news', b.dataset.rm); paintNews(); window.rerender(); });
    });
  }

  function newsForm(n) {
    const d = n || { date: S.today(), title: '', source: '', cat: '产业动态', summary: '', impact: '', heat: 3, link: '' };
    U.modal({
      title: n ? '编辑资讯' : '添加资讯',
      body:
        '<div class="grid2"><div class="field"><label>日期</label><input class="inp" id="f_date" value="' + esc(d.date) + '" placeholder="2026-07-31"></div>' +
        '<div class="field"><label>分类</label><select class="sel" id="f_cat">' + NEWS_CATS.map(c => '<option' + (c === d.cat ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div></div>' +
        '<div class="field"><label>标题</label><input class="inp" id="f_title" autofocus value="' + esc(d.title) + '"></div>' +
        '<div class="grid2"><div class="field"><label>来源</label><input class="inp" id="f_src" value="' + esc(d.source) + '"></div>' +
        '<div class="field"><label>热度 1-5</label><input class="inp" id="f_heat" type="number" min="1" max="5" value="' + (d.heat || 3) + '"></div></div>' +
        '<div class="field"><label>要点摘要</label><textarea class="txa" id="f_sum">' + esc(d.summary) + '</textarea></div>' +
        '<div class="field"><label>影响解读（宏观视角）</label><textarea class="txa" id="f_imp">' + esc(d.impact) + '</textarea></div>' +
        '<div class="field"><label>原文链接（可选）</label><input class="inp" id="f_link" value="' + esc(d.link || '') + '"></div>',
      onOk: m => {
        const v = id => (m.querySelector('#' + id).value || '').trim();
        if (!v('f_title')) { U.toast('标题不能为空'); return false; }
        const obj = {
          date: v('f_date') || S.today(), title: v('f_title'), source: v('f_src'), cat: v('f_cat'),
          summary: v('f_sum'), impact: v('f_imp'), heat: Math.max(1, Math.min(5, +v('f_heat') || 3)),
          link: v('f_link'), custom: true
        };
        if (n) S.update('news', n.id, obj); else S.add('news', obj);
        paintNews(); window.rerender(); U.toast('已保存', 'ok');
      }
    });
  }

  /* ================= 板块二 · 专业提升 ================= */
  let iFilter = '全部', iQuery = '', iShow = 30; // iShow：分页——每次多加载 30 条

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
      '<div style="font-size:12.5px;line-height:1.55;color:var(--color-text-primary)">' + esc(txt) + '</div></div>';
    let h = '';
    if (c) h += block('CMI 视角', '#185FA5', c);
    if (s) h += block('感官视角', '#3B6D11', s);
    return h;
  }

  function paintInsight() {
    const box = document.getElementById('pgBody');
    if (!box) return;
    const all = S.s.insights;
    const list = all.filter(n => {
      if (iFilter !== '全部' && topic7Of(n.topic, 'insights') !== iFilter) return false;
      if (iQuery) {
        const q = iQuery.toLowerCase();
        return (n.title + n.core + n.origin + (n.view || '') + (n.viewCMI || '') + (n.viewSensory || '') + (n.action || '')).toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    // 筛选器固定为 7 主题 MECE（定本 v5）；存量旧桶经 topic7Of 归一后仍能被对应主题筛到
    const topics = ['全部'].concat(TOPIC7);

    box.innerHTML =
      '<div class="stats stagger">' +
      stat('情报总量', all.length, '条') +
      stat('覆盖主题', topics.length - 1, '类') +
      stat('英文原文', all.filter(x => /[a-zA-Z]{4,}/.test(x.title)).length, '篇') +
      stat('可执行建议', all.filter(x => x.action).length, '条') +
      '</div>' +

      '<div class="sec-head">' +
      '<div class="sec-title">全球情报 · CMI / 感官 双维度视角</div>' +
      '<div class="sec-note">搜索范围：行业新闻 / 研究报告 / 公司博客 / Reddit / X / LinkedIn / Medium / 学术与预印本</div>' +
      '<div class="spacer"></div>' +
      '<button class="btn primary" id="iAdd">' + ico('plus') + '添加</button>' +
      '</div>' +

      '<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">' +
      '<div class="chips">' + topics.map(c =>
        '<button class="chip' + (c === iFilter ? ' on' : '') + '" data-tp="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' +
      '<input class="inp" id="iQ" placeholder="搜索标题、机构或关键词…" style="max-width:230px;margin-left:auto" value="' + esc(iQuery) + '">' +
      '</div>' +

      (list.length ? '<div class="tbl-wrap"><div class="tbl-scroll"><table class="tbl">' +
        '<thead><tr><th style="min-width:76px">时间</th><th style="min-width:100px">主题</th><th style="min-width:250px">原文标题 / 来源</th>' +
        '<th style="min-width:320px">核心内容</th><th style="min-width:330px">CMI / 感官视角</th><th style="min-width:220px">长期启发</th><th style="width:66px"></th></tr></thead><tbody>' +
        list.slice(0, iShow).map(n =>
          '<tr>' +
          '<td class="td-date">' + esc(n.date) + '</td>' +
          '<td><span class="tag ' + tagColor(T_COLOR, topic7Of(n.topic, 'insights')) + '">' + esc(topic7Of(n.topic, 'insights')) + '</span></td>' +
          '<td><div class="td-title" style="font-family:var(--font-serif);font-size:13.4px">' +
          (n.link ? '<a href="' + esc(n.link) + '" target="_blank" rel="noopener">' + esc(n.title) + '</a>' : esc(n.title)) + '</div>' +
          '<div class="td-sub">' + esc(n.origin) + (n.region ? ' · ' + esc(n.region) : '') +
          (n.lit === 'citation' ? ' · <span style="color:var(--amber, #BA7517)">仅题录 · 未获取全文</span>' : '') + '</div></td>' +
          (n.lit === 'citation'
            // 题录：不写解读是设计如此。三栏合并成一句明确提示，绝不留空白、绝不放编造的解读。
            ? '<td colspan="3" style="color:var(--color-text-secondary);font-size:12.5px;line-height:1.6">' +
              '该文献未获取到全文，按你的要求只保留题录、不生成解读。点上方标题打开原文自行获取资源。' +
              (n.litClasses && n.litClasses.length ? '<div style="margin-top:4px;color:var(--color-text-tertiary)">命中方向：' + esc(n.litClasses.join(' / ')) + '</div>' : '') +
              '</td>'
            : '<td>' + esc(n.core) + '</td>' +
              '<td>' + dualView(n) + '</td>' +
              '<td style="color:var(--sage);font-weight:500">' + esc(n.action || '—') + '</td>') +
          '<td><div class="row-act">' +
          '<button class="icon-btn" data-ed="' + n.id + '">' + ico('edit') + '</button>' +
          '<button class="icon-btn del" data-rm="' + n.id + '">' + ico('trash') + '</button>' +
          '</div></td></tr>').join('') +
        '</tbody></table></div></div>' + (list.length > iShow ? '<div style="text-align:center;margin:14px 0"><button class="btn" id="iMore">加载更多 · 已显示 ' + Math.min(iShow, list.length) + ' / ' + list.length + '</button></div>' : '')
        : emptyBox('没有匹配的情报'));

    box.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { iFilter = b.dataset.tp; iShow = 30; paintInsight(); });
    const q = document.getElementById('iQ');
    q.oninput = () => { iQuery = q.value; iShow = 30; const p = q.selectionStart; paintInsight(); const q2 = document.getElementById('iQ'); q2.focus(); q2.setSelectionRange(p, p); };
    const moreI = document.getElementById('iMore');
    if (moreI) moreI.onclick = () => { iShow += 30; paintInsight(); };
    document.getElementById('iAdd').onclick = () => insightForm(null);
    box.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => insightForm(S.find('insights', b.dataset.ed)));
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      U.confirmBox('删除情报', '确定删除这条情报吗？', () => { S.remove('insights', b.dataset.rm); paintInsight(); window.rerender(); });
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
