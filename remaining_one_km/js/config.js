// 遊戲常數、文字、共用小工具
export const CFG = {
  L: 4.4,                 // 車長（公尺）
  W: 1.8,                 // 車寬
  LANE_X: [0, -3.6, -7.2],// 0 = 最右側（交流道排隊車道），1、2 = 左側車道
  SHOULDER_X: -9.7,       // 被打中的插隊車會失控停到內側路肩
  EXIT_S: 1000,           // 出口位置
  START_S: -95,           // 開場起點
  HARD: 300,              // 最後 300 公尺難度提高
  MAX_CUTS: 3,
  MAX_CRASH: 2,
  RAMP_R: 130,            // 匝道彎道半徑
  RAMP_LEN: 260,
  MAX_V: 19.4,            // 約 70 km/h
  ACC: 3.0, BRAKE: 7.5, COAST: 0.9,
  GAP_FAR: 24,            // 「飛機場」距離
  FIRE_CD: 0.28,
};

export const TEXT = {
  cutTaunt: '你被一台車插隊了，你這魯蛇。',
  cutTaunt2: '你的駕照用雞排換的？',
  farTaunt: '你前面的距離跟飛機場一樣大。',
  endC: '你被後車駕駛幹掉了。',
  endD: '你撞到不該撞的人。',
  win1: '成功下交流道。你的人生還是卡在原地。',
  winNews: '本日新聞：國道一號出口車流順暢，死因不明。',
  win2: '通關成功',
  start: '遊戲開始',
  curse: '幹……',
  hard: '最後 300 公尺',
  crash: ['前車駕駛從後照鏡瞪了你一眼。', '他開始解安全帶了……'],
};

// 最右側車道（含交流道匝道）的位置：s = 沿路距離
export function lane0Pose(s, o = {}) {
  if (s <= CFG.EXIT_S) { o.x = 0; o.z = -s; o.yaw = 0; }
  else {
    const th = (s - CFG.EXIT_S) / CFG.RAMP_R;
    o.x = CFG.RAMP_R * (1 - Math.cos(th));
    o.z = -CFG.EXIT_S - CFG.RAMP_R * Math.sin(th);
    o.yaw = -th;
  }
  return o;
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

const KEY = 'remaining1km_cleared';      // 通關次數
const KEY_OP = 'remaining1km_opening';   // 開場是否完整看過
const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
export function loadClears() { return parseInt(get(KEY) || '0', 10) || 0; }
export function loadCleared() { return loadClears() > 0; }
export function saveCleared() { set(KEY, String(loadClears() + 1)); }
export function loadOpeningSeen() { return get(KEY_OP) === '1'; }
export function saveOpeningSeen() { set(KEY_OP, '1'); }
export function clearSave() { try { localStorage.removeItem(KEY); localStorage.removeItem(KEY_OP); } catch (e) {} }
export const GRENADE_CLEARS = 3; // 通關 3 次解鎖手榴彈
