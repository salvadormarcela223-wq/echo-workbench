/* ============================================================
   Echo 的工作台 · 核心：路由 / 导航 / 弹窗 / 设置 / 同步
   ============================================================ */
(function () {
  'use strict';

  const S = window.Store;
  const $ = (s, r) => (r || document).querySelector(s);

  /* -------------------- 工具 -------------------- */
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const ico = (n, cls) => '<svg class="' + (cls || '') + '"><use href="#i-' + n + '"></use></svg>';

  function fmtTime(ts) {
    const d = new Date(ts), n = new Date();
    const p = x => String(x).padStart(2, '0');
    const sameDay = d.toDateString() === n.toDateString();
    if (sameDay) return '今天 ' + p(d.getHours()) + ':' + p(d.getMinutes());
    const y = new Date(n.getTime() - 864e5);
    if (d.toDateString() === y.toDateString()) return '昨天 ' + p(d.getHours()) + ':' + p(d.getMinutes());
    return (d.getFullYear() === n.getFullYear() ? '' : d.getFullYear() + '-') +
      p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* -------------------- Toast -------------------- */
  function toast(msg, type) {
    const box = $('#toastBox');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = (type === 'ok' ? ico('tick') : '') + '<span>' + esc(msg) + '</span>';
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2200);
  }

  /* -------------------- Modal -------------------- */
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
    const close = () => { mask.style.animation = 'fadeIn .2s reverse'; setTimeout(() => mask.remove(), 190); };
    mask.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    mask.onclick = e => { if (e.target === mask) close(); };
    const okBtn = mask.querySelector('[data-ok]');
    if (okBtn) okBtn.onclick = () => { if (opts.onOk && opts.onOk(mask) === false) return; close(); };
    document.addEventListener('keydown', function h(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', h); }
    });
    if (opts.after) opts.after(mask);
    setTimeout(() => { const f = mask.querySelector('[autofocus]'); if (f) f.focus(); }, 60);
    return { close, root: mask };
  }

  function confirmBox(title, text, onYes) {
    modal({
      title: title,
      body: '<p style="font-size:13.5px;color:var(--ink-2);line-height:1.75;padding-bottom:6px">' + esc(text) + '</p>',
      okText: '确认删除',
      onOk: onYes
    });
  }

  /* -------------------- 页面注册表 -------------------- */
  const PAGES = [
    { key: 'home', name: '概览', icon: 'star', desc: '今日工作台总览', color: '#566069', c2: '#D9DDE0', c3: '#F1F3F4' },
    { key: 'news', name: '行业资讯', icon: 'news', desc: '电子烟与新型烟草 · 全网热点追踪', color: '#41566B', c2: '#D5DADE', c3: '#F0F2F3' },
    { key: 'insight', name: '专业提升', icon: 'brain', desc: '用户研究 / 感官分析 / 消费者洞察 · 全球情报', color: '#6B6470', c2: '#DFDDE0', c3: '#F3F3F4' },
    { key: 'plan', name: '工作计划', icon: 'check', desc: '待办、优先级与工作日志', color: '#6E7479', c2: '#DFE0E2', c3: '#F3F4F4' },
    { key: 'english', name: '英语学习', icon: 'lang', desc: '每日阅读 · 情景对话 · 单词本', color: '#8AA093', c2: '#E5EAE7', c3: '#F6F7F6' },
    { key: 'muse', name: '随想记录', icon: 'muse', desc: '电影 / 话剧 / 演唱会 / 阅读 / 旅行', color: '#6E5270', c2: '#DFD9E0', c3: '#F3F1F4' },
    { key: 'spark', name: '灵光乍现', icon: 'spark', desc: '想到就记，标签分流', color: '#A7AEB6', c2: '#ECEDEF', c3: '#F8F8F9' }
  ];
  window.PAGES = PAGES;

  /* -------------------- 导航 -------------------- */
  function counts() {
    const s = S.s;
    return {
      news: s.news.length,
      insight: s.insights.length,
      plan: s.todos.filter(t => !t.done).length,
      english: s.words.filter(w => !w.mastered).length,
      muse: s.muses.length,
      spark: s.sparks.filter(x => !x.archived).length
    };
  }

  function renderNav() {
    const c = counts();
    $('#nav').innerHTML = PAGES.map((p, i) =>
      '<button class="nav-item' + (p.key === cur ? ' on' : '') + '" data-go="' + p.key + '" style="--mc:' + p.color + '">' +
      (p.key === 'home' ? '<span class="ndot home"></span>' : '<span class="ndot" style="background:' + p.color + '"></span>') +
      '<span class="ico">' + ico(p.icon) + '</span>' +
      '<span>' + esc(p.name) + '</span>' +
      (c[p.key] ? '<span class="num">' + c[p.key] + '</span>' : '') +
      '</button>'
    ).join('');
    $('#nav').querySelectorAll('[data-go]').forEach(b => {
      b.onclick = () => { location.hash = '#/' + b.dataset.go; closeSide(); };
    });

    const pf = S.s.profile;
    $('#brandName').textContent = (pf.name || 'Echo') + ' 的工作台';
    $('#brandSub').textContent = pf.role || '';
    const av = $('#avatarBox');
    av.innerHTML = pf.avatar
      ? '<img src="' + esc(pf.avatar) + '" alt="">'
      : esc((pf.name || 'E').trim().charAt(0).toUpperCase());
  }

  /* -------------------- 侧边栏（移动端） -------------------- */
  function openSide() { $('#sidebar').classList.add('open'); $('#backdrop').classList.add('on'); }
  function closeSide() { $('#sidebar').classList.remove('open'); $('#backdrop').classList.remove('on'); }
  $('#burger').onclick = openSide;
  $('#backdrop').onclick = closeSide;

  /* -------------------- 路由 -------------------- */
  let cur = '';
  function route() {
    const k = (location.hash.replace('#/', '') || 'home');
    cur = PAGES.some(p => p.key === k) ? k : 'home';
    const p = PAGES.find(x => x.key === cur);
    $('#pgTitle').textContent = p.name;
    $('#pgDesc').textContent = p.desc;
    document.body.setAttribute('data-mod', cur);
    renderNav();
    const view = $('#view');
    view.innerHTML = '';
    const fn = window.Pages && window.Pages[cur];
    if (fn) fn(view);
    else view.innerHTML = '<div class="scroll"><div class="empty">页面加载失败</div></div>';
  }
  window.addEventListener('hashchange', route);
  window.rerender = () => { renderNav(); route(); };
  window.gotoPage = k => { location.hash = '#/' + k; };

  /* -------------------- 概览 · Bento 首页 -------------------- */
  function renderHome(view) {
    const c = counts();
    const pf = S.s.profile;
    const now = new Date();
    const h = now.getHours();
    const greet = h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    const tiles = PAGES.filter(p => p.key !== 'home').map(p =>
      '<button class="bento-tile mod-' + p.key + '" data-go="' + p.key + '" ' +
      'style="--mc:' + p.color + ';--mc-soft:' + p.c2 + ';--mc-wash:' + p.c3 + '">' +
      '<span class="bt-ico">' + ico(p.icon) + '</span>' +
      '<span class="bt-name">' + esc(p.name) + '</span>' +
      '<span class="bt-desc">' + esc(p.desc) + '</span>' +
      '<span class="bt-count">' + (c[p.key] || 0) + '<i>项</i></span>' +
      '<span class="bt-watermark">' + ico(p.icon) + '</span>' +
      '</button>'
    ).join('');

    view.innerHTML =
      '<div class="scroll"><div class="wrap">' +
      '<div class="bento">' +
      '<div class="bento-hero">' +
      '<div class="hero-greet">' + greet + '，' + esc(pf.name || 'Echo') + '</div>' +
      '<div class="hero-date">' + esc(dateStr) + '</div>' +
      '<div class="hero-chips">' +
      '<span><b>' + (c.news || 0) + '</b>行业资讯</span>' +
      '<span><b>' + (c.insight || 0) + '</b>专业提升</span>' +
      '<span><b>' + (c.plan || 0) + '</b>待办</span>' +
      '<span><b>' + (c.english || 0) + '</b>单词</span>' +
      '</div>' +
      '</div>' +
      tiles +
      '</div>' +
      '</div></div>';

    view.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
      location.hash = '#/' + b.dataset.go; closeSide();
    });
  }
  window.Pages = window.Pages || {};
  window.Pages.home = renderHome;

  /* -------------------- 同步状态 -------------------- */
  function paintSync() {
    const c = S.Sync.cfg;
    const d = $('#syncDot');
    if (c.mode === 'off') { d.className = 'sync-dot'; d.querySelector('span').textContent = '本地'; }
    else { d.className = 'sync-dot ok'; d.querySelector('span').textContent = c.last ? '已同步' : '云同步'; }
  }
  window.addEventListener('sync:status', e => {
    const d = $('#syncDot'), { s, msg } = e.detail;
    d.className = 'sync-dot ' + (s === 'busy' ? 'busy' : s === 'ok' ? 'ok' : s === 'warn' ? 'warn' : '');
    d.querySelector('span').textContent = s === 'busy' ? '同步中' : s === 'warn' ? '同步异常' : s === 'ok' ? '已同步' : '本地';
    if (s === 'warn') toast(msg);
    if (s === 'ok') setTimeout(paintSync, 2600);
  });
  window.addEventListener('store:error', e => toast(e.detail));

  $('#syncDot').onclick = () => openSettings('sync');
  $('#btnSync').onclick = async () => {
    if (S.Sync.cfg.mode === 'off') { openSettings('sync'); return; }
    const ok = await S.Sync.push();
    if (ok) toast('已上传到云端', 'ok');
  };
  $('#btnSet').onclick = () => openSettings('profile');

  /* -------------------- 头像上传 -------------------- */
  $('#avatarBox').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      if (f.size > 1.5 * 1024 * 1024) { toast('图片请小于 1.5MB'); return; }
      const fr = new FileReader();
      fr.onload = () => {
        // 压缩到 200px 方图
        const img = new Image();
        img.onload = () => {
          const cv = document.createElement('canvas');
          cv.width = cv.height = 200;
          const ctx = cv.getContext('2d');
          const m = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 200, 200);
          S.s.profile.avatar = cv.toDataURL('image/jpeg', .85);
          S.save(); renderNav(); toast('头像已更新', 'ok');
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(f);
    };
    inp.click();
  };

  /* -------------------- 设置弹窗 -------------------- */
  function openSettings(tab) {
    const pf = S.s.profile, c = S.Sync.cfg;
    const body =
      '<div class="tabs" style="margin-bottom:16px">' +
      '<button class="tab' + (tab !== 'sync' && tab !== 'data' ? ' on' : '') + '" data-st="profile">个人信息</button>' +
      '<button class="tab' + (tab === 'sync' ? ' on' : '') + '" data-st="sync">云端同步</button>' +
      '<button class="tab' + (tab === 'data' ? ' on' : '') + '" data-st="data">数据管理</button>' +
      '</div>' +

      '<div data-pane="profile" style="' + (tab !== 'sync' && tab !== 'data' ? '' : 'display:none') + '">' +
      '<div class="field"><label>称呼（显示为「XX 的工作台」）</label><input class="inp" id="setName" value="' + esc(pf.name) + '"></div>' +
      '<div class="field"><label>身份 / 领域</label><input class="inp" id="setRole" value="' + esc(pf.role) + '"></div>' +
      '<div class="field"><label>一句话</label><input class="inp" id="setMotto" value="' + esc(pf.motto) + '"></div>' +
      '<p style="font-size:11.5px;color:var(--ink-4);line-height:1.7">点击侧边栏头像可上传自定义图片。</p>' +
      '</div>' +

      '<div data-pane="sync" style="' + (tab === 'sync' ? '' : 'display:none') + '">' +
      '<div class="field"><label>同步方式</label><select class="sel" id="syMode">' +
      '<option value="off"' + (c.mode === 'off' ? ' selected' : '') + '>仅本地（浏览器留存）</option>' +
      '<option value="gist"' + (c.mode === 'gist' ? ' selected' : '') + '>GitHub Gist（推荐 · 免费私有）</option>' +
      '<option value="rest"' + (c.mode === 'rest' ? ' selected' : '') + '>自定义接口（GET/PUT JSON）</option>' +
      '</select></div>' +
      '<div id="syGist" style="' + (c.mode === 'gist' ? '' : 'display:none') + '">' +
      '<div class="field"><label>Gist ID</label><input class="inp" id="syId" placeholder="如 a1b2c3d4e5f6..." value="' + esc(c.gistId) + '"></div>' +
      '<div class="field"><label>Personal Access Token（需 gist 权限）</label><input class="inp" type="password" id="syTk" placeholder="ghp_..." value="' + esc(c.token) + '"></div>' +
      '<p style="font-size:11.5px;color:var(--ink-4);line-height:1.75;margin-bottom:10px">在 GitHub 新建一个 <b>私有 Gist</b>，文件名填 <code>echo-workbench.json</code>、内容填 <code>{}</code>，保存后地址栏最后一段即 Gist ID。Token 在 Settings → Developer settings → Tokens 创建，仅勾选 gist。凭据只保存在本机浏览器。</p>' +
      '</div>' +
      '<div id="syRest" style="' + (c.mode === 'rest' ? '' : 'display:none') + '">' +
      '<div class="field"><label>接口地址</label><input class="inp" id="syUrl" placeholder="https://..." value="' + esc(c.url) + '"></div>' +
      '<div class="field"><label>自定义请求头（可选，格式 Key: Value）</label><input class="inp" id="syHd" placeholder="X-Master-Key: xxxx" value="' + esc(c.header) + '"></div>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-2);margin:6px 0 14px;cursor:pointer">' +
      '<input type="checkbox" id="syAuto"' + (c.auto ? ' checked' : '') + '> 改动后自动上传</label>' +
      '<div style="display:flex;gap:8px"><button class="btn" id="syPull">' + ico('down') + '拉取云端</button>' +
      '<button class="btn" id="syPush">' + ico('up') + '上传本地</button></div>' +
      '</div>' +

      '<div data-pane="data" style="' + (tab === 'data' ? '' : 'display:none') + '">' +
      '<p style="font-size:12.5px;color:var(--ink-2);line-height:1.8;margin-bottom:14px">所有数据默认保存在本机浏览器。建议定期导出备份，换设备时导入即可。</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' +
      '<button class="btn" id="dExp">' + ico('down') + '导出备份</button>' +
      '<button class="btn" id="dImp">' + ico('up') + '导入备份</button>' +
      '<button class="btn" id="dSeed">' + ico('refresh') + '恢复内置情报</button>' +
      '</div>' +
      '<div style="border-top:1px solid var(--line);padding-top:14px">' +
      '<button class="btn danger" id="dReset">' + ico('trash') + '清空全部数据</button></div>' +
      '</div>';

    const m = modal({
      title: '设置', body: body, okText: '保存',
      onOk: mk => {
        const n = $('#setName', mk); if (n) S.s.profile.name = n.value.trim() || 'Echo';
        const r = $('#setRole', mk); if (r) S.s.profile.role = r.value.trim();
        const mo = $('#setMotto', mk); if (mo) S.s.profile.motto = mo.value.trim();
        const cfg = S.Sync.cfg;
        const md = $('#syMode', mk); if (md) cfg.mode = md.value;
        const gi = $('#syId', mk); if (gi) cfg.gistId = gi.value.trim();
        const tk = $('#syTk', mk); if (tk) cfg.token = tk.value.trim();
        const ur = $('#syUrl', mk); if (ur) cfg.url = ur.value.trim();
        const hd = $('#syHd', mk); if (hd) cfg.header = hd.value.trim();
        const au = $('#syAuto', mk); if (au) cfg.auto = au.checked;
        S.Sync.cfg = cfg;
        S.save(); paintSync(); window.rerender(); toast('已保存', 'ok');
      },
      after: mk => {
        mk.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
          mk.querySelectorAll('[data-st]').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          mk.querySelectorAll('[data-pane]').forEach(p => p.style.display = p.dataset.pane === b.dataset.st ? '' : 'none');
        });
        const md = $('#syMode', mk);
        if (md) md.onchange = () => {
          $('#syGist', mk).style.display = md.value === 'gist' ? '' : 'none';
          $('#syRest', mk).style.display = md.value === 'rest' ? '' : 'none';
        };
        const save = () => {
          const cfg = S.Sync.cfg;
          cfg.mode = $('#syMode', mk).value;
          cfg.gistId = ($('#syId', mk) || {}).value || '';
          cfg.token = ($('#syTk', mk) || {}).value || '';
          cfg.url = ($('#syUrl', mk) || {}).value || '';
          cfg.header = ($('#syHd', mk) || {}).value || '';
          cfg.auto = $('#syAuto', mk).checked;
          S.Sync.cfg = cfg;
        };
        const pp = $('#syPush', mk); if (pp) pp.onclick = async () => { save(); const ok = await S.Sync.push(); if (ok) toast('上传成功', 'ok'); };
        const pl = $('#syPull', mk); if (pl) pl.onclick = async () => { save(); const ok = await S.Sync.pull(true); if (ok) { toast('拉取成功', 'ok'); window.rerender(); } };

        const ex = $('#dExp', mk); if (ex) ex.onclick = () => { S.exportFile(); toast('已导出', 'ok'); };
        const im = $('#dImp', mk); if (im) im.onclick = () => {
          const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json';
          i.onchange = () => {
            if (!i.files[0]) return;
            S.importFile(i.files[0]).then(() => { toast('导入成功', 'ok'); window.rerender(); m.close(); })
              .catch(e => toast('导入失败：' + e.message));
          };
          i.click();
        };
        const sd = $('#dSeed', mk); if (sd) sd.onclick = () => { seed(true); toast('内置情报已恢复', 'ok'); window.rerender(); };
        const rs = $('#dReset', mk); if (rs) rs.onclick = () => {
          confirmBox('清空全部数据', '这会删除本机所有待办、随想、闪念与单词本内容，且不可恢复。确定继续吗？', () => {
            S.reset(); seed(true); m.close(); window.rerender(); toast('已清空并重置');
          });
        };
      }
    });
  }
  window.openSettings = openSettings;

  /* -------------------- 内置情报播种 -------------------- */
  function seed(force) {
    const s = S.s;
    if (force) {
      const keepN = s.news.filter(x => x.custom);
      const keepI = s.insights.filter(x => x.custom);
      s.news = (window.SEED_NEWS || []).slice().concat(keepN);
      s.insights = (window.SEED_INSIGHTS || []).slice().concat(keepI);
      s.ui.seeded = true;
      S.save();
      return;
    }
    if (s.ui.seeded) return;
    s.news = (window.SEED_NEWS || []).slice();
    s.insights = (window.SEED_INSIGHTS || []).slice();
    if (!s.todos.length) {
      s.todos = [
        { id: S.uid(), text: '梳理 Q3 感官评价小组的 lexicon 更新清单', pri: 1, date: S.today(), done: false, proj: '方法论', createdAt: Date.now() },
        { id: S.uid(), text: '把「感官线索 → 功效推断」映射表拉个初版框架', pri: 0, date: S.today(), done: false, proj: '洞察沉淀', createdAt: Date.now() },
        { id: S.uid(), text: '追踪 7 月 7 份电子烟监管文件的修订差异', pri: 1, date: S.today(), done: false, proj: '行业追踪', createdAt: Date.now() },
        { id: S.uid(), text: '预约下轮 CLT 的场地与招募', pri: 2, date: '', done: false, proj: '项目执行', createdAt: Date.now() }
      ];
    }
    s.ui.seeded = true;
    S.save();
  }

  /* -------------------- 导出工具给页面模块 -------------------- */
  window.UI = { esc, ico, toast, modal, confirmBox, fmtTime, $ };

  /* -------------------- 启动 -------------------- */
  seed(false);
  paintSync();
  if (!location.hash) location.hash = '#/home';
  route();

  window.addEventListener('store:change', () => renderNav());

  /* 启动后拉取每日内容 feed（行业资讯 / 专业提升 / 英语），成功则刷新当前页 */
  if (window.Feed) {
    window.Feed.load().then(ok => { if (ok) window.rerender(); });
  }

  /* 启动时若开启云同步则先拉一次 */
  if (S.Sync.cfg.mode !== 'off') {
    S.Sync.pull().then(ok => { if (ok) window.rerender(); });
  }
})();
