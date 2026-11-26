window.WS = window.WS || {};
(function (WS) {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function todayISO(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  function dateCN(d = new Date()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 星期${WEEK[d.getDay()]}`;
  }

  function fmtTime(ts) {
    const d = new Date(ts || Date.now());
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function debounce(fn, wait = 200) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  function toast(msg, ms = 1800) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, ms);
  }

  function modal(html, opts = {}) {
    const root = document.getElementById('overlay-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-mask';
    wrap.innerHTML = `<div class="modal">${html}</div>`;
    root.appendChild(wrap);
    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
    }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', e => {
      if (e.target === wrap && opts.maskClose !== false) close();
    });
    return { el: wrap, close };
  }

  function confirmBox(msg) {
    return new Promise(resolve => {
      const m = modal(`
        <p class="modal-text">${esc(msg)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-a="no">取消</button>
          <button class="btn btn-danger" data-a="yes">确定</button>
        </div>`);
      m.el.querySelector('[data-a="no"]').onclick = () => { m.close(); resolve(false); };
      m.el.querySelector('[data-a="yes"]').onclick = () => { m.close(); resolve(true); };
    });
  }

  function download(name, text, type = 'application/json') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  WS.util = { $, $$, esc, pad, todayISO, dateCN, fmtTime, uid, debounce, toast, modal, confirm: confirmBox, download };
})(window.WS);
