// boss.js — Boss 三阶段与弹幕模式 (FR-ENM-04 / 6.5 / 6.7)。
import { BOSS, REGIONS, WEAPONS } from './config.js';
import { theoreticalDps } from './weapons.js';

// 由当前 hp 比例返回阶段索引 0/1/2。阈值 66% / 33%。
export function getPhase(hp, maxHp) {
  const r = maxHp > 0 ? hp / maxHp : 0;
  if (r > BOSS.PHASE_THRESHOLDS[0]) return 0;
  if (r > BOSS.PHASE_THRESHOLDS[1]) return 1;
  return 2;
}

// 阶段切换时清空敌弹并停火 0.8s (6.5)。
export function onPhaseSwitch() {
  return { clearBullets: true, holdFire: BOSS.SWITCH_CLEAR_TIME };
}

// 理论每阶段时长（秒），基于 6.7 模型：有效输出占比 65%。
// 每阶段约占 1/3 血量；与 FR-ENM-04/ F-05 的"每阶段 ≥6 秒"约束对应 (TC-ENM-01)。
// regionExpectedLevel: 区域结束时预期火力等级 (6.7: 1区Lv.3, 2区Lv.4, 3区Lv.5)。
export function computePhaseTimes(regionIndex, effectiveOutput = 0.65) {
  const region = REGIONS[regionIndex];
  const expectedLevel = [3, 4, 5][regionIndex] ?? 5;
  const effDps = theoreticalDps(expectedLevel) * effectiveOutput;
  const fracs = [0.34, 0.33, 0.33]; // 66-100 / 33-66 / 0-33
  return fracs.map((f) => region.bossHp * f / effDps);
}

// 校验每阶段时长 ≥ MIN_PHASE_TIME (6 秒)。
export function phasesMeetMinTime(regionIndex, effectiveOutput = 0.65) {
  return computePhaseTimes(regionIndex, effectiveOutput).every((t) => t >= BOSS.MIN_PHASE_TIME);
}

// 弹幕模式顺序：四模式按序轮换，每阶段重置序列 (FR-ENM-05)。
export function patternForPhase(phase, shotIndex) {
  const n = BOSS.PATTERNS.length;
  return BOSS.PATTERNS[shotIndex % n];
}

// 阶段发射间隔（受难度 intervalMult 影响由调用方乘）。
export function phaseInterval(phase) {
  return BOSS.PHASE_INTERVAL[phase];
}
