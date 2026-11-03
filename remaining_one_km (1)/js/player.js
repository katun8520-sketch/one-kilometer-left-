// 玩家車輛：駕駛座內裝、第一人稱攝影機、3D 探頭動畫、槍、後照鏡
import * as THREE from 'three';
import { Car, playerBodyGeo } from './cars.js';
import { part, beam, mergedGroup, toon, canvasTex } from './toon.js';
import { makeBuddha, makePistol, makeLaserGun } from './characters.js';
import { CFG, lane0Pose, smooth, lerp, clamp } from './config.js';

const HEAD = new THREE.Vector3(-0.37, 1.17, 0.12);
const PEEK_MID = new THREE.Vector3(-0.74, 1.13, -0.02);
const PEEK_OUT = new THREE.Vector3(-1.27, 1.19, -0.18);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class Player {
  constructor(scene, camera, renderer) {
    this.scene = scene; this.camera = camera; this.renderer = renderer;
    this.car = new Car(0x56606c);
    const pg = playerBodyGeo(0x56606c);
    this.car.body.geometry = pg.geo; this.car.hull.geometry = pg.hull;
    this.car.glass.visible = false;
    this.car.driver.visible = false;
    this.car.driver.position.y = -100;
    this.group = this.car.group;
    scene.add(this.group);
    this.buildInterior();
    this.buildGuns();
    this.buildMirror();
    // 改用 GPT 繪製的 2D 內裝：3D 自車與 3D 槍都隱藏
    for (const c of this.group.children) c.visible = false;
    this.reset(CFG.START_S);
  }

  reset(s) {
    this.s = s; this.v = 8.5;
    this.peekT = 0; this.peeking = false;
    this.aimYaw = 0; this.aimPitch = 0;
    this.extra = { yaw: 0, pitch: 0, roll: 0 };
    this.override = null;        // 過場鏡頭（車內座標）
    this.shakeAmp = 0;
    this.gunState = 0;           // 0 = 收起，1 = 拿在手上
    this.gunShow = 0;
    this.windowOpen = 0;
    this.door.rotation.y = 0;
    this.setWindow(0);
    this.updatePose();
  }

  buildInterior() {
    const g = new THREE.Group();
    const D = 0x2b2827, D2 = 0x3a3634, LINER = 0x8d877d;
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const parts = [
      part(B(1.76, 0.2, 0.55), [0, 0.88, -1.0], null, D),
      part(B(1.76, 0.06, 0.48), [0, 0.99, -0.93], [0.16, 0, 0], D2),
      part(B(0.52, 0.1, 0.2), [-0.37, 1.04, -0.84], [0.1, 0, 0], D),
      part(B(0.42, 0.42, 0.12), [0.05, 0.74, -0.74], [-0.15, 0, 0], D2),
      part(B(0.26, 0.24, 0.95), [0, 0.5, -0.12], null, D),
      part(B(1.56, 0.05, 1.7), [0, 1.385, 0.3], null, LINER),
      part(B(1.5, 0.08, 0.14), [0, 1.39, -0.44], null, LINER),
      part(B(0.36, 0.06, 0.05), [-0.42, 1.36, -0.4], [0.3, 0, 0], 0x5a5650), // 遮陽板
      part(B(0.36, 0.06, 0.05), [0.42, 1.36, -0.4], [0.3, 0, 0], 0x5a5650),
      part(B(0.09, 0.47, 0.12), [-0.83, 1.19, 0.48], null, LINER),
      part(B(0.09, 0.47, 0.12), [0.83, 1.19, 0.48], null, LINER),
      part(B(0.5, 0.6, 0.12), [0.37, 0.86, 0.36], [0.15, 0, 0], 0x2f2c2b),
      part(B(0.26, 0.18, 0.1), [0.37, 1.26, 0.42], null, 0x2f2c2b),
      part(B(0.06, 0.42, 1.25), [0.86, 0.75, -0.15], null, D2),
      part(B(0.1, 0.04, 1.1), [0.82, 0.97, -0.15], null, D),
      part(B(0.2, 0.06, 0.08), [0, 1.3, -0.56], null, 0x222222),        // 車內後視鏡
      part(B(0.22, 0.12, 0.13), [0.55, 1.04, -0.84], null, 0xd8b7b0),  // 面紙盒
      beam([-0.37, 0.88, -0.78], [-0.37, 0.95, -0.62], 0.07, 0x1d1d1d, true, true),
    ];
    for (const s of [-1, 1]) parts.push(beam([s * 0.83, 0.98, -0.95], [s * 0.7, 1.41, -0.42], 0.1, LINER));
    g.add(mergedGroup(parts, 0.012));
    // 方向盤
    const wheel = new THREE.Group();
    wheel.add(mergedGroup([
      part(new THREE.TorusGeometry(0.185, 0.026, 8, 28), [0, 0, 0], null, 0x1d1d1d),
      part(B(0.1, 0.07, 0.04), [0, 0, 0], null, 0x262626),
      part(B(0.17, 0.03, 0.02), [-0.09, -0.01, 0], [0, 0, 0.15], 0x262626),
      part(B(0.17, 0.03, 0.02), [0.09, -0.01, 0], [0, 0, -0.15], 0x262626),
    ], 0.008));
    wheel.position.set(-0.37, 0.98, -0.6); wheel.rotation.x = -0.38;
    g.add(wheel);
    // 儀表
    this.gaugeTex = canvasTex(512, 256, (c, w, h) => {
      c.fillStyle = '#0d0d0f'; c.fillRect(0, 0, w, h);
      const dial = (cx, max, step, label) => {
        c.strokeStyle = '#d7d4cc'; c.fillStyle = '#d7d4cc'; c.lineWidth = 4;
        c.beginPath(); c.arc(cx, 128, 100, 0, Math.PI * 2); c.stroke();
        c.font = 'bold 20px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let v = 0; v <= max; v += step) {
          const a = Math.PI * 0.75 + (v / max) * Math.PI * 1.5;
          c.beginPath(); c.moveTo(cx + Math.cos(a) * 92, 128 + Math.sin(a) * 92); c.lineTo(cx + Math.cos(a) * 78, 128 + Math.sin(a) * 78); c.stroke();
          c.fillText(String(v), cx + Math.cos(a) * 62, 128 + Math.sin(a) * 62);
        }
        c.font = '14px sans-serif'; c.fillText(label, cx, 175);
      };
      dial(128, 8, 1, 'x1000r/min'); dial(384, 220, 20, 'km/h');
    });
    const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), new THREE.MeshBasicMaterial({ map: this.gaugeTex, color: 0xb8b8b8 }));
    gauge.position.set(-0.37, 1.0, -0.75); gauge.rotation.x = -0.25;
    g.add(gauge);
    const needle = (cx) => {
      const p = new THREE.Group();
      p.position.set(cx, 0, 0.004);
      const n = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.07, 0.002), new THREE.MeshBasicMaterial({ color: 0xff3a24 }));
      n.position.y = 0.035; p.add(n); gauge.add(p); return p;
    };
    this.needleRpm = needle(-0.1); this.needleSpd = needle(0.1);
    // 彌勒佛
    const buddha = makeBuddha();
    buddha.position.set(0.3, 1.035, -0.86); buddha.scale.setScalar(1.25);
    buddha.rotation.y = -0.55;
    g.add(buddha);
    this.buddha = buddha;
    // 左前門（可開啟，鉸鏈在前方）
    this.door = new THREE.Group();
    this.door.position.set(-0.86, 0, -0.78);
    this.door.add(mergedGroup([
      part(B(0.06, 0.42, 1.2), [0, 0.75, 0.6], null, D2),
      part(B(0.13, 0.05, 0.5), [0.06, 0.86, 0.75], null, D),
      part(B(0.1, 0.04, 1.1), [0.03, 0.97, 0.6], null, D),
      part(B(0.05, 0.05, 0.95), [0, 1.38, 0.68], null, LINER),
    ], 0.012));
    this.glassL = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.4), new THREE.MeshBasicMaterial({ color: 0x9fb4c4, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    this.glassL.rotation.y = Math.PI / 2;
    this.glassL.position.set(0.0, 1.17, 0.62);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1.05), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    edge.position.y = 0.2; this.glassL.add(edge); edge.rotation.y = -Math.PI / 2;
    this.door.add(this.glassL);
    g.add(this.door);
    this.interior = g;
    this.group.add(g);
  }

  setWindow(k) { // 0 = 關，1 = 全開
    this.windowOpen = k;
    this.glassL.position.y = 1.17 - 0.44 * k;
    this.glassL.visible = k < 0.98;
  }

  buildGuns() {
    this.pistol = makePistol();
    this.laser = makeLaserGun();
    this.gun = this.pistol;
    this.camera.add(this.pistol, this.laser);
    this.laser.visible = false;
    this.pistol.visible = false;
    const flashTex = canvasTex(64, 64, (c, w, h) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.35, 'rgba(255,200,80,0.9)'); g.addColorStop(1, 'rgba(255,120,0,0)');
      c.fillStyle = g; c.beginPath();
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 12 : 32; c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
      c.fill();
    });
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.flash.scale.setScalar(0.12); this.flash.visible = false;
    this.flash.renderOrder = 10;
    this.camera.add(this.flash);
  }

  setGunType(laser) {
    this.gun = laser ? this.laser : this.pistol;
    this.pistol.visible = false; this.laser.visible = false;
  }

  buildMirror() {
    this.mirrorRT = new THREE.WebGLRenderTarget(256, 128);
    this.mirrorCam = new THREE.PerspectiveCamera(30, 2, 0.5, 400);
    const housing = mergedGroup([part(new THREE.BoxGeometry(0.1, 0.15, 0.24), [0, 0, 0], null, 0x56606c)], 0.012);
    housing.position.set(-1.04, 1.0, -0.66);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.12), new THREE.MeshBasicMaterial({ map: this.mirrorRT.texture }));
    this.mirrorRT.texture.wrapS = THREE.RepeatWrapping;
    this.mirrorRT.texture.repeat.x = -1;
    glass.position.set(-1.0, 1.0, -0.535); glass.rotation.y = 0.55;
    this.mirrorGlass = glass;
    this.group.add(housing, glass);
    this.mirrorFrame = 0;
  }

  updatePose() {
    const o = lane0Pose(this.s, this._pose || (this._pose = {}));
    this.group.position.set(o.x, 0, o.z);
    this.group.rotation.y = o.yaw;
    this.group.updateMatrixWorld(true);
  }

  // dtR：真實時間（探頭動畫不受慢動作影響）
  updateCamera(dtR, aimNdc) {
    const target = this.peeking ? 1 : 0;
    const spd = this.peeking ? 1 / 0.8 : 1 / 0.5;
    this.peekT = clamp(this.peekT + Math.sign(target - this.peekT) * spd * dtR, 0, 1);
    const e = smooth(this.peekT);
    // 二次貝茲曲線：駕駛座 → 車窗 → 窗外
    const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
    const local = _v.set(
      HEAD.x * a + PEEK_MID.x * b + PEEK_OUT.x * c,
      HEAD.y * a + PEEK_MID.y * b + PEEK_OUT.y * c,
      HEAD.z * a + PEEK_MID.z * b + PEEK_OUT.z * c);
    // 探頭時鏡頭朝左前方，並隨準星微微轉動
    const ty = -aimNdc.x * 0.35, tp = aimNdc.y * 0.22;
    this.aimYaw = lerp(this.aimYaw, ty, Math.min(1, dtR * 6));
    this.aimPitch = lerp(this.aimPitch, tp, Math.min(1, dtR * 6));
    let yaw = lerp(0, 0.6 + this.aimYaw, e) + this.extra.yaw;
    let pitch = lerp(-0.05, -0.04 + this.aimPitch, e) + this.extra.pitch;
    let roll = 0.08 * e + this.extra.roll;
    if (this.override) {
      local.copy(this.override.pos);
      yaw = this.override.yaw; pitch = this.override.pitch; roll = this.override.roll;
    }
    if (this.shakeAmp > 0.0005) {
      local.x += (Math.random() - 0.5) * this.shakeAmp;
      local.y += (Math.random() - 0.5) * this.shakeAmp;
      pitch += (Math.random() - 0.5) * this.shakeAmp * 0.6;
      this.shakeAmp *= Math.pow(0.02, dtR);
    }
    this.camera.position.copy(local).applyMatrix4(this.group.matrixWorld);
    _e.set(pitch, yaw, roll, 'YXZ');
    this.camera.quaternion.copy(this.group.quaternion).multiply(_q.setFromEuler(_e));
    this.camera.updateMatrixWorld(true);
    this.updateGun(dtR, aimNdc, e);
    this.needleSpd.rotation.z = Math.PI * 0.75 - (this.v * 3.6 / 220) * Math.PI * 1.5;
    this.needleRpm.rotation.z = Math.PI * 0.75 - ((0.9 + this.v * 0.12) / 8) * Math.PI * 1.5;
  }

  updateGun(dtR, aimNdc, e) {
    const g = this.gun;
    this.gunShow = lerp(this.gunShow, this.gunState, Math.min(1, dtR * 7));
    g.visible = false;
    if (this.gunShow <= 0.02) return;
    const low = new THREE.Vector3(0.15, -0.27, -0.36), aim = new THREE.Vector3(0.11, -0.115, -0.38), hide = new THREE.Vector3(0.15, -0.7, -0.3);
    const p = new THREE.Vector3().lerpVectors(low, aim, e);
    p.lerp(hide, 1 - this.gunShow);
    g.position.copy(p);
    const cam = this.camera;
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const dir = new THREE.Vector3(aimNdc.x * th * cam.aspect, aimNdc.y * th, -1).normalize();
    const qAim = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    const qLow = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.45, 0.35, 0.25));
    g.quaternion.copy(qLow).slerp(qAim, e);
  }

  muzzleFlash(on) {
    this.flash.visible = on;
    if (on) {
      const m = this.gun.userData.muzzle.clone();
      this.gun.localToWorld(m); this.camera.worldToLocal(m);
      this.flash.position.copy(m);
      this.flash.material.rotation = Math.random() * 6;
      this.flash.material.color.set(this.gun === this.laser ? 0x7ff6ff : 0xffffff);
    }
  }

  renderMirror(scene, every) {
    return; // 2D 內裝已畫好後照鏡
    if ((this.mirrorFrame++ % every) !== 0) return;
    const p = new THREE.Vector3(-1.12, 1.08, -0.55).applyMatrix4(this.group.matrixWorld);
    const t = new THREE.Vector3(-1.5, 0.95, 8).applyMatrix4(this.group.matrixWorld);
    this.mirrorCam.position.copy(p); this.mirrorCam.lookAt(t);
    this.mirrorGlass.visible = false;
    const gv = this.gun.visible; this.gun.visible = false;
    this.renderer.setRenderTarget(this.mirrorRT);
    this.renderer.render(scene, this.mirrorCam);
    this.renderer.setRenderTarget(null);
    this.mirrorGlass.visible = true; this.gun.visible = gv;
  }
}
