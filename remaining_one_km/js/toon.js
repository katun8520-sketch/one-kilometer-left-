// 漫畫渲染：卡通分層材質 + 反轉外殼黑色描邊 + 幾何合併工具
import * as THREE from 'three';

let _grad = null;
export function gradTex() {
  if (_grad) return _grad;
  const d = new Uint8Array([55, 55, 55, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
  _grad = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  _grad.minFilter = _grad.magFilter = THREE.NearestFilter;
  _grad.generateMipmaps = false;
  _grad.needsUpdate = true;
  return _grad;
}

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradTex(), ...extra });
}

export const VCMAT = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradTex() });
export const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x0a0a0b, side: THREE.BackSide });

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export function part(geo, pos, rot, color, outline = true) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0])));
  m.compose(V3(pos), q, new THREE.Vector3(1, 1, 1));
  return { geo, matrix: m, color, outline };
}

// 兩點之間的方柱（A 柱、手臂等）
export function beam(p1, p2, t, color, outline = true, round = false) {
  const a = V3(p1), b = V3(p2);
  const d = b.clone().sub(a);
  const len = d.length();
  const g = round ? new THREE.CylinderGeometry(t / 2, t / 2, len, 8) : new THREE.BoxGeometry(t, len, t);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const m = new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return { geo: g, matrix: m, color, outline };
}

// 合併多個零件成一個頂點色網格，並產生外殼描邊網格
export function mergeParts(parts, t = 0.03) {
  const P = [], N = [], C = [], H = [];
  const col = new THREE.Color();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    g.applyMatrix4(p.matrix);
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    col.set(p.color);
    for (let i = 0; i < pa.length; i += 3) {
      P.push(pa[i], pa[i + 1], pa[i + 2]);
      N.push(na[i], na[i + 1], na[i + 2]);
      C.push(col.r, col.g, col.b);
    }
    if (p.outline) {
      const h = p.geo.clone();
      h.computeBoundingBox();
      const sz = h.boundingBox.getSize(new THREE.Vector3());
      const ct = h.boundingBox.getCenter(new THREE.Vector3());
      const f = (s) => (s < 1e-3 ? 1 : (s + 2 * t) / s);
      h.translate(-ct.x, -ct.y, -ct.z);
      h.scale(f(sz.x), f(sz.y), f(sz.z));
      h.translate(ct.x, ct.y, ct.z);
      const hn = h.index ? h.toNonIndexed() : h;
      hn.applyMatrix4(p.matrix);
      const ha = hn.attributes.position.array;
      for (let i = 0; i < ha.length; i++) H.push(ha[i]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.computeBoundingSphere();
  let hull = null;
  if (H.length) {
    hull = new THREE.BufferGeometry();
    hull.setAttribute('position', new THREE.Float32BufferAttribute(H, 3));
    hull.computeBoundingSphere();
  }
  return { geo, hull };
}

export function mergedGroup(parts, t = 0.03) {
  const { geo, hull } = mergeParts(parts, t);
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, VCMAT);
  g.add(mesh);
  if (hull) g.add(new THREE.Mesh(hull, OUTLINE));
  g.userData.mesh = mesh;
  return g;
}

// 小工具：畫布貼圖
export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function radialTex(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)') {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
