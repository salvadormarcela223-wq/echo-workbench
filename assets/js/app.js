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
    // noMaskClose：填表类弹窗不允许「点空白处关闭」，避免误触把填的内容弄丢
    mask.onclick = e => { if (e.target === mask && !opts.noMaskClose) close(); };
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
    { key: 'home', name: '空间站', icon: 'home', desc: '今日工作台总览', color: '#566069', c2: '#D9DDE0', c3: '#F1F3F4' },
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
    /* 昨日新增：只算日期=昨天的条目 */
    const yd = (d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))(new Date(Date.now()-864e5));
    const isYd = x => String(x.date||x.createdAt||'').slice(0,10) === yd;
    return {
      news: (s.news||[]).filter(isYd).length,
      insight: (s.insights||[]).filter(isYd).length,
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
      '<span class="nav-ico">' + ico(p.icon) + '</span>' +
      '<span class="nav-name">' + esc(p.name) + '</span>' +
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
      : '<img src="assets/img/avatar.png?v=20260803b" alt="">';
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

    const calState = { y: now.getFullYear(), m: now.getMonth() };
    const calTile = '<div class="bento-tile mod-cal" style="--mc:#41566B" id="calTile">' + calHTML(calState.y, calState.m) + '</div>';
    const tilesAll = tiles.replace('</button>', '</button>' + calTile, 1);

    const poem = DAILY_POEMS[(new Date().getDate()-1)%DAILY_POEMS.length];
    view.innerHTML =
    '<div class="scroll"><div class="wrap">' +
    '<div class="hero-big">' +
      '<div class="hero-left">' +
        '<div class="hero-greet">' + greet + '，' + esc(pf.name || 'Echo') + '</div>' +
        '<div class="hero-date">' + esc(dateStr) + '</div>' +
        '<div class="hero-poem"><span class="qmark">"</span><div class="poem-lines">'+esc(poem.t).replace(/\\n/g,'<br>')+'</div><span class="attr">—— '+esc(poem.a)+'</span></div>' +
        '<div class="hero-summary">' +
          '<div class="summary-title">昨日新增</div>' +
          '<div class="summary-grid">' +
            '<span class="summary-item">行业资讯 <b>'+(c.news||0)+'</b></span>' +
            '<span class="summary-item">专业提升 <b>'+(c.insight||0)+'</b></span>' +
            '<span class="summary-item">待办事项 <b>'+(c.plan||0)+'</b></span>' +
            '<span class="summary-item">待学单词 <b>'+(c.english||0)+'</b></span>' +
            '<span class="summary-item">随想记录 <b>'+(c.muse||0)+'</b></span>' +
            '<span class="summary-item">灵光乍现 <b>'+(c.spark||0)+'</b></span>' +
          '</div>' +
        '</div>' +
        '<img class="hero-avatar" src="assets/img/avatar.png?v=20260804a" alt="Echo" />' +
      '</div>' +
      '<div class="hero-cal">' +
        '<canvas class="cal-fx"></canvas>' +
        '<div class="cal-card" id="calTile">' + calHTML(calState.y, calState.m) + '</div>' +
      '</div>' +
    '</div>' +
    '</div></div>';
    view.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
      location.hash = '#/' + b.dataset.go; closeSide();
    });
    bindCalendar(view);
  }

  /* -------------------- 每日小诗 / 经典片段（31 条，按日期轮换，每条 4-5 行） -------------------- */
  const DAILY_POEMS = [
    { t: 'The only way to do great work\nis to love what you do.\nIf you haven\'t found it yet, keep looking.\nDon\'t settle.', a: 'Steve Jobs · Stanford 2005' },
    { t: 'Two roads diverged in a wood, and I—\nI took the one less traveled by,\nAnd that has made all the difference.', a: 'Robert Frost · The Road Not Taken' },
    { t: 'In the middle of every difficulty\nlies opportunity.\nThe greater the obstacle,\nthe more glory in overcoming it.', a: 'Albert Einstein' },
    { t: 'What you do every day matters more\nthan what you do once in a while.\nConsistency is the true mark of mastery.', a: 'Gretchen Rubin · Better Than Before' },
    { t: 'Slow is smooth, smooth is fast.\nRush and you will fall.\nPatience is not about waiting,\nbut the ability to keep a good attitude\nwhile working hard for what you believe in.', a: 'Navy SEAL Adage' },
    { t: 'Discipline equals freedom.\nThe pain of discipline weighs ounces,\nbut the pain of regret weighs tons.\nChoose your hard.', a: 'Jocko Willink · Extreme Ownership' },
    { t: 'Be curious, not judgmental.\nA mind is like a parachute —\nit only works when it is open.\nThe fool thinks he is wise,\nbut the wise man knows himself to be a fool.', a: 'Walt Whitman / Socrates' },
    { t: 'You are what you do, not what you say\nyou will do.\nActions speak louder than words,\nand habits are the compound interest\nof self-improvement.', a: 'Carl Jung / C.S. Lewis' },
    { t: 'The cave you fear to enter\nholds the treasure you seek.\nFear is a natural reaction\nto moving closer to the truth.', a: 'Joseph Campbell · The Hero\'s Journey' },
    { t: 'A river cuts through rock,\nnot by its power, but by its persistence.\nWater always finds a way.\nTime conquers all,\nif you give it enough of it.', a: 'James N. Watkins' },
    { t: 'Almost everything will work again\nif you unplug it for a few minutes\n— including you.\nRest is not idleness;\nit is the fuel for what comes next.', a: 'Anne Lamott · Bird by Bird' },
    { t: 'The mind is everything.\nWhat you think, you become.\nYour thoughts shape your reality,\nyour words shape your world,\nyour actions shape your destiny.', a: 'Buddha / Dhammapada' },
    { t: 'How we spend our days is,\nof course, how we spend our lives.\nHow we spend our hours is,\nof course, how we spend our days.\nTell me, then:\nwhat did you do today?', a: 'Annie Dillard · The Writing Life' },
    { t: 'I have not failed.\nI have just found 10,000 ways\nthat won\'t work.\nSuccess is failure in progress.\nGenius is 1% inspiration and 99% perspiration.', a: 'Thomas Edison' },
    { t: 'If you can dream it, you can do it.\nAll our dreams can come true\nif we have the courage to pursue them.\nThe way to get started\nis quit talking and begin doing.', a: 'Walt Disney' },
    { t: 'The future depends on\nwhat you do today.\nYour present circumstances don\'t determine\nwhere you can go;\nthey merely determine where you start.', a: 'Mahatma Gandhi' },
    { t: 'A person who never made a mistake\nnever tried anything new.\nMistakes are proof\nthat you are trying.\nEvery expert was once a beginner.', a: 'Albert Einstein' },
    { t: 'When nothing goes right — go left.\nWhen the path disappears — build one.\nWhen they say it cannot be done —\nthat is exactly why you must do it.', a: 'Anonymous' },
    { t: 'Happiness is not something ready-made.\nIt comes from your own actions.\nThe purpose of our lives\nis to be happy.\nBe happy for this moment.', a: 'Dalai Lama' },
    { t: 'If you tell the truth,\nyou don\'t have to remember anything.\nHonesty is a very expensive gift.\nDo not expect it from cheap people.', a: 'Mark Twain' },
    { t: 'Do not go where the path may lead.\nGo instead where there is no path\nand leave a trail.\nTo see the world things\nthat never were and ask "why not?"', a: 'Ralph Waldo Emerson' },
    { t: 'The two most powerful warriors\nare patience and time.\nGreat acts take time.\nWe are what we repeatedly do.\nexcellence is not an act but a habit.', a: 'Leo Tolstoy / Aristotle' },
    { t: 'Quality is not an act,\nit is a habit.\nWe are what we repeatedly do.\nExcellence is never an accident.', a: 'Aristotle · Nicomachean Ethics' },
    { t: 'Stillness is where creativity\nand solutions are found.\nIn the silence between thoughts\nlies the answer you have been seeking.\nBe still and know.', a: 'Eckhart Tolle · The Power of Now' },
    { t: 'Knowing yourself is the beginning\nof all wisdom.\nThe unexamined life\nis not worth living.\nKnow thyself.', a: 'Aristotle / Socrates' },
    { t: 'Where attention goes, energy flows.\nGuard your time fiercely.\nYou become what you think about\nall day long.\nFocus is the art of knowing\nwhat to ignore.', a: 'Tony Robbins / Jim Rohn' },
    { t: 'Make the most of yourself,\nfor that is all there is of you.\nDo not lower your standards\nto fit into the world.\nrise above it.', a: 'Ralph Waldo Emerson' },
    { t: 'Begin and the mind grows heated.\nContinue and the task is completed.\nWhatever you can do, or dream you can,\nbegin it. Boldness has genius, power, and magic in it.', a: 'Johann Wolfgang von Goethe' },
    { t: 'It is during our darkest moments\nthat we must focus to see the light.\nStars cannot shine without darkness.\nYour struggle is your strength.', a: 'Aristotle' },
    { t: 'Life is what happens\nwhen you\'re busy making other plans.\nCount your life by smiles, not tears.\nCount your age by friends, not years.', a: 'John Lennon' },
    { t: 'In three words I can sum up\neverything I\'ve learned about life:\nit goes on.\nKeep your face always toward the sunshine\nand shadows will fall behind you.', a: 'Robert Frost / Walt Whitman' }
  ];

  /* ================= 概览日历 ================= */
  const HOLIDAYS_2026 = {
    '01-01':{n:'元旦',e:'🎊',t:'cn'}, '02-14':{n:'情人节',e:'💝',t:'intl'},
    '02-15':{n:'春节调休班',e:'💼',t:'work'}, '02-16':{n:'除夕',e:'🥟',t:'cn'},
    '02-17':{n:'春节',e:'🏮',t:'cn'}, '02-18':{n:'春节',e:'🏮',t:'cn'},
    '04-04':{n:'清明',e:'🌿',t:'cn'}, '04-05':{n:'清明',e:'🌿',t:'cn'},
    '04-26':{n:'劳动调休班',e:'💼',t:'work'}, '05-01':{n:'劳动节',e:'🔧',t:'cn'},
    '05-02':{n:'劳动节',e:'🔧',t:'cn'}, '05-09':{n:'劳动调休班',e:'💼',t:'work'},
    '05-10':{n:'母亲节',e:'🌷',t:'intl'}, '06-19':{n:'端午',e:'🐉',t:'cn'},
    '06-21':{n:'父亲节',e:'👔',t:'intl'}, '07-01':{n:'建党节',e:'⭐',t:'cn'},
    '08-01':{n:'建军节',e:'🎖️',t:'cn'}, '08-08':{n:'国际猫咪日',e:'🐱',t:'intl'},
    '08-19':{n:'七夕',e:'💕',t:'cn'}, '08-27':{n:'中元节',e:'🪔',t:'cn'},
    '09-25':{n:'中秋',e:'🌕',t:'cn'}, '09-27':{n:'国庆调休班',e:'💼',t:'work'},
    '10-01':{n:'国庆',e:'🇨🇳',t:'cn'}, '10-02':{n:'国庆',e:'🇨🇳',t:'cn'},
    '10-10':{n:'国庆调休班',e:'💼',t:'work'}, '10-31':{n:'万圣节',e:'🎃',t:'intl'},
    '11-26':{n:'感恩节',e:'🦃',t:'intl'}, '12-24':{n:'平安夜',e:'🎄',t:'intl'},
    '12-25':{n:'圣诞节',e:'🎄',t:'intl'}, '12-31':{n:'跨年',e:'🎆',t:'intl'},
    '03-08':{n:'妇女节',e:'🌸',t:'cn'}, '03-14':{n:'白色情人节',e:'💝',t:'intl'}
  };
  // —— 农历转换（公历→农历，覆盖 1900–2049）——
  const LUNAR_INFO = [0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a2d0,0x0d150,0x0f252,0x0d520];
  function lYearDays(y){let sm=348;for(let i=0x8000;i>0x8;i>>=1){sm+=(LUNAR_INFO[y-1900]&i)?1:0;}return sm+leapDays(y);}
  function leapDays(y){const lm=leapMonth(y);if(lm){return (LUNAR_INFO[y-1900]&0x10000)?30:29;}return 0;}
  function leapMonth(y){return LUNAR_INFO[y-1900]&0xf;}
  function monthDays(y,mo){return (LUNAR_INFO[y-1900]&(0x10000>>mo))?30:29;}
  function solarToLunar(y,mo,d){const base=new Date(1900,0,31);let off=Math.round((new Date(y,mo,d)-base)/86400000);let t=0,i;for(i=1900;i<2101&&off>0;i++){t=lYearDays(i);off-=t;}if(off<0){off+=t;i--;}const yr=i;let lp=leapMonth(yr),isL=false,mt;for(mt=1;mt<13&&off>0;mt++){if(lp>0&&mt===(lp+1)&&!isL){isL=true;mt--;t=leapDays(yr);}else{t=monthDays(yr,mt);}if(isL&&mt===(lp+1))isL=false;off-=t;}if(off===0&&lp>0&&mt===lp+1){if(isL){isL=false;}else{isL=true;mt--;}}if(off<0){off+=t;mt--;}return {year:yr,month:mt,day:off+1,isLeap:isL};}
  const LUNAR_DAY=['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
  const LUNAR_MON=['正','二','三','四','五','六','七','八','九','十','冬','腊'];
  const GAN=['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const ZHI=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  function lunarDayName(d){return LUNAR_DAY[d-1]||'';}
  function lunarMonthName(mo,isL){return (isL?'闰':'')+LUNAR_MON[mo-1]+'月';}
  function ganzhiYear(y){return GAN[(y-4)%10]+ZHI[(y-4)%12]+'年';}

  function calKey(y,m,d){ return y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }
  function getSched(ds){ try{ return JSON.parse(localStorage.getItem(ds)||'[]'); }catch(e){ return []; } }
  function setSched(ds,a){ try{ localStorage.setItem(ds, JSON.stringify(a)); }catch(e){} }
  function calHTML(y,m){
    const now=new Date(); const isT=(y===now.getFullYear()&&m===now.getMonth());
    const first=new Date(y,m,1).getDay(); const dim=new Date(y,m+1,0).getDate();
    const prevDim=(m===0?new Date(y-1,12,0):new Date(y,m,0)).getDate();
    let cells='';
    const pY=m===0?y-1:y, pM=m===0?11:m-1;
    for(let i=first-1;i>=0;i--){const pd=prevDim-i;const pl=solarToLunar(pY,pM,pd);cells+='<div class="cal-d out"><span class="cal-cnt"><span class="cal-n">'+pd+'</span><span class="cal-lunar">'+lunarDayName(pl.day)+'</span></span></div>';}

    for(let d=1;d<=dim;d++){
      const ds=calKey(y,m,d); const k=String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      const h=HOLIDAYS_2026[k]; const td=isT&&d===now.getDate(); const sc=getSched(ds);
      const cls='cal-d'+(td?' today':'')+(h?' has':'')+(sc.length?' sched':'');
      const f=h?'<span class="cal-f" title="'+esc(h.n)+'">'+h.e+'</span>':'';
      const star=td?'<span class="cal-star">★</span>':'';
      const ld=solarToLunar(y,m,d); const lc=ld.day===1?' first':(ld.day===15?' full':'');
      cells+='<div class="'+cls+'" data-date="'+ds+'">'+f+'<span class="cal-cnt"><span class="cal-n">'+d+'</span><span class="cal-lunar'+lc+'">'+lunarDayName(ld.day)+'</span></span>'+star+'</div>';
    }
    const total=first+dim; const trail=Math.ceil(total/7)*7-total;
    const nY=m===11?y+1:y, nM=m===11?0:m+1;
    for(let d=1;d<=trail;d++){const nl=solarToLunar(nY,nM,d);cells+='<div class="cal-d out"><span class="cal-cnt"><span class="cal-n">'+d+'</span><span class="cal-lunar">'+lunarDayName(nl.day)+'</span></span></div>';}

    const lh=solarToLunar(y,m,1); const lunar=ganzhiYear(lh.year)+' '+lunarMonthName(lh.month,lh.isLeap); const st=getSched(calKey(y,m,now.getDate()));
    const foot=isT?('今日日程 · <b>'+st.length+'</b> 项'+(st.length?'　'+esc(st[0]):'')):'点击日期添加日程';
    const wd='日一二三四五六'.split('').map(w=>'<div class="cal-wd">'+w+'</div>').join('');
    return '<div class="cal-head"><div><div class="cal-m">'+y+' 年 '+(m+1)+' 月</div><div class="cal-l">'+lunar+'</div></div>'
      +'<div class="cal-nav"><button class="cal-p" aria-label="上个月">‹</button><button class="cal-n" aria-label="下个月">›</button></div></div>'
      +'<div class="cal-grid">'+wd+cells+'</div>'
      +'<div class="cal-foot">'+foot+'</div>'
      +'<div class="cal-legend"><span>🎖️ 节日</span><span>★ 今天</span><span>● 有日程</span></div>';
  }
  function bindCalendar(view){
    const tile=view&&view.querySelector('#calTile'); if(!tile) return;
    if(!tile._cal) tile._cal={y:new Date().getFullYear(),m:new Date().getMonth()};
    const st=tile._cal;
    const paint=()=>{
      tile.innerHTML=calHTML(st.y,st.m);
      tile.querySelector('.cal-p').onclick=e=>{e.stopPropagation();st.m--;if(st.m<0){st.m=11;st.y--;}paint();};
      tile.querySelector('.cal-n').onclick=e=>{e.stopPropagation();st.m++;if(st.m>11){st.m=0;st.y++;}paint();};
      tile.querySelectorAll('.cal-d[data-date]').forEach(cx=>{cx.onclick=e=>{e.stopPropagation();openSched(cx.dataset.date);};});
    };
    paint();
  }
  window.__refreshCal=()=>{const v=document.getElementById('view');if(v)bindCalendar(v);};
  function openSched(ds){
    const arr=getSched(ds);
    const list=arr.length?arr.map((t,i)=>'<div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line-soft)"><span style="flex:1;font-size:13px;color:var(--ink)">'+esc(t)+'</span><button class="icon-btn" data-del="'+i+'">'+ico('trash')+'</button></div>').join(''):'<div style="color:var(--ink-3);font-size:13px;margin-bottom:10px">暂无日程</div>';
    modal({title:'日程 · '+ds, body:list+'<input class="inp" id="schedInp" placeholder="添加日程，回车保存" style="width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:10px;font-size:13.5px">',
      okText:'添加', onOk:(m)=>{const v=m.querySelector('#schedInp').value.trim();if(v){arr.push(v);setSched(ds,arr);} setTimeout(()=>window.__refreshCal&&window.__refreshCal(),60); return true;},
      after:(m)=>{const inp=m.querySelector('#schedInp');inp.onkeydown=e=>{if(e.key==='Enter'){const v=inp.value.trim();if(v){arr.push(v);setSched(ds,arr);setTimeout(()=>window.__refreshCal&&window.__refreshCal(),60);m.querySelector('[data-ok]').click();}}};
        m.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{arr.splice(+b.dataset.del,1);setSched(ds,arr);b.closest('div').remove();setTimeout(()=>window.__refreshCal&&window.__refreshCal(),60);});}});
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
      title: '设置', body: body, okText: '保存', noMaskClose: true,
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
        // 边填边存：万一弹窗被关掉或切走，已填的编号/钥匙也不会丢
        ['syId', 'syTk', 'syUrl', 'syHd'].forEach(id => {
          const el = $('#' + id, mk);
          if (el) el.addEventListener('input', () => save());
        });
        const auBox = $('#syAuto', mk);
        if (auBox) auBox.addEventListener('change', () => save());
        const mdBox = $('#syMode', mk);
        if (mdBox) mdBox.addEventListener('change', () => save());

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
