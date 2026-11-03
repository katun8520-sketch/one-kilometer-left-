// 全部音效都用 Web Audio 即時合成，不需要音檔
export class Sfx {
  constructor() { this.ctx = null; this.music = null; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.85; this.master.connect(c.destination);
    this.envF = c.createBiquadFilter(); this.envF.type = 'lowpass'; this.envF.frequency.value = 18000;
    this.envG = c.createGain(); this.envF.connect(this.envG); this.envG.connect(this.master);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.gain.value = 0.55; this.mus.connect(this.envF);
    const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
    const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0);
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
  }
  get ok() { return !!this.ctx; }
  get t() { return this.ctx.currentTime; }
  suspend() { if (this.ctx) this.ctx.suspend(); }
  resume() { if (this.ctx) this.ctx.resume(); }

  noise(loop = false) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = loop; return s; }
  gainEnv(t0, a, peak, d, dest) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    g.connect(dest || this.sfx);
    return g;
  }
  osc(type, f, t0, dur, dest) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); o.connect(dest); o.start(t0); o.stop(t0 + dur + 0.05); return o; }
  filt(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

  // ---- 車輛環境音 ----
  startDrive() {
    if (!this.ok || this.drive) return;
    const c = this.ctx;
    const n = this.noise(true), lp = this.filt('lowpass', 650), g = c.createGain(); g.gain.value = 0.1;
    n.connect(lp); lp.connect(g); g.connect(this.envF); n.start();
    const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square';
    o1.frequency.value = 38; o2.frequency.value = 76;
    const el = this.filt('lowpass', 240), eg = c.createGain(); eg.gain.value = 0.06;
    o1.connect(el); o2.connect(el); el.connect(eg); eg.connect(this.envF); o1.start(); o2.start();
    this.drive = { n, g, o1, o2, eg };
  }
  stopDrive() {
    if (!this.drive) return;
    const d = this.drive; this.drive = null;
    try { d.n.stop(); d.o1.stop(); d.o2.stop(); } catch (e) {}
  }
  setSpeed(v, gas) {
    if (!this.drive) return;
    const t = this.t, f = 34 + v * 2.7 + (gas ? 10 : 0);
    this.drive.o1.frequency.setTargetAtTime(f, t, 0.12);
    this.drive.o2.frequency.setTargetAtTime(f * 2, t, 0.12);
    this.drive.eg.gain.setTargetAtTime(0.045 + (gas ? 0.05 : 0) + v * 0.002, t, 0.12);
    this.drive.g.gain.setTargetAtTime(0.04 + v * 0.011, t, 0.2);
  }
  muffle(on) {
    if (!this.ok) return;
    this.envF.frequency.setTargetAtTime(on ? 380 : 18000, this.t, 0.07);
    this.envG.gain.setTargetAtTime(on ? 0.75 : 1, this.t, 0.1);
  }

  // ---- 音效 ----
  tick(vol = 0.22) {
    if (!this.ok) return; const t = this.t;
    const g = this.gainEnv(t, 0.002, vol, 0.05);
    const o = this.osc('square', 2100, t, 0.08, g); o.frequency.exponentialRampToValueAtTime(650, t + 0.03);
  }
  windowMotor(dur = 1.8) {
    if (!this.ok) return; const t = this.t;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.1);
    g.gain.setValueAtTime(0.18, t + dur - 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.connect(this.sfx);
    const bp = this.filt('bandpass', 900, 3); bp.connect(g);
    const o = this.osc('sawtooth', 95, t, dur, bp); o.frequency.linearRampToValueAtTime(120, t + dur);
    const n = this.noise(); const nb = this.filt('bandpass', 2500, 2); const ng = this.ctx.createGain(); ng.gain.value = 0.25;
    n.connect(nb); nb.connect(ng); ng.connect(g); n.start(t); n.stop(t + dur);
    const g2 = this.gainEnv(t + dur - 0.02, 0.003, 0.3, 0.08); this.osc('square', 140, t + dur - 0.02, 0.1, g2);
  }
  horn(dur = 1, vol = 0.22) {
    if (!this.ok) return; const t = this.t;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.setValueAtTime(vol, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08); g.connect(this.sfx);
    const lp = this.filt('lowpass', 2200); lp.connect(g);
    this.osc('square', 415, t, dur + 0.1, lp); this.osc('square', 523, t, dur + 0.1, lp);
  }
  brake() {
    if (!this.ok) return; const t = this.t;
    const g = this.gainEnv(t, 0.02, 0.07, 0.5); const o = this.osc('sine', 2500, t, 0.55, g);
    o.frequency.linearRampToValueAtTime(2300, t + 0.5);
  }
  scrape() {
    if (!this.ok || (this._scrapeT && this.t - this._scrapeT < 0.25)) return;
    const t = this._scrapeT = this.t;
    const g = this.gainEnv(t, 0.01, 0.35, 0.3); const bp = this.filt('bandpass', 2600, 1.5); bp.connect(g);
    const n = this.noise(); n.connect(bp); n.start(t); n.stop(t + 0.35);
    const g2 = this.gainEnv(t, 0.005, 0.12, 0.25); this.osc('sawtooth', 180, t, 0.25, g2);
  }
  heartbeat(times = 2) {
    if (!this.ok) return;
    for (let i = 0; i < times; i++) for (const off of [0, 0.18]) {
      const t = this.t + i * 0.62 + off;
      const g = this.gainEnv(t, 0.01, off ? 0.5 : 0.7, 0.18);
      const o = this.osc('sine', 70, t, 0.2, g); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    }
  }
  whoosh() {
    if (!this.ok) return; const t = this.t;
    const g = this.gainEnv(t, 0.08, 0.25, 0.35); const bp = this.filt('bandpass', 500, 0.8); bp.connect(g);
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(1600, t + 0.3);
    const n = this.noise(); n.connect(bp); n.start(t); n.stop(t + 0.5);
  }
  shot() {
    if (!this.ok) return; const t = this.t;
    const g = this.gainEnv(t, 0.002, 0.9, 0.22); const lp = this.filt('lowpass', 3500); lp.connect(g);
    const n = this.noise(); n.connect(lp); n.start(t); n.stop(t + 0.3);
    const g2 = this.gainEnv(t, 0.002, 0.8, 0.25); const o = this.osc('sine', 160, t, 0.3, g2); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  }
  laser() {
    if (!this.ok) return; const t = this.t;
    const g = this.gainEnv(t, 0.005, 0.35, 0.32);
    const o = this.osc('sawtooth', 2200, t, 0.35, g); o.frequency.exponentialRampToValueAtTime(180, t + 0.3);
    const o2 = this.osc('square', 1500, t, 0.3, g); o2.frequency.exponentialRampToValueAtTime(90, t + 0.28);
    const g2 = this.gainEnv(t, 0.002, 0.4, 0.3); const o3 = this.osc('sine', 90, t, 0.3, g2); o3.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  }
  splat() {
    if (!this.ok) return; const t = this.t + 0.03;
    const g = this.gainEnv(t, 0.01, 0.6, 0.35); const lp = this.filt('lowpass', 1200, 4); lp.connect(g);
    lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(250, t + 0.3);
    const n = this.noise(); n.connect(lp); n.start(t); n.stop(t + 0.4);
  }
  ding() {
    if (!this.ok) return; const t = this.t;
    const g = this.gainEnv(t, 0.002, 0.15, 0.25); this.osc('triangle', 1800, t, 0.3, g); this.osc('triangle', 2700, t, 0.3, g);
  }
  thud(vol = 0.7) {
    if (!this.ok) return; const t = this.t;
    const g = this.gainEnv(t, 0.003, vol, 0.3); const o = this.osc('sine', 110, t, 0.35, g); o.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    const g2 = this.gainEnv(t, 0.002, vol * 0.4, 0.12); const lp = this.filt('lowpass', 900); lp.connect(g2); const n = this.noise(); n.connect(lp); n.start(t); n.stop(t + 0.2);
  }
  punch() { this.thud(1); this.whoosh(); }
  boom() {
    if (!this.ok) return; const t = this.t;
    const g = this.gainEnv(t, 0.005, 1.0, 1.4); const lp = this.filt('lowpass', 900); lp.connect(g);
    lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    const n = this.noise(); n.connect(lp); n.start(t); n.stop(t + 1.5);
    const g2 = this.gainEnv(t, 0.003, 1.0, 0.6); const o = this.osc('sine', 90, t, 0.7, g2); o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
  }
  step() { this.thud(0.35); }
  crash() {
    if (!this.ok) return; const t = this.t;
    const g = this.gainEnv(t, 0.003, 0.9, 0.9); const lp = this.filt('lowpass', 2500); lp.connect(g);
    const n = this.noise(); n.connect(lp); n.start(t); n.stop(t + 1);
    for (const f of [310, 467, 733, 1040]) { const g2 = this.gainEnv(t, 0.002, 0.12, 0.8); this.osc('square', f * (0.97 + Math.random() * 0.06), t, 0.85, g2); }
    this.thud(1);
  }
  doorOpen() {
    if (!this.ok) return; const t = this.t;
    const g = this.gainEnv(t, 0.002, 0.35, 0.12); const bp = this.filt('bandpass', 1400, 2); bp.connect(g);
    const n = this.noise(); n.connect(bp); n.start(t); n.stop(t + 0.15);
    const g2 = this.gainEnv(t + 0.05, 0.002, 0.2, 0.15); this.osc('square', 220, t + 0.05, 0.15, g2);
  }
  cock() {
    if (!this.ok) return;
    for (const off of [0, 0.12]) { const t = this.t + off; const g = this.gainEnv(t, 0.001, 0.4, 0.05); const hp = this.filt('highpass', 1800); hp.connect(g); const n = this.noise(); n.connect(hp); n.start(t); n.stop(t + 0.06); }
  }
  laserCharge() {
    if (!this.ok) return; const t = this.t;
    const g = this.gainEnv(t, 0.3, 0.18, 0.4); const o = this.osc('sine', 300, t, 0.75, g); o.frequency.exponentialRampToValueAtTime(2400, t + 0.6);
  }
  sting() {
    if (!this.ok) return; const t = this.t;
    for (const f of [98, 104, 147]) { const g = this.gainEnv(t, 0.02, 0.15, 1.6); const lp = this.filt('lowpass', 900); lp.connect(g); const o = this.osc('sawtooth', f, t, 1.7, lp); o.frequency.linearRampToValueAtTime(f * 0.7, t + 1.6); }
  }
  taunt() {
    if (!this.ok) return; const t = this.t;
    [523, 392].forEach((f, i) => { const g = this.gainEnv(t + i * 0.16, 0.01, 0.16, 0.25); this.osc('square', f, t + i * 0.16, 0.28, g); });
  }
  speak(text) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-TW'; u.rate = 0.65; u.pitch = 0.4; u.volume = 1;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) {}
  }

  // ---- 音樂 ----
  startTension() { this.music = { mode: 'tension', next: this.ok ? this.t + 0.2 : 0, bpm: 76, n: 0 }; }
  setHard(on) { if (this.music && this.music.mode === 'tension') this.music.bpm = on ? 124 : 76; }
  stopMusic() { this.music = null; }
  updateMusic() {
    const m = this.music;
    if (!m || !this.ok || m.mode !== 'tension') return;
    while (m.next < this.t + 0.15) {
      const t = m.next;
      const hard = m.bpm > 100;
      const g = this.gainEnv(t, 0.01, hard ? 0.34 : 0.26, 0.35, this.mus);
      const o = this.osc('sine', 55, t, 0.4, g); o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
      if (m.n % 2 === 1 || hard) {
        const g2 = this.gainEnv(t, 0.01, hard ? 0.06 : 0.035, 0.25, this.mus);
        const lp = this.filt('lowpass', 700); lp.connect(g2);
        this.osc('sawtooth', [110, 116.5, 110, 98][m.n % 4] * (hard ? 2 : 1), t, 0.3, lp);
      }
      m.n++; m.next += 60 / m.bpm;
    }
  }
  victory() {
    this.music = { mode: 'victory' };
    if (!this.ok) return;
    const t0 = this.t + 0.1;
    const chords = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7], [261.6, 329.6, 392]];
    chords.forEach((ch, i) => {
      ch.forEach((f, j) => {
        const t = t0 + i * 1.6 + j * 0.18;
        const g = this.gainEnv(t, 0.05, 0.09, 1.8, this.master);
        this.osc('triangle', f, t, 1.9, g);
        const g2 = this.gainEnv(t + 0.8, 0.03, 0.05, 0.6, this.master);
        this.osc('sine', f * 2, t + 0.8, 0.7, g2);
      });
    });
  }
}
