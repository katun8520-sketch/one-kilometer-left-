// 《剩下一公里》主程式：遊戲迴圈、狀態、射擊、過場
import * as THREE from 'three';
import { CFG, TEXT, clamp, lerp, smooth, rand, loadCleared, saveCleared, clearSave, loadClears, loadOpeningSeen, saveOpeningSeen, GRENADE_CLEARS } from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { setInkTexture } from './cars.js';
import { makeThug, walkPose, makeFist } from './characters.js';
import { mergedGroup, part, canvasTex } from './toon.js';
import { Cockpit } from './cockpit.js';
import { Debris } from './debris.js';

const ui = new UI();
const input = new Input(document.getElementById('app'));
const audio = new Sfx();
const cockpit = new Cockpit();
const canvas = ui.el.c;
const isTouch = input.touch;
document.body.classList.toggle('touch', isTouch);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x596073);
scene.fog = new THREE.Fog(0x4e535e, 70, 560);
const camera = new THREE.PerspectiveCamera(60, 1, 0.04, 2600);
scene.add(camera);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1.5 ? 68 : 60;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const G = {
  state: 'loading', mode: 'opening', token: 0, cuts: 0, laser: false, paused: false,
  timeScale: 1, slowT: 99, lastSlow: -9, clock: 0, fireCD: 0, farT: 0, farCD: 0,
  hard: false, auto: true, stopCar: false, wasPeek: false, assistDone: false,
};
let world, player, traffic, bigThug, rearThug, fist, beam, thugSprite, debris;
let waits = [], tweens = [];
const wait = (sec) => new Promise((res) => waits.push({ t: sec, res, tok: G.token }));
const tween = (dur, fn, ease = smooth) => new Promise((res) => tweens.push({ t: 0, dur, fn, res, tok: G.token, ease }));
function tickTimers(dt) {
  const w = waits; waits = [];
  for (const x of w) { if (x.tok !== G.token) continue; x.t -= dt; if (x.t <= 0) x.res(); else waits.push(x); }
  const tw = tweens; tweens = [];
  for (const x of tw) {
    if (x.tok !== G.token) continue;
    x.t += dt;
    const k = Math.min(1, x.t / x.dur);
    x.fn(x.ease(k));
    if (k >= 1) x.res(); else tweens.push(x);
  }
}

// ---------- 載入 ----------
const loader = new THREE.TextureLoader();
let hasDoorImg = false;
// 預先載入所有過場圖
const HS_P = [1, 2, 3, 4, 5, 6].map((i) => `assets/hs_p${i}.jpg`);
const HS_L = [1, 2, 3, 4, 5].map((i) => `assets/hs_l${i}.jpg`);
const HS_G = [1, 2, 3, 4].map((i) => `assets/hs_g${i}.jpg`);
const preloaded = [];
for (const u of [...HS_P, ...HS_L, ...HS_G, 'assets/boom_text.png']) { const im = new Image(); im.src = u; preloaded.push(im); }
for (const u of ['assets/door_open.jpg', 'assets/end_c.jpg', 'assets/end_d.jpg', 'assets/end_win.jpg', 'assets/headshot.jpg', 'assets/headshot_laser.jpg']) {
  const im = new Image();
  if (u.includes('door_open')) im.onload = () => { hasDoorImg = true; };
  im.src = u; preloaded.push(im);
}
const load = (u) => loader.loadAsync(u).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; });
Promise.all([load('assets/city.jpg'), load('assets/sign_1km.jpg'), load('assets/ink.png'), load('assets/thug_walk.webp')]).then(([city, sign1km, ink, thugTex]) => {
  thugSprite = makeThugSprite(thugTex);
  setInkTexture(ink);
  world = new World(scene, { city, sign1km });
  player = new Player(scene, camera, renderer);
  traffic = new Traffic(scene, {
    tick: (d) => audio.tick(clamp(0.28 - d * 0.006, 0.04, 0.28)),
    cutSuccess: onCutSuccess,
  });
  bigThug = makeThug('big');
  rearThug = makeThug('rear');
  fist = makeFist();
  beam = makeBeam();
  debris = new Debris(scene);
  G.laser = loadCleared();
  resetGame();
  ui.fade(0, 0);
  G.state = 'title';
  document.body.classList.add('ready');
  refreshTitle();
}).catch((err) => {
  document.getElementById('loadMsg').textContent = '載入失敗，請重新整理頁面。' + (err && err.message ? '（' + err.message + '）' : '');
});

function refreshTitle() {
  G.clears = loadClears();
  G.unlocked = G.clears >= 1;
  G.grenadeOK = G.clears >= GRENADE_CLEARS;
  G.openingSeen = loadOpeningSeen();
  // 剛解鎖新武器：自動選最新的武器
  if (G.clears !== lastClears) {
    if (!userPicked || G.clears === GRENADE_CLEARS || G.clears === 1) gunChoice = G.grenadeOK ? 'grenade' : G.unlocked ? 'laser' : 'pistol';
    lastClears = G.clears;
  }
  applyWeapon();
  document.body.classList.toggle('unlocked', G.unlocked);
  ui.el.gunPick.classList.toggle('hidden', !G.unlocked);
  refreshGunPick();
  ui.el.badge.classList.toggle('hidden', !G.laser);
  document.getElementById('btnClear').classList.toggle('hidden', !G.laser);
}

// ---------- 壯漢走路（GPT 四格走路圖做成 3D 看板）----------
function makeThugSprite(tex) {
  tex.repeat.set(0.25, 1);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xd8d4cc, transparent: true, alphaTest: 0.1 }));
  sp.center.set(0.5, 0);
  sp.scale.set(2.2 * (348 / 544), 2.2, 1);
  sp.userData.frame = (i) => { tex.offset.x = (i % 4) * 0.25; };
  return sp;
}

// ---------- 雷射光束 ----------
function makeBeam() {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); geo.translate(0, 0.5, 0);
  const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xe8ffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.scale.set(0.012, 1, 0.012);
  const glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3fe8ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(0.05, 1, 0.05);
  g.add(core, glow); g.visible = false; g.userData = { core, glow, t: 0 };
  scene.add(g);
  return g;
}
function showBeam(a, b) {
  const d = b.clone().sub(a), len = d.length();
  beam.position.copy(a);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  beam.scale.set(1, len, 1);
  beam.visible = true; beam.userData.t = 0.18;
}

// ---------- 重新開始 ----------
function resetGame() {
  G.token++; waits = []; tweens = [];
  Object.assign(G, { navNext: 900, crashes: 0, crashCD: 0, cuts: 0, hard: false, stopCar: false, auto: true, timeScale: 1, slowT: 99, farT: 0, farCD: 0, fireCD: 0, wasPeek: false, mode: 'opening' });
  thugSprite.removeFromParent(); thugSprite.material.opacity = 1;
  for (const o of [bigThug, rearThug]) { o.removeFromParent(); o.userData.upper.rotation.set(0, 0, 0); o.rotation.set(0, 0, 0); }
  fist.removeFromParent();
  for (const g of grenades) { scene.remove(g.m); if (g.trailObj) scene.remove(g.trailObj); } grenades.length = 0;
  for (const b of booms) scene.remove(b.sp); booms.length = 0;
  debris.clear();
  player.reset(CFG.START_S);
  player.setGunType(G.laser);
  cockpit.setGun(G.weapon);
  traffic.reset(player);
  player.updatePose();
  ui.hideEnd(); ui.panel('', false); ui.hideTexts(); ui.bw(false); ui.warn(false);
  ui.show('hud', false); ui.show('controls', false); ui.show('keysHint', false); ui.show('btnSkip', false);
  ui.crosshair(false); ui.tags([]);
  input.enabled = false; input.clear();
  audio.stopMusic(); audio.muffle(false);
}

function startGame() {
  audio.init();
  audio.loadBgm('assets/bgm.mp3');
  audio.loadSample('brake', 'assets/sfx_brake.mp3');
  applyWeapon();
  try {
    if (isTouch && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  } catch (e) {}
  ui.show('title', false);
  resetGame();
  audio.startDrive();
  opening();
}

// ---------- 選擇武器（只能在開始選單選）：通關 1 次解鎖雷射槍、3 次解鎖手榴彈 ----------
let gunChoice = 'laser';
let userPicked = false, lastClears = -1;
document.querySelectorAll('#gunPick button').forEach((b) => b.addEventListener('click', () => {
  gunChoice = b.dataset.gun; userPicked = true; refreshGunPick();
}));
function refreshGunPick() {
  document.querySelectorAll('#gunPick button').forEach((b) => {
    b.classList.toggle('on', b.dataset.gun === gunChoice);
    if (b.dataset.gun === 'grenade') b.classList.toggle('hidden', !G.grenadeOK);
  });
}
function applyWeapon() {
  let w = G.unlocked ? gunChoice : 'pistol';
  if (w === 'grenade' && !G.grenadeOK) w = 'laser';
  G.weapon = w; G.laser = w === 'laser'; G.grenade = w === 'grenade';
}

// ---------- 開場 ----------
async function opening() {
  G.state = 'opening'; G.mode = 'opening'; G.auto = true;
  audio.playBgm(0.6);
  ui.fade(1, 0); await wait(0.05); ui.fade(0, 1200);
  ui.show('btnSkip', !!G.openingSeen); // 開場完整看過一次後才能跳過
  // 導航語音：進入最後一公里排隊時
  setTimeout(() => { if (G.state === 'opening') audio.navVoice('下交流道，剩一公里，請靠右行駛。'); }, 900);
  const sc = traffic.spawnCutter(player, { scripted: true, blinks: 3, s: player.s - 24, v: player.v + 4.5 });
  let w = 0;
  while (sc.state !== 'done' && !sc.dead && w < 11) { await wait(0.1); w += 0.1; }
  await wait(0.35);
  ui.subtitle(TEXT.curse, 1800);
  await wait(1.0);
  await tween(0.6, (k) => { player.extra.pitch = -0.45 * k; });
  player.gunState = 1;
  if (G.laser) audio.laserCharge(); else audio.cock();
  await wait(1.0);
  await tween(0.6, (k) => { player.extra.pitch = -0.45 * (1 - k); player.extra.yaw = 0.55 * k; });
  audio.windowMotor(1.8);
  await tween(1.8, (k) => player.setWindow(k), (k) => k);
  await wait(0.2);
  await tween(0.45, (k) => { player.extra.yaw = 0.55 * (1 - k); });
  saveOpeningSeen(); G.openingSeen = true;
  startPlay();
}

function skipOpening() {
  if (G.state !== 'opening' || !G.openingSeen) return;
  G.token++; waits = []; tweens = [];
  traffic.removeScripted();
  player.extra = { yaw: 0, pitch: 0, roll: 0 };
  player.gunState = 1; player.setWindow(1);
  ui.hideTexts(); ui.fade(0, 200);
  startPlay();
}

function startPlay() {
  G.state = 'play'; G.mode = 'play'; G.auto = false;
  ui.show('btnSkip', false);
  ui.big(TEXT.start, 1500, 'start');
  ui.show(isTouch ? 'controls' : 'keysHint', true);
  input.enabled = true; input.clear();
  audio.startTension();
}

// ---------- 規則 ----------
function onCutSuccess(e) {
  if (e.scripted || G.state !== 'play') return;
  G.cuts++;
  e.successT = 2.2;
  ui.toast(G.cuts === 2 ? TEXT.cutTaunt2 : TEXT.cutTaunt, 2600);
  ui.flash('rgba(160,0,0,0.45)', 350);
  audio.taunt();
  if (G.cuts >= CFG.MAX_CUTS) endingC();
}

function idmPlayer(v, gap, dv) {
  const a = 1.6, b = 2.6, ss = 2.4 + Math.max(0, v * 1.2 + v * dv / (2 * Math.sqrt(a * b)));
  return a * (1 - Math.pow(v / 11, 4) - Math.pow(ss / Math.max(gap, 0.1), 2));
}

function physics(dt) {
  const P = player;
  const F0 = traffic.frontOf(P);
  if (G.state === 'play') {
    let a = input.brake ? -CFG.BRAKE : input.gas ? CFG.ACC : -CFG.COAST;
    if (input.brake && !G.wasBrake && P.v > 2.5) audio.brake();
    G.wasBrake = input.brake;
    P.v = clamp(P.v + a * dt, 0, CFG.MAX_V);
  } else if (G.stopCar) {
    P.v = Math.max(0, P.v - 4.5 * dt);
  } else if (G.auto) {
    const gap = F0 ? F0.s - P.s - CFG.L : 999;
    P.v = clamp(P.v + clamp(idmPlayer(P.v, gap, F0 ? P.v - F0.v : 0), -8, 2) * dt, 0, 14);
  }
  P.s += P.v * dt;
  const ctx = { P, mode: G.mode, hard: G.hard, remaining: CFG.EXIT_S - P.s, push: false };
  traffic.update(dt, ctx);
  if (ctx.push) { audio.scrape(); P.shakeAmp = Math.max(P.shakeAmp, 0.035); }
  const F = traffic.frontOf(P);
  if (F) {
    const gap = F.s - P.s - CFG.L;
    if (gap < 0.05) {
      if (G.state === 'play' && !(F.graceT > 0) && G.crashCD <= 0) {
        G.crashes++;
        if (G.crashes >= CFG.MAX_CRASH) endingD(F);
        else {
          audio.crash(); ui.flash('#fff', 140); P.shakeAmp = 0.22;
          P.s = F.s - CFG.L - 0.8; P.v = 0; F.tap = 0;
          ui.toast(TEXT.crash[G.crashes - 1], 2800);
          setTimeout(() => audio.horn(0.9, 0.28), 350);
          G.crashCD = 1.5;
        }
      }
      else { P.s = F.s - CFG.L - 0.1; P.v = Math.min(P.v, F.v); if (G.state === 'play') audio.scrape(); }
    }
  }
  P.updatePose();
  if (G.crashCD > 0) G.crashCD -= dt;
  if (G.state !== 'play') return;
  const remaining = CFG.EXIT_S - P.s;
  // 車距過大
  G.farCD -= dt;
  const Fn = traffic.frontOf(P);
  const gap = Fn ? Fn.s - P.s - CFG.L : 0;
  if (Fn && gap > CFG.GAP_FAR && remaining > 90 && Fn.s < CFG.EXIT_S) {
    G.farT += dt;
    if (G.farT > 1.5 && G.farCD <= 0) { ui.toast(TEXT.farTaunt, 2600); audio.taunt(); G.farCD = 8; G.farT = 0; }
  } else G.farT = 0;
  G.warn = !!(Fn && gap < 3.2 && P.v > Fn.v + 0.8);
  // 最後 300 公尺
  if (!G.hard && remaining <= CFG.HARD) {
    G.hard = true; ui.big(TEXT.hard + '！', 1800, 'hard'); audio.setHard(true); audio.horn(0.2, 0.08);
  }
  // 導航語音：每 100 公尺提示一次
  if (G.navNext && remaining <= G.navNext) {
    const zh = ['', '一', '兩', '三', '四', '五', '六', '七', '八', '九'][G.navNext / 100];
    // 只有開場（1 公里）和 300 公尺念完整句子，其他只報距離
    audio.navVoice(G.navNext === 300 ? '下交流道，剩三百公尺，請靠右行駛。' : `${zh}百公尺。`);
    G.navNext -= 100;
  }
  if (P.s >= CFG.EXIT_S) endingWin();
}

// ---------- 射擊 ----------
const ray = new THREE.Raycaster();
function fire() {
  if (G.fireCD > 0) return;
  if (G.grenade) { throwGrenade(); return; }
  G.fireCD = CFG.FIRE_CD;
  const ndc = input.ndc();
  ray.setFromCamera(ndc, camera); ray.far = 90;
  const hits = ray.intersectObjects(traffic.targets(player), false);
  cockpit.fire(G.laser);
  player.shakeAmp = Math.max(player.shakeAmp, 0.018);
  if (G.laser) audio.laser(); else audio.shot();
  let point = ray.ray.at(60, new THREE.Vector3());
  if (hits.length) {
    const h = hits[0]; point = h.point;
    if (h.object.userData.isHead) {
      const e = h.object.userData.car.ent;
      if (e) { traffic.kill(e); e.failT = 2.8; }
      audio.splat();
      ui.pow(input.aim.x, input.aim.y, G.laser);
      ui.closeup(G.laser ? HS_L : HS_P, G.laser ? 'laser' : '');
      if (G.laser) { ui.flash('rgba(120,255,255,0.35)', 200); }
    } else { audio.ding(); ui.spark(input.aim.x, input.aim.y); }
  }
  const mz = new THREE.Vector3((cockpit.muzzleX / innerWidth) * 2 - 1, -(cockpit.muzzleY / innerHeight) * 2 + 1, 0.5).unproject(camera);
  const m = camera.position.clone().add(mz.sub(camera.position).normalize().multiplyScalar(0.6));
  if (G.laser) {
    showBeam(m, point);
    world.flashLight.position.copy(point); world.flashLight.color.set(0x7ff6ff); world.flashLight.intensity = 60;
  } else {
    world.flashLight.position.copy(m); world.flashLight.color.set(0xffc070); world.flashLight.intensity = 25;
  }
}

// ---------- 手榴彈 ----------
const grenades = [], booms = [];
let grenadeGeo = null, boomMat = null;
function grenadeMesh() {
  if (!grenadeGeo) grenadeGeo = () => mergedGroup([
    part(new THREE.SphereGeometry(0.075, 10, 8), [0, 0, 0], null, 0x4f5c36),
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8), [0, 0.085, 0], null, 0x8a8f94),
    part(new THREE.BoxGeometry(0.02, 0.1, 0.02), [0.04, 0.05, 0], [0, 0, -0.3], 0x8a8f94),
  ], 0.008);
  return grenadeGeo();
}
function boomSprite() {
  if (!boomMat) {
    const t = canvasTex(256, 256, (c, w, h) => {
      const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.3, 'rgba(255,200,60,1)'); g.addColorStop(0.6, 'rgba(255,90,0,0.85)'); g.addColorStop(1, 'rgba(60,20,0,0)');
      c.fillStyle = g; c.beginPath();
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = i % 2 ? 70 : 128; c.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); }
      c.fill();
    });
    boomMat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  }
  const sp = new THREE.Sprite(boomMat.clone());
  return sp;
}
const ARC_H = 1.6;
function grenadeAim() {
  ray.setFromCamera(input.ndc(), camera); ray.far = 60;
  const hits = ray.intersectObjects(traffic.targets(player), false);
  let to;
  if (hits.length) to = hits[0].point.clone();
  else { // 沒打到車：落在準星方向的地面（最遠 30 公尺）
    const d = ray.ray.direction;
    const tg = d.y < -0.01 ? Math.min(30, (camera.position.y - 0.3) / -d.y) : 22;
    to = ray.ray.at(tg, new THREE.Vector3());
  }
  to.y = Math.max(0.3, Math.min(to.y, 1.2));
  const fwd = new THREE.Vector3(0.12, -0.12, -1).applyQuaternion(camera.quaternion);
  const from = camera.position.clone().add(fwd.multiplyScalar(0.5));
  return { from, to };
}
function arcPoint(from, to, k, out) {
  out.lerpVectors(from, to, k);
  out.y += 4 * ARC_H * k * (1 - k);
  return out;
}
// 瞄準時的拋物線預覽與爆炸範圍
let aimDots = null, aimRing = null;
function makeAimGuide() {
  const N = 26;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  const dot = canvasTex(32, 32, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(16, 16, 11, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#000'; c.lineWidth = 4; c.stroke(); });
  aimDots = new THREE.Points(g, new THREE.PointsMaterial({ map: dot, size: 11, sizeAttenuation: false, transparent: true, depthTest: false, color: 0xffb070 }));
  aimDots.renderOrder = 20; aimDots.frustumCulled = false; aimDots.visible = false;
  const rg = new THREE.RingGeometry(7.1, 7.5, 48); rg.rotateX(-Math.PI / 2);
  aimRing = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
  const inner = new THREE.Mesh(new THREE.CircleGeometry(7.1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.12, depthWrite: false }));
  aimRing.add(inner);
  aimRing.visible = false;
  scene.add(aimDots, aimRing);
}
function updateAimGuide() {
  if (!aimDots) makeAimGuide();
  const on = G.state === 'play' && G.grenade && player.peekT > 0.75;
  aimDots.visible = aimRing.visible = on;
  if (!on) return;
  const { from, to } = grenadeAim();
  const pos = aimDots.geometry.attributes.position, v = new THREE.Vector3();
  const N = pos.count;
  for (let i = 0; i < N; i++) { arcPoint(from, to, (i + 1) / N, v); pos.setXYZ(i, v.x, v.y, v.z); }
  pos.needsUpdate = true;
  aimRing.position.set(to.x, 0.06, to.z);
  const ready = G.fireCD <= 0;
  aimDots.material.color.set(ready ? 0xffb070 : 0x777777);
  aimRing.material.opacity = ready ? 0.75 : 0.3;
}
function throwGrenade() {
  G.fireCD = 1.3;
  const { from, to } = grenadeAim();
  const m = grenadeMesh(); m.position.copy(from); scene.add(m);
  grenades.push({ m, from, to, t: 0, dur: clamp(from.distanceTo(to) / 20, 0.45, 0.9), trail: [] });
  cockpit.fire('grenade'); audio.whoosh();
}
function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.t += dt / g.dur;
    const k = Math.min(1, g.t);
    arcPoint(g.from, g.to, k, g.m.position);
    if (!g.trailObj) {
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(40 * 3), 3));
      g.trailObj = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
      g.trailObj.frustumCulled = false; scene.add(g.trailObj);
    }
    { const tp = g.trailObj.geometry.attributes.position, v = new THREE.Vector3(), N = tp.count;
      for (let j = 0; j < N; j++) { arcPoint(g.from, g.to, Math.max(0, k - 0.35 + 0.35 * j / (N - 1)), v); tp.setXYZ(j, v.x, v.y, v.z); }
      tp.needsUpdate = true; }
    g.m.rotation.x += dt * 14; g.m.rotation.z += dt * 9;
    if (k >= 1) { scene.remove(g.m); if (g.trailObj) scene.remove(g.trailObj); grenades.splice(i, 1); explode(g.to); }
  }
  for (let i = booms.length - 1; i >= 0; i--) {
    const b = booms[i];
    b.t += dt;
    const k = b.t / 0.7;
    b.sp.scale.setScalar(2 + 10 * Math.min(1, k * 2.5));
    b.sp.material.opacity = Math.max(0, 1 - k);
    if (k >= 1) { scene.remove(b.sp); booms.splice(i, 1); }
  }
}
function explode(p) {
  audio.boom();
  const sp = boomSprite(); sp.position.copy(p); sp.position.y += 0.8; scene.add(sp);
  booms.push({ sp, t: 0 });
  world.flashLight.position.copy(p); world.flashLight.position.y += 1; world.flashLight.color.set(0xff8a30); world.flashLight.intensity = 160;
  player.shakeAmp = Math.max(player.shakeAmp, 0.3);
  let n = 0;
  for (const e of traffic.active()) {
    const c = e.car.group.position;
    // 車身（4.4×1.8 公尺的長方形）任何一部分碰到爆炸圈就算炸到
    const yaw = e.car.group.rotation.y, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const dx = p.x - c.x, dz = p.z - c.z;
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    const qx = Math.max(Math.abs(lx) - CFG.W / 2, 0), qz = Math.max(Math.abs(lz) - CFG.L / 2, 0);
    if (Math.hypot(qx, qz) <= 7.5) {
      traffic.kill(e); e.failT = 2.8; e.boom = 0; e.car.setColor(0x1c1a19); n++;
      const away = new THREE.Vector3(c.x - p.x, 0, c.z - p.z); if (away.lengthSq() < 0.01) away.set(-1, 0, 0); away.normalize();
      debris.burst(c, away);
    }
  }
  const v = p.clone().project(camera);
  if (v.z < 1) ui.pow((v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, 'boom');
  ui.flash('rgba(255,150,40,0.45)', 260);
  if (n && HS_G.length) ui.closeup(HS_G, 'boom');
}

function autoAim() {
  const act = traffic.active().filter((e) => e.state !== 'approach' || Math.abs(e.s - player.s) < 12);
  if (!act.length) return;
  const v = new THREE.Vector3();
  act[0].car.hitbox.getWorldPosition(v); v.project(camera);
  if (v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.9) {
    input.aim.x = (v.x + 1) / 2 * innerWidth; input.aim.y = (1 - v.y) / 2 * innerHeight;
  }
}

// ---------- 結局 C：被插隊三次 ----------
function enterScene() {
  G.state = 'scene'; G.mode = 'scene';
  player.gunState = 0;
  input.enabled = false; player.peeking = false;
  ui.bw(false); audio.muffle(false); ui.warn(false);
  ui.show('controls', false); ui.show('keysHint', false); ui.crosshair(false);
  audio.stopMusic();
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

async function endingC() {
  if (G.state !== 'play') return;
  enterScene(); audio.stopBgm(1.5);
  G.stopCar = true; traffic.frozen = true;
  await wait(1.3);
  audio.horn(1.3, 0.3); await wait(1.6);
  audio.horn(0.22, 0.3); await wait(0.32); audio.horn(0.22, 0.3); await wait(0.5);
  const O = player.override = { pos: V(-0.37, 1.17, 0.12), yaw: 0, pitch: -0.05, roll: 0 };
  ui.show('hud', false);
  // 轉頭看車門
  await tween(0.6, (k) => { O.yaw = 0.9 * k; });
  await wait(0.3);
  // 車門被拉開，後車駕駛站在外面（GPT 圖）
  audio.doorOpen();
  if (hasDoorImg) { ui.panel('assets/door_open.jpg', true, true); }
  audio.heartbeat(2);
  await wait(1.5);
  // 一拳：大震動 → 全黑
  audio.punch(); player.shakeAmp = 0.35;
  ui.el.panel.classList.add('shake');
  await wait(0.25);
  ui.fade(1, 0); ui.panel('', false, true); ui.el.panel.classList.remove('shake');
  audio.thud(1);
  await wait(1.0);
  // 倒在地上的視角
  await ui.panel('assets/end_c.jpg', true, true);
  ui.fade(0, 0);
  await wait(2.6);
  ui.fade(1, 250); await wait(0.45); ui.panel('', false);
  audio.sting(); audio.stopDrive();
  ui.end(TEXT.endC, `被插隊 ${G.cuts} 次`, '重新開始');
}

// ---------- 結局 D：撞到前車 ----------
async function endingD(F) {
  if (G.state !== 'play') return;
  enterScene(); audio.stopBgm(0.4);
  audio.crash(); ui.flash('#fff', 160); player.shakeAmp = 0.3;
  player.v = 0; G.stopCar = true; traffic.frozen = true;
  F.frozen = true; F.v = 0; F.brake = true; F.tap = 0;
  const s0 = F.s;
  tween(0.8, (k) => { F.s = s0 + 2.4 * k; }, (k) => 1 - (1 - k) * (1 - k));
  ui.show('hud', false);
  await wait(1.1);
  const door = mergedGroup([part(new THREE.BoxGeometry(0.06, 0.5, 1.05), [0, 0, 0.52], null, F.car.color)], 0.02);
  door.position.set(-0.92, 0.66, -0.78);
  F.car.group.add(door); F.car.extraDoor = door;
  audio.doorOpen();
  await tween(0.5, (k) => { door.rotation.y = -1.05 * k; });
  const O = player.override = { pos: V(-0.37, 1.17, 0.12), yaw: 0, pitch: -0.05, roll: 0 };
  const dz = -(F.s - player.s);
  const T = thugSprite;
  player.group.add(T);
  // 壯漢從前車駕駛座車門下車，站在門邊
  const st = V(-1.45, 0, dz - 0.35);
  const inCar = V(-1.0, 0, dz - 0.35);
  T.position.copy(inCar);
  T.userData.frame(1);
  T.material.opacity = 0;
  audio.heartbeat(3);
  await tween(0.55, (k) => { T.position.lerpVectors(inCar, st, k); T.material.opacity = Math.min(1, k * 2); }, (k) => 1 - (1 - k) * (1 - k));
  audio.step();
  const hx = st.x - O.pos.x, hz = st.z - O.pos.z;
  await tween(0.6, (k) => { O.yaw = Math.atan2(-hx, -hz) * 0.5 * k; O.pitch = -0.05 + 0.06 * k; });
  await wait(0.9);
  // 直接切到壯漢站在你車前的畫面
  audio.thud(0.8);
  ui.flash('#000', 160);
  ui.panel('assets/end_d.jpg', true, true);
  await wait(2.6);
  ui.fade(1, 0); ui.panel('', false);
  audio.sting(); audio.stopDrive();
  ui.end(TEXT.endD, '', '重新開始');
}

// ---------- 勝利 ----------
async function endingWin() {
  if (G.state !== 'play') return;
  enterScene();
  G.auto = true; traffic.frozen = true;
  ui.show('hud', false);
  audio.victory();
  saveCleared();
  await wait(5);
  ui.panel('assets/end_win.jpg', true);
  await wait(3);
  ui.fade(1, 1200); await wait(1.4); ui.panel('', false);
  audio.stopDrive();
  const cl = loadClears();
  const unlockMsg = cl === 1 ? '解鎖：雷射槍（回選單可選）' : cl === GRENADE_CLEARS ? '解鎖：手榴彈！（回選單可選）' : cl < GRENADE_CLEARS ? `通關 ${cl} 次。再通關 ${GRENADE_CLEARS - cl} 次解鎖手榴彈` : `通關 ${cl} 次`;
  ui.end(TEXT.win1, '', '', 'win nobtn');
  await wait(2.4);
  ui.el.endSub.innerHTML = `<div class="news">${TEXT.winNews}</div>`;
  await wait(2.8);
  ui.el.endSub.innerHTML = `<div class="news">${TEXT.winNews}</div><div class="clear">${TEXT.win2}</div><div class="unlock">${unlockMsg}</div>`;
  ui.el.btnRestart.textContent = '回選單（可選雷射槍）';
  ui.el.end.className = 'win';
}

// ---------- 迴圈 ----------
const STEP = 1 / 60;
let acc = 0, last = performance.now();
const tagV = new THREE.Vector3();

function handlePeek(dtR) {
  const want = G.state === 'play' && input.peek;
  if (want && !G.wasPeek) {
    if (G.clock - G.lastSlow > 2.5) { G.slowT = 0; G.lastSlow = G.clock; }
    audio.heartbeat(4); audio.muffle(true); ui.bw(true);
    G.assistDone = false;
  }
  if (!want && G.wasPeek) { audio.muffle(false); ui.bw(false); if (G.slowT < 2.3) G.slowT = 2.3; }
  G.wasPeek = want;
  player.peeking = want;
  document.body.classList.toggle('peek', want);
  if (want && isTouch && !G.assistDone && player.peekT > 0.97) { G.assistDone = true; autoAim(); }
  G.slowT += dtR;
  const t = G.slowT;
  G.timeScale = t < 0.3 ? lerp(1, 0.08, t / 0.3) : t < 2.3 ? 0.08 : t < 2.8 ? lerp(0.08, 1, (t - 2.3) / 0.5) : 1;
}

function updateTags() {
  const list = [];
  const W = innerWidth, H = innerHeight;
  for (const e of traffic.ents) {
    let text = null, cls = '';
    if (e.role === 'cutter' && (e.state === 'signal' || e.state === 'cutting')) { text = '插隊中！'; cls = 'cutting'; }
    else if (e.state === 'shot' && e.failT > 0) { text = '插隊失敗'; cls = 'fail'; }
    else if (e.successT > 0) { text = '插隊成功'; cls = 'ok'; }
    if (e.failT > 0) e.failT -= 1 / 60;
    if (e.successT > 0) e.successT -= 1 / 60;
    if (!text || e.scripted) continue;
    tagV.copy(e.car.group.position); tagV.y = 2.0; tagV.project(camera);
    if (tagV.z > 1 || Math.abs(tagV.x) > 1.1 || Math.abs(tagV.y) > 1.1) continue;
    list.push({ id: e.id, text, cls, x: (tagV.x + 1) / 2 * W, y: (1 - tagV.y) / 2 * H });
  }
  ui.tags(list);
}

const portrait = matchMedia('(orientation: portrait)');
function frame(now) {
  requestAnimationFrame(frame);
  const dtR = Math.min(0.1, (now - last) / 1000); last = now;
  if (G.state === 'loading') return;
  if (G.paused || (isTouch && portrait.matches && G.state !== 'title')) return;
  G.clock += dtR;
  handlePeek(dtR);
  tickTimers(dtR);
  const dt = dtR * G.timeScale;
  if (G.state === 'opening' || G.state === 'play' || G.state === 'scene') {
    acc += dt; let n = 0;
    while (acc >= STEP && n < 8) { physics(STEP); acc -= STEP; n++; }
    updateGrenades(dt);
    debris.update(dt, -player.s);
    if (n >= 8) acc = 0;
  } else if (G.state === 'title') {
    // 標題畫面背景：車子緩慢前進
    player.s += 0; player.updatePose();
  }
  G.fireCD -= dtR;
  if (G.state === 'play' && input.consumeFire() && player.peekT > 0.75) fire(); else if (G.state !== 'play') input.clear();
  if (G.flashT > 0) { G.flashT -= dtR; if (G.flashT <= 0) player.muzzleFlash(false); }
  if (beam.visible) {
    beam.userData.t -= dtR;
    const o = Math.max(0, beam.userData.t / 0.18);
    beam.userData.core.material.opacity = o; beam.userData.glow.material.opacity = 0.45 * o;
    if (beam.userData.t <= 0) beam.visible = false;
  }
  world.flashLight.intensity *= Math.pow(0.0005, dtR);
  const ndc = input.ndc();
  player.updateCamera(dtR, player.peekT > 0 ? ndc : { x: 0, y: 0 });
  updateAimGuide();
  world.update(camera);
  {
    const lastV = G.lastV;
    const O = player.override;
    const e = smooth(player.peekT);
    cockpit.update(dtR, {
      e: O ? 0 : e,
      out: O ? clamp((-0.37 - O.pos.x) / 0.9, 0, 1) : 0,
      yaw: O ? O.yaw : player.extra.yaw,
      pitch: O ? O.pitch + 0.05 : player.extra.pitch,
      roll: O ? O.roll : player.extra.roll,
      shake: player.shakeAmp, fov: camera.fov, gunShow: player.gunShow, aim: input.aim,
      kmh: player.v * 3.6, accel: (player.v - (G.lastV ?? player.v)) / Math.max(dtR, 1e-3),
    });
    G.lastV = player.v;
  }
  if (G.state === 'play') {
    ui.hud(Math.min(1000, CFG.EXIT_S - player.s), player.v * 3.6, G.cuts, CFG.MAX_CUTS, G.crashes, CFG.MAX_CRASH);
    ui.crosshair(player.peekT > 0.6, input.aim.x, input.aim.y);
    updateTags();
  } else if (G.state !== 'opening') ui.tags([]);
  audio.setSpeed(player.v, G.state === 'play' && input.gas);
  audio.updateMusic();
  player.renderMirror(scene, isTouch ? 3 : 2);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ---------- 按鈕、暫停 ----------
document.getElementById('btnStart').addEventListener('click', () => { if (G.state === 'title') startGame(); });
ui.el.btnSkip.addEventListener('click', skipOpening);
ui.el.btnRestart.addEventListener('click', () => {
  refreshTitle();
  ui.hideEnd();
  if (G.unlocked) { // 已解鎖雷射槍：回開始選單選武器
    resetGame(); ui.fade(0, 0); G.state = 'title'; ui.show('title', true); return;
  }
  resetGame();
  audio.startDrive();
  opening();
});
document.getElementById('btnClear').addEventListener('click', () => { clearSave(); refreshTitle(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (G.state === 'play' || G.state === 'opening' || G.state === 'scene') { G.paused = true; ui.show('pause', true); }
    audio.suspend();
  } else if (!G.paused) audio.resume();
});
ui.el.pause.addEventListener('pointerdown', () => {
  G.paused = false; ui.show('pause', false); audio.resume(); last = performance.now(); input.clear();
});
