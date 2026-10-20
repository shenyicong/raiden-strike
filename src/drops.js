// drops.js — 掉落判定 (6.6)。可注入 rng 以便确定性测试。
import { DROPS, POWER_PER_ITEM } from './config.js';

function weightedPick(rng) {
  const w = DROPS.WEIGHTS;
  const r = rng();
  if (r < w.power) return 'power';
  if (r < w.power + w.bomb) return 'bomb';
  return 'shield';
}

// 击破敌机时决定掉落。返回 'power' | 'bomb' | 'shield' | null。
// 重型单位(tank/turret)必掉且优先火力；其余按 BASE_CHANCE 与池内权重。
export function rollDrop(enemyType, rng = Math.random) {
  if (DROPS.HEAVY_FORCED.includes(enemyType)) return 'power';
  if (rng() < DROPS.BASE_CHANCE) return weightedPick(rng);
  return null;
}

// 期望统计（仅供测试/平衡校验，非运行期调用）：
// 每区约 48 架 ×14% ≈ 6.7 次随机掉落；×55% + 3 个重型必掉 ≈ 6.7 火力道具；×34 ≈ 228 能量。
export function expectedPowerItems(regionEnemyCount = 48, heavyCount = 3) {
  const randomDrops = regionEnemyCount * DROPS.BASE_CHANCE;
  return randomDrops * DROPS.WEIGHTS.power + heavyCount;
}
export function expectedPowerEnergy(regionEnemyCount = 48, heavyCount = 3) {
  return expectedPowerItems(regionEnemyCount, heavyCount) * POWER_PER_ITEM;
}
