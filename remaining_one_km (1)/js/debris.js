// 手榴彈爆炸碎片：車門、輪胎、玻璃碎片，噴飛後彈跳、落在路面上
import * as THREE from 'three';
import { toon, OUTLINE } from './toon.js';
import { rand } from './config.js';

const G = 9.8;

export class Debris {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.doorGeo = new THREE.BoxGeometry(0.06, 0.55, 1.0);
    this.doorHull = new THREE.BoxGeometry(0.12, 0.61, 1.06);
    this.tireGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 12);
    this.tireHull = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
    this.glassGeo = new THREE.PlaneGeometry(0.2, 0.13);
    this.doorMat = toon(0x2a2726);
    this.tireMat = toon(0x151515);
    this.glassMat = new THREE.MeshBasicMaterial({ color: 0xd8eef5, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  }

  piece(geo, mat, hull, restY, restRot) {
    const m = new THREE.Mesh(geo, mat);
    if (hull) m.add(new THREE.Mesh(hull, OUTLINE));
    this.scene.add(m);
    return { m, restY, restRot, v: new THREE.Vector3(), w: new THREE.Vector3(), rest: false };
  }

  // pos：車子位置；away：從爆炸點指向車子的方向（碎片往外噴）
  burst(pos, away) {
    const add = (p, speed, up) => {
      p.m.position.set(pos.x + rand(-0.8, 0.8), rand(0.6, 1.3), pos.z + rand(-1.5, 1.5));
      p.v.set(away.x * speed + rand(-3, 3), rand(up[0], up[1]), away.z * speed + rand(-3, 3));
      p.w.set(rand(-10, 10), rand(-10, 10), rand(-10, 10));
      p.m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      this.list.push(p);
    };
    // 車門 1～2 片
    for (let i = 0; i < (Math.random() < 0.5 ? 1 : 2); i++)
      add(this.piece(this.doorGeo, this.doorMat, this.doorHull, 0.03, [0, rand(0, 6), Math.PI / 2]), rand(4, 8), [6, 10]);
    // 輪胎 2 顆
    for (let i = 0; i < 2; i++)
      add(this.piece(this.tireGeo, this.tireMat, this.tireHull, 0.12, [0, rand(0, 6), 0]), rand(5, 9), [5, 9]);
    // 玻璃碎片
    for (let i = 0; i < 14; i++)
      add(this.piece(this.glassGeo, this.glassMat, null, 0.015, [-Math.PI / 2, 0, rand(0, 6)]), rand(3, 9), [3, 8]);
  }

  update(dt, playerZ) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i], m = p.m;
      if (!p.rest) {
        p.v.y -= G * dt;
        m.position.addScaledVector(p.v, dt);
        m.rotation.x += p.w.x * dt; m.rotation.y += p.w.y * dt; m.rotation.z += p.w.z * dt;
        if (m.position.y <= p.restY + 0.05 && p.v.y < 0) {
          m.position.y = p.restY + 0.05;
          p.v.y = -p.v.y * 0.35;
          p.v.x *= 0.55; p.v.z *= 0.55;
          p.w.multiplyScalar(0.5);
          if (p.v.length() < 1.2) { // 停下來，平躺在路面上
            p.rest = true;
            m.position.y = p.restY;
            m.rotation.set(p.restRot[0], p.restRot[1], p.restRot[2]);
          }
        }
      }
      if (m.position.z > playerZ + 90) { this.scene.remove(m); this.list.splice(i, 1); }
    }
  }

  clear() {
    for (const p of this.list) this.scene.remove(p.m);
    this.list.length = 0;
  }
}
