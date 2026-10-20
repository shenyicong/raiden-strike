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
const { DROPS, OVERDRIVE, REGIONS, PLAYER, ENEMY_DAMAGE } = await import('../src/config.js');
const VIEW_H = VIEW.H;
const inputModule = await import('../src/input.js');
const entitiesModule = await import('../src/entities.js');
const { rollDrop } = await import('../src/drops.js');

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

test('v2.4 难度递进：血量/射速/数量/弹速随存活时间平滑上升并封顶', () => {
  const g = newGame();
  g.startRun();
  // 0 秒：无加成
  let s = g.rampScale();
  assert.equal(s.hpMult, 1); assert.equal(s.fireMult, 1); assert.equal(s.extra, 0);
  // 60 秒：明显加强
  g.runTime = 60; s = g.rampScale();
  assert.ok(s.hpMult > 1.3 && s.hpMult < 1.4, '血量应上升到约 1.36 倍，实际 ' + s.hpMult.toFixed(2));
  assert.ok(s.fireMult > 1.3, '射速应上升，实际 ' + s.fireMult.toFixed(2));
  assert.ok(s.speedMult > 1.1, '弹速应上升');
  assert.ok(s.extra >= 1, '每波应追加敌机');
  // 600 秒：封顶不再变难
  g.runTime = 600; const cap = g.rampScale();
  g.runTime = 120; const at120 = g.rampScale();
  assert.equal(cap.hpMult, at120.hpMult, '到达上限后不应继续变难');
});

test('v2.4 敌机成长：血量按倍率放大，开火频率同步提高', () => {
  const mod = entitiesModule;
  const base = new mod.Enemy('fighter', 100, 0);
  const grown = new mod.Enemy('fighter', 100, 0, { hpMult: 1.5, fireMult: 1.4 });
  assert.ok(grown.hp > base.hp * 1.4, '血量应放大');
  assert.equal(grown.maxHp, grown.hp, '血条上限应等于当前血量');
  assert.ok(grown.fireRate > base.fireRate * 1.3, '射速应提高');
});

test('v2.4 道具随机爆率：护盾/生命可独立掉落，生命拾取加命', () => {
  const g = newGame();
  g.startRun();
  const before = g.player.lives;
  g.applyDrop({ kind: 'life', x: g.player.x, y: g.player.y });
  assert.equal(g.player.lives, before + 1, '生命道具应加一条命');
  // 独立爆率：未命中基础概率时仍可能掉护盾/生命
  const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
  assert.equal(rollDrop('scout', () => 0.99), null, '未命中基础概率且独立爆率不中则无掉落');
  // 第一次掷骰 > 基础概率（走独立爆率），第二次决定具体道具
  assert.equal(rollDrop('scout', seq([0.5, 0.001])), 'life', '独立爆率掉生命');
  assert.equal(rollDrop('scout', seq([0.5, 0.08])), 'shield', '独立爆率掉护盾');
  assert.equal(rollDrop('scout', seq([0.5, 0.5])), null, '独立爆率未命中');
});

test('v2.5 漏网敌机重整：飞出下缘后带着剩余血量，数秒后从上方重返战场', () => {
  const g = newGame();
  g.startRun();
  g.waves.done = true; // 只观察重整行为，屏蔽波次干扰
  const e = new entitiesModule.Enemy('fighter', 200, VIEW_H + 40); // 已越过下缘
  e.hp = 12; e.maxHp = 30; // 被打残
  g.enemies = [e];
  g.step(1 / 60, performance.now());
  assert.equal(g.enemies.length, 0, '离场的敌机应移出战场，不再堆在飞机下方');
  assert.equal(g.rally.length, 1, '应进入重整队列');
  assert.equal(g.rally[0].hp, 12, '重整数据应保留剩余血量');

  // 等到它重新入场就立刻检查（用 reentries 精确定位，避免误选波次刷出的同型敌机）
  let back = null;
  for (let i = 0; i < 300 && !back; i++) {
    g.step(1 / 60, performance.now() + i * 16);
    back = g.enemies.find((x) => x.reentries === 1) || null;
  }
  assert.ok(back, '到时应重新出现在战场上');
  assert.ok(back.y < 200, '应从上方入场，实际 y=' + back.y.toFixed(0));
  assert.equal(back.hp, 12, '血量应保持被打残时的数值');
  assert.equal(back.maxHp, 30, '血条上限沿用满血，剩余比例可见');
  assert.equal(back.reentries, 1, '应记录重整次数');
});

test('v2.5 重整次数封顶，避免敌机无限循环', () => {
  const g = newGame();
  g.startRun();
  for (let round = 0; round < 5; round++) {
    const e = new entitiesModule.Enemy('scout', 200, VIEW_H + 40);
    e.reentries = round; // 模拟已经重整过 round 次
    g.enemies = [e];
    g.step(1 / 60, performance.now());
  }
  assert.ok(g.rally.length <= 3, '超过 MAX_TIMES 的敌机不再入队，实际排队 ' + g.rally.length);
});

test('v2.6 自动开火：无需长按射击键，战机也持续发射子弹', () => {
  const g = newGame(fakeInput(false)); // 明确未按下任何射击键/未拖动
  g.startRun();
  let sawBullet = false;
  for (let i = 0; i < 40; i++) {
    g.step(1 / 60, performance.now() + i * 16);
    if (g.pBullets.length > 0) { sawBullet = true; break; }
  }
  assert.ok(sawBullet, '未按射击键也应自动开火');
});

test('v2.6 道具自动下落：爆出后持续下降，并加速到顶速', () => {
  const g = newGame();
  g.startRun();
  g.player.x = 24; g.player.y = VIEW_H - 30; // 远离道具，避免被吸附干扰
  g.drops = [{ x: 400, y: 120, kind: 'power', vy: 0 }];
  const y0 = g.drops[0].y;
  for (let i = 0; i < 30; i++) g.step(1 / 60, performance.now() + i * 16);
  assert.ok(g.drops.length === 1, '半秒内道具不应离场');
  assert.ok(g.drops[0].y > y0 + 20, `道具应自动下落，实际位移 ${(g.drops[0].y - y0).toFixed(1)}px`);
  assert.ok(g.drops[0].vy > 0, '应带下落速度');
  // 2 秒后达到顶速并匀速
  for (let i = 0; i < 120; i++) g.step(1 / 60, performance.now() + i * 16);
  if (g.drops.length) assert.ok(g.drops[0].vy <= DROPS.FALL_SPEED + 1e-6, '下落速度应被顶速封顶');
});

test('v2.6 超载积攒：命中敌机与击破都会为蓝条充能', () => {
  const g = newGame();
  g.startRun();
  g.overdrive = 0;
  const e = new entitiesModule.Enemy('scout', g.player.x, g.player.y - 160);
  g.enemies = [e];
  for (let i = 0; i < 120 && g.overdrive <= 0; i++) g.step(1 / 60, performance.now() + i * 16);
  assert.ok(g.overdrive > 0, '命中敌机后蓝条应开始充能');
});

test('v2.6 超载爆发：蓝条集满自动引爆，清空屏幕所有敌机', () => {
  const g = newGame();
  g.startRun();
  for (let i = 0; i < 3; i++) g.enemies.push(new entitiesModule.Enemy('scout', 80 + i * 120, 220));
  g.overdrive = OVERDRIVE.MAX; // 直接置满
  const before = g.score;
  g.step(1 / 60, performance.now());
  assert.equal(g.enemies.length, 0, '集满应清空屏幕上所有敌机');
  assert.equal(g.overdrive, 0, '引爆后蓝条应清零');
  assert.ok(g.score > before, '清屏应计分');
  assert.ok(g.player.invuln > 0, '引爆后应有短暂无敌');
});

test('v2.6 超载爆发：Boss 不被秒杀，只承受一次重创', () => {
  const g = newGame();
  g.startRun();
  g.boss = new entitiesModule.Boss(0);
  g.boss.entering = false;
  const hp0 = g.boss.hp;
  g.overdrive = OVERDRIVE.MAX;
  g.step(1 / 60, performance.now());
  assert.ok(g.boss && g.boss.hp < hp0, 'Boss 应受伤而非被清屏秒杀');
  assert.ok(hp0 - g.boss.hp >= OVERDRIVE.BOSS_DAMAGE, `伤害应至少 ${OVERDRIVE.BOSS_DAMAGE}`);
});

test('v2.6 关卡阈值：每关有清理阈值，达标后停止刷怪、清屏即出 Boss', () => {
  const g = newGame();
  g.startRun();
  const quota = g.regionQuota;
  assert.ok(quota > 0 && quota <= 40, '每关应有合理阈值，实际 ' + quota);
  assert.equal(quota, REGIONS[0].quota, '阈值取自区域配置');
  g.regionKills = quota; // 模拟已清理达标
  g.step(1 / 60, performance.now());
  assert.ok(g.waves.done, '达标后应停止刷怪');
  g.enemies = [];
  g.step(1 / 60, performance.now() + 16);
  assert.ok(g.boss, '清屏后应拉出 Boss');
});

test('v2.6 关卡阈值：进入新区后计数重新归零', () => {
  const g = newGame();
  g.startRun();
  g.regionKills = g.regionQuota;
  g.regionIndex = 0;
  g.boss = new entitiesModule.Boss(0);
  g.boss.hp = 0; // 触发 onBossDead -> 进入下一区
  g.onBossDead();
  assert.equal(g.regionIndex, 1, '应推进到第二区');
  assert.equal(g.regionKills, 0, '新区阈值计数应归零');
  assert.equal(g.regionQuota, REGIONS[1].quota, '应改用第二区的阈值');
});

test('v2.6.1 敌机射速 +50%：三种会开火的敌机频率均提升到 1.5 倍', () => {
  const mod = entitiesModule;
  // 基准值来自 v2.3：fighter 1.00 / tank 0.70 / turret 1.15
  assert.ok(Math.abs(new mod.Enemy('fighter', 0, 0).fireRate - 1.50) < 1e-6, 'fighter 应 1.50');
  assert.ok(Math.abs(new mod.Enemy('tank', 0, 0).fireRate - 1.05) < 1e-6, 'tank 应 1.05');
  assert.ok(Math.abs(new mod.Enemy('turret', 0, 0).fireRate - 1.73) < 0.01, 'turret 应约 1.73');
  assert.equal(new mod.Enemy('scout', 0, 0).fireRate, 0, '侦察机仍不开火');
});

test('v2.6.1 敌机伤害 +50%：一发敌弹扣光一条命并溢出，两发掉三命', () => {
  const g = newGame();
  g.startRun();
  const p = g.player;
  p.lives = 9; p.invuln = 0; p.shield = 0; p.alive = true;
  p.lifeHp = PLAYER.LIFE_HP;
  p.takeHit(ENEMY_DAMAGE.BULLET); // 150 伤害 = 1.5 条命
  assert.equal(p.lives, 8, '第一发掉 1 命');
  assert.ok(Math.abs(p.lifeHp - PLAYER.LIFE_HP * 0.5) < 1e-6, '应只剩半条命的耐久');
  p.invuln = 0;
  p.takeHit(ENEMY_DAMAGE.BULLET); // 再一发：0.5 - 1.5 -> 连带下一条命
  assert.equal(p.lives, 6, '两发共掉 3 命（相对旧版 +50%）');
  // 旧行为回归：不传伤害参数仍是"一击一命"
  const p2 = g.player; p2.invuln = 0;
  const before = p2.lives;
  p2.takeHit();
  assert.equal(p2.lives, before - 1, '默认伤害应等价于旧版一击一命');
});

test('v2.6.1 蓝条积攒变慢：同样的输出换来的能量明显减少', () => {
  const g = newGame();
  g.startRun();
  g.overdrive = 0;
  g.player.level = 5; // 满火力：8/s * 9 伤害
  const e = new entitiesModule.Enemy('tank', g.player.x, g.player.y - 120);
  g.enemies = [e];
  for (let i = 0; i < 60; i++) g.step(1 / 60, performance.now() + i * 16); // 1 秒
  // 系数层面：三项来源全部下调（v2.6 基准 0.35 / 4 / 0.6）
  assert.ok(OVERDRIVE.PER_DMG < 0.35, '每点伤害的充能应下调');
  assert.ok(OVERDRIVE.PER_KILL < 4, '击破充能应下调');
  assert.ok(OVERDRIVE.PER_GRAZE < 0.6, '擦弹充能应下调');
  // 体感层面：满火力 1 秒的充能量应明显低于 v2.6 的约 38
  assert.ok(g.overdrive > 0, '仍应能充能');
  assert.ok(g.overdrive < 30, `充能速度应下降，1 秒内实际 ${g.overdrive.toFixed(1)}`);
});

test('v2.6.1 Boss 强化：血量 +20%、阶段间隔缩短（射速 +50%）、弹量增加', async () => {
  const bossCfg = (await import('../src/config.js')).BOSS;
  const regions = (await import('../src/config.js')).REGIONS;
  assert.equal(regions[0].bossHp, 2970, '一区 Boss 血量 +20%');
  assert.equal(regions[1].bossHp, 4790, '二区 Boss 血量 +20%');
  assert.equal(regions[2].bossHp, 7300, '三区 Boss 血量 +20%');
  assert.ok(Math.abs(bossCfg.PHASE_INTERVAL[0] - 1.2) < 1e-6, '阶段间隔 1.8 -> 1.2（射速 +50%）');
  assert.ok(bossCfg.RING_COUNT > 14 && bossCfg.SPIRAL_COUNT > 3, '环形/螺旋弹量应增加');
  assert.ok(bossCfg.PHASE_SPEED_MULT[2] > 1.36, '三阶段弹速应提高');
});

test('v2.6.1 背景音乐：三区各一套主题 + Boss 紧张版，可切换曲目', async () => {
  const calls = [];
  const audio = {
    unlock: () => Promise.resolve(true), sfx() {}, applyGains() {}, setMuted() {}, init() {},
    startMusic(r) { calls.push(['start', r]); }, stopMusic() { calls.push(['stop']); },
    setTrack(r, boss) { calls.push(['track', r, !!boss]); },
  };
  const { Game } = await import('../src/game.js');
  const g = new Game({ renderer: fakeRenderer, audio, input: fakeInput(), backend: memBackend() });
  g.startRun();
  await new Promise((r) => setTimeout(r, 0)); // startMusic 在 unlock() 的 then 里调用
  assert.ok(calls.some((c) => c[0] === 'start'), '开局应启动 BGM');
  // Boss 出场 -> 切紧张版
  calls.length = 0;
  g.regionKills = g.regionQuota;
  g.step(1 / 60, performance.now());
  g.enemies = [];
  g.step(1 / 60, performance.now() + 16);
  assert.ok(g.boss, '应拉出 Boss');
  assert.ok(calls.some((c) => c[0] === 'track' && c[2] === true), 'Boss 出场应切紧张版曲目');
  // 击杀 Boss -> 换区换曲
  calls.length = 0;
  g.boss.hp = 0;
  g.onBossDead();
  assert.ok(calls.some((c) => c[0] === 'track' && c[1] === 1 && c[2] === false), '进入新区应换曲');
});
