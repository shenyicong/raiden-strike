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
const inputModule = await import('../src/input.js');

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

test('v2.2 炸弹：可收集入库，也可主动使用（清屏+伤害+消耗）', () => {
  const g = newGame();
  g.startRun();
  g.player.bombs = 0;
  g.applyDrop({ kind: 'bomb', x: g.player.x, y: g.player.y });
  assert.equal(g.player.bombs, 1, 'B 补给应可收集入库');
  g.enemies = [{ x: 10, y: 10, hp: 999, dead: false }];
  g.eBullets = [{ id: 1, x: 10, y: 10, r: 4, dead: false, update() {} }];
  g.useBomb();
  assert.equal(g.player.bombs, 0, '使用后应消耗一颗');
  assert.equal(g.eBullets.length, 0, '应清空敌弹');
  assert.ok(g.enemies[0].hp < 999, '应对全场敌人造成伤害');
  assert.ok(g.player.invuln > 0, '应获得短暂无敌');
  g.useBomb(); // 无炸弹时不报错
  assert.equal(g.player.bombs, 0);
});

test('v2.2 拖动跟手：按下时记录机身与手指的相对偏移，移动后偏移保持不变', () => {
  const events = {};
  const canvas = {
    _logicalW: 480, _logicalH: 720,
    addEventListener: (t, f) => { (events[t] || (events[t] = [])).push(f); },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 720 }),
    setPointerCapture() {},
  };
  globalThis.window = { addEventListener: (t, f) => { (events[t] || (events[t] = [])).push(f); } };
  globalThis.document = { addEventListener() {} };
  const { InputManager, TOUCH_BUTTONS } = inputModule;
  let bombCalls = 0, pauseCalls = 0;
  const inp = new InputManager(canvas, {
    getPlayerPos: () => ({ x: 240, y: 630 }),
    onBomb: () => { bombCalls++; },
    onPause: () => { pauseCalls++; },
  });
  // 手指按在机身下方 30px 处
  const down = { pointerId: 1, clientX: 240, clientY: 660 };
  events.pointerdown.forEach((f) => f(down));
  assert.equal(inp.dragX, 240, '横向应精确对齐');
  assert.equal(inp.dragY, 630, '纵向应保持按下时的相对位置（机身高于手指 30px）');
  // 手指上移 100px -> 机身也上移 100px，偏移不变
  events.pointermove.forEach((f) => f({ pointerId: 1, clientX: 240, clientY: 560 }));
  assert.equal(inp.dragX, 240);
  assert.equal(inp.dragY, 530, '手指走多少，机身走多少（无延迟/无跳变）');
  // 点击右下角炸弹按钮 -> 触发 onBomb 且不打断拖动锚点
  const b = TOUCH_BUTTONS.bomb;
  events.pointerdown.forEach((f) => f({ pointerId: 2, clientX: b.x, clientY: b.y }));
  assert.equal(bombCalls, 1, '炸弹按钮应触发放弹');
  assert.equal(inp.dragId, 1, '按钮不应抢走拖动锚点');
  // 左下角暂停按钮
  events.pointerdown.forEach((f) => f({ pointerId: 3, clientX: TOUCH_BUTTONS.pause.x, clientY: TOUCH_BUTTONS.pause.y }));
  assert.equal(pauseCalls, 1, '暂停按钮应触发暂停');
});

test('v2.1 战机：开局按所选机型生效，打完第 1 区解锁重装堡垒', () => {
  const g = newGame();
  g.settings.ship = 'phantom';
  g.startRun();
  assert.equal(g.player.ship.id, 'phantom');
  assert.equal(g.player.hitR, 6, '幻影判定 6px');
  assert.equal(g.player.lives, 3, '幻影生命 -1（v2.3 标准难度 4）');
  // 击破第 1 区 Boss -> 到达第 2 区
  g.waves.done = true; g.enemies = [];
  g.step(1 / 60, performance.now());
  g.boss.hp = 0;
  g.step(1 / 60, performance.now());
  assert.ok((g.data.unlocked || []).includes('fortress'), '到达第 2 区应解锁重装堡垒');
});

test('v2.2 再来一局：gameover/win 态点重开必须真正进入 playing', () => {
  const g = newGame();
  g.startRun();
  // 触发 gameover
  g.player.lives = 1; g.player.invuln = 0; g.player.alive = true;
  g.player.takeHit();
  g.step(1 / 60, performance.now());
  assert.equal(g.sm.is(STATES.GAMEOVER), true);
  // 点"再来一局"
  g.startRun();
  assert.equal(g.sm.is(STATES.PLAYING), true, '重开后应进入战斗，而不是停在结算态');
  assert.equal(g.score, 0);
  assert.ok(g.player.lives > 0);
  // 通关态同样可重开
  const g2 = newGame();
  g2.startRun();
  g2.sm.transition(STATES.WIN);
  g2.startRun();
  assert.equal(g2.sm.is(STATES.PLAYING), true, '通关后重开也应进入战斗');
});
