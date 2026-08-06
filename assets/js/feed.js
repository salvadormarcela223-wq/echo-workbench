/* ============================================================
   每日内容 feed：由 WorkBuddy 定时任务抓取并写入云端（公开可读）
   启动后自动拉取，合并进「行业资讯 / 专业提升 / 英语学习」三个模块。
   拉取失败时静默回退到内置 seed，不影响使用。
   ============================================================ */
(function () {
  'use strict';

  // 内容 feed 与站点同源（GitHub Pages 的 data/feed.json），无需跨域、无需令牌即可读取。
  // 由每日自动化任务抓取最新素材后写入该文件。
  // v 参数用于破 CDN 缓存，每次更新内容时递增。
  const URL = 'data/feed.json?v=20260806e';

  let cache = null;

  function apply(j) {
    const S = window.Store;
    if (!S) return;

    // 行业资讯 & 专业提升：用云端策划内容替换内置 seed，保留用户自定义(custom:true)
    if (Array.isArray(j.news) && j.news.length) {
      const keep = S.s.news.filter(x => x.custom);
      S.s.news = j.news.map(x => Object.assign({ feed: true }, x)).concat(keep);
    }
    if (Array.isArray(j.insights) && j.insights.length) {
      const keep = S.s.insights.filter(x => x.custom);
      S.s.insights = j.insights.map(x => Object.assign({ feed: true }, x)).concat(keep);
    }

    // 英语学习：云端优先，缺失时回退到内置 seed
    window.SEED_READINGS = (Array.isArray(j.readings) && j.readings.length) ? j.readings : (window.SEED_READINGS || []);
    window.SEED_DIALOGS = (Array.isArray(j.dialogs) && j.dialogs.length) ? j.dialogs : (window.SEED_DIALOGS || []);

    // 关键：拉到新数据后立刻持久化到 localStorage，确保刷新后不丢失
    if (S.save) S.save(true);
  }

  async function load() {
    if (typeof fetch === 'undefined') return false;
    try {
      const r = await fetch(URL + (URL.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) { console.warn('[feed] 返回', r.status); return false; }
      const j = await r.json();
      if (!j || typeof j !== 'object') { console.warn('[feed] 格式不正确'); return false; }
      cache = j;
      apply(j);
      return true;
    } catch (e) {
      console.warn('[feed] 拉取失败，使用内置情报：', e && e.message);
      return false;
    }
  }

  window.Feed = {
    URL,
    load,
    get data() { return cache; }
  };
})();
