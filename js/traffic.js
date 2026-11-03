// 車流與插隊 AI：交流道排隊車陣、左側車道車流、插隊車（接近 → 打方向燈 → 強行切入 → 成功或失敗）
import * as THREE from 'three';
import { Car, CAR_COLORS } from './cars.js';
import { CFG, lane0Pose, rand, pick, clamp, lerp, smooth } from './config.js';

const L = CFG.L;
const BLINK_P = 0.55, BLINK_ON = 0.3;

function idm(v, v0, gap, dv, T = 1.0, s0 = 2.1, a = 1.6, b = 2.6) {
  const ss = s0 + Math.max(0, v * T + v * dv / (2 * Math.sqrt(a * b)));
  const g = Math.max(gap, 0.1);
  return a * (1 - Math.pow(Math.max(v, 0) / Math.max(v0, 0.1), 4) - (ss / g) * (ss / g));
}

export class Traffic {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks; // { tick(dist), cutSuccess(e), scrape(), }
    this.pool = [];
    this.ents = [];
    this._o = {};
  }

  getCar(color) {
    let c = this.pool.pop();
    if (!c) c = new Car(color); else c.setColor(color);
    c.reset();
    this.scene.add(c.group);
    return c;
  }

  add(e) {
    e.car = this.getCar(e.color || pick(CAR_COLORS));
    e.car.ent = e;
    e.id = ++this.idc || (this.idc = 1);
    e.v0 = e.v0 || 10;
    e.t = 0; e.tap = 0; e.yaw = e.yaw || 0;
    this.ents.push(e);
    return e;
  }

  release(e) {
    this.scene.remove(e.car.group);
    e.car.ent = null;
    this.pool.push(e.car);
    e.dead = true;
  }

  clear() { for (const e of this.ents) this.release(e); this.ents = []; }

  reset(P) {
    this.clear();
    let s = P.s + L + 13;
    for (let i = 0; i < 30; i++) {
      this.add({ role: 'queue', lane: 0, s, v: 8, v0: rand(10.5, 13) });
      s += L + rand(4.5, 9);
    }
    for (let i = 0; i < 3; i++) this.add({ role: 'rear', lane: 0, s: P.s - (L + 7) * (i + 1), v: 8, v0: 12 });
    for (const lane of [1, 2]) {
      let ss = lane === 1 ? P.s + 45 : P.s - 50;
      for (let i = 0; i < (lane === 1 ? 3 : 4); i++) {
        ss += rand(25, 60);
        this.add({ role: 'flow', lane, x: CFG.LANE_X[lane], s: ss, v: rand(10, 13), v0: rand(11, 15.5) });
      }
    }
    this.leaderTarget = 8; this.leaderTimer = 3;
    this.cutTimer = 3.5;
    this.tapTimer = rand(9, 14);
    this.spawnTimer = [0, 2, 1];
    this.frozen = false;
  }

  active() { return this.ents.filter((e) => e.role === 'cutter' && !e.dead && (e.state === 'approach' || e.state === 'signal' || e.state === 'cutting')); }

  frontOf(P) {
    let best = null;
    for (const e of this.ents) {
      if (e.dead || e.lane !== 0) continue;
      if (e.s > P.s && (!best || e.s < best.s)) best = e;
    }
    return best;
  }

  spawnCutter(P, opts = {}) {
    const hard = !!opts.hard;
    return this.add({
      role: 'cutter', lane: 1, x: CFG.LANE_X[1], s: opts.s ?? P.s - 28, v: opts.v ?? P.v + 5,
      state: opts.state || 'approach', blinksNeeded: opts.blinks || (hard ? 1 : 3), blinkN: 0,
      p: 0, hard, scripted: !!opts.scripted, life: 0,
    });
  }

  // ctx: { P, mode: 'opening'|'play'|'scene', hard, remaining, push }
  update(dt, ctx) {
    const P = ctx.P;
    const playerEnt = { s: P.s, v: P.v, isPlayer: true };
    // ---- 交流道排隊車道（車道 0）----
    const l0 = this.ents.filter((e) => !e.dead && e.lane === 0);
    l0.push(playerEnt);
    l0.sort((a, b) => b.s - a.s);
    this.leaderTimer -= dt;
    if (this.leaderTimer <= 0) { this.leaderTimer = rand(3, 6); this.leaderTarget = pick([5, 7, 8, 9, 10, 11, 12]); }
    for (let i = 0; i < l0.length; i++) {
      const e = l0[i];
      if (e.isPlayer || e.frozen) continue;
      const lead = l0[i - 1];
      let acc;
      if (!lead) {
        acc = e.s > CFG.EXIT_S ? idm(e.v, 13, 999, 0) : clamp((this.leaderTarget - e.v) * 0.8, -3, 1.4);
      } else {
        acc = idm(e.v, e.role === 'rear' ? 12 : e.v0, lead.s - e.s - L, e.v - lead.v);
      }
      if (e.tap > 0) { e.tap -= dt; acc = Math.min(acc, -4.2); }
      acc = Math.max(acc, -9);
      e.v = Math.max(0, e.v + acc * dt);
      e.s += e.v * dt;
      if (lead && e.s > lead.s - L - 0.4) { e.s = lead.s - L - 0.4; e.v = Math.min(e.v, lead.v); }
      e.brake = acc < -1.0 || e.v < 0.3;
    }
    // 前車偶爾踩一下煞車
    if (ctx.mode === 'play') {
      this.tapTimer -= dt;
      if (this.tapTimer <= 0) {
        this.tapTimer = rand(7, 13);
        const F = this.frontOf(P);
        if (F && F.s < CFG.EXIT_S - 30 && F.v > 3) F.tap = rand(0.7, 1.2);
      }
    }
    // ---- 插隊車 ----
    const F = this.frontOf(P);
    const act = this.active();
    const busy = act.find((e) => e.state === 'signal' || e.state === 'cutting');
    for (const e of act) this.updateCutter(e, dt, ctx, F, busy);
    // ---- 左側車道（1、2）----
    for (const lane of [1, 2]) {
      const list = this.ents.filter((e) => !e.dead && e.lane === lane).sort((a, b) => b.s - a.s);
      for (let i = 0; i < list.length; i++) {
        const e = list[i], lead = list[i - 1];
        let acc = lead ? idm(e.v, e.v0, lead.s - e.s - L, e.v - lead.v) : idm(e.v, e.v0, 999, 0);
        if (e.role === 'cutter' && e.ctrlAcc !== undefined) acc = e.state === 'cutting' ? e.ctrlAcc : Math.min(acc, e.ctrlAcc);
        acc = clamp(acc, -9, 4);
        e.v = Math.max(0, e.v + acc * dt);
        e.s += e.v * dt;
        if (lead && e.role !== 'cutter' && e.s > lead.s - L - 0.4) { e.s = lead.s - L - 0.4; e.v = Math.min(e.v, lead.v); }
        e.brake = acc < -1.0;
      }
    }
    // ---- 被打中的插隊車：失控滑向內側路肩 ----
    for (const e of this.ents) {
      if (e.dead || e.role !== 'cutter' || e.state !== 'shot') continue;
      e.t += dt;
      const on = (e.t % 0.6) < 0.3;
      e.blinkL = e.blinkR = on;
      e.v = Math.max(0, e.v - 3 * dt);
      e.s += e.v * dt;
      if (e.t > 0.35 && e.x > CFG.SHOULDER_X) {
        e.x = Math.max(CFG.SHOULDER_X, e.x - dt * 2.4);
        e.yaw = lerp(e.yaw, 0.32, Math.min(1, dt * 4));
      } else if (e.t > 0.35) e.yaw = lerp(e.yaw, 0.12, Math.min(1, dt * 2));
      e.brake = true;
    }
    // ---- 產生 / 回收 ----
    this.spawnFlow(dt, P);
    if (ctx.mode === 'play' && !this.frozen) this.spawnCutters(dt, ctx, act);
    for (const e of this.ents) {
      if (e.dead) continue;
      const ds = e.s - P.s;
      if (e.role === 'flow' && (ds > 260 || ds < -130)) this.release(e);
      else if (e.role === 'queue' && e.s > CFG.EXIT_S + CFG.RAMP_LEN - 6) this.release(e);
      else if (e.role === 'cutter' && e.state === 'shot' && ds < -60) this.release(e);
      else if (e.role === 'cutter' && e.state === 'approach' && e.life > 14) { e.role = 'flow'; e.blinkR = false; e.v0 = rand(13, 16.5); e.ctrlAcc = undefined; }
    }
    this.ents = this.ents.filter((e) => !e.dead);
    this.applyPoses(dt, P);
  }

  updateCutter(e, dt, ctx, F, busy) {
    const P = ctx.P;
    e.life += dt;
    let targetS;
    const gapPF = F ? F.s - P.s - L : 999;
    if (gapPF >= L + 1.0) targetS = Math.min((P.s + F.s) / 2, P.s + L + 5);
    else targetS = P.s + L + 0.5;
    const waiting = busy && busy !== e;
    if (waiting) targetS = P.s - 2.5;
    e.tight = gapPF < L + 1.0;
    if (e.state === 'approach') {
      e.ctrlAcc = clamp(2.2 * (targetS - e.s) + 1.8 * (P.v - e.v), -6, 3.5);
      if (!waiting && Math.abs(targetS - e.s) < 1.4 && Math.abs(e.v - P.v) < 2.0) { e.state = 'signal'; e.t = 0; e.blinkN = 0; }
    } else if (e.state === 'signal') {
      e.ctrlAcc = clamp(2.2 * (targetS - e.s) + 1.8 * (P.v - e.v), -6, 3.5);
      e.t += dt;
      const ph = e.t % BLINK_P;
      const on = ph < BLINK_ON;
      if (on && !e.blinkR) { this.hooks.tick(Math.abs(e.s - P.s)); e.blinkN++; }
      e.blinkR = on;
      if (e.blinkN >= e.blinksNeeded && !on) { e.state = 'cutting'; e.p = 0; e.t = 0; }
    } else if (e.state === 'cutting') {
      e.t += dt;
      const on = (e.t % BLINK_P) < BLINK_ON;
      if (on && !e.blinkR) this.hooks.tick(Math.abs(e.s - P.s));
      e.blinkR = on;
      let D = e.hard ? 1.35 : 2.2;
      if (e.tight) D *= 1.4;
      e.p = Math.min(1, e.p + dt / D);
      e.x = lerp(CFG.LANE_X[1], 0, smooth(e.p));
      e.yaw = -0.2 * Math.sin(Math.PI * e.p);
      if (e.p > 0.5) e.lane = -1;
      let tS = e.tight ? P.s + L + 0.4 : targetS;
      if (F && e.p > 0.45) tS = Math.min(tS, F.s - L - 0.4);
      e.ctrlAcc = clamp(2.5 * (tS - e.s) + 2.0 * (P.v - e.v), -7, 4);
      if (e.lane === -1) { e.v = Math.max(0, e.v + e.ctrlAcc * dt); e.s += e.v * dt; }
      // 擠開玩家
      if (e.x > -1.95 && P.s + L > e.s - 0.35) {
        ctx.push = true;
        P.s = e.s - L - 0.35;
        P.v = Math.min(P.v, Math.max(0, e.v - 0.8));
      }
      if (F && e.x > -1.95 && e.s > F.s - L - 0.4) e.s = F.s - L - 0.4;
      if (e.p >= 1) {
        e.state = 'done'; e.role = 'queue'; e.lane = 0; e.x = 0; e.yaw = 0; e.v0 = 10;
        e.blinkR = false; e.graceT = 1.5;
        this.hooks.cutSuccess(e);
      }
    }
  }

  spawnFlow(dt, P) {
    for (const lane of [1, 2]) {
      this.spawnTimer[lane] -= dt;
      if (this.spawnTimer[lane] > 0) continue;
      const list = this.ents.filter((e) => !e.dead && e.lane === lane);
      const want = lane === 1 ? 3 : 4;
      if (list.length >= want) { this.spawnTimer[lane] = 1; continue; }
      const sp = P.s - 95;
      if (list.some((e) => Math.abs(e.s - sp) < 18)) { this.spawnTimer[lane] = 0.6; continue; }
      this.add({ role: 'flow', lane, x: CFG.LANE_X[lane], s: sp, v: rand(12, 15), v0: rand(12.5, 16.5) });
      this.spawnTimer[lane] = rand(2, 4);
    }
  }

  spawnCutters(dt, ctx, act) {
    const P = ctx.P;
    if (ctx.remaining < 60) return;
    this.cutTimer -= dt;
    if (this.cutTimer > 0) return;
    const max = ctx.hard ? 2 : 1;
    if (act.length >= max) return;
    const sp = P.s - 28;
    const blocked = this.ents.some((e) => !e.dead && e.lane === 1 && e.s > sp - 9 && e.s < P.s + 10);
    if (blocked) {
      // 左邊車道有車擋著：直接讓旁邊那台一般車變成插隊車
      let best = null;
      for (const e of this.ents) {
        if (e.dead || e.lane !== 1 || e.role !== 'flow') continue;
        const d = Math.abs(e.s - (P.s + 3));
        if (d < 16 && (!best || d < Math.abs(best.s - (P.s + 3)))) best = e;
      }
      if (best && ctx.hard) {
        Object.assign(best, { role: 'cutter', state: 'approach', blinksNeeded: ctx.hard ? 1 : 3, blinkN: 0, p: 0, hard: ctx.hard, scripted: false, life: 0, t: 0 });
        this.cutTimer = ctx.hard ? rand(1.4, 2.6) : rand(4.5, 7.5);
      } else this.cutTimer = 0.4;
      return;
    }
    this.spawnCutter(P, { hard: ctx.hard });
    this.cutTimer = ctx.hard ? rand(1.4, 2.6) : rand(4.5, 7.5);
  }

  removeScripted() {
    for (const e of this.ents) if (e.scripted && e.role === 'cutter') this.release(e);
    this.ents = this.ents.filter((e) => !e.dead);
  }

  kill(e) {
    e.state = 'shot'; e.t = 0; e.lane = -1; e.blinkR = false;
    e.car.shot();
  }

  applyPoses(dt, P) {
    const o = this._o;
    for (const e of this.ents) {
      const c = e.car;
      if (e.lane === 0 || e.role === 'queue' || e.role === 'rear') {
        lane0Pose(e.s, o);
        c.group.position.set(o.x, 0, o.z);
        c.group.rotation.y = o.yaw;
      } else {
        c.group.position.set(e.x, 0, -e.s);
        c.group.rotation.y = e.yaw || 0;
      }
      c.group.visible = Math.abs(e.s - P.s) < 300;
      c.setBlink(!!e.blinkL, !!e.blinkR);
      c.setBrake(!!e.brake);
      if (e.graceT > 0) e.graceT -= dt;
      c.update(dt);
    }
  }

  // 射擊用：可擋子彈的車身 + 插隊中駕駛的頭部判定
  targets(P) {
    const list = [];
    for (const e of this.ents) {
      if (Math.abs(e.s - P.s) > 90) continue;
      list.push(e.car.body);
      if (e.role === 'cutter' && (e.state === 'approach' || e.state === 'signal' || e.state === 'cutting')) list.push(e.car.hitbox);
    }
    return list;
  }
}
