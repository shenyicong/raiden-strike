// v28.test.js — V2.8.0 验收（PRD 附录E 需求可追溯矩阵 RTM）。
// 覆盖四大模块：终局与结算 FR-1.x、模式系统 FR-2.x、打击感 FR-3.x、画风 FR-4.x。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// 在导入 game.js 之前注入浏览器全局桩
globalThis.location = { search: '' };
const fakeRenderer = {
  setSettings() {}, updateStars() {}, drawBackground() {}, drawPlayer() {}, drawEnemy() {},
  drawBoss() {}, drawBullet() {}, drawParticle() {}, drawDrop() {}, drawHUD() {}, drawFlash() {},
  drawShockwaves() {}, drawFloats() {}, drawTouchButtons() {},
};
const fakeAudio = {
  unlock: () => Promise.resolve(true), sfx() {}, startMusic() {}, stopMusic() {},
  applyGains() {}, setMuted() {}, setTrack() {}, init() {},
};
function fakeInput(fire = true) {
  return { keys: new Set(), dragId: null, bombFlash: 0, get state() { return { left: false, right: false, up: false, down: false, fire, precision: false }; } };
}
function memBackend(preload) {
  const m = preload ? { ...preload } : {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}

const { Game } = await import('../src/game.js');
const { STATES, StateMachine } = await import('../src/statemachine.js');
const { ENDGAME, FEEL, MODES, REGIONS, ART, DEFAULT_MODE, STORAGE_KEY, STORAGE_SCHEMA_VERSION } = await import('../src/config.js');
const { comboMultiplier, gradeRun } = await import('../src/scoring.js');
const { Enemy } = await import('../src/entities.js');
const { defaultSettings, emptyData, recordRun, bestOf, normalizeMode, load } = await import('../src/storage.js');

function newGame(input = fakeInput()) {
  return new Game({ renderer: fakeRenderer, audio: fakeAudio, input, backend: memBackend() });
}
// 连续推进 n 帧（固定 1/60 步长，与 NFR 帧钳制一致）
function stepN(g, n) { for (let i = 0; i < n; i++) g.step(1 / 60, performance.now() + i * 16); }
// 清空战场并停刷，构造"空屏"场景（用于兜底与连击窗口等纯计时验证）
function idleField(g) { g.enemies = []; g.rally = []; g.boss = null; if (g.waves) g.waves.done = true; }

// ── FR-1.x 对局终局与结算 ────────────────────────────────────────────────

test('FR-1.1 战役胜利：击破第 3 区最终 Boss 进入 victory 并产出结算', () => {
  const g = newGame();
  g.startRun();
  g.regionIndex = REGIONS.length - 1;   // 直接推进到末区
  idleField(g);
  g.step(1 / 60, performance.now());
  assert.ok(g.boss, '应召唤区末 Boss');
  g.boss.hp = 0;
  g.step(1 / 60, performance.now());
  assert.ok(g.sm.is(STATES.VICTORY), '战役末区 Boss 击破应进入 victory，实际 ' + g.sm.state);
  assert.equal(g.summary.outcome, 'victory');
});

test('FR-1.2 失败：生命耗尽进入 gameover 并写入结算', () => {
  const g = newGame();
  g.startRun();
  g.player.lives = 0;
  g.player.alive = false;
  g.step(1 / 60, performance.now());
  assert.ok(g.sm.is(STATES.GAMEOVER), '应进入 gameover，实际 ' + g.sm.state);
  assert.equal(g.summary.outcome, 'gameover');
});

test('FR-1.3 防死锁：无敌人无 Boss 空屏达 DEADLOCK_TIMEOUT 强制推进', () => {
  const g = newGame();
  g.startRun();
  let broke = 0;
  const orig = g._breakDeadlock.bind(g);
  g._breakDeadlock = () => { broke += 1; orig(); };
  g._spawnBoss = () => {};   // 屏蔽常规召唤，构造"波次已收尾但 Boss 未登场"的空屏
  idleField(g);
  stepN(g, Math.floor(4 * 60));
  assert.equal(broke, 0, `4 秒未达阈值 ${ENDGAME.DEADLOCK_TIMEOUT}s，不应触发兜底`);
  stepN(g, Math.ceil(1.2 * 60));
  assert.ok(broke >= 1, '超过 DEADLOCK_TIMEOUT 必须强制推进流程');
});

test('FR-1.4 结算：评级/击破/最大连击/命中率/用时/本局解锁字段齐全', () => {
  const g = newGame();
  g.startRun();
  g.stats.shotsFired = 10;
  g.stats.shotsHit = 5;
  g.registerKill(); g.registerKill();
  const s = g.finishRun('gameover');
  for (const k of ['outcome', 'mode', 'score', 'grade', 'kills', 'maxCombo', 'accuracy', 'duration', 'unlocked']) {
    assert.ok(k in s, '结算缺字段：' + k);
  }
  assert.equal(s.accuracy, 0.5, '命中率应为 5/10');
  assert.ok(s.maxCombo >= 2);
  assert.equal(typeof s.duration, 'number');
});

test('FR-1.4 评级：S 需无伤，其余按分数档位', () => {
  assert.equal(gradeRun({ score: 70000, noMiss: true }), 'S');
  assert.equal(gradeRun({ score: 70000, noMiss: false }), 'A');
  assert.equal(gradeRun({ score: 45000 }), 'A');
  assert.equal(gradeRun({ score: 25000 }), 'B');
  assert.equal(gradeRun({ score: 10 }), 'C');
});

test('FR-1.5 状态机：region-clear 与 victory 的合法流转符合 PRD 附录B', () => {
  // 每次转换都用全新实例，避免前一次转换改变当前态而误判
  const mk = (s) => new StateMachine(s);
  assert.equal(mk('region-clear').transition('playing'), true);
  assert.equal(mk('region-clear').transition('victory'), true);
  assert.equal(mk('region-clear').transition('gameover'), false, '非法转换必须被忽略');
  assert.equal(mk('victory').transition('ready'), true);
  assert.equal(mk('victory').transition('playing'), false, 'victory 只能回 ready');
  assert.equal(mk('gameover').transition('ready'), true);
});

// ── FR-2.x 模式系统 ─────────────────────────────────────────────────────

test('FR-2.2 无尽模式：击破精英 Boss 不进入 victory，区域循环继续', () => {
  const g = newGame();
  g.settings.mode = 'endless';
  g.startRun();
  assert.equal(g.mode, 'endless');
  g._spawnBoss();
  const r0 = g.regionIndex;
  g.boss.hp = 0;
  g.step(1 / 60, performance.now());
  assert.ok(g.sm.is(STATES.PLAYING), '无尽无胜利条件，应保持 playing，实际 ' + g.sm.state);
  assert.notEqual(g.regionIndex, r0, '区域应循环推进');
});

test('FR-2.2 无尽波次：导演不设收尾上限（持续续波）', () => {
  const g = newGame();
  g.settings.mode = 'endless';
  g.startRun();
  assert.equal(g.waves.maxWaves, Infinity);
});

test('FR-2.4 模式配置：无尽难度不封顶、掉落更慷慨、计分倍率更高', () => {
  const g = newGame();
  g.settings.mode = 'endless';
  g.startRun();
  const c = g.modeCfg;
  const base = MODES[DEFAULT_MODE];
  assert.ok(c.rampMaxSteps > base.rampMaxSteps, '无尽难度上限应更高');
  assert.ok(c.dropChance > base.dropChance, '无尽掉落应更慷慨');
  assert.ok(c.scoreMult > base.scoreMult, '无尽计分倍率应更高');
  assert.ok(c.bossEliteEvery > 0, '应配置精英 Boss 出现频率');
  assert.equal(c.hasVictory, false);
});

test('FR-2.5 存档隔离：战役与无尽最高分互不覆盖', () => {
  let d = emptyData();
  d = recordRun(d, { score: 1200, difficulty: 'standard', date: '2026-10-21', duration: 80, region: 2, mode: 'campaign', grade: 'C' });
  d = recordRun(d, { score: 9800, difficulty: 'standard', date: '2026-10-21', duration: 200, region: 3, mode: 'endless', grade: 'B' });
  assert.equal(bestOf(d, 'campaign').score, 1200);
  assert.equal(bestOf(d, 'endless').score, 9800);
});

test('FR-2.5 旧存档兼容：历史单键 best 迁移为战役成绩', () => {
  const old = {
    schema_version: STORAGE_SCHEMA_VERSION,
    best: { score: 4321, difficulty: 'standard', date: '2026-10-01' },
    top5: [], settings: {},
  };
  const backend = memBackend({ [STORAGE_KEY]: JSON.stringify(old) });
  const d = load(backend);
  assert.equal(bestOf(d, 'campaign').score, 4321);
  assert.equal(bestOf(d, 'endless'), null);
});

test('FR-2.3 模式选择：未知模式兜底为战役', () => {
  assert.equal(normalizeMode('nope'), DEFAULT_MODE);
  const g = newGame();
  g.settings.mode = 'nope';
  g.startRun();
  assert.equal(g.mode, DEFAULT_MODE);
});

// ── FR-3.x 打击感 Game-Feel ─────────────────────────────────────────────

test('FR-3.1 命中反馈：敌机受击闪烁 + 火花粒子', () => {
  const e = new Enemy('scout', 100, 100);
  e.hitFlash();
  assert.ok(e.flash > 0, '受击应进入闪烁状态');
  const g = newGame();
  g.startRun();
  const before = g.particles.length;
  g.spawnHitSpark(100, 100);
  assert.ok(g.particles.length > before, '命中应产生火花粒子');
});

test('FR-3.3 连击：倍率 1+0.02×(combo-1) 封顶 2.0，窗口超时重置', () => {
  assert.equal(comboMultiplier(1), 1);
  assert.ok(Math.abs(comboMultiplier(2) - 1.02) < 1e-9);
  assert.equal(comboMultiplier(200), FEEL.COMBO_MULT_MAX);
  const g = newGame();
  g.startRun();
  idleField(g);
  g.registerKill(); g.registerKill(); g.registerKill();
  assert.equal(g.combo, 3);
  stepN(g, Math.ceil(FEEL.COMBO_WINDOW * 60) + 6);
  assert.equal(g.combo, 0, '超过连击窗口应重置');
});

test('FR-3.4 命中停顿：触发后冻结世界推进，减弱动效档关闭', () => {
  const g = newGame();
  g.startRun();
  g.applyHitstop();
  assert.ok(g.hitstop > 0);
  const t0 = g.runTime;
  g.step(1 / 60, performance.now());
  assert.equal(g.runTime, t0, 'hitstop 期间世界不应推进');
  const g2 = newGame();
  g2.settings.motion = 'reduced';
  g2.startRun();
  g2.applyHitstop();
  assert.equal(g2.hitstop, 0, 'reduced-motion 应关闭命中停顿');
});

test('FR-3.6 降级：reduced-motion 下粒子减半且不震屏', () => {
  const a = newGame(); a.startRun(); a.spawnHitSpark(100, 100);
  const b = newGame(); b.settings.motion = 'reduced'; b.startRun(); b.spawnHitSpark(100, 100);
  assert.ok(b.particles.length < a.particles.length, '减弱动效应减少粒子数');
  const c = newGame(); c.settings.motion = 'reduced'; c.startRun();
  c.spawnKillFx(100, 100, 20, true);
  assert.equal(c.shake, 0, '减弱动效应关闭震屏');
});

// ── FR-4.x 画风与 2.5D 战机 ─────────────────────────────────────────────

test('FR-4.2 弹幕可读性：危险度分色阈值递进', () => {
  assert.ok(ART.DANGER_LETHAL_SPEED > ART.DANGER_FAST_SPEED, '致命弹阈值应高于高速弹');
  assert.ok(ART.DANGER_FAST_SPEED > 0);
});

test('FR-4.1/4.4 战机画风：默认启用预渲染 2.5D，且可回退 2D 描边', () => {
  assert.equal(ART.SPRITE_3D, true);
  assert.equal(defaultSettings().sprite3d, true, '默认启用 2.5D 战机');
  const g = newGame();
  assert.equal(g.settings.sprite3d, true, '设置项应可从存档读取并在设置面板关闭');
});
