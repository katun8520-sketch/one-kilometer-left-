// 人物與道具：8+9 壯漢、後車駕駛、彌勒佛、手槍、雷射槍、拳頭
import * as THREE from 'three';
import { part, beam, mergedGroup, toon, OUTLINE } from './toon.js';

const SKIN = 0xb5876a;

// kind: 'big'（8+9 壯漢）或 'rear'（後車駕駛）。人物面向 -Z
export function makeThug(kind) {
  const big = kind === 'big';
  const top = big ? 0xdcd8ce : 0x3b4048, bottom = big ? 0x7b705c : 0x26272a, shoe = big ? 0x2f4f8f : 0x1b1b1b;
  const k = big ? 1 : 0.68;
  const root = new THREE.Group();
  const upper = new THREE.Group();
  upper.position.y = 0.72;
  const U = [
    part(new THREE.BoxGeometry(0.85 * k + 0.1, 0.75, 0.5 * k + 0.08), [0, 0.62, 0], null, top),
    part(new THREE.SphereGeometry(0.42 * k + 0.05, 10, 8), [0, 0.5, -0.06], null, top),       // 肚子
    part(new THREE.BoxGeometry(0.8 * k + 0.1, 0.36, 0.48 * k + 0.08), [0, 0.12, 0], null, bottom), // 短褲
    part(new THREE.SphereGeometry(0.22 * k + 0.03, 10, 8), [-(0.52 * k + 0.06), 0.9, 0], null, SKIN),
    part(new THREE.SphereGeometry(0.22 * k + 0.03, 10, 8), [(0.52 * k + 0.06), 0.9, 0], null, SKIN),
    part(new THREE.CylinderGeometry(0.12 * k + 0.02, 0.14 * k + 0.03, 0.18, 8), [0, 1.06, 0], null, SKIN),
    part(new THREE.SphereGeometry(0.15, 10, 8), [0, 1.23, 0], null, SKIN),
    part(new THREE.SphereGeometry(0.155, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 1.26, 0.01], null, 0x111111),
  ];
  for (const s of [-1, 1]) {
    const sx = s * (0.58 * k + 0.06);
    U.push(beam([sx, 0.88, 0], [s * (0.66 * k + 0.08), 0.48, -0.02], 0.34 * k + 0.04, SKIN, true, true));
    U.push(beam([s * (0.66 * k + 0.08), 0.48, -0.02], [s * (0.62 * k + 0.08), 0.1, -0.08], 0.3 * k + 0.04, SKIN, true, true));
    U.push(part(new THREE.SphereGeometry(0.13 * k + 0.02, 8, 6), [s * (0.62 * k + 0.08), 0.04, -0.08], null, SKIN));
  }
  const ug = mergedGroup(U, 0.03);
  upper.add(ug);
  if (big) {
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 18), toon(0xd8a933, { emissive: 0x3a2a00 }));
    chain.position.set(0, 0.98, -0.2); chain.rotation.x = 1.25;
    upper.add(chain);
  }
  root.add(upper);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * (0.22 * k + 0.04), 0.72, 0);
    leg.add(mergedGroup([
      beam([0, 0, 0], [0, -0.64, 0], 0.28 * k + 0.05, big ? SKIN : bottom, true, true),
      part(new THREE.BoxGeometry(0.2, 0.07, 0.34), [0, -0.68, -0.05], null, shoe),
    ], 0.025));
    root.add(leg); legs.push(leg);
  }
  root.userData = { upper, legs, walkT: 0 };
  return root;
}

export function walkPose(thug, t, amount = 1) {
  const { legs, upper } = thug.userData;
  legs[0].rotation.x = Math.sin(t * 7) * 0.5 * amount;
  legs[1].rotation.x = -Math.sin(t * 7) * 0.5 * amount;
  upper.position.y = 0.72 + Math.abs(Math.sin(t * 7)) * 0.05 * amount;
  upper.rotation.z = Math.sin(t * 7) * 0.05 * amount;
}

// 彌勒佛（儀表板擺飾）
export function makeBuddha() {
  const gold = 0xb88d3c, dark = 0x8a6424;
  const S = (r) => new THREE.SphereGeometry(r, 12, 10);
  const g = mergedGroup([
    part(new THREE.CylinderGeometry(0.075, 0.08, 0.02, 14), [0, 0.01, 0], null, 0x5a3a1c),       // 底座
    part(S(0.062), [0, 0.06, 0], null, gold),                                                   // 盤腿
    part(S(0.058), [0, 0.1, -0.008], null, gold),                                               // 大肚子
    part(S(0.045), [0, 0.135, 0.01], null, dark),                                               // 袍子
    part(S(0.036), [0, 0.185, 0], null, gold),                                                  // 頭
    part(S(0.012), [-0.034, 0.185, 0.002], null, gold),                                         // 大耳朵
    part(S(0.012), [0.034, 0.185, 0.002], null, gold),
    beam([-0.045, 0.14, 0], [-0.03, 0.2, -0.015], 0.018, gold, true, true),                     // 舉手
    part(S(0.014), [-0.028, 0.212, -0.015], null, gold),
    part(S(0.016), [0.045, 0.1, -0.03], null, 0xd4b04a),                                        // 元寶
  ], 0.004);
  // 笑臉
  const face = document.createElement('canvas'); face.width = face.height = 64;
  const c = face.getContext('2d');
  c.strokeStyle = '#2a1a08'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.arc(22, 26, 6, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  c.beginPath(); c.arc(42, 26, 6, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  c.fillStyle = '#2a1a08'; c.beginPath(); c.arc(32, 38, 12, 0, Math.PI); c.fill();
  const ft = new THREE.CanvasTexture(face); ft.colorSpace = THREE.SRGBColorSpace;
  const fm = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), new THREE.MeshBasicMaterial({ map: ft, transparent: true }));
  fm.position.set(0, 0.185, 0.037);
  g.add(fm);
  return g;
}

export function makePistol() {
  const g = new THREE.Group();
  const m = mergedGroup([
    part(new THREE.BoxGeometry(0.032, 0.034, 0.18), [0, 0.022, -0.04], null, 0x2a2a2d),
    part(new THREE.BoxGeometry(0.03, 0.024, 0.14), [0, -0.006, -0.03], null, 0x1c1c1e),
    part(new THREE.BoxGeometry(0.03, 0.11, 0.046), [0, -0.06, 0.035], [-0.28, 0, 0], 0x1c1c1e),
    part(new THREE.TorusGeometry(0.018, 0.004, 4, 10), [0, -0.024, -0.008], [0, Math.PI / 2, 0], 0x1c1c1e, false),
    part(new THREE.BoxGeometry(0.066, 0.07, 0.085), [0.004, -0.062, 0.04], null, 0xb08468),     // 手
    part(new THREE.CylinderGeometry(0.042, 0.05, 0.3, 8), [0.03, -0.12, 0.2], [1.15, 0, 0], 0x3a3532), // 袖子
  ], 0.005);
  g.add(m);
  g.userData.muzzle = new THREE.Vector3(0, 0.022, -0.135);
  return g;
}

export function makeLaserGun() {
  const g = new THREE.Group();
  const cyan = new THREE.MeshBasicMaterial({ color: 0x5ff4ff });
  const m = mergedGroup([
    part(new THREE.CylinderGeometry(0.03, 0.034, 0.17, 12), [0, 0.02, -0.04], [Math.PI / 2, 0, 0], 0xd3d7dc),
    part(new THREE.CylinderGeometry(0.045, 0.026, 0.05, 12), [0, 0.02, -0.14], [Math.PI / 2, 0, 0], 0xaeb5bd),
    part(new THREE.BoxGeometry(0.008, 0.04, 0.06), [0, 0.06, 0.0], null, 0xa7df4a),
    part(new THREE.BoxGeometry(0.03, 0.1, 0.044), [0, -0.05, 0.03], [-0.3, 0, 0], 0xd3d7dc),
    part(new THREE.SphereGeometry(0.022, 10, 8), [0, 0.055, 0.04], null, 0x7ff6ff),
    part(new THREE.BoxGeometry(0.066, 0.07, 0.085), [0.004, -0.058, 0.035], null, 0xb08468),
    part(new THREE.CylinderGeometry(0.042, 0.05, 0.3, 8), [0.03, -0.12, 0.2], [1.15, 0, 0], 0x3a3532),
  ], 0.005);
  g.add(m);
  for (const z of [-0.09, -0.05, -0.01]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 16), cyan);
    r.position.set(0, 0.02, z);
    g.add(r);
  }
  g.userData.muzzle = new THREE.Vector3(0, 0.02, -0.17);
  return g;
}

export function makeFist() {
  return mergedGroup([
    part(new THREE.BoxGeometry(0.16, 0.13, 0.13), [0, 0, 0], null, SKIN),
    part(new THREE.CylinderGeometry(0.06, 0.07, 0.4, 8), [0, -0.02, 0.25], [Math.PI / 2, 0, 0], 0x3b4048),
  ], 0.012);
}
