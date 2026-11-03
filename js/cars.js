// 程式化低多邊形汽車：漫畫描邊、方向燈、煞車燈、黑色剪影駕駛、墨水噴濺
import * as THREE from 'three';
import { part, beam, mergeParts, VCMAT, OUTLINE, radialTex } from './toon.js';
import { CFG, rand } from './config.js';

export const CAR_COLORS = [0x8d9299, 0x5c6672, 0xa39886, 0x3f4852, 0x6f3434, 0xc8c4b9, 0x4a564d, 0x2e2e31, 0x7d6b58, 0x9a9b97];

const GLASS = new THREE.MeshBasicMaterial({ color: 0x18202b, transparent: true, opacity: 0.5, depthWrite: false });
export const TAIL_OFF = new THREE.MeshBasicMaterial({ color: 0x9a2018 });
export const TAIL_ON = new THREE.MeshBasicMaterial({ color: 0xff3b26 });
const BLINK = new THREE.MeshBasicMaterial({ color: 0xffa81c });
const DRIVER = new THREE.MeshBasicMaterial({ color: 0x050505 });
const HIT = new THREE.MeshBasicMaterial({ visible: false });
export const INK = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.05 });
const SHADOW = new THREE.MeshBasicMaterial({ map: radialTex('rgba(0,0,0,0.6)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false });
let GLOW_MAT = null;
function glowMat() {
  if (!GLOW_MAT) GLOW_MAT = new THREE.SpriteMaterial({ map: radialTex('rgba(255,170,40,0.95)', 'rgba(255,120,0,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  return GLOW_MAT;
}
export function setInkTexture(t) { INK.map = t; INK.needsUpdate = true; }

function cabinGeo() {
  const g = new THREE.BoxGeometry(1.62, 0.56, 2.3);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > 0) {
      const z = p.getZ(i);
      p.setZ(i, z < 0 ? z + 0.5 : z - 0.35);
      p.setX(i, p.getX(i) * 0.88);
    }
  }
  g.computeVertexNormals();
  g.translate(0, 1.14, 0.2);
  return g;
}

function bodyParts(color) {
  const trim = 0x2f2f31, tire = 0x141414;
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const ps = [
    part(B(1.8, 0.6, 4.4), [0, 0.57, 0], null, color),
    part(B(1.84, 0.17, 0.16), [0, 0.37, -2.2], null, trim),
    part(B(1.84, 0.17, 0.16), [0, 0.37, 2.2], null, trim),
    part(B(1.44, 0.07, 1.48), [0, 1.44, 0.275], null, color),
    part(B(0.22, 0.13, 0.13), [-1.0, 1.0, -0.72], null, color),
    part(B(0.22, 0.13, 0.13), [1.0, 1.0, -0.72], null, color),
    part(B(0.42, 0.13, 0.04), [-0.58, 0.68, -2.205], null, 0xd8d0ac, false),
    part(B(0.42, 0.13, 0.04), [0.58, 0.68, -2.205], null, 0xd8d0ac, false),
    part(B(0.5, 0.14, 0.03), [0, 0.5, 2.225], null, 0xd6d6cc, false),
    part(B(0.5, 0.14, 0.03), [0, 0.42, -2.29], null, 0xd6d6cc, false),
    part(B(1.82, 0.05, 4.2), [0, 0.86, 0], null, trim, false),
  ];
  for (const x of [-0.8, 0.8]) for (const z of [-1.38, 1.38])
    ps.push(part(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12), [x, 0.33, z], [0, 0, Math.PI / 2], tire));
  for (const s of [-1, 1]) {
    ps.push(beam([s * 0.79, 0.87, -0.95], [s * 0.71, 1.43, -0.45], 0.08, color));
    ps.push(beam([s * 0.8, 0.87, 0.25], [s * 0.71, 1.43, 0.25], 0.08, color));
    ps.push(beam([s * 0.79, 0.87, 1.35], [s * 0.71, 1.43, 1.0], 0.08, color));
  }
  return ps;
}

// 玩家車：車身挖空（只有引擎蓋、後車廂、兩側、地板），從駕駛座看出去才不會被車身頂面擋住
export function playerBodyGeo(color) {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const ps = bodyParts(color).slice(1).filter((p, i) => i !== 9);
  ps.push(
    part(B(1.8, 0.6, 1.25), [0, 0.57, -1.575], null, color),
    part(B(1.8, 0.6, 0.85), [0, 0.57, 1.775], null, color),
    part(B(0.08, 0.6, 2.3), [-0.86, 0.57, 0.2], null, color),
    part(B(0.08, 0.6, 2.3), [0.86, 0.57, 0.2], null, color),
    part(B(1.8, 0.05, 2.3), [0, 0.3, 0.2], null, 0x222222, false),
  );
  return mergeParts(ps, 0.035);
}

const geoCache = new Map();
function carGeo(color) {
  if (!geoCache.has(color)) geoCache.set(color, mergeParts(bodyParts(color), 0.035));
  return geoCache.get(color);
}

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const B = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  const merge = (gs) => mergeParts(gs.map((g) => ({ geo: g, matrix: new THREE.Matrix4(), color: 0xffffff, outline: false }))).geo;
  const blink = (s) => merge([
    B(0.16, 0.1, 0.05, s * 0.72, 0.66, -2.215),
    B(0.13, 0.15, 0.05, s * 0.84, 0.72, 2.225),
    B(0.23, 0.045, 0.14, s * 1.0, 0.94, -0.72),
    B(0.03, 0.06, 0.16, s * 0.905, 0.66, -1.75),
  ]);
  const drv = mergeParts([
    part(new THREE.BoxGeometry(0.44, 0.55, 0.26), [0, 0.33, 0], null, 0, false),
    part(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 6), [0, 0.65, 0], null, 0, false),
    part(new THREE.SphereGeometry(0.13, 10, 8), [0, 0.78, -0.02], null, 0, false),
    beam([-0.21, 0.5, 0], [-0.17, 0.42, -0.44], 0.09, 0, false),
    beam([0.21, 0.5, 0], [0.17, 0.42, -0.44], 0.09, 0, false),
  ]).geo;
  const ink1 = new THREE.PlaneGeometry(1.25, 0.7); // 擋風玻璃
  const ink2 = new THREE.PlaneGeometry(1.5, 0.48); // 右側車窗
  SHARED = {
    cabin: cabinGeo(),
    tail: merge([B(0.42, 0.14, 0.04, -0.6, 0.72, 2.205), B(0.42, 0.14, 0.04, 0.6, 0.72, 2.205)]),
    blinkL: blink(-1), blinkR: blink(1), drv, ink1, ink2,
    hit: new THREE.SphereGeometry(0.3, 8, 6),
    shadow: (() => { const g = new THREE.PlaneGeometry(2.4, 5.2); g.rotateX(-Math.PI / 2); g.translate(0, 0.03, 0); return g; })(),
  };
  return SHARED;
}

export class Car {
  constructor(color = CAR_COLORS[0]) {
    const S = shared();
    this.group = new THREE.Group();
    this.body = new THREE.Mesh(undefined, VCMAT);
    this.hull = new THREE.Mesh(undefined, OUTLINE);
    this.body.userData.car = this;
    this.group.add(this.body, this.hull);
    this.glass = new THREE.Mesh(S.cabin, GLASS);
    this.glass.renderOrder = 2;
    this.tail = new THREE.Mesh(S.tail, TAIL_OFF);
    this.blinkL = this.makeBlink(S.blinkL, -1);
    this.blinkR = this.makeBlink(S.blinkR, 1);
    this.driver = new THREE.Group();
    this.driver.position.set(-0.37, 0.5, 0.15);
    this.driverMesh = new THREE.Mesh(S.drv, DRIVER);
    this.hitbox = new THREE.Mesh(S.hit, HIT);
    this.hitbox.position.set(0, 0.78, -0.02);
    this.hitbox.userData.car = this;
    this.hitbox.userData.isHead = true;
    this.driver.add(this.driverMesh, this.hitbox);
    this.ink1 = new THREE.Mesh(S.ink1, INK);
    this.ink1.position.set(-0.15, 1.13, -0.68); this.ink1.rotation.x = 0.74;
    this.ink2 = new THREE.Mesh(S.ink2, INK);
    this.ink2.position.set(0.74, 1.12, 0.2); this.ink2.rotation.y = Math.PI / 2;
    this.shadow = new THREE.Mesh(S.shadow, SHADOW);
    this.group.add(this.glass, this.tail, this.blinkL, this.blinkR, this.driver, this.ink1, this.ink2, this.shadow);
    this.setColor(color);
    this.reset();
  }
  makeBlink(geo, s) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, BLINK));
    for (const p of [[s * 0.72, 0.66, -2.3], [s * 0.84, 0.72, 2.3], [s * 1.08, 0.94, -0.72]]) {
      const sp = new THREE.Sprite(glowMat());
      sp.position.set(p[0], p[1], p[2]); sp.scale.set(0.9, 0.9, 0.9);
      g.add(sp);
    }
    g.visible = false;
    return g;
  }
  setColor(c) {
    const g = carGeo(c);
    this.body.geometry = g.geo; this.hull.geometry = g.hull; this.color = c;
  }
  reset() {
    this.driver.visible = true;
    this.driver.rotation.set(0, 0, 0);
    this.driver.position.set(-0.37, 0.5, 0.15);
    this.ink1.visible = this.ink2.visible = false;
    this.ink1.scale.setScalar(1); this.ink2.scale.setScalar(1);
    this.blinkL.visible = this.blinkR.visible = false;
    this.tail.material = TAIL_OFF;
    this.fallT = -1;
    this.ent = null;
    this.group.visible = true;
    if (this.extraDoor) { this.group.remove(this.extraDoor); this.extraDoor = null; }
  }
  setBlink(l, r) { this.blinkL.visible = l; this.blinkR.visible = r; }
  setBrake(on) { this.tail.material = on ? TAIL_ON : TAIL_OFF; }
  shot() { this.fallT = 0; this.ink1.visible = this.ink2.visible = true; }
  update(dt) {
    if (this.fallT >= 0 && this.fallT < 1) {
      this.fallT = Math.min(1, this.fallT + dt * 2.2);
      const k = this.fallT;
      const e = 1 - Math.pow(1 - k, 3);
      this.driver.rotation.x = 1.15 * e;      // 向後倒
      this.driver.rotation.z = 0.25 * e;
      this.driver.position.y = 0.5 - 0.12 * e;
      const s = 0.2 + 0.8 * Math.min(1, k * 3);
      this.ink1.scale.setScalar(s); this.ink2.scale.setScalar(s);
    }
  }
}
