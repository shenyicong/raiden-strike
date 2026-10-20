// acceptance.test.js — 附录 D 可代码化验收项的自动化测试 (Node 内置 test runner)。
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STATES, StateMachine } from '../src/statemachine.js';
import { levelFromEnergy, applyPowerItem, downgradeOnHit, spawnPlayerShots, theoreticalDps } from '../src/weapons.js';
import { classifyHit, GrazeTracker, killScore } from '../src/scoring.js';
import { rollDrop, expectedPowerItems, expectedPowerEnergy } from '../src/drops.js';
import { getPhase, computePhaseTimes, phasesMeetMinTime } from '../src/boss.js';
import { load, save, recordRun, clearAll, emptyData, defaultSettings, keepTop5, defaultUnlocked } from '../src/storage.js';
import { sliderToGain, busGains, motionFlags, hitboxVisible } from '../src/settings.js';
import { SHIPS } from '../src/config.js';
import { shipById, isUnlocked, gradeUnlocks, unlockText } from '../src/ships.js';

// 内存后端（模拟 localStorage，注入以便测试 FR-SAV-02 降级）
function memBackend(throwOnSet = false) {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { if (throwOnSet) throw new Error('quota'); m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  };
}

// ── TC-CORE-01 六态状态机 + 非法转换忽略 ──
test('状态机：非法转换被忽略且不抛异常', () => {
  const sm = new StateMachine(STATES.READY);
  assert.equal(sm.transition(STATES.PLAYING), true);
  assert.equal(sm.state, STATES.PLAYING);
  // playing 不能直接回 ready（非法）
  assert.equal(sm.transition(STATES.READY), false);
  assert.equal(sm.state, STATES.PLAYING);
  assert.equal(sm.transition(STATES.GAMEOVER), true);
  assert.equal(sm.transition(STATES.PLAYING), false); // gameover 不能回 playing
  assert.equal(sm.transition(STATES.READY), true);
});

// ── TC-CBT-01 武器等级/能量映射 (6.3) ──
test('武器：能量映射到火力等级', () => {
  assert.equal(levelFromEnergy(0), 1);
  assert.equal(levelFromEnergy(100), 2);
  assert.equal(levelFromEnergy(220), 3);   // 100+120
  assert.equal(levelFromEnergy(370), 4);   // +150
  assert.equal(levelFromEnergy(570), 5);   // +200 满级
  assert.equal(levelFromEnergy(9999), 5);  // 不溢出
});
test('武器：火力道具 +34 能量，满级折算 50 分', () => {
  const r = applyPowerItem({ energy: 0, level: 1 });
  assert.equal(r.energy, 34); assert.equal(r.level, 1); assert.equal(r.bonus, 0);
  const full = applyPowerItem({ energy: 570, level: 5 });
  assert.equal(full.level, 5); assert.equal(full.bonus, 50);
});
test('武器：受伤掉级不低于 Lv.1', () => {
  assert.equal(downgradeOnHit(3), 2);
  assert.equal(downgradeOnHit(1), 1);
  // 满级五级形态弹道数随等级增加
  assert.equal(spawnPlayerShots(1, 0, 0).length, 1);
  assert.equal(spawnPlayerShots(5, 0, 0).length, 6);
});

// ── TC-CBT-01/FR-CBT-06/07 判定点 9px 与擦弹 ──
test('判定点半径 9px，擦弹区间 9–21px，同弹仅计一次', () => {
  assert.equal(classifyHit(9), 'hit');
  assert.equal(classifyHit(15), 'graze');
  assert.equal(classifyHit(21), 'graze');
  assert.equal(classifyHit(22), 'none');
  const g = new GrazeTracker();
  assert.equal(g.check(1, 15), true);
  assert.equal(g.check(1, 16), false); // 同弹不重复
  assert.equal(g.check(2, 15), true);
  assert.equal(g.count, 2);
  assert.equal(killScore('scout'), 100);
  assert.equal(killScore('tank'), 420);
});

// ── TC-CBT 掉落：重型必掉火力 + 加权 (6.6) ──
test('掉落：重型单位必掉火力；随机按权重', () => {
  assert.equal(rollDrop('tank'), 'power');
  assert.equal(rollDrop('turret'), 'power');
  // 序列随机源：rollDrop 先判定基础概率再判权重，需两次取值
  const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
  // 基础概率外（rng 远大于 0.14）-> 不掉落
  assert.equal(rollDrop('scout', () => 0.99), null);
  // 基础概率内(0.0) 且权重段 <0.55 -> power
  assert.equal(rollDrop('scout', seq([0.0, 0.0])), 'power');
  assert.equal(rollDrop('scout', seq([0.0, 0.5])), 'bomb');   // 0.42–0.60
  assert.equal(rollDrop('scout', seq([0.0, 0.7])), 'shield'); // 0.60–0.82
  assert.equal(rollDrop('scout', seq([0.0, 0.9])), 'life');   // >0.82
  // v2.4：权重池加入生命后，首区期望火力道具 7.03、能量 239（同一推导口径重算）
  assert.ok(Math.abs(expectedPowerItems(48, 3) - 7.03) < 0.01);
  assert.ok(Math.abs(expectedPowerEnergy(48, 3) - 239.1) < 0.5);
});

// ── TC-ENM-01 Boss 三阶段阈值 + 每阶段 ≥6 秒 ──
test('Boss：阶段阈值 66%/33%，每阶段时长基本 ≥6 秒', () => {
  assert.equal(getPhase(2600, 2600), 0);
  assert.equal(getPhase(1560, 2600), 1); // 60% -> <66%
  assert.equal(getPhase(780, 2600), 2);  // 30% -> <33%
  const t1 = computePhaseTimes(0);
  // v2.3：Boss 血量下调 5%，区域1每阶段约 5.7s（口径不变，阈值同步下移）
  assert.ok(t1.every((t) => t >= 5.5), `region1 阶段时长 ${t1.map((x) => x.toFixed(2))}`);
  assert.ok(phasesMeetMinTime(1));
  assert.ok(phasesMeetMinTime(2));
});

// ── FR-SAV-01/02/03/04/05 存储：读写/版本/降级/前五榜/清除 ──
test('存储：空库返回空结构；读写往返', () => {
  const b = memBackend();
  const d0 = load(b);
  assert.equal(d0.best, null);
  assert.deepEqual(d0.top5, []);
  assert.equal(save(b, { ...d0, best: { score: 100, difficulty: 'standard', date: '2026-10-20' } }), true);
  const d1 = load(b);
  assert.equal(d1.best.score, 100);
});
test('存储：版本不符整体丢弃重建，不抛异常', () => {
  const b = memBackend();
  b.setItem('raiden.v1', JSON.stringify({ schema_version: 99, best: { score: 9 } }));
  const d = load(b);
  assert.equal(d.best, null);
  assert.equal(d.schema_version, 1);
});
test('存储：损坏 JSON 返回空结构（不抛异常）', () => {
  const b = memBackend();
  b.setItem('raiden.v1', '{bad json');
  assert.equal(load(b).best, null);
});
test('存储：写入失败静默降级返回 false', () => {
  const b = memBackend(true);
  assert.equal(save(b, emptyData()), false);
});
test('存储：前五榜保留 5 条，超出丢弃最早', () => {
  let data = emptyData();
  for (let i = 0; i < 7; i++) data = recordRun(data, { score: i * 100, difficulty: 'standard', date: `2026-10-0${i + 1}`, duration: 100 + i, region: 1 });
  assert.equal(data.top5.length, 5);
  assert.equal(data.best.score, 600); // 最高分更新
});
test('存储：清除后返回空结构', () => {
  const b = memBackend();
  save(b, { ...emptyData(), best: { score: 1, difficulty: 'standard', date: '2026-10-20' } });
  const d = clearAll(b);
  assert.equal(d.best, null);
  assert.equal(b.getItem('raiden.v1'), null);
});

// ── FR-SYS-01/03/07 设置：音量对数映射 / 减弱档 / 判定点 ──
test('设置：三路音量对数映射到增益；0 即静音', () => {
  assert.equal(sliderToGain(0), 0);
  assert.equal(sliderToGain(100), 1);
  const g = busGains({ volume: { master: 70, sfx: 70, music: 50 } });
  assert.ok(g.master > 0 && g.master < 1);
  assert.ok(g.music < g.sfx); // music 总线更低
});
test('设置：减弱档关闭震动/白闪、粒子减半、星空2层', () => {
  const f = motionFlags({ motion: 'standard' });
  assert.equal(f.shake, true);
  const r = motionFlags({ motion: 'reduced' });
  assert.equal(r.shake, false);
  assert.equal(r.flash, false);
  assert.equal(r.particleScale, 0.5);
  assert.equal(r.starLayers, 2);
});
test('设置：判定点默认显示，可关闭', () => {
  assert.equal(hitboxVisible(defaultSettings()), true);
  assert.equal(hitboxVisible({ hitboxDot: false }), false);
});

// ── 数值自洽：理论 DPS 随等级提升（6.3 跨度约 6.75 倍）──
test('平衡：Lv.1→Lv.5 理论 DPS 约 6.75 倍', () => {
  const ratio = theoreticalDps(5) / theoreticalDps(1);
  assert.ok(Math.abs(ratio - 6.75) < 0.05, `ratio=${ratio.toFixed(2)}`);
});

// ── v2.1 战机与解锁 ──
test('战机：共 6 架，初始解锁雷霆号与幻影', () => {
  assert.equal(SHIPS.length, 6);
  const un = defaultUnlocked();
  assert.ok(un.includes('raiden'));
  assert.ok(un.includes('phantom'));
  assert.equal(isUnlocked('raiden', un), true);
  assert.equal(isUnlocked('fortress', un), false); // 未解锁机型不可选
});
test('战机：按关卡进度解锁（第2区/第3区/通关/2万分）', () => {
  assert.deepEqual(gradeUnlocks([], { regionReached: 1 }), []);
  assert.ok(gradeUnlocks([], { regionReached: 2 }).includes('fortress')); // 打到第2区
  assert.ok(gradeUnlocks([], { regionReached: 3 }).includes('falcon'));   // 打到第3区
  assert.ok(gradeUnlocks([], { win: true }).includes('aurora'));          // 通关
  assert.deepEqual(gradeUnlocks([], { score: 19999 }), []);
  assert.ok(gradeUnlocks([], { score: 20000 }).includes('phoenix'));      // 2万分
});
test('战机：已解锁的不再重复发放；解锁文案可读', () => {
  assert.deepEqual(gradeUnlocks(['fortress'], { regionReached: 3 }), ['falcon']);
  assert.match(unlockText(shipById('fortress')), /第 2 区/);
  assert.match(unlockText(shipById('aurora')), /通关/);
  assert.equal(shipById('不存在的机型').id, 'raiden', '未知 id 回退到默认机');
});
test('存档：解锁列表随 recordRun 保留，旧存档自动补初始机型', () => {
  const b = memBackend();
  save(b, { ...emptyData(), unlocked: ['fortress'] });
  const d = load(b);
  assert.ok(d.unlocked.includes('fortress') && d.unlocked.includes('raiden'));
  const after = recordRun(d, { score: 1, difficulty: 'standard', date: '2026-01-01', duration: 1, region: 1 });
  assert.ok(after.unlocked.includes('fortress'), '记分不应丢弃解锁进度');
});
