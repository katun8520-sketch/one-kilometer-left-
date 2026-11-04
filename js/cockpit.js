// GPT 繪製的駕駛座內裝、探頭前景、手拿槍：2D 圖層疊在 3D 畫面上，跟著鏡頭動作移動
import { clamp, smooth, lerp } from './config.js';

const $ = (id) => document.getElementById(id);
// 手槍圖上的槍口與手腕位置（0~1，相對圖片寬高）
const GUNS = {
  pistol: { src: 'assets/hand_pistol.webp', muzzle: [0.012, 0.079], pivot: [1, 1], aspect: 900 / 713 },
  laser: { src: 'assets/hand_laser.webp', muzzle: [0.03, 0.065], pivot: [1, 1], aspect: 900 / 638 },
  grenade: { src: 'assets/hand_grenade.webp', muzzle: [0.19, 0.03], pivot: [1, 1], aspect: 900 / 692, noAim: true },
};

export class Cockpit {
  constructor() {
    this.view = $('view');
    this.ck = $('ckwrap');
    this.fg = $('peekfg');
    this.hand = $('hand');
    this.flash = $('muzzle');
    this.recoil = 0;
    this.glass = $('ckglass'); this.winK = -1;
    this.charm = $('charm'); this.needle = $('needle'); this.lcd = $('lcd');
    this.th = 0; this.om = 0;
    this.setGun(false);
  }
  setGun(kind) {
    if (kind === true) kind = 'laser'; else if (!kind) kind = 'pistol';
    this.kind = kind;
    this.gun = GUNS[kind] || GUNS.pistol;
    this.hand.style.visibility = 'visible';
    this.hand.onerror = () => { this.hand.style.visibility = 'hidden'; }; // 手榴彈手圖還沒到時先隱藏
    this.hand.src = this.gun.src;
  }
  // cam: { e（探頭進度 0~1）, yaw, pitch, roll, out（被拉出車外 0~1）, shake, fov, gunShow, aim:{x,y} }
  update(dtR, cam) {
    const W = innerWidth, H = innerHeight;
    const f = (H / 2) / Math.tan((cam.fov * Math.PI / 180) / 2);
    // 內裝全景圖（2400×1436）：預設畫面＝右上角、高 672px 的區域，往左轉頭看到車門、低頭看到腿
    const IW = 2400, IH = 1436, VH = 672;
    const sc0 = H / VH;
    const baseW = IW * sc0, baseH = IH * sc0;
    const left = W - baseW;
    const e = cam.e, out = cam.out;
    const k = Math.max(e, out);
    const sx = (Math.random() - 0.5) * cam.shake * 900, sy = (Math.random() - 0.5) * cam.shake * 900;
    const tx = cam.yaw * f + k * W * 1.05 + sx;
    const ty = cam.pitch * f + k * H * 0.08 + sy;
    const sc = 1 + k * 0.55;
    this.ck.style.width = baseW + 'px';
    this.ck.style.height = baseH + 'px';
    this.ck.style.left = left + 'px';
    this.ck.style.top = '0px';
    this.ck.style.transformOrigin = `${W / 2 - left}px ${H * 0.6}px`;
    this.ck.style.transform = `translate(${tx}px, ${ty}px) rotate(${-cam.roll}rad) scale(${sc})`;
    this.ck.style.opacity = String(1 - smooth((k - 0.4) / 0.45));
    // 駕駛座車窗玻璃：0 = 關、1 = 全開（往下滑進車門）
    const wk = cam.win || 0;
    if (wk !== this.winK) { this.winK = wk; this.glass.style.transform = `translateY(${wk * 104}%)`; this.glass.style.display = wk > 0.99 ? 'none' : 'block'; }
    // 時速表指針（0～200 km/h，掃過約 230 度）與數字
    const kmh = Math.max(0, cam.kmh || 0);
    this.needle.style.transform = `rotate(${155 + Math.min(200, kmh) / 200 * 230}deg)`;
    this.lcd.textContent = String(Math.round(kmh));
    this.lcd.style.fontSize = (baseH * 0.019) + 'px';
    // 平安符：簡單的單擺，車子加減速或碰撞時會晃
    const dt = Math.min(dtR, 0.05);
    this.om += (-26 * this.th - 1.1 * this.om - (cam.accel || 0) * 0.09) * dt;
    if (cam.shake > 0.05) this.om += (Math.random() - 0.5) * cam.shake * 6;
    this.th += this.om * dt;
    this.th = Math.max(-0.9, Math.min(0.9, this.th));
    this.charm.style.transform = `rotate(${this.th}rad)`;
    // 探頭時的前景（車窗下緣 + 後照鏡）
    const fo = smooth((e - 0.55) / 0.4) * (1 - out);
    this.fg.style.opacity = String(fo);
    this.fg.style.transform = `translate(${(1 - fo) * W * 0.15 + sx + cam.yaw * f * 0.3}px, ${(1 - fo) * H * 0.2 + sy}px)`;
    // 手與槍
    this.recoil = Math.max(0, this.recoil - dtR * 6);
    // 丟手榴彈動作：0～0.25 秒往前甩出去、0.25～0.9 秒手是空的、0.9～1.25 秒拿起新的一顆
    let throwOff = 0, throwRot = 0, throwHide = 0;
    if (this.throwT !== undefined) {
      this.throwT += dtR;
      const t = this.throwT;
      if (t < 0.25) { const k = t / 0.25; throwOff = -k; throwRot = -0.6 * k; }
      else if (t < 0.9) { throwHide = 1; }
      else if (t < 1.25) { throwOff = (1 - (t - 0.9) / 0.35) * 0.9; }
      else this.throwT = undefined;
    }
    const show = cam.gunShow;
    this.hand.style.display = show > 0.02 ? 'block' : 'none';
    if (show > 0.02) {
      const g = this.gun;
      const hw = Math.min(W * 0.36, H * 0.78 * g.aspect);
      const hh = hw / g.aspect;
      // 手腕（圖片右下角）在螢幕上的位置
      const px = lerp(W * 1.02, W * 1.0, e), py = lerp(H * 1.2, H * 1.1, e) + (1 - show) * H * 0.6 + this.recoil * 18 + Math.min(0, cam.pitch) * f * 1.3;
      const mx = (g.muzzle[0] - g.pivot[0]) * hw, my = (g.muzzle[1] - g.pivot[1]) * hh;
      const base = Math.atan2(my, mx);
      const lowRot = -0.35;
      const aimRot = g.noAim ? -0.12 : Math.atan2(cam.aim.y - py, cam.aim.x - px) - base;
      const rot = lerp(lowRot, aimRot, e) - this.recoil * 0.12 + throwRot;
      this.hand.style.width = hw + 'px';
      this.hand.style.height = hh + 'px';
      this.hand.style.left = (px - hw) + 'px';
      this.hand.style.top = (py - hh) + 'px';
      this.hand.style.transformOrigin = '100% 100%';
      const toff = throwOff < 0 ? `translate(${throwOff * W * 0.25}px, ${throwOff * H * 0.35}px)` : `translate(0px, ${throwOff * H * 0.6}px)`;
      this.hand.style.opacity = throwHide ? '0' : '1';
      this.hand.style.transform = `${toff} translate(${sx * 0.5}px, ${sy * 0.5}px) rotate(${rot}rad)`;
      const c = Math.cos(rot), s = Math.sin(rot);
      this.muzzleX = px + mx * c - my * s;
      this.muzzleY = py + mx * s + my * c;
    }
  }
  fire(laser) {
    if (laser === 'grenade') { this.throwT = 0; return; }
    this.recoil = 1;
    const fl = this.flash;
    fl.className = laser ? 'laser' : '';
    fl.style.left = this.muzzleX + 'px'; fl.style.top = this.muzzleY + 'px';
    fl.style.display = 'block';
    clearTimeout(this._ft);
    this._ft = setTimeout(() => { fl.style.display = 'none'; }, 70);
  }
}
