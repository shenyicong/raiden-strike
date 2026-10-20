// scoring.js — 计分与擦弹判定 (FR-CBT-07 / 6.6)。
import { ENEMIES, SCORE, GLOBAL, PLAYER } from './config.js';

export function killScore(type) {
  return ENEMIES[type]?.score ?? 0;
}

// 判定点碰撞/擦弹分类。返回 'hit' | 'graze' | 'none'。
// 敌弹中心距判定点 9px 内为命中；9–21px 内为擦弹 (FR-CBT-07)。
export function classifyHit(distance) {
  if (distance <= PLAYER.HIT_RADIUS) return 'hit';
  if (distance <= GRAZE_OUTER()) return 'graze';
  return 'none';
}
function GRAZE_OUTER() {
  return GLOBAL.GRAZE_INNER + (GLOBAL.GRAZE_OUTER - GLOBAL.GRAZE_INNER); // 21
}

// 擦弹管理：同颗子弹仅计一次。
export class GrazeTracker {
  constructor() { this.count = 0; this.seen = new Set(); }
  // 传入子弹唯一 id 与当前距判定点距离；返回本次是否新增一次擦弹。
  check(bulletId, distance) {
    const c = classifyHit(distance);
    if (c === 'graze' && !this.seen.has(bulletId)) {
      this.seen.add(bulletId);
      this.count += 1;
      return true;
    }
    if (c === 'hit') this.seen.add(bulletId); // 命中后不再计擦弹
    return false;
  }
}
