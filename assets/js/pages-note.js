/* ============================================================
   板块五【随想记录】· 板块六【灵光乍现】
   ============================================================ */
(function () {
  'use strict';
  window.Pages = window.Pages || {};
  const S = window.Store, U = window.UI;
  const esc = U.esc, ico = U.ico;

  /* ================= 板块五 · 随想记录 ================= */
  const CATS = ['电影', '话剧', '演唱会', '阅读', '旅行', '展览', '其他'];
  const C_COLOR = { '电影': 'c4', '话剧': 'c5', '演唱会': 'c1', '阅读': 'c2', '旅行': 'c3', '展览': 'c5', '其他': '' };
  let mFilter = '全部';

  window.Pages.muse = function (view) {
    view.innerHTML = '<div class="scroll"><div class="wrap page" id="pgBody"></div></div>';
    paintMuse();
  };

  function paintMuse() {
    const box = document.getElementById('pgBody');
    if (!box) return;
    const all = S.s.muses;
    const list = (mFilter === '全部' ? all : all.filter(m => m.cat === mFilter))
      .slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.createdAt - a.createdAt);
    const cats = ['全部'].concat(CATS.filter(c => all.some(m => m.cat === c)));
    const yr = new Date().getFullYear();

    box.innerHTML =
      '<div class="stats stagger">' +
      window.uiStat('记录总数', all.length, '篇') +
      window.uiStat(yr + ' 年', all.filter(m => String(m.date).startsWith(yr)).length, '篇') +
      window.uiStat('五星体验', all.filter(m => m.star === 5).length, '个') +
      window.uiStat('涉及门类', cats.length - 1, '类') +
      '</div>' +

      '<div class="sec-head"><div class="sec-title">心得体会</div>' +
      '<div class="sec-note">看过、听过、走过之后，留下的那点东西</div>' +
      '<div class="spacer"></div>' +
      '<div class="chips">' + cats.map(c => '<button class="chip' + (c === mFilter ? ' on' : '') + '" data-mc="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' +
      '<button class="btn primary" id="mAdd" style="margin-left:8px">' + ico('plus') + '写一篇</button></div>' +

      (list.length
        ? '<div class="muse-grid">' + list.map(m =>
          '<div class="muse">' +
          '<div class="muse-top"><span class="tag ' + (C_COLOR[m.cat] || '') + '">' + esc(m.cat) + '</span>' +
          '<span class="td-date">' + esc(m.date) + '</span>' +
          (m.from ? '<span class="route-badge">' + ico('spark') + '闪念</span>' : '') +
          '<div class="row-act"><button class="icon-btn" data-me="' + m.id + '">' + ico('edit') + '</button>' +
          '<button class="icon-btn del" data-mr="' + m.id + '">' + ico('trash') + '</button></div></div>' +
          '<div class="muse-t">' + esc(m.title) + '</div>' +
          '<div class="muse-b">' + esc(m.text) + '</div>' +
          '<div class="muse-f">' + stars(m.star) +
          (m.place ? '<span class="td-date">' + esc(m.place) + '</span>' : '') + '</div>' +
          '</div>').join('') + '</div>'
        : window.uiEmpty('还没有随想，去写第一篇吧'));

    box.querySelectorAll('[data-mc]').forEach(b => b.onclick = () => { mFilter = b.dataset.mc; paintMuse(); });
    document.getElementById('mAdd').onclick = () => museForm(null);
    box.querySelectorAll('[data-me]').forEach(b => b.onclick = () => museForm(S.find('muses', b.dataset.me)));
    box.querySelectorAll('[data-mr]').forEach(b => b.onclick = () => {
      U.confirmBox('删除随想', '确定删除这篇记录吗？', () => { S.remove('muses', b.dataset.mr); paintMuse(); window.rerender(); });
    });
  }

  function stars(n) {
    return '<span class="stars">' + [1, 2, 3, 4, 5].map(i =>
      '<svg class="' + (i <= (n || 0) ? 'on' : '') + '" viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8L12 3.5Z"/></svg>').join('') + '</span>';
  }

  function museForm(m) {
    const d = m || { date: S.today(), cat: '电影', title: '', text: '', star: 4, place: '' };
    U.modal({
      title: m ? '编辑随想' : '写一篇随想',
      body:
        '<div class="grid3">' +
        '<div class="field"><label>类别</label><select class="sel" id="m_c">' + CATS.map(c => '<option' + (c === d.cat ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>日期</label><input class="inp" type="date" id="m_d" value="' + esc(d.date) + '"></div>' +
        '<div class="field"><label>评分</label><select class="sel" id="m_s">' + [5, 4, 3, 2, 1].map(i => '<option value="' + i + '"' + (i === (d.star || 4) ? ' selected' : '') + '>' + '★'.repeat(i) + '</option>').join('') + '</select></div>' +
        '</div>' +
        '<div class="field"><label>标题 / 作品名</label><input class="inp" id="m_t" autofocus value="' + esc(d.title) + '"></div>' +
        '<div class="field"><label>地点（可选）</label><input class="inp" id="m_p" value="' + esc(d.place || '') + '"></div>' +
        '<div class="field"><label>心得体会</label><textarea class="txa" id="m_b" style="min-height:150px" placeholder="哪一刻打动了你？它让你想到了什么？">' + esc(d.text) + '</textarea></div>',
      onOk: mk => {
        const v = id => mk.querySelector('#' + id).value.trim();
        if (!v('m_t')) { U.toast('标题不能为空'); return false; }
        const obj = { cat: v('m_c'), date: v('m_d') || S.today(), star: +v('m_s'), title: v('m_t'), place: v('m_p'), text: v('m_b') };
        if (m) S.update('muses', m.id, obj); else S.add('muses', obj);
        paintMuse(); window.rerender(); U.toast('已保存', 'ok');
      }
    });
  }

  /* ================= 板块六 · 灵光乍现 ================= */
  const TAGS = [
    { n: '灵感', r: '' },
    { n: '待办', r: 'plan' },
    { n: '工作', r: 'plan' },
    { n: '随想', r: 'muse' },
    { n: '英语', r: 'english' },
    { n: '行业', r: 'news' },
    { n: '专业', r: 'insight' },
    { n: '生活', r: '' }
  ];
  const ROUTE = {};
  TAGS.forEach(t => { if (t.r) ROUTE[t.n] = t.r; });
  const PAGE_NAME = { plan: '工作计划', muse: '随想记录', english: '英语学习', news: '行业资讯', insight: '专业提升' };

  let sFilter = '全部';
  let draftTags = [];

  window.Pages.spark = function (view) {
    view.innerHTML =
      '<div class="spark-page">' +
      '<div class="spark-scroll" id="spScroll"><div class="spark-list" id="spList"></div></div>' +
      '<div class="spark-dock"><div class="spark-dock-inner">' +
      '<div class="dock-box">' +
      '<textarea id="spInp" rows="1" placeholder="想到什么，直接写下来…"></textarea>' +
      '<div class="dock-bar" id="spTags"></div>' +
      '</div></div></div></div>';

    const ta = document.getElementById('spInp');
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; };
    ta.onkeydown = e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    };
    paintTagBar();
    paintSparks();
    setTimeout(() => ta.focus(), 120);
  };

  function paintTagBar() {
    const bar = document.getElementById('spTags');
    if (!bar) return;
    bar.innerHTML = TAGS.map(t =>
      '<button class="tagpick' + (draftTags.includes(t.n) ? ' on' : '') + '" data-dt="' + esc(t.n) + '" title="' +
      (t.r ? '打上此标签可一键送往「' + PAGE_NAME[t.r] + '」' : '停留在闪念页面') + '">' +
      esc(t.n) + (t.r ? ' ↗' : '') + '</button>').join('') +
      '<button class="tagpick" data-newtag>+ 自定义</button>' +
      '<span class="hint">Enter 发送 · Shift+Enter 换行</span>';
    bar.querySelectorAll('[data-dt]').forEach(b => b.onclick = () => {
      const n = b.dataset.dt;
      const i = draftTags.indexOf(n);
      if (i >= 0) draftTags.splice(i, 1); else draftTags.push(n);
      paintTagBar();
    });
    bar.querySelector('[data-newtag]').onclick = () => {
      U.modal({
        title: '自定义标签',
        body: '<div class="field"><label>标签名</label><input class="inp" id="nt" autofocus placeholder="如：选题 / 复盘 / 读书"></div>' +
          '<p style="font-size:11.5px;color:var(--ink-4);line-height:1.7">自定义标签的内容会停留在闪念页面，可用于筛选。</p>',
        onOk: m => {
          const v = m.querySelector('#nt').value.trim();
          if (!v) return false;
          if (!draftTags.includes(v)) draftTags.push(v);
          paintTagBar();
        }
      });
    };
  }

  function submit() {
    const ta = document.getElementById('spInp');
    const txt = ta.value.trim();
    if (!txt) return;
    const item = S.add('sparks', { text: txt, tags: draftTags.slice(), archived: false });
    ta.value = ''; ta.style.height = 'auto';
    draftTags = [];
    paintTagBar(); paintSparks(); window.rerender();

    if (S.s.ui.autoFlow) {
      const r = item.tags.map(t => ROUTE[t]).find(Boolean);
      if (r) { flow(item.id, r, true); return; }
    }
    U.toast('已记录', 'ok');
  }

  function paintSparks() {
    const list = document.getElementById('spList');
    if (!list) return;
    const all = S.s.sparks;
    const used = {};
    all.forEach(s => (s.tags || []).forEach(t => used[t] = (used[t] || 0) + 1));
    const tagList = ['全部'].concat(Object.keys(used).sort((a, b) => used[b] - used[a]));

    const shown = all.filter(s => {
      if (sFilter === '全部') return true;
      if (sFilter === '已流转') return s.archived;
      return (s.tags || []).includes(sFilter);
    });

    list.innerHTML =
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">' +
      '<div class="chips">' + tagList.concat(all.some(s => s.archived) ? ['已流转'] : []).map(t =>
        '<button class="chip' + (t === sFilter ? ' on' : '') + '" data-sf="' + esc(t) + '">' + esc(t) +
        (used[t] ? ' ' + used[t] : '') + '</button>').join('') + '</div>' +
      '<label style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink-3);cursor:pointer">' +
      '<input type="checkbox" id="spAuto"' + (S.s.ui.autoFlow ? ' checked' : '') + '>带路由标签时自动流转</label>' +
      '</div>' +
      (shown.length ? shown.map(sparkRow).join('')
        : '<div class="empty">' + ico('spark') + '<div>' + (all.length ? '这个标签下还没有内容' : '下面输入框写下第一个念头') + '</div></div>');

    list.querySelectorAll('[data-sf]').forEach(b => b.onclick = () => { sFilter = b.dataset.sf; paintSparks(); });
    document.getElementById('spAuto').onchange = e => { S.s.ui.autoFlow = e.target.checked; S.save(); U.toast(e.target.checked ? '已开启自动流转' : '已关闭自动流转'); };

    list.querySelectorAll('[data-se]').forEach(b => b.onclick = () => sparkEdit(S.find('sparks', b.dataset.se)));
    list.querySelectorAll('[data-sr]').forEach(b => b.onclick = () => { S.remove('sparks', b.dataset.sr); paintSparks(); window.rerender(); U.toast('已删除'); });
    list.querySelectorAll('[data-flow]').forEach(b => b.onclick = () => flow(b.dataset.flow, b.dataset.to));
    list.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => window.gotoPage(b.dataset.goto));
  }

  function sparkRow(s) {
    const routes = [...new Set((s.tags || []).map(t => ROUTE[t]).filter(Boolean))];
    return '<div class="spark' + (s.archived ? ' archived' : '') + '">' +
      '<div class="spark-txt">' + esc(s.text) + '</div>' +
      '<div class="spark-foot">' +
      (s.tags || []).map(t => '<span class="tag ' + (ROUTE[t] ? 'c2' : '') + '">' + esc(t) + (ROUTE[t] ? ' ↗' : '') + '</span>').join('') +
      '<span class="spark-time">' + U.fmtTime(s.createdAt) + '</span>' +
      (s.archived
        ? '<span class="route-badge">' + ico('tick') + '已送往 ' + esc(PAGE_NAME[s.archivedTo] || '') +
        '</span><button class="btn sm ghost" data-goto="' + esc(s.archivedTo) + '">去查看' + ico('arrow') + '</button>'
        : routes.map(r => '<button class="btn sm" data-flow="' + s.id + '" data-to="' + r + '">' + ico('arrow') + '送往' + PAGE_NAME[r] + '</button>').join('')) +
      '<div class="row-act">' +
      '<button class="icon-btn" data-se="' + s.id + '">' + ico('edit') + '</button>' +
      '<button class="icon-btn del" data-sr="' + s.id + '">' + ico('trash') + '</button>' +
      '</div></div></div>';
  }

  function sparkEdit(s) {
    U.modal({
      title: '编辑闪念',
      body: '<div class="field"><label>内容</label><textarea class="txa" id="se_t" autofocus style="min-height:110px">' + esc(s.text) + '</textarea></div>' +
        '<div class="field"><label>标签（空格分隔）</label><input class="inp" id="se_g" value="' + esc((s.tags || []).join(' ')) + '"></div>' +
        '<p style="font-size:11.5px;color:var(--ink-4);line-height:1.7">带路由的标签：' +
        TAGS.filter(t => t.r).map(t => t.n + '→' + PAGE_NAME[t.r]).join('、') + '</p>',
      onOk: m => {
        const t = m.querySelector('#se_t').value.trim();
        if (!t) { U.toast('内容不能为空'); return false; }
        S.update('sparks', s.id, { text: t, tags: m.querySelector('#se_g').value.split(/[\s,，]+/).filter(Boolean) });
        paintSparks(); window.rerender(); U.toast('已保存', 'ok');
      }
    });
  }

  /** 把闪念流转到目标页面 */
  function flow(id, to, silent) {
    const s = S.find('sparks', id);
    if (!s || !to) return;
    const txt = s.text;
    const short = txt.length > 20 ? txt.slice(0, 20) + '…' : txt;

    if (to === 'plan') {
      S.add('todos', { text: txt, pri: 1, date: S.today(), proj: '闪念', done: false, from: 'spark' });
    } else if (to === 'muse') {
      S.add('muses', { cat: '其他', date: S.today(), star: 0, title: short, text: txt, place: '', from: 'spark' });
    } else if (to === 'english') {
      const w = txt.split(/\s+/)[0].replace(/[^A-Za-z\-']/g, '') || txt;
      S.s.words.unshift({ id: S.uid(), w: w, p: '', t: txt === w ? '' : txt, lv: '阅读生词', from: '闪念', mastered: false, createdAt: Date.now() });
      S.save();
    } else if (to === 'news') {
      S.add('news', { date: S.today(), title: short, source: '个人记录', cat: '趋势洞察', summary: txt, impact: '', heat: 3, link: '', custom: true });
    } else if (to === 'insight') {
      S.add('insights', { date: S.today(), topic: '感官分析', title: short, origin: '个人记录', region: '', core: txt, view: '', action: '', link: '', custom: true });
    }
    S.update('sparks', id, { archived: true, archivedTo: to });
    paintSparks(); window.rerender();
    U.toast((silent ? '已自动送往「' : '已送往「') + PAGE_NAME[to] + '」', 'ok');
  }
})();
