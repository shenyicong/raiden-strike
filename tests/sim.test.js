// sim.test.js — 无头集成：真实驱动 Game 主循环（桩替换 canvas/audio/DOM），验证核心闭环可运行。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 在导入 game.js 之前注入浏览器全局桩
globalThis.location = { search: '' };
const fakeCtx = new Proxy({}, { get: () => () => {} });
const fakeRenderer = { setSettings() {}, updateStars() {}, drawBackground() {}, drawPlayer() {}, drawEnemy() {}, drawBoss() {}, drawBullet() {}, drawParticle() {}, drawDrop() {}, drawHUD() {}, drawFlash() {} };
const fakeAudio = {
  unlock: () => Promise.resolve(true), sfx() {}, startMusic() {}, stopMusic() {},
  applyGains() {}, setMuted() {}, init() {},
};
function fakeInput(fire = true) {
  return { keys: new Set(), dragId: null, get state() { return { left: false, right: false, up: false, down: false, fire, precision: false }; } };
}
function memBackend() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; }

const { Game } = await import('../src/game.js');
const { STATES } = await import('../src/statemachine.js');
const { VIEW } = await import('../src/config.js');

function newGame(input = fakeInput()) {
  return new Game({ renderer: fakeRenderer, audio: fakeAudio, input, backend: memBackend() });
}

test('主循环：开局后波次生成敌机、瞄准射击产生得分', () => {
  const g = newGame();
  g.startRun();
  let sawEnemies = false;
  for (let i = 0; i < 600; i++) { // 约 10 秒模拟
    // 让玩家朝最近敌机横向对齐，验证子弹命中与计分闭环
    g.input.keys.delete('a'); g.input.keys.delete('d');
    if (g.enemies.length) {
      const e = g.enemies.reduce((a, b) => (Math.abs(b.x - g.player.x) < Math.abs(a.x - g.player.x) ? b : a));
      if (e.x < g.player.x - 4) g.input.keys.add('a');
      else if (e.x > g.player.x + 4) g.input.keys.add('d');
    }
    g.step(1 / 60, performance.now() + i * 16);
    if (g.enemies.length > 0) sawEnemies = true;
    if (g.score > 0) break;
  }
  assert.ok(sawEnemies, '应生成过敌机');
  assert.ok(g.score > 0, '瞄准射击应命中并得分，实际 ' + g.score);
});

test('Boss：波次清空后生成；血量降至 66% 切阶段', () => {
  const g = newGame();
  g.startRun();
  g.waves.done = true; g.enemies = [];
  g.step(1 / 60, performance.now());
  assert.ok(g.boss, '波次完成后应生成 Boss');
  assert.equal(g.boss.phase, 0);
  g.boss.hp = g.boss.maxHp * 0.6; // 落入 33%-66%
  g.step(1 / 60, performance.now());
  assert.equal(g.boss.phase, 1, '应切换到阶段 2');
});

test('区域推进：Boss 击破后进入下一区（clear 态）', () => {
  const g = newGame();
  g.startRun();
  g.waves.done = true; g.enemies = [];
  g.step(1 / 60, performance.now());
  const region0 = g.regionIndex;
  g.boss.hp = 0; // 即将击破（置 0 触发击破判定）
  g.step(1 / 60, performance.now());
  assert.equal(g.boss, null);
  assert.equal(g.regionIndex, region0 + 1, '应推进到下一区');
  assert.ok(g.sm.is(STATES.CLEAR) || g.sm.is(STATES.PLAYING));
});

test('中断即暂停：playing 下失焦进入 paused', () => {
  const g = newGame();
  g.startRun();
  g.interrupt();
  assert.equal(g.sm.is(STATES.PAUSED), true);
});

test('游戏结束：生命归零进入 gameover 并写入最高分', () => {
  const g = newGame();
  g.startRun();
  g.score = 12345;
  g.player.lives = 1; g.player.invuln = 0; g.player.alive = true;
  g.player.takeHit(); // 生命 ->0
  g.step(1 / 60, performance.now());
  assert.equal(g.sm.is(STATES.GAMEOVER), true);
  assert.equal(g.data.best?.score, 12345, '最高分应被持久化');
});

test('单帧 dt 钳制：大间隔不导致穿模（位置仍在边界内）', () => {
  const g = newGame();
  g.startRun();
  g.step(5.0, performance.now()); // 远超 0.1 上限，应被 step 内部逻辑忽略（step 不钳制，由调用方钳制）
  // step 本身不钳制 dt（main 循环钳制），这里仅验证不抛异常且玩家仍在场内
  assert.ok(g.player.x >= 0 && g.player.x <= VIEW.W);
});

test('v2.1 炸弹：只能收集入库，按使用键不消耗、不清屏', () => {
  const g = newGame();
  g.startRun();
  g.player.bombs = 0;
  g.applyDrop({ kind: 'bomb', x: g.player.x, y: g.player.y });
  assert.equal(g.player.bombs, 1, 'B 补给应可收集入库');
  g.enemies = [{ x: 10, y: 10, hp: 999, dead: false }];
  g.eBullets = [{ id: 1, x: 10, y: 10, r: 4, dead: false, update() {} }];
  g.useBomb(); // 炸弹不可使用
  assert.equal(g.player.bombs, 1, '炸弹不应被消耗');
  assert.equal(g.eBullets.length, 1, '不应清屏');
  assert.equal(g.enemies[0].hp, 999, '不应造成伤害');
});

test('v2.1 战机：开局按所选机型生效，打完第 1 区解锁重装堡垒', () => {
  const g = newGame();
  g.settings.ship = 'phantom';
  g.startRun();
  assert.equal(g.player.ship.id, 'phantom');
  assert.equal(g.player.hitR, 6, '幻影判定 6px');
  assert.equal(g.player.lives, 2, '幻影生命 -1（标准难度 3）');
  // 击破第 1 区 Boss -> 到达第 2 区
  g.waves.done = true; g.enemies = [];
  g.step(1 / 60, performance.now());
  g.boss.hp = 0;
  g.step(1 / 60, performance.now());
  assert.ok((g.data.unlocked || []).includes('fortress'), '到达第 2 区应解锁重装堡垒');
});
