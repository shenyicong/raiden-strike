/**
 * utils.js —— 数学与通用工具
 */

export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 指数平滑，与帧率无关 */
export function damp(a, b, lambda, dt) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function randInt(a, b) {
  return Math.floor(rand(a, b + 1));
}

export function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

export function chance(p) {
  return Math.random() < p;
}

/** 圆-圆碰撞 */
export function circleHit(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const r = r1 + r2;
  return dx * dx + dy * dy <= r * r;
}

/** 归一化向量 */
export function norm(dx, dy) {
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len, len };
}

/** 角度差归一到 [-PI, PI] */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * 从 x 到 y 的合法角
 * 把 y 归一到 (0, 2π) 后每帧给 (x - y, x + y) 区间的合法区间，用于错开弹幕轨迹。
 */
export function bulletRange(x, y) {
  y %= TAU;
  if (y < 0) y += TAU;
  return y > Math.PI ? [x - y, x + y - TAU] : [x - y, x + y];
}

/** 从区间里取一个值（步长 step 量化） */
export function rangePick([lo, hi], step, rnd = Math.random()) {
  const a = Math.round(lo / step) * step;
  const b = Math.floor(hi / step) * step;
  if (b <= a) return a;
  return a + Math.floor(rnd * ((b - a) / step + 1)) * step;
}


/** 数字千分位 */
export function formatScore(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 秒数 → mm:ss */
export function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** 简易对象池 */
export class Pool {
  constructor(factory, size = 64) {
    this.factory = factory;
    this.free = [];
    for (let i = 0; i < size; i++) this.free.push(factory());
  }
  get() {
    return this.free.pop() || this.factory();
  }
  put(obj) {
    if (this.free.length < 512) this.free.push(obj);
  }
}
