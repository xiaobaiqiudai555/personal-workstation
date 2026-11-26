window.WS = window.WS || {};
(function (WS) {
  const { $, $$, esc, pad, todayISO, dateCN, fmtTime, toast, modal, confirm, download, uid } = WS.util;
  const DB = WS.db;

  /* ================= 主题 ================= */
  function applyTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f1115' : '#4F6BFF');
  }

  function fmtDur(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function streakOf(stats) {
    let s = 0;
    const cur = new Date();
    const today = todayISO(cur);
    if (!stats[today] || !stats[today].done) cur.setDate(cur.getDate() - 1);
    while (stats[todayISO(cur)] && stats[todayISO(cur)].done > 0) {
      s++;
      cur.setDate(cur.getDate() - 1);
    }
    return s;
  }

  /* ================================================================
   * 背单词
   * ================================================================ */
  const VOCAB = { queue: [], idx: 0, reveal: false };

  function ensureVocabSeeded() {
    const v = DB.get('vocab');
    if (!v.seeded && (!v.words || v.words.length === 0)) {
      v.words = (window.WS_VOCAB || []).map(w => ({
        id: uid(), w: w.w, p: w.p || '', m: w.m || '',
        ef: 2.5, interval: 0, due: 0, reps: 0, lapses: 0, seen: false, added: Date.now()
      }));
      v.seeded = true;
      DB.set('vocab', v);
    }
    return v;
  }

  function vocabBuild() {
    const v = ensureVocabSeeded();
    const now = Date.now();
    const target = v.settings.daily || DB.get('settings').dailyTarget || 20;
    const tk = todayISO();
    const st = v.stats[tk] || { done: 0, new: 0 };
    const due = v.words.filter(w => w.seen && w.due && w.due <= now);
    const fresh = v.words.filter(w => !w.seen);
    const remain = Math.max(0, target - st.new);
    VOCAB.queue = due.concat(fresh.slice(0, remain));
    VOCAB.idx = Math.min(VOCAB.idx, Math.max(0, VOCAB.queue.length - 1));
  }

  function vocabGrade(q) {
    const v = DB.get('vocab');
    const tk = todayISO();
    if (!v.stats[tk]) v.stats[tk] = { done: 0, new: 0 };
    const st = v.stats[tk];
    const cur = VOCAB.queue[VOCAB.idx];
    if (!cur) return;
    const word = v.words.find(x => x.id === cur.id);
    if (!word) return;
    const wasNew = !word.seen;
    word.seen = true;
    const steps = [1, 2, 4, 7, 15, 30, 60, 120];
    if (q === 0) {
      word.lapses = (word.lapses || 0) + 1;
      word.reps = 0;
      word.interval = 0;
      word.due = Date.now() + 10 * 60 * 1000;
    } else {
      word.reps = (word.reps || 0) + 1;
      const step = steps[Math.min(word.reps - 1, steps.length - 1)];
      word.interval = (q === 3) ? Math.max(1, Math.round(step / 2)) : step;
      word.due = Date.now() + word.interval * 86400000;
    }
    word.last = Date.now();
    st.done = (st.done || 0) + 1;
    if (wasNew) st.new = (st.new || 0) + 1;
    DB.set('vocab', v);
    VOCAB.reveal = false;
    VOCAB.idx += 1;
    if (VOCAB.idx >= VOCAB.queue.length) { VOCAB.queue = []; VOCAB.idx = 0; }
  }

  function pageVocab() {
    vocabBuild();
    const v = DB.get('vocab');
    const tk = todayISO();
    const st = v.stats[tk] || { done: 0, new: 0 };
    const target = v.settings.daily || 20;
    const streak = streakOf(v.stats);
    const now = Date.now();
    const dueCount = v.words.filter(w => w.seen && w.due && w.due <= now).length;
    const freshCount = v.words.filter(w => !w.seen).length;
    const cur = VOCAB.queue[VOCAB.idx];

    let body;
    if (!cur) {
      body = `
      <section class="card empty-card">
        <p class="empty-icon">✓</p>
        <h2>今日完成</h2>
        <p class="muted">今日已学 ${st.done || 0} 个 · 新词 ${st.new || 0}/${target}</p>
        ${freshCount > 0
          ? `<p class="muted">还剩 ${freshCount} 个新词，可以再来一批</p>
             <button class="btn btn-primary" data-act="vocab-more">再来 5 个新词</button>`
          : `<p class="muted">词库已全部过一遍，进入复习节奏。</p>`}
      </section>`;
    } else {
      body = `
      <section class="card word-card">
        <div class="word-top">
          <span class="chip">第 ${VOCAB.idx + 1}/${VOCAB.queue.length} 个</span>
          <span class="muted">今日 ${st.done || 0}/${target}</span>
        </div>
        <h1 class="word">${esc(cur.w)}</h1>
        <p class="word-p">${esc(cur.p || '')}</p>
        ${VOCAB.reveal
          ? `<p class="word-m">${esc(cur.m || '')}</p>`
          : `<button class="btn btn-soft" data-act="vocab-reveal">显示释义</button>`}
      </section>
      <div class="grade-row">
        <button class="btn grade g0" data-act="vocab-grade" data-q="0">不认识</button>
        <button class="btn grade g1" data-act="vocab-grade" data-q="3">模糊</button>
        <button class="btn grade g2" data-act="vocab-grade" data-q="4">认识</button>
      </div>
      <div class="bar"><i style="width:${Math.min(100, (st.done || 0) / target * 100)}%"></i></div>
      <p class="muted center">待复习 ${dueCount} · 新词剩 ${freshCount}</p>`;
    }

    return `
    <header class="page-head">
      <h1>背单词</h1>
      <div style="display:flex;gap:8px;align-items:center">
        <a class="btn btn-soft" href="#/import" style="min-height:34px;padding:0 12px">导入</a>
        <span class="chip" style="margin:0">连续 ${streak} 天</span>
      </div>
    </header>${body}`;
  }

  /* ================================================================
   * 健身（今日训练记录）
   * ================================================================ */
  const PART_OPTIONS = ['胸', '肩', '手臂', '背', '腿', '有氧'];
  const EQUIP_OPTIONS = ['杠铃', '哑铃', '龙门架', '跑步机', '徒手', '自行车'];
  const FIT = { loaded: false, parts: new Set(), equipment: new Set(), items: [], elapsed: 0, running: false, timer: null };

  function fitnessLoad() {
    const today = todayISO();
    const log = DB.get('fitness').logs.find(l => l.date === today);
    FIT.parts = new Set(log ? log.parts : []);
    FIT.equipment = new Set(log ? log.equipment : []);
    FIT.items = log ? JSON.parse(JSON.stringify(log.items || [])) : [];
    FIT.elapsed = 0;
    FIT.running = false;
    if (FIT.timer) { clearInterval(FIT.timer); FIT.timer = null; }
    FIT.loaded = true;
  }

  function fitnessSave(manualMin) {
    const today = todayISO();
    const dur = (parseInt(manualMin, 10) > 0) ? parseInt(manualMin, 10) : Math.round(FIT.elapsed / 60);
    DB.update('fitness', f => {
      const i = f.logs.findIndex(l => l.date === today);
      const entry = {
        id: i >= 0 ? f.logs[i].id : uid(), date: today,
        parts: [...FIT.parts], equipment: [...FIT.equipment],
        items: FIT.items, duration: dur, note: ''
      };
      if (i >= 0) f.logs[i] = entry; else f.logs.push(entry);
    });
    return dur;
  }

  function fitTimerTick() {
    FIT.elapsed += 1;
    const el = $('#fit-time');
    if (el) el.textContent = fmtDur(FIT.elapsed);
  }

  function weekData() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = todayISO(d);
      const m = DB.get('fitness').logs.filter(l => l.date === k).reduce((s, l) => s + (l.duration || 0), 0);
      days.push({ key: k, label: '日一二三四五六'[d.getDay()], m, isToday: i === 0 });
    }
    return days;
  }

  function pageFitness() {
    if (!FIT.loaded) fitnessLoad();
    const today = todayISO();
    const todayLog = DB.get('fitness').logs.find(l => l.date === today);

    const partHtml = PART_OPTIONS.map(p =>
      `<button class="chip-btn ${FIT.parts.has(p) ? 'on' : ''}" data-act="fit-part" data-v="${p}">${p}</button>`).join('');
    const eqHtml = EQUIP_OPTIONS.map(q =>
      `<button class="chip-btn ${FIT.equipment.has(q) ? 'on' : ''}" data-act="fit-eq" data-v="${q}">${q}</button>`).join('');

    const itemsHtml = FIT.items.length
      ? FIT.items.map((it, i) => `
        <div class="fit-item">
          <span>${esc(it.name)}</span>
          <em>${esc(it.weight || 0)} kg × ${esc(it.reps || 0)} 次 × ${esc(it.sets || 0)} 组</em>
          <button class="link danger" data-act="fit-del" data-i="${i}">删</button>
        </div>`).join('')
      : `<p class="muted">还没添加动作，点下面「添加动作」。</p>`;

    const maxM = Math.max(1, ...weekData().map(d => d.m));
    const bars = weekData().map(d => `
      <div class="wb ${d.isToday ? 'on' : ''}">
        <div class="col" style="height:${Math.round(d.m / maxM * 48)}px"></div>
        <span>${d.label}</span>
      </div>`).join('');

    return `
    <header class="page-head">
      <h1>健身</h1>
      <span class="muted">${esc(dateCN())}</span>
    </header>

    <section class="card">
      <div class="card-head"><h2>今日训练</h2><span class="muted">${todayLog ? todayLog.duration + ' 分钟' : '还没记录'}</span></div>

      <p class="muted">练了哪些部位</p>
      <div class="chip-wrap">${partHtml}</div>

      <p class="muted">用了什么器械</p>
      <div class="chip-wrap">${eqHtml}</div>

      <p class="muted">训练时长（可手动填，或点计时）</p>
      <div class="timer" id="fit-time">${fmtDur(FIT.elapsed)}</div>
      <div class="chip-wrap">
        <button class="chip-btn ${FIT.running ? 'on' : ''}" data-act="fit-timer">${FIT.running ? '暂停' : '开始计时'}</button>
        <button class="chip-btn" data-act="fit-reset">清零</button>
      </div>
      <input id="fit-manual" class="search-input" type="number" inputmode="numeric" min="0" placeholder="手动填写分钟数（可选，优先于计时）">

      <p class="muted">今天练了</p>
      ${itemsHtml}
      <button class="btn btn-soft" data-act="fit-add" style="margin-top:10px">＋ 添加动作</button>
    </section>

    <section class="card">
      <div class="card-head"><h2>本周训练</h2><span class="muted">${weekData().filter(d => d.m > 0).length} 天</span></div>
      <div class="week-bars">${bars}</div>
    </section>

    <button class="btn btn-primary" data-act="fit-save" style="width:100%">保存今日训练</button>
    <p class="muted center" style="margin-top:10px">重量与时长随时可改，自动记入本周</p>`;
  }

  /* ================================================================
   * 提醒中心
   * ================================================================ */
  const REM = { tab: 'daily', days: new Set([1, 2, 3, 4, 5]) };
  const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

  function repeatSummary(days) {
    if (!days || !days.length) return '不重复';
    if (days.length === 7) return '每天';
    if (days.length === 5 && days.every(d => d >= 1 && d <= 5)) return '工作日';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return '周末';
    return days.slice().sort().map(d => DAY_LABELS[d]).join('');
  }

  function pageReminders() {
    const rem = DB.get('reminders');
    const seg = `
    <div class="seg" style="margin:0 0 14px">
      <button class="seg-btn ${REM.tab === 'daily' ? 'on' : ''}" data-act="rem-tab" data-v="daily">今日提醒</button>
      <button class="seg-btn ${REM.tab === 'work' ? 'on' : ''}" data-act="rem-tab" data-v="work">工作提醒</button>
    </div>`;

    let body;
    if (REM.tab === 'daily') {
      const rows = rem.daily.length
        ? rem.daily.map(r => `
          <div class="rem-row">
            <div class="rem-main">
              <div class="rem-title">${esc(r.text)}</div>
              <div class="rem-sub">${esc(r.time)} · ${esc(repeatSummary(r.days))}</div>
            </div>
            <button class="chip-btn ${r.enabled !== false ? 'on' : ''}" data-act="rem-toggle-daily" data-id="${r.id}">${r.enabled !== false ? '开' : '关'}</button>
            <button class="link danger" data-act="rem-del-daily" data-id="${r.id}">删</button>
          </div>`).join('')
        : `<p class="muted">还没有今日提醒，点下面「新增」。</p>`;
      body = `<section class="card"><div class="card-head"><h2>每日重复</h2><span class="muted">${rem.daily.length} 条</span></div>${rows}</section>`;
    } else {
      const sorted = rem.work.slice().sort((a, b) => (a.done - b.done) || (a.due - b.due));
      const rows = sorted.length
        ? sorted.map(w => {
            const overdue = !w.done && w.due && w.due < Date.now();
            const pri = { high: 'high', mid: 'mid', low: 'low' }[w.priority] || 'low';
            const priTxt = { high: '高', mid: '中', low: '低' }[w.priority] || '低';
            const dueTxt = w.due ? new Date(w.due) : null;
            return `
            <div class="rem-row">
              <div class="rem-main">
                <div class="rem-title ${w.done ? 'muted' : ''}" ${w.done ? 'style="text-decoration:line-through"' : ''}>${esc(w.title)}</div>
                <div class="rem-sub ${overdue ? 'overdue' : ''}">
                  ${dueTxt ? `${dueTxt.getMonth() + 1}月${dueTxt.getDate()}日 ${String(dueTxt.getHours()).padStart(2, '0')}:${String(dueTxt.getMinutes()).padStart(2, '0')}${overdue ? ' · 已逾期' : ''}` : '无截止时间'}
                </div>
              </div>
              <span class="pill ${pri}">${priTxt}</span>
              <button class="chip-btn ${w.done ? 'on' : ''}" data-act="rem-toggle-work" data-id="${w.id}">${w.done ? '完成' : '待办'}</button>
              <button class="link danger" data-act="rem-del-work" data-id="${w.id}">删</button>
            </div>`;
          }).join('')
        : `<p class="muted">还没有工作提醒，点下面「新增」。</p>`;
      body = `<section class="card"><div class="card-head"><h2>待办与截止</h2><span class="muted">${rem.work.filter(w => !w.done).length} 项待办</span></div>${rows}</section>`;
    }

    return `
    <header class="page-head"><h1>提醒中心</h1></header>
    ${seg}
    ${body}
    <button class="btn btn-primary" data-act="rem-add" style="width:100%">＋ 新增${REM.tab === 'daily' ? '今日提醒' : '工作提醒'}</button>`;
  }

  /* ================================================================
   * 随手小记
   * ================================================================ */
  const NOTES = { q: '', tag: null };

  function noteTags() {
    return [...new Set(DB.get('notes').flatMap(n => n.tags || []))].sort();
  }

  function pageNotes() {
    let list = DB.get('notes').slice().sort((a, b) =>
      (b.pinned - a.pinned) || ((b.updated || b.created) - (a.updated || a.created)));
    if (NOTES.q) {
      const q = NOTES.q.toLowerCase();
      list = list.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.body || '').toLowerCase().includes(q) ||
        (n.tags || []).some(t => t.toLowerCase().includes(q)));
    }
    if (NOTES.tag) list = list.filter(n => (n.tags || []).includes(NOTES.tag));

    const tags = noteTags();
    const tagChips = tags.map(t => `<span class="tag-chip ${NOTES.tag === t ? 'on' : ''}" data-act="note-tag" data-v="${t}">#${esc(t)}</span>`).join('');

    const cards = list.length
      ? list.map(n => `
        <article class="card note-card">
          <h3>${n.pinned ? '📌 ' : ''}${esc(n.title || '无标题')}</h3>
          <p class="note-body">${esc((n.body || '').slice(0, 200))}</p>
          ${(n.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join('')}
          <footer>
            <span class="muted">${esc(fmtTime(n.updated || n.created))}</span>
            <span>
              <button class="link" data-act="pin-note" data-id="${esc(n.id)}">${n.pinned ? '取消置顶' : '置顶'}</button>
              <button class="link" data-act="edit-note" data-id="${esc(n.id)}">编辑</button>
              <button class="link danger" data-act="del-note" data-id="${esc(n.id)}">删除</button>
            </span>
          </footer>
        </article>`).join('')
      : `<section class="card empty-card"><p class="empty-icon">记</p><h2>${NOTES.q || NOTES.tag ? '没有匹配的笔记' : '还没有笔记'}</h2><p class="muted">点右下角 + 随手记一笔。</p></section>`;

    return `
    <header class="page-head">
      <h1>随手小记</h1>
      <button class="btn btn-soft" data-act="new-note">新建</button>
    </header>
    <input class="search-input" id="note-search" placeholder="搜索标题 / 正文 / 标签" value="${esc(NOTES.q)}">
    ${tagChips ? `<div class="chip-wrap" style="margin-top:-4px">${tagChips}</div>` : ''}
    ${cards}
    <p class="muted center">共 ${list.length} 条 · 自动保存在本机</p>`;
  }

  function openNoteEditor(note) {
    const isNew = !note;
    const m = modal(`
      <h3 class="modal-title">${isNew ? '新建笔记' : '编辑笔记'}</h3>
      <input id="ne-title" placeholder="标题（可空）" value="${esc(note ? note.title : '')}">
      <textarea id="ne-body" rows="6" placeholder="想到什么记什么…">${esc(note ? note.body : '')}</textarea>
      <input id="ne-tags" placeholder="标签（空格分隔，如 工作 灵感）" value="${esc((note && note.tags) ? note.tags.join(' ') : '')}">
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="ne-save">保存</button>
      </div>`);
    m.el.querySelector('[data-close]').onclick = m.close;
    m.el.querySelector('#ne-save').onclick = () => {
      const title = m.el.querySelector('#ne-title').value.trim();
      const body = m.el.querySelector('#ne-body').value.trim();
      const tags = m.el.querySelector('#ne-tags').value.trim().split(/\s+/).filter(Boolean);
      if (!title && !body) { toast('写点什么再保存吧'); return; }
      DB.update('notes', list => {
        if (isNew) {
          list.push({ id: uid(), title, body, tags, pinned: false, created: Date.now(), updated: Date.now() });
        } else {
          const n = list.find(x => x.id === note.id);
          if (n) { n.title = title; n.body = body; n.tags = tags; n.updated = Date.now(); }
        }
      });
      m.close();
      toast(isNew ? '已记下' : '已保存');
      render();
    };
  }

  /* ================================================================
   * 知识扩展
   * ================================================================ */
  const KNOW = { cat: '全部', random: null, loading: false };

  async function fetchRandomKnowledge() {
    KNOW.loading = true; render();
    try {
      const res = await fetch('https://zh.wikipedia.org/api/rest_v1/page/random/summary');
      if (!res.ok) throw new Error('接口错误');
      const d = await res.json();
      KNOW.random = { t: d.title, c: d.extract || '', url: (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || '' };
    } catch (e) {
      KNOW.random = null;
      toast('已离线，展示内置精选');
    }
    KNOW.loading = false;
    render();
  }

  function pageKnowledge() {
    const cards = window.WS_KNOWLEDGE || [];
    const now = new Date();
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const daily = cards[doy % cards.length];
    const cats = ['全部', ...new Set(cards.map(c => c.cat))];
    const list = cards.filter(c => KNOW.cat === '全部' || c.cat === KNOW.cat);

    const chips = cats.map(c => `<span class="tag-chip ${KNOW.cat === c ? 'on' : ''}" data-act="know-cat" data-v="${esc(c)}">${esc(c)}</span>`).join('');

    const randomHtml = KNOW.random
      ? `<section class="card" style="background:var(--accent-soft)">
          <span class="chip">随机知识 · 中文维基百科</span>
          <h2 class="card-title">${esc(KNOW.random.t)}</h2>
          <p class="muted">${esc((KNOW.random.c || '').slice(0, 260))}</p>
          ${KNOW.random.url ? `<a class="link" href="${esc(KNOW.random.url)}" target="_blank" rel="noopener">打开原文 →</a>` : ''}
        </section>`
      : '';

    const dailyHtml = daily ? `
      <section class="card">
        <span class="chip">每日一知 · ${esc(daily.cat)}</span>
        <h2 class="card-title">${esc(daily.t)}</h2>
        <p class="muted">${esc(daily.c)}</p>
      </section>` : '';

    const listHtml = list.length
      ? list.map(c => `
        <section class="card">
          <div class="card-head"><h2 class="card-title">${esc(c.t)}</h2><span class="pill low">${esc(c.cat)}</span></div>
          <p class="muted">${esc(c.c)}</p>
        </section>`).join('')
      : `<section class="card empty-card"><p class="muted">该分类下暂无内容</p></section>`;

    return `
    <header class="page-head">
      <h1>知识扩展</h1>
      <button class="btn btn-soft" data-act="know-random" ${KNOW.loading ? 'disabled' : ''} style="min-height:34px;padding:0 12px">${KNOW.loading ? '联网中…' : '随机学一条'}</button>
    </header>
    ${randomHtml}
    ${dailyHtml}
    <div class="chip-wrap">${chips}</div>
    ${listHtml}
    <p class="muted center">联网随机来自维基百科，断网自动回退内置精选</p>`;
  }

  /* ================================================================
   * 周易 · 摇卦解卦
   * ================================================================ */
  const TRIGRAMS = { 0: { s: '☷', n: '坤' }, 1: { s: '☶', n: '艮' }, 2: { s: '☵', n: '坎' }, 3: { s: '☴', n: '巽' }, 4: { s: '☳', n: '震' }, 5: { s: '☲', n: '离' }, 6: { s: '☱', n: '兑' }, 7: { s: '☰', n: '乾' } };
  const ZY = { view: 'cast', question: '', result: null, detail: null, fromResult: false, q: '' };
  const YAO_POS = ['初', '二', '三', '四', '五', '上'];

  function hexByBits(lo, up) { return (window.WS_HEX || []).find(h => h.lo === lo && h.up === up); }

  function buildResult(lines, yang, moving) {
    const loBits = (yang[0] ? 1 : 0) | (yang[1] ? 2 : 0) | (yang[2] ? 4 : 0);
    const upBits = (yang[3] ? 1 : 0) | (yang[4] ? 2 : 0) | (yang[5] ? 4 : 0);
    const byang = yang.map((y, i) => moving[i] ? !y : y);
    const blo = (byang[0] ? 1 : 0) | (byang[1] ? 2 : 0) | (byang[2] ? 4 : 0);
    const bup = (byang[3] ? 1 : 0) | (byang[4] ? 2 : 0) | (byang[5] ? 4 : 0);
    return { lines, yang, moving, hex: hexByBits(loBits, upBits), changed: hexByBits(blo, bup) };
  }

  function castHex() {
    const lines = [];
    for (let i = 0; i < 6; i++) {
      const sum = [0, 1, 2].reduce((a) => a + (Math.random() < 0.5 ? 2 : 3), 0);
      lines.push(sum);
    }
    const yang = lines.map(v => v === 7 || v === 9);
    const moving = lines.map(v => v === 6 || v === 9);
    return buildResult(lines, yang, moving);
  }

  function yaoLabel(i, yang) { return YAO_POS[i] + (yang[i] ? '九' : '六'); }

  function lineHtml(i, yang, moving) {
    const col = moving[i] ? 'var(--accent)' : 'var(--ink)';
    const bar = `<div style="height:10px;border-radius:5px;background:${col};flex:1"></div>`;
    const line = yang[i] ? bar : `<div style="display:flex;gap:8px;flex:1">${bar}${bar}</div>`;
    return `
      <div style="display:flex;align-items:center;gap:10px;margin:5px 0">
        <div style="width:120px;display:flex;align-items:center">${line}</div>
        <span style="font-size:12px;color:var(--muted);width:40px">${yaoLabel(i, yang)}</span>
        ${moving[i] ? '<span class="pill mid">动爻</span>' : ''}
      </div>`;
  }

  function hexLinesHtml(yang, moving) {
    let html = '';
    for (let i = 5; i >= 0; i--) html += lineHtml(i, yang, moving);
    return html;
  }

  function pageZhouyi() {
    if (ZY.view === 'result' && ZY.result) return zhouyiResultHtml();
    if (ZY.view === 'browse') return zhouyiBrowseHtml();
    if (ZY.view === 'detail' && ZY.detail) return zhouyiDetailHtml(ZY.detail);
    return zhouyiCastHtml();
  }

  function zhouyiCastHtml() {
    const records = DB.get('zhouyi').records || [];
    const recHtml = records.length
      ? records.slice().reverse().map(r => `
        <button class="btn-row" data-act="zy-open" data-id="${esc(r.id)}">
          <span class="row-text">${esc(r.hexName || '')} · ${esc((r.question || '未写问题').slice(0, 14))}</span>
          <span class="muted">${esc(fmtTime(r.time))}</span>
        </button>`).join('')
      : '<p class="muted">还没有起卦记录。</p>';
    return `
    <header class="page-head"><h1>周易 · 摇卦</h1></header>
    <section class="card">
      <p class="muted" style="margin:0 0 6px">所问之事</p>
      <input class="search-input" id="zy-q" placeholder="默念的问题，如：这次要不要换工作？" value="${esc(ZY.question)}">
      <button class="btn btn-primary" data-act="zy-cast" style="width:100%">起卦（三枚铜钱六次）</button>
      <p class="muted center" style="margin-top:8px">老阳、老阴为动爻，自动生成变卦</p>
    </section>
    <section class="card">
      <div class="card-head"><h2>手动查卦</h2><button class="link" data-act="zy-browse">六十四卦列表 →</button></div>
      <p class="muted">按卦序或卦名，直接查某一卦的卦辞爻辞。</p>
    </section>
    <section class="card">
      <div class="card-head"><h2>起卦记录</h2><span class="muted">${records.length} 次</span></div>
      ${recHtml}
      ${records.length ? '<button class="btn btn-danger-ghost" data-act="zy-clear">清空记录</button>' : ''}
    </section>`;
  }

  function zhouyiBrowseHtml() {
    const hex = window.WS_HEX || [];
    const q = ZY.q.trim();
    const list = q
      ? hex.filter(h => h.name.includes(q) || String(h.n) === q || String(h.n).padStart(2, '0') === q)
      : hex;
    return `
    <header class="page-head">
      <button class="btn btn-ghost" data-act="zy-back">← 返回</button>
      <h1>六十四卦</h1>
    </header>
    <input class="search-input" id="zy-search" placeholder="搜索卦名或卦序" value="${esc(ZY.q)}">
    <div class="grid-2">
      ${list.map(h => {
        const lo = TRIGRAMS[h.lo], up = TRIGRAMS[h.up];
        return `<button class="card mini" data-act="zy-detail" data-n="${h.n}" style="text-align:left;cursor:pointer;background:var(--card);border:0;font:inherit;padding:14px">
          <p class="muted" style="font-size:12px;margin:0">${up.s}${lo.s} 第${h.n}卦</p>
          <p style="font-weight:700;margin:2px 0 0">${esc(h.name)}</p>
        </button>`;
      }).join('')}
    </div>
    <p class="muted center">共 ${list.length} 卦</p>`;
  }

  function zhouyiDetailHtml(hex) {
    const lo = TRIGRAMS[hex.lo], up = TRIGRAMS[hex.up];
    const yang = [];
    for (let i = 0; i < 3; i++) yang[i] = !!(hex.lo & (1 << i));
    for (let i = 0; i < 3; i++) yang[3 + i] = !!(hex.up & (1 << i));
    const lines = hex.y.map((txt, i) => `
      <div class="rem-row" style="align-items:flex-start">
        <span class="pill low" style="flex:none;margin-top:2px">${yaoLabel(i, yang)}</span>
        <div class="rem-main"><span>${esc(txt)}</span></div>
      </div>`).join('');
    return `
    <header class="page-head">
      <button class="btn btn-ghost" data-act="zy-back">← 返回</button>
      <h1>第${hex.n}卦 ${esc(hex.name)}</h1>
    </header>
    <section class="card" style="text-align:center">
      <p style="font-size:34px;margin:0">${up.s}${lo.s}</p>
      <p class="muted" style="margin:2px 0 8px">${up.n}上 ${lo.n}下</p>
      <p class="muted" style="margin:0">卦辞：${esc(hex.g)}</p>
    </section>
    <section class="card">
      <div class="card-head"><h2>爻辞</h2></div>
      ${lines}
      ${hex.yong ? `<div class="rem-row"><span class="pill low" style="flex:none">用${hex.n === 1 ? '九' : '六'}</span><div class="rem-main"><span>${esc(hex.yong)}</span></div></div>` : ''}
    </section>`;
  }

  function zhouyiResultHtml() {
    const r = ZY.result;
    if (!r || !r.hex) { ZY.view = 'cast'; return zhouyiCastHtml(); }
    const lo = TRIGRAMS[r.hex.lo], up = TRIGRAMS[r.hex.up];
    const movingIdx = r.moving.map((m, i) => m ? i : -1).filter(i => i >= 0);
    const movingLines = movingIdx.map(i => `
      <div class="rem-row" style="align-items:flex-start">
        <span class="pill mid" style="flex:none;margin-top:2px">${yaoLabel(i, r.yang)}</span>
        <div class="rem-main"><span>${esc(r.hex.y[i])}</span></div>
      </div>`).join('');
    const hasChanged = r.changed && r.changed.n !== r.hex.n;
    return `
    <header class="page-head">
      <button class="btn btn-ghost" data-act="zy-back">← 返回</button>
      <h1>解卦</h1>
    </header>
    <section class="card" style="text-align:center">
      <p class="muted" style="margin:0">所问：${esc(ZY.question || '未写问题')}</p>
      <p style="font-size:36px;margin:6px 0 0">${up.s}${lo.s}</p>
      <p style="font-weight:700;margin:4px 0 6px">本卦 · ${esc(r.hex.name)}</p>
      ${hexLinesHtml(r.yang, r.moving)}
      ${hasChanged ? `<p class="muted" style="margin-top:6px">变卦 · ${esc(r.changed.name)}</p>` : ''}
    </section>
    <section class="card"><span class="chip">卦辞</span><p style="margin:4px 0 0">${esc(r.hex.g)}</p></section>
    ${movingIdx.length ? `<section class="card"><span class="chip">动爻爻辞</span>${movingLines}</section>` : ''}
    ${hasChanged ? `<section class="card"><span class="chip">变卦卦辞</span><p style="margin:4px 0 0">${esc(r.changed.g)}</p></section>` : ''}
    <div class="seg">
      <button class="btn btn-soft" data-act="zy-cast">再摇一卦</button>
      <button class="btn btn-soft" data-act="zy-detail" data-n="${r.hex.n}">查看本卦全文</button>
    </div>
    <p class="muted center" style="margin-top:10px">本卦看处境，变卦看走向，动爻是转折点</p>`;
  }

  /* ================================================================
   * 导入单词（拍照识别 + 粘贴）
   * ================================================================ */
  const IMP = { words: [], busy: false, status: '' };

  function extractWords(text) {
    const toks = String(text || '').toLowerCase().match(/[a-z][a-z'-]{1,}/g) || [];
    const stop = new Set(['the','and','you','that','this','with','have','for','are','was','were','will','from','your','they','their','been','but','not','all','can','its','our','out','who','what','when','where','why','how','did','does','has','had','being','into','them','then','than','more','some','would','could','should','there','here','about','also','just','only','very','over','under']);
    return [...new Set(toks.map(w => w.replace(/^'+|'+$/g, '')))]
      .filter(w => w.length >= 3 && !stop.has(w));
  }

  function lookupWord(w) {
    return fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        try { return data[0].meanings[0].definitions[0].definition || ''; }
        catch (e) { return ''; }
      })
      .catch(() => '');
  }

  async function fillMeanings() {
    const known = new Map((window.WS_VOCAB || []).map(x => [x.w.toLowerCase(), x.m]));
    for (const it of IMP.words) {
      if (!it.m) it.m = known.get(it.w) || await lookupWord(it.w);
    }
    render();
  }

  async function runOCR(file) {
    IMP.busy = true; IMP.status = '加载识别引擎…'; render();
    try {
      if (!window.Tesseract) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
          s.onload = res;
          s.onerror = () => rej(new Error('网络不可用'));
          document.head.appendChild(s);
        });
      }
      IMP.status = '识别中…'; render();
      const worker = await window.Tesseract.createWorker('eng', 1);
      const { data } = await worker.recognize(file);
      await worker.terminate();
      IMP.words = extractWords(data.text).map(w => ({ w, m: '', sel: true }));
      IMP.busy = false; IMP.status = '';
      render();
      fillMeanings();
    } catch (err) {
      IMP.busy = false; IMP.status = '';
      toast('识别失败：' + (err.message || err) + '（可改用粘贴导入）');
      render();
    }
  }

  function pageImport() {
    const words = IMP.words;
    const listHtml = words.length
      ? words.map((it, i) => `
        <div class="rem-row" style="align-items:flex-start">
          <button class="chip-btn ${it.sel ? 'on' : ''}" data-act="imp-toggle" data-i="${i}">${it.sel ? '✓' : '—'}</button>
          <div class="rem-main">
            <span class="rem-title">${esc(it.w)}</span>
            <input class="search-input" style="margin:4px 0 0" data-act="imp-m" data-i="${i}" value="${esc(it.m)}" placeholder="释义（可编辑）">
          </div>
        </div>`).join('')
      : '<p class="muted">还没有识别出单词。拍照识别，或粘贴单词列表。</p>';

    return `
    <header class="page-head">
      <button class="btn btn-ghost" data-act="imp-back">← 返回</button>
      <h1>导入单词</h1>
    </header>
    <section class="card">
      <h2>拍照识别</h2>
      <p class="muted">课本、单词表照片都可，自动提取英文单词；识别在本机完成，图片不上传。</p>
      <button class="btn btn-primary" data-act="imp-pick" ${IMP.busy ? 'disabled' : ''} style="width:100%">${IMP.busy ? (IMP.status || '识别中…') : '📷 拍照 / 选择图片'}</button>
      <p class="muted center" style="margin-top:6px">首次使用需联网加载识别引擎（约 2MB）</p>
    </section>
    <section class="card">
      <h2>粘贴导入</h2>
      <textarea class="search-input" id="imp-paste" rows="4" placeholder="粘贴单词，可用逗号、空格或换行分隔"></textarea>
      <button class="btn btn-soft" data-act="imp-parse" style="width:100%">解析粘贴内容</button>
    </section>
    ${words.length ? `<section class="card">
      <div class="card-head"><h2>识别结果</h2><span class="muted">${words.filter(w => w.sel).length}/${words.length} 已选</span></div>
      ${listHtml}
      <button class="btn btn-primary" data-act="imp-import" style="width:100%;margin-top:8px">导入选中 ${words.filter(w => w.sel).length} 个单词</button>
    </section>` : ''}`;
  }

  /* ================================================================
   * 首页
   * ================================================================ */
  function pageHome() {
    const now = new Date();
    const h = now.getHours();
    const greet = h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好';
    const settings = DB.get('settings');
    const reminders = DB.get('reminders');
    const notes = DB.get('notes');
    const fitness = DB.get('fitness');
    const vocab = DB.get('vocab');
    const today = todayISO();

    const todayNotes = notes.filter(n => todayISO(new Date(n.created || Date.now())) === today).length;
    const todayLogs = fitness.logs.filter(l => l.date === today);
    const fitMinutes = todayLogs.reduce((s, l) => s + (l.duration || 0), 0);

    const dailyTotal = reminders.daily.length;
    const dailyDone = reminders.daily.filter(r => (r.doneOn || []).includes(today)).length;
    const workPending = reminders.work.filter(w => !w.done).length;
    const workOverdue = reminders.work.filter(w => !w.done && w.due && w.due < Date.now()).length;

    const learnedToday = (vocab.stats[today] || {}).done || 0;
    const dailyTarget = settings.dailyTarget || 20;

    const dailyRows = reminders.daily.length
      ? `<ul class="list">${reminders.daily.map(r => {
          const done = (r.doneOn || []).includes(today);
          return `<li>
            <button class="btn-row ${done ? 'done' : ''}" data-act="home-toggle-daily" data-id="${r.id}">
              <span class="row-time">${esc(r.time || '')}</span>
              <span class="row-text">${esc(r.text || '')}</span>
              <span class="muted">${done ? '已完成' : '未完成'}</span>
            </button>
          </li>`;
        }).join('')}</ul>`
      : `<div class="empty"><p class="muted">还没有今日提醒</p><a class="btn btn-soft" href="#/reminders">去添加</a></div>`;

    return `
    <header class="page-head">
      <div>
        <h1 class="greet">${esc(greet)}，${esc(settings.name || '大肥鱼')}</h1>
        <p class="muted">${esc(dateCN(now))} · 一切都在本机</p>
      </div>
    </header>

    <section class="card">
      <div class="card-head">
        <h2>今日提醒</h2>
        <span class="muted">${dailyDone}/${dailyTotal}</span>
      </div>
      ${dailyRows}
      ${workPending > 0 ? `<p class="muted" style="margin-top:8px">工作待办 ${workPending} 项${workOverdue > 0 ? `，其中 <span class="overdue">${workOverdue} 项已逾期</span>` : ''} → <a class="link" href="#/reminders">去处理</a></p>` : ''}
    </section>

    <section class="card">
      <div class="card-head"><h2>背单词</h2><span class="streak">连续 ${streakOf(vocab.stats)} 天</span></div>
      <p class="muted">今日 ${learnedToday} / ${dailyTarget} · 待复习 ${vocab.words.filter(w => w.seen && w.due && w.due <= Date.now()).length}</p>
      <div class="bar"><i style="width:${Math.min(100, learnedToday / dailyTarget * 100)}%"></i></div>
      <a class="btn btn-primary" href="#/vocab">开始学习</a>
    </section>

    <div class="grid-2">
      <section class="card mini">
        <h2>健身</h2>
        <p class="big">${fitMinutes || 0} 分钟</p>
        <p class="muted">今日训练</p>
        <a class="link" href="#/fitness">去记录</a>
      </section>
      <section class="card mini">
        <h2>随手小记</h2>
        <p class="big">${todayNotes} 条</p>
        <p class="muted">今天写的</p>
        <a class="link" href="#/notes">打开</a>
      </section>
    </div>

    <section class="card">
      <span class="chip">每日一知 · 科学</span>
      <h2 class="card-title">为什么天空是蓝色的？</h2>
      <p class="muted">阳光进入大气层后，波长较短的蓝光更容易被空气分子散射，于是天空呈现蓝色。</p>
      <a class="link" href="#/knowledge">阅读全文 →</a>
    </section>`;
  }

  /* ================================================================
   * 更多 / 设置
   * ================================================================ */
  function pageMore() {
    const notes = DB.get('notes');
    return `
    <header class="page-head"><h1>更多</h1></header>
    <section class="menu-list">
      <a class="card menu-item" href="#/notes"><span class="menu-ico">记</span><span><b>随手小记</b><em>${notes.length} 条笔记</em></span></a>
      <a class="card menu-item" href="#/knowledge"><span class="menu-ico">知</span><span><b>知识扩展</b><em>联网随机 + 内置精选</em></span></a>
      <a class="card menu-item" href="#/zhouyi"><span class="menu-ico">卦</span><span><b>周易 · 摇卦</b><em>六十四卦</em></span></a>
      <a class="card menu-item" href="#/settings"><span class="menu-ico">设</span><span><b>设置与数据</b><em>主题 · 备份 · 安装</em></span></a>
    </section>
    <p class="muted center">本地优先 · 断网可用 · 数据只存这台手机</p>`;
  }

  function pageSettings() {
    const s = DB.get('settings');
    const dark = s.theme === 'dark';
    return `
    <header class="page-head"><h1>设置</h1></header>
    <section class="card">
      <h2>外观</h2>
      <div class="seg">
        <button class="seg-btn ${dark ? '' : 'on'}" data-act="theme" data-theme="light">浅色</button>
        <button class="seg-btn ${dark ? 'on' : ''}" data-act="theme" data-theme="dark">深色</button>
      </div>
    </section>
    <section class="card">
      <h2>每日新词目标</h2>
      <div class="seg">
        ${[10, 20, 30, 50].map(n => `<button class="seg-btn ${(s.dailyTarget || 20) === n ? 'on' : ''}" data-act="target" data-v="${n}">${n}</button>`).join('')}
      </div>
    </section>
    <section class="card">
      <h2>数据备份</h2>
      <p class="muted">所有数据保存在本机浏览器。换手机或清理浏览器前，先导出备份。</p>
      <div class="seg">
        <button class="btn btn-soft" data-act="export">导出备份</button>
        <button class="btn btn-soft" data-act="import">导入备份</button>
      </div>
      <button class="btn btn-danger-ghost" data-act="reset">清空本机数据</button>
    </section>
    <section class="card">
      <h2>添加到主屏幕</h2>
      <ol class="steps">
        <li>用手机 Chrome 打开本站地址</li>
        <li>点右上角 ⋮ → 「添加到主屏幕」</li>
        <li>桌面出现图标后，断网也能打开</li>
      </ol>
      <p class="muted">版本 v1.0 · 个人工作站</p>
    </section>`;
  }

  /* ================================================================
   * 路由
   * ================================================================ */
  const PAGES = {
    home: pageHome, vocab: pageVocab, fitness: pageFitness, reminders: pageReminders,
    notes: pageNotes, knowledge: pageKnowledge, zhouyi: pageZhouyi, more: pageMore, settings: pageSettings, import: pageImport,
  };

  function currentRoute() {
    return (location.hash.replace(/^#\/?/, '') || 'home').split('/')[0] || 'home';
  }

  function render() {
    const name = currentRoute();
    const page = PAGES[name] || PAGES.home;
    document.getElementById('app').innerHTML = page();
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.route === name));
    const fab = document.getElementById('fab');
    fab.style.display = (name === 'home' || name === 'notes') ? '' : 'none';
    document.getElementById('app').scrollTop = 0;
  }

  /* ================================================================
   * 动作分发
   * ================================================================ */
  function bindActions() {
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;

      /* ---- 通用 ---- */
      if (act === 'new-note') return openNoteEditor(null);
      if (act === 'theme') {
        const th = t.dataset.theme === 'dark' ? 'dark' : 'light';
        DB.update('settings', s => { s.theme = th; });
        applyTheme(th); render(); return;
      }
      if (act === 'target') {
        DB.update('settings', s => { s.dailyTarget = parseInt(t.dataset.v, 10); });
        render(); return;
      }
      if (act === 'export') { download(`个人工作站备份-${todayISO()}.json`, JSON.stringify(DB.exportAll(), null, 2)); toast('备份已导出'); return; }
      if (act === 'import') { doImport(); return; }
      if (act === 'reset') {
        confirm('确定清空本机所有数据？此操作不可恢复。').then(ok => {
          if (!ok) return;
          DB.resetAll(); applyTheme('light'); toast('已清空'); render();
        });
        return;
      }

      /* ---- 单词 ---- */
      if (act === 'vocab-reveal') { VOCAB.reveal = true; render(); return; }
      if (act === 'vocab-grade') { vocabGrade(parseInt(t.dataset.q, 10)); render(); return; }
      if (act === 'vocab-more') {
        DB.update('vocab', v => { v.settings.daily = (v.settings.daily || 20) + 5; });
        toast('今日目标 +5'); render(); return;
      }

      /* ---- 健身 ---- */
      if (act === 'fit-part') { toggleSet(FIT.parts, t.dataset.v); render(); return; }
      if (act === 'fit-eq') { toggleSet(FIT.equipment, t.dataset.v); render(); return; }
      if (act === 'fit-del') { FIT.items.splice(parseInt(t.dataset.i, 10), 1); render(); return; }
      if (act === 'fit-timer') {
        if (FIT.running) { clearInterval(FIT.timer); FIT.timer = null; FIT.running = false; }
        else { FIT.running = true; FIT.timer = setInterval(fitTimerTick, 1000); }
        render(); return;
      }
      if (act === 'fit-reset') { if (FIT.timer) { clearInterval(FIT.timer); FIT.timer = null; } FIT.running = false; FIT.elapsed = 0; render(); return; }
      if (act === 'fit-add') { fitAddItem(); return; }
      if (act === 'fit-save') {
        const mm = $('#fit-manual') ? $('#fit-manual').value : '';
        const dur = fitnessSave(mm);
        toast(`已保存 · 今日 ${dur} 分钟`); render(); return;
      }

      /* ---- 提醒 ---- */
      if (act === 'rem-tab') { REM.tab = t.dataset.v; render(); return; }
      if (act === 'rem-add') { REM.tab === 'daily' ? dailyAddModal() : workAddModal(); return; }
      if (act === 'rem-toggle-daily') {
        DB.update('reminders', r => { const it = r.daily.find(x => x.id === t.dataset.id); if (it) it.enabled = it.enabled === false; });
        render(); return;
      }
      if (act === 'rem-del-daily') {
        confirm('删除这条今日提醒？').then(ok => { if (!ok) return; DB.update('reminders', r => { r.daily = r.daily.filter(x => x.id !== t.dataset.id); }); toast('已删除'); render(); });
        return;
      }
      if (act === 'rem-toggle-work') {
        DB.update('reminders', r => { const it = r.work.find(x => x.id === t.dataset.id); if (it) it.done = !it.done; });
        render(); return;
      }
      if (act === 'rem-del-work') {
        confirm('删除这条工作提醒？').then(ok => { if (!ok) return; DB.update('reminders', r => { r.work = r.work.filter(x => x.id !== t.dataset.id); }); toast('已删除'); render(); });
        return;
      }

      /* ---- 首页 ---- */
      if (act === 'home-toggle-daily') {
        DB.update('reminders', r => {
          const it = r.daily.find(x => x.id === t.dataset.id);
          if (it) {
            const tk = todayISO();
            it.doneOn = it.doneOn || [];
            const i = it.doneOn.indexOf(tk);
            if (i >= 0) it.doneOn.splice(i, 1); else it.doneOn.push(tk);
          }
        });
        render(); return;
      }

      /* ---- 笔记 ---- */
      if (act === 'note-tag') { NOTES.tag = (NOTES.tag === t.dataset.v) ? null : t.dataset.v; render(); return; }
      if (act === 'pin-note') {
        DB.update('notes', list => { const n = list.find(x => x.id === t.dataset.id); if (n) n.pinned = !n.pinned; });
        render(); return;
      }
      if (act === 'edit-note') {
        const n = DB.get('notes').find(x => x.id === t.dataset.id);
        if (n) openNoteEditor(n);
        return;
      }
      if (act === 'del-note') {
        confirm('删除这条笔记？').then(ok => {
          if (!ok) return;
          DB.update('notes', list => { const i = list.findIndex(x => x.id === t.dataset.id); if (i >= 0) list.splice(i, 1); });
          toast('已删除'); render();
        });
        return;
      }

      /* ---- 知识 ---- */
      if (act === 'know-cat') { KNOW.cat = t.dataset.v; render(); return; }
      if (act === 'know-random') { fetchRandomKnowledge(); return; }

      /* ---- 周易 ---- */
      if (act === 'zy-cast') {
        ZY.question = ($('#zy-q') ? $('#zy-q').value : '').trim();
        const r = castHex();
        ZY.result = r; ZY.view = 'result'; ZY.fromResult = false;
        DB.update('zhouyi', z => {
          z.records = z.records || [];
          z.records.push({ id: uid(), time: Date.now(), question: ZY.question, lines: r.lines, yang: r.yang, moving: r.moving, hexName: r.hex ? r.hex.name : '' });
        });
        render(); return;
      }
      if (act === 'zy-browse') { ZY.view = 'browse'; ZY.q = ''; render(); return; }
      if (act === 'zy-back') {
        if (ZY.fromResult && ZY.result) { ZY.view = 'result'; ZY.fromResult = false; }
        else { ZY.view = 'cast'; ZY.result = null; ZY.detail = null; ZY.fromResult = false; }
        render(); return;
      }
      if (act === 'zy-detail') {
        const h = (window.WS_HEX || []).find(x => x.n === parseInt(t.dataset.n, 10));
        if (h) { ZY.fromResult = (ZY.view === 'result'); ZY.detail = h; ZY.view = 'detail'; render(); }
        return;
      }
      if (act === 'zy-open') {
        const rec = (DB.get('zhouyi').records || []).find(x => x.id === t.dataset.id);
        if (rec) {
          ZY.question = rec.question || '';
          ZY.result = buildResult(rec.lines, rec.yang, rec.moving);
          ZY.view = 'result'; ZY.fromResult = false;
          render();
        }
        return;
      }
      if (act === 'zy-clear') {
        confirm('清空所有起卦记录？').then(ok => { if (!ok) return; DB.update('zhouyi', z => { z.records = []; }); toast('已清空'); render(); });
        return;
      }

      /* ---- 导入单词 ---- */
      if (act === 'imp-back') { location.hash = '#/vocab'; return; }
      if (act === 'imp-pick') {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
        inp.onchange = () => { if (inp.files && inp.files[0]) runOCR(inp.files[0]); };
        inp.click();
        return;
      }
      if (act === 'imp-parse') {
        const ta = $('#imp-paste');
        const words = extractWords(ta ? ta.value : '');
        if (!words.length) { toast('没解析出单词'); return; }
        IMP.words = words.map(w => ({ w, m: '', sel: true }));
        render();
        fillMeanings();
        return;
      }
      if (act === 'imp-toggle') { const i = parseInt(t.dataset.i, 10); if (IMP.words[i]) IMP.words[i].sel = !IMP.words[i].sel; render(); return; }
      if (act === 'imp-import') {
        const sel = IMP.words.filter(w => w.sel);
        if (!sel.length) { toast('先勾选要导入的词'); return; }
        let added = 0;
        DB.update('vocab', v => {
          v.words = v.words || [];
          const existing = new Set(v.words.map(x => x.w.toLowerCase()));
          sel.forEach(it => {
            if (existing.has(it.w.toLowerCase())) return;
            v.words.push({ id: uid(), w: it.w, p: '', m: it.m || '', ef: 2.5, interval: 0, due: 0, reps: 0, lapses: 0, seen: false, added: Date.now() });
            existing.add(it.w.toLowerCase());
            added++;
          });
        });
        toast(`导入 ${added} 个新单词`);
        IMP.words = [];
        location.hash = '#/vocab';
        return;
      }
    });

    /* 搜索框（防抖，避免每敲一个字重渲染丢焦点） */
    document.addEventListener('input', e => {
      if (e.target.id === 'note-search') {
        NOTES.q = e.target.value;
        debounceRender();
      } else if (e.target.id === 'zy-search') {
        ZY.q = e.target.value;
        debounceRender();
      } else if (e.target.id === 'zy-q') {
        ZY.question = e.target.value;
      } else if (e.target.dataset.act === 'imp-m') {
        const i = parseInt(e.target.dataset.i, 10);
        if (IMP.words[i]) IMP.words[i].m = e.target.value;
      }
    });
  }

  let renderTimer = null;
  function debounceRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => { render(); refocusSearch(); }, 250);
  }
  function refocusSearch() {
    const el = $('#note-search');
    if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; }
  }

  function toggleSet(set, v) {
    if (set.has(v)) set.delete(v); else set.add(v);
  }

  function fitAddItem() {
    const m = modal(`
      <h3 class="modal-title">添加动作</h3>
      <input id="fi-name" placeholder="动作名（如 杠铃卧推）">
      <div class="seg" style="margin:0 0 10px">
        <input id="fi-weight" class="search-input" type="number" inputmode="decimal" min="0" placeholder="重量 kg">
        <input id="fi-reps" class="search-input" type="number" inputmode="numeric" min="0" placeholder="次数">
        <input id="fi-sets" class="search-input" type="number" inputmode="numeric" min="0" placeholder="组数">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="fi-save">添加</button>
      </div>`);
    m.el.querySelector('[data-close]').onclick = m.close;
    m.el.querySelector('#fi-save').onclick = () => {
      const name = m.el.querySelector('#fi-name').value.trim();
      if (!name) { toast('填个动作名'); return; }
      FIT.items.push({
        name,
        weight: m.el.querySelector('#fi-weight').value || 0,
        reps: m.el.querySelector('#fi-reps').value || 0,
        sets: m.el.querySelector('#fi-sets').value || 0,
      });
      m.close();
      render();
    };
  }

  function dailyAddModal() {
    const days = new Set([1, 2, 3, 4, 5]);
    const m = modal(`
      <h3 class="modal-title">新增今日提醒</h3>
      <input id="da-time" type="time" value="08:00">
      <input id="da-text" placeholder="内容，如 喝水 8 杯">
      <p class="muted" style="margin:0 0 6px">重复</p>
      <div class="chip-wrap" id="da-days">
        ${DAY_LABELS.map((d, i) => `<button class="chip-btn ${days.has(i) ? 'on' : ''}" data-day="${i}">周${d}</button>`).join('')}
      </div>
      <div class="chip-wrap">
        <button class="chip-btn" data-preset="all">每天</button>
        <button class="chip-btn" data-preset="work">工作日</button>
        <button class="chip-btn" data-preset="weekend">周末</button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="da-save">保存</button>
      </div>`);

    const daysBox = m.el.querySelector('#da-days');
    function refreshChips() {
      [...daysBox.querySelectorAll('.chip-btn')].forEach(b => b.classList.toggle('on', days.has(parseInt(b.dataset.day, 10))));
    }
    daysBox.addEventListener('click', e => {
      const b = e.target.closest('[data-day]');
      if (!b) return;
      const d = parseInt(b.dataset.day, 10);
      if (days.has(d)) days.delete(d); else days.add(d);
      refreshChips();
    });
    m.el.querySelector('[data-preset="all"]').onclick = () => { days.clear(); [0, 1, 2, 3, 4, 5, 6].forEach(d => days.add(d)); refreshChips(); };
    m.el.querySelector('[data-preset="work"]').onclick = () => { days.clear(); [1, 2, 3, 4, 5].forEach(d => days.add(d)); refreshChips(); };
    m.el.querySelector('[data-preset="weekend"]').onclick = () => { days.clear(); [0, 6].forEach(d => days.add(d)); refreshChips(); };
    m.el.querySelector('[data-close]').onclick = m.close;
    m.el.querySelector('#da-save').onclick = () => {
      const text = m.el.querySelector('#da-text').value.trim();
      const time = m.el.querySelector('#da-time').value;
      if (!text) { toast('填个内容'); return; }
      if (!time) { toast('选个时间'); return; }
      DB.update('reminders', r => {
        r.daily.push({ id: uid(), time, text, days: [...days], enabled: true, doneOn: [] });
      });
      m.close();
      toast('已添加');
      render();
    };
  }

  function workAddModal() {
    const m = modal(`
      <h3 class="modal-title">新增工作提醒</h3>
      <input id="wa-title" placeholder="标题，如 提交周报">
      <input id="wa-note" placeholder="备注（可空）">
      <input id="wa-due" type="datetime-local">
      <div class="seg">
        <button class="seg-btn" data-p="mid">中</button>
        <button class="seg-btn on" data-p="high">高</button>
        <button class="seg-btn" data-p="low">低</button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="wa-save">保存</button>
      </div>`);
    let pri = 'high';
    const segBtns = [...m.el.querySelectorAll('[data-p]')];
    segBtns.forEach(b => b.onclick = () => { pri = b.dataset.p; segBtns.forEach(x => x.classList.toggle('on', x === b)); });
    m.el.querySelector('[data-close]').onclick = m.close;
    m.el.querySelector('#wa-save').onclick = () => {
      const title = m.el.querySelector('#wa-title').value.trim();
      if (!title) { toast('填个标题'); return; }
      const dueStr = m.el.querySelector('#wa-due').value;
      const due = dueStr ? new Date(dueStr).getTime() : 0;
      DB.update('reminders', r => {
        r.work.push({ id: uid(), title, note: m.el.querySelector('#wa-note').value.trim(), due, priority: pri, done: false });
      });
      m.close();
      toast('已添加');
      render();
    };
  }

  function doImport() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          DB.importAll(JSON.parse(reader.result));
          toast('导入成功');
          applyTheme(DB.get('settings').theme);
          render();
        } catch (err) {
          toast('导入失败：' + (err.message || err));
        }
      };
      reader.readAsText(f);
    };
    inp.click();
  }

  /* ================================================================
   * 提醒引擎
   * ================================================================ */
  function checkDueNow() {
    const now = new Date();
    const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const tk = todayISO();
    const wd = now.getDay();
    let hit = null;
    DB.update('reminders', r => {
      r.daily.forEach(it => {
        if (it.enabled === false) return;
        if (it.time !== hm) return;
        if (!(it.days || []).includes(wd)) return;
        if (it.firedOn === tk) return;
        it.firedOn = tk;
        hit = it;
      });
    });
    if (hit) toast(`⏰ ${hit.text}`, 3500);
  }

  /* ================================================================
   * 离线缓存 / 初始化
   * ================================================================ */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW 注册失败', err));
  }

  function init() {
    applyTheme(DB.get('settings').theme);
    const meta = DB.get('meta');
    if (!meta.createdAt) { meta.createdAt = Date.now(); DB.set('meta', meta); }
    bindActions();
    window.addEventListener('hashchange', render);
    render();
    registerSW();
    checkDueNow();
    setInterval(checkDueNow, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.WS);
