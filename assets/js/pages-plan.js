/* ============================================================
   板块三【工作计划】· 待办清单 + 工作日志
   ============================================================ */
(function () {
  'use strict';
  window.Pages = window.Pages || {};
  const S = window.Store, U = window.UI;
  const esc = U.esc, ico = U.ico;

  const PRI = [
    { v: 0, k: 'P0', t: '紧急重要' },
    { v: 1, k: 'P1', t: '重要不紧急' },
    { v: 2, k: 'P2', t: '紧急不重要' },
    { v: 3, k: 'P3', t: '有空再说' }
  ];

  let scope = 'today';   // today | open | week | done | all
  let sortBy = 'pri';    // pri | date | new

  window.Pages.plan = function (view) {
    view.innerHTML = '<div class="scroll"><div class="wrap page" id="pgBody"></div></div>';
    paint();
  };

  function inWeek(d) {
    if (!d) return false;
    const t = new Date(S.today()), x = new Date(d);
    const diff = (x - t) / 864e5;
    return diff >= -0.5 && diff < 7;
  }

  function paint() {
    const box = document.getElementById('pgBody');
    if (!box) return;
    const all = S.s.todos, td = S.today();

    let list = all.slice();
    // 今日待办 = 到期日在今天或更早（含逾期）的未完成项
    if (scope === 'today') list = all.filter(t => !t.done && t.date && t.date <= td);
    if (scope === 'open') list = all.filter(t => !t.done);
    if (scope === 'week') list = all.filter(t => !t.done && inWeek(t.date));
    if (scope === 'done') list = all.filter(t => t.done);

    if (sortBy === 'pri') list.sort((a, b) => (a.pri - b.pri) || String(a.date || '9').localeCompare(String(b.date || '9')));
    else if (sortBy === 'date') list.sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
    else list.sort((a, b) => b.createdAt - a.createdAt);

    const overdue = all.filter(t => !t.done && t.date && t.date < td).length;
    const todayN = all.filter(t => !t.done && t.date === td).length;
    const doneToday = all.filter(t => t.done && String(t.doneAt || '').slice(0, 10) === td).length;

    box.innerHTML =
      '<div class="stats stagger">' +
      window.uiStat('今日待办', todayN, '项') +
      window.uiStat('已逾期', overdue, '项') +
      window.uiStat('今日完成', doneToday, '项') +
      window.uiStat('未完成总计', all.filter(t => !t.done).length, '项') +
      '</div>' +

      /* 快速添加 */
      '<div class="card card-pad" style="margin-bottom:18px">' +
      '<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">' +
      '<input class="inp" id="qText" placeholder="添加一项待办，回车即可保存…" style="flex:1;min-width:200px">' +
      '<select class="sel" id="qPri" style="width:132px">' + PRI.map(p => '<option value="' + p.v + '"' + (p.v === 1 ? ' selected' : '') + '>' + p.k + ' ' + p.t + '</option>').join('') + '</select>' +
      '<input class="inp" id="qDate" type="date" style="width:150px" value="' + td + '">' +
      '<input class="inp" id="qProj" placeholder="项目 / 标签" style="width:130px">' +
      '<button class="btn primary" id="qAdd">' + ico('plus') + '添加</button>' +
      '</div></div>' +

      '<div class="sec-head">' +
      '<div class="sec-title">待办清单</div>' +
      '<div class="spacer"></div>' +
      '<div class="chips">' +
      chip('today', '今日待办') + chip('week', '本周') + chip('open', '全部未完成') + chip('done', '已完成') + chip('all', '全部') +
      '</div>' +
      '<select class="sel" id="qSort" style="width:118px;margin-left:8px">' +
      '<option value="pri"' + (sortBy === 'pri' ? ' selected' : '') + '>按优先级</option>' +
      '<option value="date"' + (sortBy === 'date' ? ' selected' : '') + '>按日期</option>' +
      '<option value="new"' + (sortBy === 'new' ? ' selected' : '') + '>按创建时间</option>' +
      '</select>' +
      '</div>' +

      (list.length
        ? '<div class="card" style="overflow:hidden;margin-bottom:26px">' + list.map(t => todoRow(t, td)).join('') + '</div>'
        : '<div style="margin-bottom:26px">' + window.uiEmpty(scope === 'today' ? '今天没有待办，享受一点空白。' : '这里还没有内容') + '</div>') +

      /* 工作日志 */
      '<div class="sec-head">' +
      '<div class="sec-title">工作日志</div>' +
      '<div class="sec-note">记录进展、结论与决定，方便复盘</div>' +
      '<div class="spacer"></div>' +
      '<button class="btn" id="lAdd">' + ico('plus') + '写一条</button>' +
      '</div>' +
      (S.s.logs.length
        ? '<div style="display:flex;flex-direction:column;gap:10px">' + S.s.logs.map(logRow).join('') + '</div>'
        : window.uiEmpty('还没有工作日志'));

    /* 事件 */
    const qt = document.getElementById('qText');
    const addNow = () => {
      const txt = qt.value.trim();
      if (!txt) { U.toast('先写点什么吧'); return; }
      S.add('todos', {
        text: txt,
        pri: +document.getElementById('qPri').value,
        date: document.getElementById('qDate').value,
        proj: document.getElementById('qProj').value.trim(),
        done: false
      });
      qt.value = ''; document.getElementById('qProj').value = '';
      paint(); window.rerender();
      const n = document.getElementById('qText'); if (n) n.focus();
    };
    document.getElementById('qAdd').onclick = addNow;
    qt.onkeydown = e => { if (e.key === 'Enter') addNow(); };

    box.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => { scope = b.dataset.sc; paint(); });
    document.getElementById('qSort').onchange = e => { sortBy = e.target.value; paint(); };

    box.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => {
      const t = S.find('todos', b.dataset.tg);
      S.update('todos', t.id, { done: !t.done, doneAt: !t.done ? new Date().toISOString() : '' });
      paint(); window.rerender();
    });
    box.querySelectorAll('[data-ted]').forEach(b => b.onclick = () => todoForm(S.find('todos', b.dataset.ted)));
    box.querySelectorAll('[data-trm]').forEach(b => b.onclick = () => {
      S.remove('todos', b.dataset.trm); paint(); window.rerender(); U.toast('已删除');
    });

    document.getElementById('lAdd').onclick = () => logForm(null);
    box.querySelectorAll('[data-led]').forEach(b => b.onclick = () => logForm(S.find('logs', b.dataset.led)));
    box.querySelectorAll('[data-lrm]').forEach(b => b.onclick = () => {
      U.confirmBox('删除日志', '确定删除这条工作日志吗？', () => { S.remove('logs', b.dataset.lrm); paint(); });
    });
  }

  function chip(k, t) {
    return '<button class="chip' + (scope === k ? ' on' : '') + '" data-sc="' + k + '">' + t + '</button>';
  }

  function todoRow(t, td) {
    const p = PRI[t.pri] || PRI[3];
    const late = !t.done && t.date && t.date < td;
    return '<div class="todo' + (t.done ? ' is-done' : '') + '">' +
      '<button class="cbx' + (t.done ? ' done' : '') + '" data-tg="' + t.id + '">' + ico('tick') + '</button>' +
      '<div class="todo-body"><div class="todo-txt">' + esc(t.text) + '</div>' +
      '<div class="todo-meta">' +
      '<span class="pri p' + t.pri + '">' + p.k + '</span>' +
      (t.date ? '<span class="td-date"' + (late ? ' style="color:var(--clay)"' : '') + '>' + esc(t.date) + (late ? ' · 逾期' : '') + '</span>' : '') +
      (t.proj ? '<span class="tag">' + esc(t.proj) + '</span>' : '') +
      (t.from ? '<span class="route-badge">' + ico('spark') + '来自闪念</span>' : '') +
      '</div></div>' +
      '<div class="row-act">' +
      '<button class="icon-btn" data-ted="' + t.id + '">' + ico('edit') + '</button>' +
      '<button class="icon-btn del" data-trm="' + t.id + '">' + ico('trash') + '</button>' +
      '</div></div>';
  }

  function todoForm(t) {
    U.modal({
      title: '编辑待办',
      body:
        '<div class="field"><label>内容</label><textarea class="txa" id="e_t" autofocus style="min-height:70px">' + esc(t.text) + '</textarea></div>' +
        '<div class="grid3">' +
        '<div class="field"><label>优先级</label><select class="sel" id="e_p">' + PRI.map(p => '<option value="' + p.v + '"' + (p.v === t.pri ? ' selected' : '') + '>' + p.k + ' ' + p.t + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>日期</label><input class="inp" type="date" id="e_d" value="' + esc(t.date || '') + '"></div>' +
        '<div class="field"><label>项目</label><input class="inp" id="e_j" value="' + esc(t.proj || '') + '"></div></div>',
      onOk: m => {
        const txt = m.querySelector('#e_t').value.trim();
        if (!txt) { U.toast('内容不能为空'); return false; }
        S.update('todos', t.id, { text: txt, pri: +m.querySelector('#e_p').value, date: m.querySelector('#e_d').value, proj: m.querySelector('#e_j').value.trim() });
        paint(); window.rerender(); U.toast('已保存', 'ok');
      }
    });
  }

  function logRow(l) {
    return '<div class="card card-pad hoverable" style="padding:15px 18px">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<span class="td-date">' + esc(l.date) + '</span>' +
      (l.tag ? '<span class="tag c2">' + esc(l.tag) + '</span>' : '') +
      '<div class="row-act" style="margin-left:auto">' +
      '<button class="icon-btn" data-led="' + l.id + '">' + ico('edit') + '</button>' +
      '<button class="icon-btn del" data-lrm="' + l.id + '">' + ico('trash') + '</button></div></div>' +
      '<div style="font-size:13.2px;line-height:1.8;color:var(--ink-2);white-space:pre-wrap">' + esc(l.text) + '</div></div>';
  }

  function logForm(l) {
    const d = l || { date: S.today(), tag: '', text: '' };
    U.modal({
      title: l ? '编辑日志' : '写一条工作日志',
      body:
        '<div class="grid2"><div class="field"><label>日期</label><input class="inp" type="date" id="l_d" value="' + esc(d.date) + '"></div>' +
        '<div class="field"><label>标签（可选）</label><input class="inp" id="l_g" value="' + esc(d.tag) + '" placeholder="项目复盘 / 会议 / 决策"></div></div>' +
        '<div class="field"><label>内容</label><textarea class="txa" id="l_t" autofocus style="min-height:130px" placeholder="今天推进了什么？遇到什么？下一步是什么？">' + esc(d.text) + '</textarea></div>',
      onOk: m => {
        const txt = m.querySelector('#l_t').value.trim();
        if (!txt) { U.toast('内容不能为空'); return false; }
        const obj = { date: m.querySelector('#l_d').value || S.today(), tag: m.querySelector('#l_g').value.trim(), text: txt };
        if (l) S.update('logs', l.id, obj); else S.add('logs', obj);
        paint(); U.toast('已保存', 'ok');
      }
    });
  }
})();
