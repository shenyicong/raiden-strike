// util.js — 纯函数数学/工具，浏览器与 Node 共用，无副作用。
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}
export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

// 八向移动向量归一：同时按两个方向键时斜向速度为 300 而非 424 (FR-INP-02)
export function normalizeDir(dx, dy) {
  if (dx === 0 && dy === 0) return { x: 0, y: 0 };
  const len = Math.hypot(dx, dy);
  return { x: dx / len, y: dy / len };
}

// 简单可注入随机源（测试可确定性）。默认 Math.random。
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  return function () {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}
