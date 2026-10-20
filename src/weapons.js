// weapons.js — 火力进化与弹道 (FR-CBT-01 / 6.3 / 6.6)。
import { WEAPONS, POWER_PER_ITEM, MAX_LEVEL } from './config.js';

// 把累计能量映射到火力等级。逐级扣除升到下一级所需能量。
// Lv.1→2 需 100，2→3 需 120，3→4 需 150，4→5 需 200；满级共 570 能量 (6.3)。
export function levelFromEnergy(energy) {
  let lvl = 1;
  let e = Math.max(0, energy);
  while (lvl < MAX_LEVEL) {
    const need = WEAPONS[lvl - 1].energyToNext;
    if (e >= need) { e -= need; lvl += 1; } else break;
  }
  return lvl;
}

// 拾取火力道具：能量 +34；满级时折算 50 分 (6.6)。返回 { energy, level, bonus }。
export function applyPowerItem(state) {
  const energy = state.energy + POWER_PER_ITEM;
  const level = levelFromEnergy(energy);
  const bonus = level >= MAX_LEVEL && state.level >= MAX_LEVEL ? 50 : 0;
  return { energy, level, bonus };
}

// 受伤掉级：火力降低一级，不低于 Lv.1 (FR-CBT-03)。
export function downgradeOnHit(level) {
  return Math.max(1, level - 1);
}

// 理论 DPS（100% 有效输出上限，6.3 表）。
export function theoreticalDps(level) {
  const w = WEAPONS[Math.min(level, MAX_LEVEL) - 1];
  return w.fireRate * w.dmg * w.pellets;
}

// 生成一次射击的弹道（相对玩家中心）。返回子弹描述数组。
// 形态随等级变化：单发/双列/中央重炮+散射/交替追踪/全弹幕+双追踪。
// dmgMult：战机伤害倍率 (v2.1)。
export function spawnPlayerShots(level, x, y, t = 0, dmgMult = 1) {
  const w = WEAPONS[Math.min(level, MAX_LEVEL) - 1];
  const dmg = w.dmg * dmgMult;
  const shots = [];
  const push = (dx, dy, vx, vy, opts = {}) =>
    shots.push({ x: x + dx, y: y + dy, vx, vy, dmg, ...opts });
  const SPEED = 700;
  switch (level) {
    case 1:
      push(0, -10, 0, -SPEED);
      break;
    case 2:
      push(-6, -10, 0, -SPEED);
      push(6, -10, 0, -SPEED);
      break;
    case 3:
      push(0, -12, 0, -SPEED);                       // 中央重炮
      push(-10, -6, -SPEED * 0.18, -SPEED * 0.98);   // 散射
      push(10, -6, SPEED * 0.18, -SPEED * 0.98);
      break;
    case 4: {
      push(-8, -8, 0, -SPEED);
      push(8, -8, 0, -SPEED);
      // 交替追踪：按时间奇偶交替左右偏移
      const side = Math.sin(t * 6) >= 0 ? 1 : -1;
      push(side * 12, -4, side * SPEED * 0.5, -SPEED * 0.85, { homing: true });
      break;
    }
    case 5: {
      push(-10, -10, 0, -SPEED);
      push(10, -10, 0, -SPEED);
      push(-6, -6, -SPEED * 0.3, -SPEED * 0.95);
      push(6, -6, SPEED * 0.3, -SPEED * 0.95);
      push(-14, -4, -SPEED * 0.5, -SPEED * 0.85, { homing: true });
      push(14, -4, SPEED * 0.5, -SPEED * 0.85, { homing: true });
      break;
    }
  }
  return shots;
}
