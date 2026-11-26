window.WS = window.WS || {};
(function (WS) {
  const PREFIX = 'ws.';
  const VERSION = 1;

  const DEFAULTS = {
    meta: { version: VERSION, createdAt: null },
    settings: { theme: 'light', name: '大肥鱼', dailyTarget: 20, notify: false },
    vocab: { words: [], settings: { daily: 20 }, stats: {} },
    fitness: { logs: [] },
    reminders: { daily: [], work: [] },
    notes: [],
    knowledge: { read: [], history: [] },
    zhouyi: { records: [] },
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function mergeDefaults(key, val) {
    const def = clone(DEFAULTS[key]);
    if (Array.isArray(def)) return Array.isArray(val) ? val : def;
    if (def && typeof def === 'object' && val && typeof val === 'object') {
      for (const k in def) if (!(k in val)) val[k] = def[k];
      return val;
    }
    return (val === undefined || val === null) ? def : val;
  }

  function get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return mergeDefaults(key, raw ? JSON.parse(raw) : undefined);
    } catch (e) {
      console.warn('[db] get failed', key, e);
      return clone(DEFAULTS[key]);
    }
  }

  function set(key, val) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(val));
      return true;
    } catch (e) {
      console.warn('[db] set failed', key, e);
      return false;
    }
  }

  function update(key, fn) {
    const val = get(key);
    fn(val);
    set(key, val);
    return val;
  }

  function exportAll() {
    const out = { app: 'personal-workstation', version: VERSION, exportedAt: new Date().toISOString() };
    Object.keys(DEFAULTS).forEach(k => { out[k] = get(k); });
    return out;
  }

  function importAll(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('文件格式不对');
    if (obj.meta && obj.meta.version > VERSION) throw new Error('备份版本比应用新，请先更新应用');
    let n = 0;
    Object.keys(DEFAULTS).forEach(k => {
      if (k in obj) { set(k, obj[k]); n++; }
    });
    return n;
  }

  function resetAll() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  }

  WS.db = { get, set, update, exportAll, importAll, resetAll, VERSION };
})(window.WS);
