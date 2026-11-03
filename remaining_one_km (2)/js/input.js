// 鍵盤、滑鼠、多點觸控
export class Input {
  constructor(root) {
    this.gas = false; this.brake = false; this.peek = false;
    this.fireQ = false; this.anyTap = false;
    this.enabled = false;
    this.touch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
    this.aim = { x: innerWidth / 2, y: innerHeight / 2 };
    this.keys = {};
    const keyMap = { KeyW: 'gas', ArrowUp: 'gas', KeyS: 'brake', ArrowDown: 'brake', ShiftLeft: 'peek', ShiftRight: 'peek' };
    addEventListener('keydown', (e) => {
      const k = keyMap[e.code];
      if (k) { this.keys[e.code] = true; this.sync(); e.preventDefault(); }
      if (e.code === 'Space') { if (this.enabled) this.fireQ = true; e.preventDefault(); }
    });
    addEventListener('keyup', (e) => { if (keyMap[e.code]) { this.keys[e.code] = false; this.sync(); } });
    addEventListener('blur', () => { this.keys = {}; this.sync(); this.btn = {}; this.syncBtn(); });
    addEventListener('mousemove', (e) => { if (!this.touch) { this.aim.x = e.clientX; this.aim.y = e.clientY; } });
    root.addEventListener('mousedown', (e) => {
      if (this.touch || e.button !== 0) return;
      if (e.target.closest('button')) return;
      if (this.enabled) this.fireQ = true;
    });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    // 觸控按鈕
    this.btn = {};
    const hold = (id, key) => {
      const el = document.getElementById(id);
      const down = (e) => { e.preventDefault(); this.btn[key] = true; this.syncBtn(); try { el.setPointerCapture(e.pointerId); } catch (_) {} el.classList.add('on'); };
      const up = (e) => { this.btn[key] = false; this.syncBtn(); el.classList.remove('on'); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    };
    hold('btnGas', 'gas'); hold('btnBrake', 'brake'); hold('btnPeek', 'peek');
    const fire = document.getElementById('btnFire');
    fire.addEventListener('pointerdown', (e) => { e.preventDefault(); if (this.enabled) this.fireQ = true; fire.classList.add('on'); });
    fire.addEventListener('pointerup', () => fire.classList.remove('on'));
    fire.addEventListener('pointercancel', () => fire.classList.remove('on'));
    // 觸控拖曳瞄準（按鈕以外的區域）
    this.dragId = null;
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || e.target.closest('button') || this.dragId !== null) return;
      this.dragId = e.pointerId; this.lx = e.clientX; this.ly = e.clientY;
    });
    root.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.dragId) return;
      const k = 1.35;
      this.aim.x = Math.max(0, Math.min(innerWidth, this.aim.x + (e.clientX - this.lx) * k));
      this.aim.y = Math.max(0, Math.min(innerHeight, this.aim.y + (e.clientY - this.ly) * k));
      this.lx = e.clientX; this.ly = e.clientY;
    });
    const end = (e) => { if (e.pointerId === this.dragId) this.dragId = null; };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
  }
  sync() {
    const k = this.keys;
    this.kGas = !!(k.KeyW || k.ArrowUp); this.kBrake = !!(k.KeyS || k.ArrowDown); this.kPeek = !!(k.ShiftLeft || k.ShiftRight);
    this.merge();
  }
  syncBtn() { this.merge(); }
  merge() {
    this.gas = !!(this.kGas || this.btn?.gas);
    this.brake = !!(this.kBrake || this.btn?.brake);
    this.peek = !!(this.kPeek || this.btn?.peek);
  }
  consumeFire() { const f = this.fireQ; this.fireQ = false; return f; }
  clear() { this.fireQ = false; }
  ndc() { return { x: (this.aim.x / innerWidth) * 2 - 1, y: -(this.aim.y / innerHeight) * 2 + 1 }; }
}
