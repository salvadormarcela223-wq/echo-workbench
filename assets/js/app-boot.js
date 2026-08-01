/* ============================================================
   UI 基础件：转义 / 图标 / Toast / Modal / 时间格式化
   必须在所有 pages-*.js 之前加载
   ============================================================ */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const ico = (n, cls) => '<svg class="' + (cls || '') + '"><use href="#i-' + n + '"></use></svg>';

  function fmtTime(ts) {
    const d = new Date(ts), n = new Date();
    const p = x => String(x).padStart(2, '0');
    if (d.toDateString() === n.toDateString()) return '今天 ' + p(d.getHours()) + ':' + p(d.getMinutes());
    const y = new Date(n.getTime() - 864e5);
    if (d.toDateString() === y.toDateString()) return '昨天 ' + p(d.getHours()) + ':' + p(d.getMinutes());
    return (d.getFullYear() === n.getFullYear() ? '' : d.getFullYear() + '-') +
      p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function toast(msg, type) {
    const box = $('#toastBox');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = (type === 'ok' ? ico('tick') : '') + '<span>' + esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2200);
  }

  function modal(opts) {
    const root = $('#modalRoot');
    const mask = document.createElement('div');
    mask.className = 'mask';
    mask.innerHTML =
      '<div class="modal" role="dialog">' +
      '<div class="modal-h"><h3>' + esc(opts.title) + '</h3><button class="icon-btn" data-close>' + ico('x') + '</button></div>' +
      '<div class="modal-b">' + opts.body + '</div>' +
      '<div class="modal-f">' +
      '<button class="btn ghost" data-close>' + esc(opts.cancelText || '取消') + '</button>' +
      (opts.okText === null ? '' : '<button class="btn primary" data-ok>' + esc(opts.okText || '保存') + '</button>') +
      '</div></div>';
    root.appendChild(mask);

    const close = () => { mask.style.opacity = '0'; setTimeout(() => mask.remove(), 190); };
    mask.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    mask.onclick = e => { if (e.target === mask) close(); };
    const okBtn = mask.querySelector('[data-ok]');
    if (okBtn) okBtn.onclick = () => { if (opts.onOk && opts.onOk(mask) === false) return; close(); };

    function keyHandler(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', keyHandler); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && okBtn) { okBtn.click(); document.removeEventListener('keydown', keyHandler); }
    }
    document.addEventListener('keydown', keyHandler);

    if (opts.after) opts.after(mask);
    setTimeout(() => { const f = mask.querySelector('[autofocus]'); if (f) f.focus(); }, 60);
    return { close: close, root: mask };
  }

  function confirmBox(title, text, onYes) {
    modal({
      title: title,
      body: '<p style="font-size:13.5px;color:var(--ink-2);line-height:1.75;padding-bottom:6px">' + esc(text) + '</p>',
      okText: '确认删除',
      onOk: onYes
    });
  }

  window.UI = { esc: esc, ico: ico, toast: toast, modal: modal, confirmBox: confirmBox, fmtTime: fmtTime, $: $ };
})();
