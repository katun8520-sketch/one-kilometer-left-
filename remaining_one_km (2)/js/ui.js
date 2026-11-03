// 介面：HUD、嘲諷文字、字幕、閃光、淡入淡出、結局畫面、插隊車標籤
const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'dist', 'speed', 'cuts', 'toast', 'subtitle', 'bigText', 'controls', 'keysHint', 'btnSkip', 'flash', 'fade', 'title', 'end', 'endImg', 'endText', 'endSub', 'btnRestart', 'pause', 'crosshair', 'fx', 'tags', 'warn', 'panel', 'panelImg', 'c', 'view', 'crashes', 'closeup', 'gunPick', 'btnFire', 'badge'])
      this.el[id] = $(id);
    this.timers = {};
    this.tagEls = new Map();
  }
  show(id, on = true) { this.el[id].classList.toggle('hidden', !on); }
  hud(dist, kmh, cuts, max, crashes = 0, maxCrash = 2) {
    this.el.crashes.textContent = `${crashes}/${maxCrash}`;
    this.el.crashes.parentElement.classList.toggle('danger', crashes >= maxCrash - 1);
    this.el.dist.textContent = Math.max(0, Math.ceil(dist));
    this.el.speed.textContent = Math.round(kmh);
    this.el.cuts.textContent = `${cuts}/${max}`;
    this.el.cuts.parentElement.classList.toggle('danger', cuts >= max - 1);
  }
  timed(id, text, ms, cls) {
    const e = this.el[id];
    e.textContent = text;
    e.className = 'show' + (cls ? ' ' + cls : '');
    clearTimeout(this.timers[id]);
    if (ms) this.timers[id] = setTimeout(() => { e.className = ''; }, ms);
  }
  toast(t, ms = 2600) { this.timed('toast', t, ms); }
  subtitle(t, ms = 2000) { this.timed('subtitle', t, ms); }
  big(t, ms = 1500, cls) { this.timed('bigText', t, ms, cls); }
  hideTexts() { for (const id of ['toast', 'subtitle', 'bigText']) { this.el[id].className = ''; clearTimeout(this.timers[id]); } }
  flash(color = '#fff', ms = 140) {
    const f = this.el.flash; f.style.background = color; f.style.transition = 'none'; f.style.opacity = 1;
    requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = 0; }));
  }
  fade(to, ms = 600) {
    const f = this.el.fade; f.style.transition = `opacity ${ms}ms ease`; f.style.opacity = to;
  }
  bw(on) { this.el.view.classList.toggle('bw', on); }
  // 特寫：從清單隨機挑一張，不跟上一張重複；cls = 'laser' / 'boom' 等外框樣式
  closeup(list, cls = '') {
    const c = this.el.closeup;
    let i; do { i = (Math.random() * list.length) | 0; } while (list.length > 1 && list[i] === this._lastCU);
    this._lastCU = list[i];
    document.getElementById('closeupImg').src = list[i];
    c.className = ''; void c.offsetWidth;
    c.className = 'show' + (cls ? ' ' + cls : '');
    clearTimeout(this.timers.closeup);
    this.timers.closeup = setTimeout(() => { c.className = ''; }, 1150);
  }
  warn(on) { this.el.warn.classList.toggle('hidden', !on); }
  crosshair(on, x, y) {
    const c = this.el.crosshair;
    c.style.display = on ? 'block' : 'none';
    if (on) c.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }
  pow(x, y, laser) {
    const d = document.createElement('div');
    d.className = 'pow' + (laser === 'boom' ? ' boom' : laser ? ' laser' : '');
    d.style.left = x + 'px'; d.style.top = y + 'px';
    this.el.fx.appendChild(d);
    setTimeout(() => d.remove(), 900);
  }
  spark(x, y) {
    const d = document.createElement('div');
    d.className = 'spark'; d.style.left = x + 'px'; d.style.top = y + 'px';
    this.el.fx.appendChild(d); setTimeout(() => d.remove(), 300);
  }
  // 過場圖：先等圖片解碼完成才顯示，避免沿用上一張
  panel(src, on, instant) {
    const p = this.el.panel, img = this.el.panelImg;
    p.classList.toggle('instant', !!instant);
    if (!on) { p.classList.remove('show'); return Promise.resolve(); }
    const tok = (this._pt = (this._pt || 0) + 1);
    img.style.visibility = 'hidden';
    img.src = src;
    const show = () => { if (tok !== this._pt) return; img.style.visibility = 'visible'; p.classList.add('show'); };
    const d = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    return d.then(show);
  }
  end(text, sub, btn, cls) {
    this.el.endText.textContent = text;
    this.el.endSub.innerHTML = sub || '';
    this.el.btnRestart.textContent = btn || '重新開始';
    this.el.end.className = cls || '';
  }
  hideEnd() { this.el.end.className = 'hidden'; }
  // 插隊車頭上的狀態標籤
  tags(list) {
    const seen = new Set();
    for (const t of list) {
      let el = this.tagEls.get(t.id);
      if (!el) { el = document.createElement('div'); el.className = 'tag'; this.el.tags.appendChild(el); this.tagEls.set(t.id, el); }
      seen.add(t.id);
      if (el.textContent !== t.text) el.textContent = t.text;
      el.className = 'tag ' + t.cls;
      el.style.transform = `translate(${t.x}px, ${t.y}px) translate(-50%, -100%)`;
    }
    for (const [id, el] of this.tagEls) if (!seen.has(id)) { el.remove(); this.tagEls.delete(id); }
  }
}
