// drops.js — 掉落判定 (6.6)。可注入 rng 以便确定性测试。
import { DROPS, POWER_PER_ITEM } from './config.js';

function weightedPick(rng) {
  const w = DROPS.WEIGHTS;
  const r = rng();
  if (r < w.power) return 'power';
  if (r < w.power + w.bomb) return 'bomb';
  if (r < w.power + w.bomb + w.shield) return 'shield';
  return 'life';
}

// v2.4 独立爆率：护盾/生命在权重池之外再各自掷一次骰子（低概率、可叠加触发）。
export function bonusRoll(rng = Math.random) {
  const life = DROPS.LIFE_CHANCE || 0;
  const shield = DROPS.SHIELD_CHANCE || 0;
  const r = rng(); // 单次掷骰：life 段 -> shield 段 -> 无
  if (r < life) return 'life';
  if (r < life + shield) return 'shield';
  return null;
}

// 击破敌机时决定掉落。返回 'power' | 'bomb' | 'shield' | 'life' | null。
// 重型单位(tank/turret)必掉火力；其余按 BASE_CHANCE + 池内权重，
// 未命中基础概率时仍按独立爆率掷一次护盾/生命（v2.4）。
// V2.8.0：baseChance 可由模式覆盖（无尽模式掉落更慷慨，FR-2.4），缺省沿用 DROPS.BASE_CHANCE。
export function rollDrop(enemyType, rng = Math.random, baseChance = null) {
  const base = (baseChance == null) ? DROPS.BASE_CHANCE : baseChance;
  if (DROPS.HEAVY_FORCED.includes(enemyType)) return 'power';
  if (rng() < base) return weightedPick(rng);
  return bonusRoll(rng);
}

// 期望统计（仅供测试/平衡校验，非运行期调用）：
// v2.4 口径：每区约 48 架 ×20% ≈ 9.6 次随机掉落；×42% + 3 个重型必掉 ≈ 火力道具数。
export function expectedPowerItems(regionEnemyCount = 48, heavyCount = 3) {
  const randomDrops = regionEnemyCount * DROPS.BASE_CHANCE;
  return randomDrops * DROPS.WEIGHTS.power + heavyCount;
}
export function expectedPowerEnergy(regionEnemyCount = 48, heavyCount = 3) {
  return expectedPowerItems(regionEnemyCount, heavyCount) * POWER_PER_ITEM;
}
