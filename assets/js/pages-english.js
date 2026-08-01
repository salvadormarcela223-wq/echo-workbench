/* ============================================================
   板块四【英语学习】· 每日阅读 / 情景对话 / 单词本
   ============================================================ */
(function () {
  'use strict';
  window.Pages = window.Pages || {};
  const S = window.Store, U = window.UI;
  const esc = U.esc, ico = U.ico;

  let tab = 'read';

  /* 每日轮换：按日期取模，保证同一天固定，跨天自动换 */
  function dayIndex(len) {
    const d = new Date(S.today());
    return Math.abs(Math.floor(d.getTime() / 864e5)) % Math.max(1, len);
  }
  function curReading() {
    const arr = window.SEED_READINGS || [];
    const e = S.s.english;
    if (e.stamp !== S.today()) { e.stamp = S.today(); e.readIdx = dayIndex(arr.length); e.dlgIdx = dayIndex(arr.length + 3) % Math.max(1, (window.SEED_DIALOGS || []).length); S.save(true); }
    return arr[e.readIdx % Math.max(1, arr.length)] || null;
  }
  function curDialog() {
    const arr = window.SEED_DIALOGS || [];
    curReading();
    return arr[S.s.english.dlgIdx % Math.max(1, arr.length)] || null;
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
  function paintRead(c) {
    const a = curReading();
    if (!a) { c.innerHTML = window.uiEmpty('暂无文章'); return; }
    const saved = new Set(S.s.words.map(w => w.w.toLowerCase()));
    const vmap = {};
    (a.vocab || []).forEach(v => vmap[v.w.toLowerCase()] = v);

    // 把正文中的 <u>xxx</u> 转成可点击词
    const body = (a.body || []).map(p =>
      '<p>' + p.replace(/<u>([^<]+)<\/u>/g, (m, w) => {
        const key = w.toLowerCase().replace(/[^a-z\- ]/g, '');
        return '<span class="kw' + (saved.has(key) ? ' saved' : '') + '" data-w="' + esc(key) + '">' + esc(w) + '</span>';
      }) + '</p>').join('');

    c.innerHTML =
      '<div class="page" style="display:grid;grid-template-columns:1fr;gap:16px">' +
      '<div class="card card-pad" style="padding:28px 32px">' +
      '<div style="display:flex;align-items:center;gap:9px;margin-bottom:12px;flex-wrap:wrap">' +
      '<span class="tag c1">' + esc(a.tag) + '</span>' +
      '<span class="td-date">约 ' + a.minutes + ' 分钟</span>' +
      '<span class="td-date">' + S.today() + '</span>' +
      '<div style="margin-left:auto;display:flex;gap:6px">' +
      '<button class="btn sm" id="rNext">' + ico('refresh') + '换一篇</button>' +
      '<button class="btn sm" id="rAll">全部生词入本</button></div></div>' +
      '<h2 style="font-family:var(--font-serif);font-size:26px;line-height:1.35;margin-bottom:4px">' + esc(a.title) + '</h2>' +
      '<div style="color:var(--ink-3);font-size:13px;margin-bottom:20px">' + esc(a.subtitle) + '</div>' +
      '<div style="font-size:11.5px;color:var(--ink-4);background:var(--surface-2);padding:9px 13px;border-radius:10px;margin-bottom:20px">' +
      '划线词可点击 → 一键收入单词本；也可选中任意文字后点击浮起的「加入单词本」。</div>' +
      '<div class="article" id="artBody">' + body + '</div>' +
      '</div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="grid2">' +
      '<div class="card">' +
      '<div class="card-pad" style="padding-bottom:8px"><div class="sec-title">重点词汇</div></div>' +
      (a.vocab || []).map(v =>
        '<div class="vocab-item">' +
        '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">' +
        '<span class="vocab-w">' + esc(v.w) + '</span><span class="vocab-p">' + esc(v.p) + '</span>' +
        '<span class="tag ' + lvColor(v.lv) + '">' + esc(v.lv) + '</span></div>' +
        '<div class="vocab-t">' + esc(v.t) + '</div></div>' +
        '<button class="icon-btn" data-add="' + esc(v.w) + '" title="加入单词本">' +
        (saved.has(v.w.toLowerCase()) ? ico('tick') : ico('plus')) + '</button></div>').join('') +
      '</div>' +
      '<div class="card">' +
      '<div class="card-pad" style="padding-bottom:8px"><div class="sec-title">地道表达</div></div>' +
      (a.phrases || []).map(p =>
        '<div class="vocab-item"><div><div class="vocab-w" style="font-family:var(--font-serif);font-weight:500">' + esc(p.en) + '</div>' +
        '<div class="vocab-t">' + esc(p.zh) + '</div></div></div>').join('') +
      '</div></div></div>';

    /* 点击高亮词 */
    c.querySelectorAll('.kw').forEach(el => el.onclick = () => {
      const key = el.dataset.w;
      const v = vmap[key] || { w: key, p: '', t: '', lv: '阅读生词' };
      addWord(v, a.title);
      el.classList.add('saved');
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
    document.getElementById('rNext').onclick = () => {
      const arr = window.SEED_READINGS || [];
      S.s.english.readIdx = (S.s.english.readIdx + 1) % arr.length;
      S.save(); paintRead(c);
    };

    /* 划词加入 */
    setupSelection(document.getElementById('artBody'), a.title);
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
    if (!silent) { S.save(); U.toast('「' + v.w + '」已入单词本', 'ok'); window.rerender(); }
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
          addWord({ w: txt, lv: '阅读生词' }, from);
          kill(); sel.removeAllRanges();
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
      '<div style="margin-left:auto"><button class="btn sm" id="dNext">' + ico('refresh') + '换一个场景</button></div></div>' +
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

    document.getElementById('dNext').onclick = () => {
      const arr = window.SEED_DIALOGS || [];
      S.s.english.dlgIdx = (S.s.english.dlgIdx + 1) % arr.length;
      S.save(); paintDlg(c);
    };
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
