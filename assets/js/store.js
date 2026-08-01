/* ============================================================
   数据层：localStorage 本地留存 + 可选云端同步
   同步方式：① GitHub Gist（私有 Gist + PAT，纯前端可用）
             ② 自定义 REST 接口（GET 拉取 / PUT 推送 JSON）
   ============================================================ */
(function () {
  'use strict';

  const KEY = 'echo_workbench_v1';
  const CFG = 'echo_workbench_sync';

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => new Date().toISOString().slice(0, 10);

  const DEFAULT = {
    v: 1,
    updatedAt: 0,
    profile: { name: 'Echo', role: 'FMCG · 感官研究 & CMI', avatar: '', motto: '把不可见的偏好，翻译成可执行的决策。' },
    news: [],
    insights: [],
    todos: [],
    logs: [],
    words: [],
    muses: [],
    sparks: [],
    english: { readIdx: 0, dlgIdx: 0, stamp: '', doneDays: [] },
    ui: { seeded: false }
  };

  function deepMerge(base, patch) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!patch || typeof patch !== 'object') return out;
    Object.keys(patch).forEach(k => {
      const b = out[k], p = patch[k];
      if (p && typeof p === 'object' && !Array.isArray(p) && b && typeof b === 'object' && !Array.isArray(b)) {
        out[k] = deepMerge(b, p);
      } else if (p !== undefined) {
        out[k] = p;
      }
    });
    return out;
  }

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT));
      return deepMerge(JSON.parse(JSON.stringify(DEFAULT)), JSON.parse(raw));
    } catch (e) {
      console.warn('本地数据解析失败，已重置', e);
      return JSON.parse(JSON.stringify(DEFAULT));
    }
  }

  let saveTimer = null;
  function persist(silent) {
    state.updatedAt = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('本地保存失败', e);
      window.dispatchEvent(new CustomEvent('store:error', { detail: '本地存储写入失败，可能空间已满' }));
      return;
    }
    if (!silent) window.dispatchEvent(new CustomEvent('store:change'));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => Sync.autoPush(), 2600);
  }

  /* -------------------- 同步配置 -------------------- */
  function loadCfg() {
    try {
      return Object.assign(
        { mode: 'off', gistId: '', token: '', url: '', header: '', auto: true, last: 0 },
        JSON.parse(localStorage.getItem(CFG) || '{}')
      );
    } catch (e) { return { mode: 'off', gistId: '', token: '', url: '', header: '', auto: true, last: 0 }; }
  }
  function saveCfg(c) { localStorage.setItem(CFG, JSON.stringify(c)); }

  const Sync = {
    get cfg() { return loadCfg(); },
    set cfg(c) { saveCfg(c); },

    status(s, msg) { window.dispatchEvent(new CustomEvent('sync:status', { detail: { s, msg } })); },

    async push() {
      const c = loadCfg();
      if (c.mode === 'off') { this.status('off', '未开启云同步'); return false; }
      this.status('busy', '正在上传…');
      try {
        const payload = JSON.stringify(state);
        if (c.mode === 'gist') {
          if (!c.gistId || !c.token) throw new Error('缺少 Gist ID 或 Token');
          const r = await fetch('https://api.github.com/gists/' + c.gistId, {
            method: 'PATCH',
            headers: {
              'Authorization': 'Bearer ' + c.token,
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ files: { 'echo-workbench.json': { content: payload } } })
          });
          if (!r.ok) throw new Error('Gist 返回 ' + r.status);
        } else {
          if (!c.url) throw new Error('缺少接口地址');
          const h = { 'Content-Type': 'application/json' };
          if (c.header) { const i = c.header.indexOf(':'); if (i > 0) h[c.header.slice(0, i).trim()] = c.header.slice(i + 1).trim(); }
          const r = await fetch(c.url, { method: 'PUT', headers: h, body: payload });
          if (!r.ok) throw new Error('接口返回 ' + r.status);
        }
        const n = loadCfg(); n.last = Date.now(); saveCfg(n);
        this.status('ok', '已同步 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
        return true;
      } catch (e) {
        this.status('warn', '同步失败：' + e.message);
        return false;
      }
    },

    async pull(force) {
      const c = loadCfg();
      if (c.mode === 'off') { this.status('off', '未开启云同步'); return false; }
      this.status('busy', '正在拉取…');
      try {
        let text = '';
        if (c.mode === 'gist') {
          if (!c.gistId) throw new Error('缺少 Gist ID');
          const h = { 'Accept': 'application/vnd.github+json' };
          if (c.token) h['Authorization'] = 'Bearer ' + c.token;
          const r = await fetch('https://api.github.com/gists/' + c.gistId + '?t=' + Date.now(), { headers: h });
          if (!r.ok) throw new Error('Gist 返回 ' + r.status);
          const j = await r.json();
          const f = j.files && j.files['echo-workbench.json'];
          if (!f) throw new Error('Gist 中没有 echo-workbench.json');
          text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
        } else {
          if (!c.url) throw new Error('缺少接口地址');
          const h = {};
          if (c.header) { const i = c.header.indexOf(':'); if (i > 0) h[c.header.slice(0, i).trim()] = c.header.slice(i + 1).trim(); }
          const r = await fetch(c.url + (c.url.includes('?') ? '&' : '?') + 't=' + Date.now(), { headers: h });
          if (!r.ok) throw new Error('接口返回 ' + r.status);
          text = await r.text();
        }
        const remote = JSON.parse(text);
        if (!remote || typeof remote !== 'object') throw new Error('云端数据格式不正确');
        if (!force && (remote.updatedAt || 0) < (state.updatedAt || 0)) {
          this.status('warn', '云端数据比本地旧，已跳过');
          return false;
        }
        state = deepMerge(JSON.parse(JSON.stringify(DEFAULT)), remote);
        localStorage.setItem(KEY, JSON.stringify(state));
        window.dispatchEvent(new CustomEvent('store:change'));
        const n = loadCfg(); n.last = Date.now(); saveCfg(n);
        this.status('ok', '已拉取云端数据');
        return true;
      } catch (e) {
        this.status('warn', '拉取失败：' + e.message);
        return false;
      }
    },

    autoPush() {
      const c = loadCfg();
      if (c.mode !== 'off' && c.auto) this.push();
    }
  };

  /* -------------------- 对外 API -------------------- */
  window.Store = {
    uid, today,
    get s() { return state; },
    save: persist,

    /** 通用集合操作：list = 'news'|'insights'|'todos'|'words'|'muses'|'sparks' */
    add(list, obj, toTop) {
      const item = Object.assign({ id: uid(), createdAt: Date.now() }, obj);
      if (toTop === false) state[list].push(item); else state[list].unshift(item);
      persist();
      return item;
    },
    update(list, id, patch) {
      const i = state[list].findIndex(x => x.id === id);
      if (i < 0) return null;
      state[list][i] = Object.assign({}, state[list][i], patch, { updatedAt: Date.now() });
      persist();
      return state[list][i];
    },
    remove(list, id) {
      const n = state[list].length;
      state[list] = state[list].filter(x => x.id !== id);
      if (state[list].length !== n) persist();
    },
    find(list, id) { return state[list].find(x => x.id === id) || null; },

    reset() {
      state = JSON.parse(JSON.stringify(DEFAULT));
      persist();
    },

    exportFile() {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Echo工作台-备份-' + today() + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    },

    importFile(file) {
      return new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => {
          try {
            const j = JSON.parse(fr.result);
            state = deepMerge(JSON.parse(JSON.stringify(DEFAULT)), j);
            persist();
            res(true);
          } catch (e) { rej(e); }
        };
        fr.onerror = () => rej(new Error('文件读取失败'));
        fr.readAsText(file);
      });
    },

    Sync
  };

  /* 跨标签页同步 */
  window.addEventListener('storage', e => {
    if (e.key === KEY && e.newValue) {
      try {
        state = deepMerge(JSON.parse(JSON.stringify(DEFAULT)), JSON.parse(e.newValue));
        window.dispatchEvent(new CustomEvent('store:change'));
      } catch (err) { /* ignore */ }
    }
  });
})();
