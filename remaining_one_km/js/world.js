// 台灣國道場景：路面標線、護欄、路燈、指示牌、交流道匝道、高架道路、城市遠景
import * as THREE from 'three';
import { toon, OUTLINE, part, mergedGroup, canvasTex } from './toon.js';
import { CFG, lane0Pose, rand } from './config.js';

const ROAD_L = -10.8, ROAD_R = 4.4; // 路面左右邊界 x
const PX = 34;                        // 每公尺像素（橫向）

function asphalt(g, w, h) {
  g.fillStyle = '#3d3e42'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const v = 40 + Math.random() * 30 | 0;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  g.strokeStyle = 'rgba(20,20,22,0.35)'; g.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) { // 漫畫手繪裂痕
    let x = Math.random() * w, y = Math.random() * h;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += rand(-14, 14); y += rand(-24, 24); g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(25,25,28,0.18)'; g.fillRect(Math.random() * w, Math.random() * h, rand(30, 120), rand(20, 80)); }
}

function roadTexture(left, right, lines) {
  const wm = right - left;
  const w = Math.round(wm * PX), h = 512; // 縱向 10 公尺
  const t = canvasTex(w, h, (g) => {
    asphalt(g, w, h);
    const X = (x) => (x - left) * PX;
    for (const L of lines) {
      g.fillStyle = L.c;
      const lw = 0.16 * PX;
      if (L.dash) g.fillRect(X(L.x) - lw / 2, 0, lw, h * 0.4);
      else g.fillRect(X(L.x) - lw / 2, 0, lw, h);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let i = 0; i < 30; i++) g.fillRect(X(L.x) - lw / 2 + Math.random() * lw, Math.random() * h * (L.dash ? 0.4 : 1), 2, 3);
    }
  });
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
}

function signTexture(lines, arrow, w = 768, h = 256) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = '#1d6a44'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2f2ec'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#f4f4ee'; g.textBaseline = 'middle';
    g.font = `900 ${h * 0.42}px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif`;
    g.fillText(lines, 40, h / 2 + 4);
    if (arrow) {
      g.save(); g.translate(w - 90, h / 2); g.rotate(-Math.PI / 4);
      g.fillRect(-46, -9, 70, 18);
      g.beginPath(); g.moveTo(46, 0); g.lineTo(14, -30); g.lineTo(14, 30); g.closePath(); g.fill();
      g.restore();
    }
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(Math.random() * w, Math.random() * h, rand(2, 6), rand(8, 40)); }
    g.strokeStyle = '#0b0b0b'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  });
}

export class World {
  constructor(scene, tex) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.buildSky(tex.city);
    this.buildGround();
    this.buildRoad();
    this.buildRamp();
    this.buildRails();
    this.buildPoles();
    this.buildGantries(tex.sign1km);
    this.buildDistanceSigns();
    this.buildSurroundings();
    this.buildLights();
  }

  buildSky(cityTex) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false, depthWrite: false }));
    const p = dome.geometry.attributes.position; const cols = []; const c = new THREE.Color();
    const top = new THREE.Color(0x2b3040), mid = new THREE.Color(0x596073), low = new THREE.Color(0x8a6f73);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 1500;
      if (y > 0.35) c.copy(mid).lerp(top, Math.min(1, (y - 0.35) / 0.6)); else c.copy(low).lerp(mid, Math.max(0, (y + 0.05) / 0.4));
      cols.push(c.r, c.g, c.b);
    }
    dome.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    dome.renderOrder = -10;
    this.scene.add(dome);
    // 城市環景：圖片地平線約在下方 1/3
    cityTex.wrapS = THREE.RepeatWrapping; cityTex.repeat.set(-2, 1);
    const R = 1100, H = (2 * Math.PI * R / 2) / (2048 / 683);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), new THREE.MeshBasicMaterial({ map: cityTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    cyl.position.y = H / 2 - H * 0.33 - 6;
    cyl.renderOrder = -9;
    this.scene.add(cyl);
    this.sky = [dome, cyl];
  }

  buildGround() {
    const tex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#474b40'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { const v = Math.random(); g.fillStyle = v > 0.5 ? 'rgba(70,82,58,0.6)' : 'rgba(40,44,36,0.6)'; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(300, 300);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), toon(0xffffff, { map: tex }));
    g.rotation.x = -Math.PI / 2; g.position.set(0, -0.03, -600);
    this.root.add(g);
  }

  buildRoad() {
    // 主線（含交流道排隊車道）
    const lines = [
      { x: -9.0, c: '#c9a640' },            // 內側黃線
      { x: -5.4, c: '#e8e6dc', dash: true },
      { x: -1.8, c: '#e8e6dc', dash: true },
      { x: 1.8, c: '#e8e6dc' },             // 外側白線
    ];
    const len = 1150, z0 = 150;
    const tA = roadTexture(ROAD_L, ROAD_R, lines); tA.repeat.set(1, len / 10);
    const a = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_R - ROAD_L, len), toon(0xffffff, { map: tA }));
    a.rotation.x = -Math.PI / 2; a.position.set((ROAD_L + ROAD_R) / 2, 0, z0 - len / 2);
    this.root.add(a);
    // 出口後的主線（只剩兩線）
    const lenB = 900, rB = -0.4;
    const tB = roadTexture(ROAD_L, rB, [{ x: -9.0, c: '#c9a640' }, { x: -5.4, c: '#e8e6dc', dash: true }, { x: -1.8, c: '#e8e6dc' }]);
    tB.repeat.set(1, lenB / 10);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(rB - ROAD_L, lenB), toon(0xffffff, { map: tB }));
    b.rotation.x = -Math.PI / 2; b.position.set((ROAD_L + rB) / 2, 0, -CFG.EXIT_S - lenB / 2);
    this.root.add(b);
    // 槽化線（出口分岔處）
    const gore = canvasTex(128, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#e8e6dc'; g.lineWidth = 10;
      g.strokeRect(6, 6, w - 12, h - 12);
      for (let y = -w; y < h; y += 46) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w * 0.8); g.stroke(); }
    });
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 70), new THREE.MeshBasicMaterial({ map: gore, transparent: true, depthWrite: false }));
    gm.rotation.x = -Math.PI / 2; gm.position.set(-1.8, 0.012, -CFG.EXIT_S - 25);
    this.root.add(gm);
  }

  ribbon(fromA, toA, step, left, right, y0, y1, vertical) {
    const pos = [], uv = [], idx = [];
    const o = {}; let n = 0;
    for (let a = fromA; a <= toA + 1e-6; a += step) {
      lane0Pose(CFG.EXIT_S + a, o);
      const th = -o.yaw, rx = Math.cos(th), rz = Math.sin(th);
      if (vertical) {
        pos.push(o.x + rx * left, y0, o.z + rz * left, o.x + rx * left, y1, o.z + rz * left);
      } else {
        pos.push(o.x + rx * left, y0, o.z + rz * left, o.x + rx * right, y0, o.z + rz * right);
      }
      uv.push(0, a / 10, 1, a / 10);
      if (n > 0) { const i = n * 2; idx.push(i - 2, i - 1, i, i - 1, i + 1, i); }
      n++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  buildRamp() {
    const t = roadTexture(-2.2, 2.8, [{ x: -1.8, c: '#e8e6dc' }, { x: 1.8, c: '#e8e6dc' }]);
    const m = new THREE.Mesh(this.ribbon(-20, CFG.RAMP_LEN, 2, -2.2, 2.8, 0.008), toon(0xffffff, { map: t, side: THREE.DoubleSide }));
    this.root.add(m);
  }

  buildRails() {
    const railMat = toon(0x9da2a8);
    const len = 1150, z0 = 150;
    // 外側護欄
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, len), railMat);
    rail.position.set(4.7, 0.72, z0 - len / 2);
    const railH = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, len + 0.1), OUTLINE);
    railH.position.copy(rail.position);
    this.root.add(rail, railH);
    // 匝道外側護欄
    const rr = new THREE.Mesh(this.ribbon(0, CFG.RAMP_LEN, 2, 3.1, 0, 0.55, 0.9, true), toon(0x9da2a8, { side: THREE.DoubleSide }));
    this.root.add(rr);
    // 立柱
    const posts = [];
    for (let z = z0; z > -CFG.EXIT_S; z -= 4) posts.push([4.75, z]);
    const o = {};
    for (let a = 0; a < CFG.RAMP_LEN; a += 4) { lane0Pose(CFG.EXIT_S + a, o); const th = -o.yaw; posts.push([o.x + Math.cos(th) * 3.15, o.z + Math.sin(th) * 3.15]); }
    const pg = new THREE.BoxGeometry(0.12, 0.8, 0.12);
    const im = new THREE.InstancedMesh(pg, toon(0x7d8187), posts.length);
    const m = new THREE.Matrix4();
    posts.forEach((p, i) => { m.makeTranslation(p[0], 0.4, p[1]); im.setMatrixAt(i, m); });
    this.root.add(im);
    // 內側水泥護欄（紐澤西護欄）
    const lenM = 2100;
    const med = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, lenM), toon(0x8e8c86));
    med.position.set(-11.2, 0.45, 150 - lenM / 2);
    const medH = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.97, lenM), OUTLINE);
    medH.position.copy(med.position);
    this.root.add(med, medH);
    // 出口後主線右側護欄
    const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 900), railMat);
    r2.position.set(-0.1, 0.72, -CFG.EXIT_S - 80 - 450);
    this.root.add(r2);
  }

  buildPoles() {
    const pts = [];
    for (let z = 120; z > -1700; z -= 48) { pts.push({ x: 5.4, z, dir: -1 }); pts.push({ x: -11.2, z: z - 24, dir: 1 }); }
    const n = pts.length;
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 10, 6), toon(0x6f7378), n);
    const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.1, 0.1), toon(0x6f7378), n);
    const lamp = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd89a }), n);
    const m = new THREE.Matrix4();
    pts.forEach((p, i) => {
      m.makeTranslation(p.x, 5, p.z); pole.setMatrixAt(i, m);
      m.makeTranslation(p.x + p.dir * 1.3, 9.9, p.z); arm.setMatrixAt(i, m);
      m.makeTranslation(p.x + p.dir * 2.5, 9.8, p.z); lamp.setMatrixAt(i, m);
    });
    this.root.add(pole, arm, lamp);
  }

  gantry(z, signs) {
    const g = new THREE.Group();
    const parts = [
      part(new THREE.CylinderGeometry(0.22, 0.26, 7.6, 8), [5.6, 3.8, 0], null, 0x8b9096),
      part(new THREE.CylinderGeometry(0.22, 0.26, 7.6, 8), [-11.7, 3.8, 0], null, 0x8b9096),
      part(new THREE.BoxGeometry(17.8, 0.32, 0.32), [-3.05, 7.4, 0], null, 0x8b9096),
      part(new THREE.BoxGeometry(17.8, 0.22, 0.22), [-3.05, 6.2, 0.35], null, 0x8b9096),
    ];
    for (let x = -11; x < 5; x += 1.6) parts.push(part(new THREE.BoxGeometry(0.08, 1.4, 0.08), [x, 6.8, 0.18], [0, 0, 0.6], 0x8b9096, false));
    g.add(mergedGroup(parts, 0.04));
    for (const s of signs) {
      const back = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.1, s.h + 0.1, 0.12), toon(0x5d6166));
      back.position.set(s.x, s.y, 0.45);
      const bh = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.24, s.h + 0.24, 0.2), OUTLINE);
      bh.position.copy(back.position);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), toon(0xffffff, { map: s.tex }));
      face.position.set(s.x, s.y, 0.52);
      g.add(back, bh, face);
    }
    g.position.z = z;
    this.root.add(g);
  }

  buildGantries(sign1km) {
    const t300 = signTexture('出口 300 公尺', true);
    const tMain = signTexture('國道 直行 ↑', false);
    this.gantry(40, [{ x: -0.6, y: 6.6, w: 6.4, h: 1.55, tex: sign1km }, { x: -7.6, y: 6.6, w: 5.2, h: 1.7, tex: tMain }]);
    this.gantry(-700, [{ x: -0.6, y: 6.6, w: 6.4, h: 2.1, tex: t300 }, { x: -7.6, y: 6.6, w: 5.2, h: 1.7, tex: tMain }]);
    // 出口前路邊牌
    const tExit = signTexture('出口', true, 512, 256);
    const g = new THREE.Group();
    g.add(mergedGroup([
      part(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), [-0.9, 1.6, 0], null, 0x8b9096),
      part(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), [0.9, 1.6, 0], null, 0x8b9096),
    ]));
    const f = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.4), toon(0xffffff, { map: tExit }));
    f.position.set(0, 3.1, 0.1);
    g.add(f);
    g.position.set(6.2, 0, -CFG.EXIT_S + 60);
    this.root.add(g);
    // 分岔處黃黑導引標誌
    const chev = canvasTex(64, 128, (c, w, h) => {
      c.fillStyle = '#e2b52c'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#111';
      for (let y = -20; y < h; y += 34) { c.beginPath(); c.moveTo(0, y); c.lineTo(w / 2, y + 22); c.lineTo(w, y); c.lineTo(w, y + 12); c.lineTo(w / 2, y + 34); c.lineTo(0, y + 12); c.fill(); }
    });
    const cm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.1), toon(0xffffff, { map: chev }));
    cm.position.set(-1.6, 1.0, -CFG.EXIT_S - 8);
    this.root.add(cm);
  }

  // 右側路邊：出口距離牌（900～400 公尺）＋ 出口前 300／200／100 公尺斜線牌
  buildDistanceSigns() {
    const post = (x, z, h) => mergedGroup([part(new THREE.CylinderGeometry(0.06, 0.06, h, 6), [0, h / 2, 0], null, 0x8b9096)]);
    const board = (tex, w, h, x, z, y) => {
      const g = new THREE.Group();
      g.add(post(0, 0, y));
      const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.06), OUTLINE);
      back.position.set(0, y, -0.02);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), toon(0xffffff, { map: tex }));
      f.position.set(0, y, 0.02);
      g.add(back, f);
      g.position.set(x, 0, z);
      this.root.add(g);
    };
    for (const d of [900, 800, 700, 600, 500, 400]) {
      board(signTexture(`出口 ${d}m`, false, 512, 192), 2.0, 0.75, 6.3, -(CFG.EXIT_S - d), 2.3);
    }
    for (const [d, n] of [[300, 3], [200, 2], [100, 1]]) {
      const t = canvasTex(160, 320, (g, w, h) => {
        g.fillStyle = '#1d6a44'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#f2f2ec'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
        g.fillStyle = '#f4f4ee';
        const gap = h / (n + 1);
        for (let i = 1; i <= n; i++) {
          const cy = gap * i;
          g.beginPath();
          g.moveTo(22, cy + 26); g.lineTo(w - 22, cy - 26); g.lineTo(w - 22, cy - 2); g.lineTo(22, cy + 50); g.closePath();
          g.fill();
        }
        for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(Math.random() * w, Math.random() * h, 3, rand(6, 20)); }
        g.strokeStyle = '#0b0b0b'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
      });
      board(t, 0.8, 1.6, 6.0, -(CFG.EXIT_S - d), 1.9);
    }
  }

  buildSurroundings() {
    // 右側高架道路
    const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 1.3, 2600), toon(0x7f8184));
    deck.position.set(68, 10, -650);
    const dh = new THREE.Mesh(new THREE.BoxGeometry(14.3, 1.6, 2600), OUTLINE);
    dh.position.copy(deck.position);
    const par = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.8, 2600), toon(0x95979a));
    par.position.set(68, 11.0, -650); par.scale.x = 1;
    this.root.add(deck, dh);
    const pc = Math.floor(2600 / 34);
    const pil = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 10, 2.4), toon(0x75777a), pc);
    const m = new THREE.Matrix4();
    for (let i = 0; i < pc; i++) { m.makeTranslation(68, 5, 650 - i * 34); pil.setMatrixAt(i, m); }
    this.root.add(pil);
    // 建築物
    const winTex = canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (let y = 6; y < h; y += 10) for (let x = 4; x < w; x += 9) if (Math.random() < 0.28) { g.fillStyle = Math.random() < 0.7 ? '#ffcf86' : '#bfe3ff'; g.fillRect(x, y, 5, 5); }
    });
    const bCount = 190;
    const bMat = toon(0xffffff, { emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9 });
    const bg = new THREE.BoxGeometry(1, 1, 1); bg.translate(0, 0.5, 0);
    const bld = new THREE.InstancedMesh(bg, bMat, bCount);
    const bldH = new THREE.InstancedMesh(bg, OUTLINE, bCount);
    const col = new THREE.Color();
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const tones = [0x6d7079, 0x7b7568, 0x5d6068, 0x8a8478, 0x4f545c, 0x757a72];
    for (let i = 0; i < bCount; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side < 0 ? rand(-280, -45) : rand(95, 300);
      const z = rand(250, -1750);
      const w = rand(10, 28), d = rand(10, 28), h = rand(12, 70);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(-0.2, 0.2));
      ps.set(x, 0, z); sc.set(w, h, d); m.compose(ps, q, sc); bld.setMatrixAt(i, m);
      sc.set(w + 0.8, h + 0.6, d + 0.8); ps.y = -0.3; m.compose(ps, q, sc); bldH.setMatrixAt(i, m);
      bld.setColorAt(i, col.set(tones[i % tones.length]));
    }
    this.root.add(bld, bldH);
    // 樹叢
    const tCount = 320;
    const tg = new THREE.IcosahedronGeometry(1, 0);
    const trees = new THREE.InstancedMesh(tg, toon(0x46523d, { flatShading: true }), tCount);
    const treesH = new THREE.InstancedMesh(tg, OUTLINE, tCount);
    for (let i = 0; i < tCount; i++) {
      const side = Math.random() < 0.55 ? 1 : -1;
      const x = side > 0 ? rand(8, 40) : rand(-14, -40);
      const z = rand(150, -1600);
      if (side > 0 && z < -CFG.EXIT_S + 20 && z > -CFG.EXIT_S - 260 && x < 140) {
        m.makeScale(0, 0, 0); trees.setMatrixAt(i, m); treesH.setMatrixAt(i, m); continue;
      }
      const s = rand(1.4, 3.8);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, 6));
      ps.set(x, s * 0.6, z); sc.set(s, s * rand(0.8, 1.3), s); m.compose(ps, q, sc); trees.setMatrixAt(i, m);
      sc.multiplyScalar(1.07); m.compose(ps, q, sc); treesH.setMatrixAt(i, m);
      trees.setColorAt(i, col.set(Math.random() < 0.5 ? 0x46523d : 0x3a4634));
    }
    this.root.add(trees, treesH);
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xb7bfd0, 0x3c352d, 1.5);
    const sun = new THREE.DirectionalLight(0xffbf96, 1.6);
    sun.position.set(-60, 45, -100);
    this.scene.add(hemi, sun);
    this.flashLight = new THREE.PointLight(0x7ff6ff, 0, 18, 1.5);
    this.scene.add(this.flashLight);
  }

  update(camera) {
    for (const s of this.sky) { s.position.x = camera.position.x; s.position.z = camera.position.z; }
  }
}
