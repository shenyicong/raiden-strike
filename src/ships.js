// ships.js — 战机选择与解锁规则 (v2.1)。无 DOM 依赖，浏览器与 Node 测试共用。
// 解锁条件分四类：初始解锁 / 到达指定区 / 通关 / 单局分数达标。
import { SHIPS, DEFAULT_SHIP_ID } from './config.js';

export function shipById(id) {
  return SHIPS.find((s) => s.id === id)
    || SHIPS.find((s) => s.id === DEFAULT_SHIP_ID)
    || SHIPS[0];
}

// 未解锁列表为空（旧存档）时，初始机型仍可使用。
export function isUnlocked(id, unlocked = []) {
  const s = shipById(id);
  if (!s.unlock || s.unlock.type === 'default') return true;
  return Array.isArray(unlocked) && unlocked.includes(s.id);
}

export function usableShips(unlocked = []) {
  return SHIPS.filter((s) => isUnlocked(s.id, unlocked));
}

// 依据当前进度计算"应授予"的战机 id 列表（不含已解锁的）。
// cond = { regionReached, win, score }
export function gradeUnlocks(unlocked = [], cond = {}) {
  const regionReached = cond.regionReached || 0;
  const win = !!cond.win;
  const score = cond.score || 0;
  const granted = [];
  for (const s of SHIPS) {
    if (isUnlocked(s.id, unlocked)) continue;
    const u = s.unlock || {};
    if (u.type === 'region' && regionReached >= u.region) granted.push(s.id);
    else if (u.type === 'win' && win) granted.push(s.id);
    else if (u.type === 'score' && score >= u.score) granted.push(s.id);
  }
  return granted;
}

// 解锁条件的中文说明，用于选机界面。
export function unlockText(s) {
  const u = (s && s.unlock) || {};
  if (u.type === 'region') return `到达第 ${u.region} 区解锁`;
  if (u.type === 'win') return '通关战役解锁';
  if (u.type === 'score') return `单局 ${u.score.toLocaleString('en-US')} 分解锁`;
  return '初始解锁';
}
