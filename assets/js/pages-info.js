/* ============================================================
   板块一【行业资讯】· 板块二【专业提升】
   ============================================================ */
(function () {
  'use strict';
  window.Pages = window.Pages || {};
  const S = window.Store;
  const U = window.UI;
  const esc = U.esc, ico = U.ico;

  const NEWS_CATS = ['政策法规', '监管执法', '出口贸易', '市场数据', '巨头动向', '海外监管', '趋势洞察', '产品技术'];
  const CAT_COLOR = { '政策法规': 'c1', '监管执法': 'c4', '出口贸易': 'c3', '市场数据': 'c2', '巨头动向': 'c5', '海外监管': 'c4', '趋势洞察': 'c1', '产品技术': 'c3' };

  const TOPICS = ['方法论 · AI', '感官分析', '消费者洞察', '体验设计', '食品科学 · 趋势', '技术 · 工具', '行业态势', '学术 · 争议'];
  const T_COLOR = { '方法论 · AI': 'c3', '感官分析': 'c1', '消费者洞察': 'c2', '体验设计': 'c5', '食品科学 · 趋势': 'c2', '技术 · 工具': 'c3', '行业态势': 'c1', '学术 · 争议': 'c4' };

  const heatBar = n => '<span class="heat">' + [1, 2, 3, 4, 5].map(i => '<i class="' + (i <= (n || 3) ? 'on' : '') + '"></i>').join('') + '</span>';

  /* ================= 板块一 · 行业资讯 ================= */
  let nFilter = '全部', nQuery = '';

  window.Pages.news = function (view) {
    view.innerHTML = '<div class="scroll"><div class="wrap page" id="pgBody"></div></div>';
    paintNews();
  };

  function paintNews() {
    const box = document.getElementById('pgBody');
    if (!box) return;
    const all = S.s.news;
    const list = all.filter(n => {
      if (nFilter !== '全部' && n.cat !== nFilter) return false;
      if (nQuery) {
        const q = nQuery.toLowerCase();
        return (n.title + n.summary + n.source + (n.impact || '')).toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const cats = ['全部'].concat(NEWS_CATS.filter(c => all.some(n => n.cat === c)));
    const hot = all.filter(n => (n.heat || 0) >= 5).length;
    const mo = new Date().toISOString().slice(0, 7);
    const thisMonth = all.filter(n => String(n.date).startsWith(mo)).length;

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
        list.map(n =>
          '<tr>' +
          '<td class="td-date">' + esc(n.date) + '</td>' +
          '<td><div class="td-title">' + (n.link ? '<a href="' + esc(n.link) + '" target="_blank" rel="noopener">' + esc(n.title) + '</a>' : esc(n.title)) + '</div>' +
          '<div class="td-sub">' + esc(n.source) + '</div></td>' +
          '<td><span class="tag ' + (CAT_COLOR[n.cat] || '') + '">' + esc(n.cat || '未分类') + '</span></td>' +
          '<td>' + esc(n.summary) + '</td>' +
          '<td><div class="quote">' + esc(n.impact || '—') + '</div></td>' +
          '<td>' + heatBar(n.heat) + '</td>' +
          '<td><div class="row-act">' +
          '<button class="icon-btn" data-ed="' + n.id + '">' + ico('edit') + '</button>' +
          '<button class="icon-btn del" data-rm="' + n.id + '">' + ico('trash') + '</button>' +
          '</div></td></tr>').join('') +
        '</tbody></table></div></div>'
        : emptyBox('没有匹配的资讯'));

    box.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { nFilter = b.dataset.cat; paintNews(); });
    const q = document.getElementById('nQ');
    q.oninput = () => { nQuery = q.value; const p = q.selectionStart; paintNews(); const q2 = document.getElementById('nQ'); q2.focus(); q2.setSelectionRange(p, p); };
    document.getElementById('nAdd').onclick = () => newsForm(null);
    box.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => newsForm(S.find('news', b.dataset.ed)));
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      U.confirmBox('删除资讯', '确定删除这条情报吗？', () => { S.remove('news', b.dataset.rm); paintNews(); window.rerender(); });
    });
  }

  function newsForm(n) {
    const d = n || { date: S.today(), title: '', source: '', cat: '政策法规', summary: '', impact: '', heat: 3, link: '' };
    U.modal({
      title: n ? '编辑资讯' : '添加资讯',
      body:
        '<div class="grid2"><div class="field"><label>日期</label><input class="inp" id="f_date" value="' + esc(d.date) + '" placeholder="2026-07-31"></div>' +
        '<div class="field"><label>分类</label><select class="sel" id="f_cat">' + NEWS_CATS.map(c => '<option' + (c === d.cat ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div></div>' +
        '<div class="field"><label>标题</label><input class="inp" id="f_title" autofocus value="' + esc(d.title) + '"></div>' +
        '<div class="grid2"><div class="field"><label>来源</label><input class="inp" id="f_src" value="' + esc(d.source) + '"></div>' +
        '<div class="field"><label>热度 1-5</label><input class="inp" id="f_heat" type="number" min="1" max="5" value="' + (d.heat || 3) + '"></div></div>' +
        '<div class="field"><label>要点摘要</label><textarea class="txa" id="f_sum">' + esc(d.summary) + '</textarea></div>' +
        '<div class="field"><label>影响解读（我的判断）</label><textarea class="txa" id="f_imp">' + esc(d.impact) + '</textarea></div>' +
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
  let iFilter = '全部', iQuery = '';

  window.Pages.insight = function (view) {
    view.innerHTML = '<div class="scroll"><div class="wrap page" id="pgBody"></div></div>';
    paintInsight();
  };

  function paintInsight() {
    const box = document.getElementById('pgBody');
    if (!box) return;
    const all = S.s.insights;
    const list = all.filter(n => {
      if (iFilter !== '全部' && n.topic !== iFilter) return false;
      if (iQuery) {
        const q = iQuery.toLowerCase();
        return (n.title + n.core + n.origin + (n.view || '') + (n.action || '')).toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const topics = ['全部'].concat(TOPICS.filter(t => all.some(n => n.topic === t)));

    box.innerHTML =
      '<div class="stats stagger">' +
      stat('情报总量', all.length, '条') +
      stat('覆盖主题', topics.length - 1, '类') +
      stat('英文原文', all.filter(x => /[a-zA-Z]{4,}/.test(x.title)).length, '篇') +
      stat('可执行建议', all.filter(x => x.action).length, '条') +
      '</div>' +

      '<div class="sec-head">' +
      '<div class="sec-title">全球情报 · 顾问视角</div>' +
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
        '<th style="min-width:320px">核心内容</th><th style="min-width:330px">顾问视角</th><th style="min-width:220px">行动建议</th><th style="width:66px"></th></tr></thead><tbody>' +
        list.map(n =>
          '<tr>' +
          '<td class="td-date">' + esc(n.date) + '</td>' +
          '<td><span class="tag ' + (T_COLOR[n.topic] || '') + '">' + esc(n.topic || '') + '</span></td>' +
          '<td><div class="td-title" style="font-family:var(--font-serif);font-size:13.4px">' +
          (n.link ? '<a href="' + esc(n.link) + '" target="_blank" rel="noopener">' + esc(n.title) + '</a>' : esc(n.title)) + '</div>' +
          '<div class="td-sub">' + esc(n.origin) + (n.region ? ' · ' + esc(n.region) : '') + '</div></td>' +
          '<td>' + esc(n.core) + '</td>' +
          '<td><div class="quote">' + esc(n.view || '—') + '</div></td>' +
          '<td style="color:var(--sage);font-weight:500">' + esc(n.action || '—') + '</td>' +
          '<td><div class="row-act">' +
          '<button class="icon-btn" data-ed="' + n.id + '">' + ico('edit') + '</button>' +
          '<button class="icon-btn del" data-rm="' + n.id + '">' + ico('trash') + '</button>' +
          '</div></td></tr>').join('') +
        '</tbody></table></div></div>'
        : emptyBox('没有匹配的情报'));

    box.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { iFilter = b.dataset.tp; paintInsight(); });
    const q = document.getElementById('iQ');
    q.oninput = () => { iQuery = q.value; const p = q.selectionStart; paintInsight(); const q2 = document.getElementById('iQ'); q2.focus(); q2.setSelectionRange(p, p); };
    document.getElementById('iAdd').onclick = () => insightForm(null);
    box.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => insightForm(S.find('insights', b.dataset.ed)));
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
      U.confirmBox('删除情报', '确定删除这条情报吗？', () => { S.remove('insights', b.dataset.rm); paintInsight(); window.rerender(); });
    });
  }

  function insightForm(n) {
    const d = n || { date: S.today(), topic: '感官分析', title: '', origin: '', region: '', core: '', view: '', action: '', link: '' };
    U.modal({
      title: n ? '编辑情报' : '添加情报',
      body:
        '<div class="grid2"><div class="field"><label>时间</label><input class="inp" id="g_date" value="' + esc(d.date) + '"></div>' +
        '<div class="field"><label>主题</label><select class="sel" id="g_tp">' + TOPICS.map(c => '<option' + (c === d.topic ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div></div>' +
        '<div class="field"><label>原文标题（保留英文）</label><input class="inp" id="g_title" autofocus value="' + esc(d.title) + '"></div>' +
        '<div class="grid2"><div class="field"><label>来源机构 / 作者</label><input class="inp" id="g_org" value="' + esc(d.origin) + '"></div>' +
        '<div class="field"><label>地区</label><input class="inp" id="g_rg" value="' + esc(d.region || '') + '"></div></div>' +
        '<div class="field"><label>核心内容（中文）</label><textarea class="txa" id="g_core">' + esc(d.core) + '</textarea></div>' +
        '<div class="field"><label>顾问视角（我的判断与立场）</label><textarea class="txa" id="g_view">' + esc(d.view) + '</textarea></div>' +
        '<div class="field"><label>行动建议</label><input class="inp" id="g_act" value="' + esc(d.action || '') + '"></div>' +
        '<div class="field"><label>链接（可选）</label><input class="inp" id="g_link" value="' + esc(d.link || '') + '"></div>',
      onOk: m => {
        const v = id => (m.querySelector('#' + id).value || '').trim();
        if (!v('g_title')) { U.toast('标题不能为空'); return false; }
        const obj = {
          date: v('g_date') || S.today(), topic: v('g_tp'), title: v('g_title'), origin: v('g_org'),
          region: v('g_rg'), core: v('g_core'), view: v('g_view'), action: v('g_act'), link: v('g_link'), custom: true
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
