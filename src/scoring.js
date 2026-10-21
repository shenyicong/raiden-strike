// scoring.js — 计分与擦弹判定 (FR-CBT-07 / 6.6)。
// V2.8.0 新增：连击 Combo 倍率 (FR-3.3) 与结算评级 (FR-1.4)。
import { ENEMIES, SCORE, GLOBAL, PLAYER, FEEL, ENDGAME } from './config.js';

export function killScore(type) {
  return ENEMIES[type]?.score ?? 0;
}

// 连击倍率：1 + 0.02×(combo-1)，封顶 ×2.0 (FR-3.3)。combo<1 时为 1.0。
export function comboMultiplier(combo) {
  if (!(combo > 1)) return 1;
  const m = 1 + (FEEL.COMBO_MULT_STEP || 0.02) * (combo - 1);
  return Math.min(FEEL.COMBO_MULT_MAX || 2, m);
}

// 结算评级 S/A/B/C：自上而下首个满足档位者；S 额外要求全程无伤 (FR-1.4)。
// summary = { score, noMiss }
export function gradeRun(summary = {}) {
  const score = summary.score || 0;
  const noMiss = !!summary.noMiss;
  for (const g of ENDGAME.GRADES) {
    if (score < (g.minScore || 0)) continue;
    if (g.noMiss && !noMiss) continue;
    return g.grade;
  }
  return 'C';
}

// 判定点碰撞/擦弹分类。返回 'hit' | 'graze' | 'none'。
// 敌弹中心距判定点 9px 内为命中；9–21px 内为擦弹 (FR-CBT-07)。
export function classifyHit(distance) {
  if (distance <= PLAYER.HIT_RADIUS) return 'hit';
  if (distance <= GLOBAL.GRAZE_OUTER) return 'graze';
  return 'none';
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
