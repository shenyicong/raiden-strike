// config.js — 集中数值规格 (PRD 第六章)。调平衡只改这里，逻辑不依赖字面量。
// NFR-MAINT-01: 全部平衡性参数集中于单一配置文件。

export const VIEW = {
  W: 480,            // 逻辑分辨率宽 (6.1)
  H: 720,            // 逻辑分辨率高
  ASPECT: 2 / 3,     // 宽高比 2:3
};

export const GLOBAL = {
  DT_CAP: 0.1,            // 单帧时间上限 (秒)，防切标签页返回后瞬移 (6.1)
  BULLET_POOL: 900,       // 子弹并发硬上限，达上限丢弃新子弹 (6.1)
  PARTICLE_POOL: 1400,    // 粒子并发硬上限 (6.1)
  ATTRACT_RADIUS: 130,    // 道具自动吸附触发距离 (px) (6.1)
  PLAYER_BULLET_SPEED: 700, // 玩家子弹速度 px/s (6.1)
  GRAZE_INNER: 9,         // 擦弹内半径 = 判定半径 (6.1/6.2)
  GRAZE_OUTER: 21,        // 擦弹外半径 (FR-CBT-07)
};

export const PLAYER = {
  HIT_RADIUS: 9,     // 判定圆半径 9px (6.2)
  MOVE_SPEED: 300,   // 常规移动 300px/s (6.2)
  PRECISION_SPEED: 150, // 按住 Shift 半速 (6.2)
  INIT_LIVES: 3,
  INIT_BOMBS: 3,
  HIT_INVULN: 1.8,   // 受击无敌 1.8s (6.2)
  RESPAWN_WAIT: 1.0, // 重生等待 1.0s (6.2)
  LIVES_MAX: 9,
  BOMBS_MAX: 9,
  BLINK_HZ: 2,       // 无敌闪烁 2Hz (FR-PRS-04)
  AUTO_FIRE: true,   // v2.6：全程自动开火，无需长按空格/J（与 PRD「自动射击」一致）
};

// 可驾驶战机 (v2.1 新增)。
// speedMult/fireMult/dmgMult 为相对基准倍率；hitR 判定圆半径；livesBonus 相对难度的生命偏移。
// unlock 决定解锁条件：default 初始解锁 / region:N 到达第 N 区解锁 / win 通关解锁 / score:N 单局分数解锁。
export const SHIPS = [
  { id: 'raiden',   name: '雷霆号',   color: '#7fe7ff', desc: '均衡型 · 综合性能稳定',   speedMult: 1.00, fireMult: 1.00, dmgMult: 1.00, hitR: 9,  livesBonus: 0,  unlock: { type: 'default' } },
  { id: 'phantom',  name: '幻影',     color: '#c9a7ff', desc: '高速小判定 · 判定仅 6px', speedMult: 1.25, fireMult: 1.00, dmgMult: 0.90, hitR: 6,  livesBonus: -1, unlock: { type: 'default' } },
  { id: 'fortress', name: '重装堡垒', color: '#ffb27f', desc: '重甲厚血 · 生命 +2',      speedMult: 0.80, fireMult: 0.90, dmgMult: 1.10, hitR: 11, livesBonus: 2,  unlock: { type: 'region', region: 2 } },
  { id: 'falcon',   name: '猎鹰',     color: '#9affc0', desc: '速射型 · 射速 +25%',      speedMult: 1.10, fireMult: 1.25, dmgMult: 0.85, hitR: 9,  livesBonus: 0,  unlock: { type: 'region', region: 3 } },
  { id: 'aurora',   name: '极光',     color: '#ffd166', desc: '贯通重炮 · 伤害 +30%',    speedMult: 0.95, fireMult: 0.90, dmgMult: 1.30, hitR: 9,  livesBonus: 0,  unlock: { type: 'win' } },
  { id: 'phoenix',  name: '凤凰',     color: '#ff7fa8', desc: '烈焰护持 · 受击不掉火力', speedMult: 1.05, fireMult: 1.05, dmgMult: 1.00, hitR: 8,  livesBonus: 0,  unlock: { type: 'score', score: 20000 } },
];
export const DEFAULT_SHIP_ID = 'raiden';

// 五级火力 (6.3)。energyToNext = 从本级升到下一级所需能量；power 道具固定 +34 能量 (6.6 统一)。
// 满级共需 100+120+150+200 = 570 能量。
export const WEAPONS = [
  { level: 1, name: '单发',       fireRate: 8.0,  dmg: 7, pellets: 1, energyToNext: 100 },
  { level: 2, name: '双列',       fireRate: 8.6,  dmg: 7, pellets: 2, energyToNext: 120 },
  { level: 3, name: '中央重炮+散射', fireRate: 9.2,  dmg: 8, pellets: 3, energyToNext: 150 },
  { level: 4, name: '交替追踪弹',   fireRate: 9.8,  dmg: 8, pellets: 4, energyToNext: 200 },
  { level: 5, name: '全弹幕+双追踪', fireRate: 10.5, dmg: 9, pellets: 4, energyToNext: 0   },
];
export const POWER_PER_ITEM = 34; // 单个火力道具能量 (6.6 统一)
export const MAX_LEVEL = WEAPONS.length;

// 敌机规格 (6.4)。命中判定取半径的 0.82 倍（宽容处理）。
// v2.3 难度下调：血量约 -12%、速度约 -12%、开火频率约 -25%（分值保持不变）
export const ENEMIES = {
  scout:    { hp: 14, radius: 13, speed: 115, fireRate: 0,    score: 100, behavior: 'straight' },
  fighter:  { hp: 30, radius: 16, speed: 84,  fireRate: 1.00, score: 180, behavior: 'sway' },
  tank:     { hp: 95, radius: 24, speed: 52,  fireRate: 0.70, score: 420, behavior: 'slow' },
  kamikaze: { hp: 18, radius: 14, speed: 182, fireRate: 0,    score: 220, behavior: 'dive' },
  turret:   { hp: 60, radius: 18, speed: 42,  fireRate: 1.15, score: 260, behavior: 'static' },
};
export const ENEMY_HIT_FACTOR = 0.82; // 敌机命中半径系数

// 掉落规格 (6.6)
// v2.4：护盾/生命进入随机池，各自独立爆率（LIFE_CHANCE / SHIELD 权重），火力仍由重型必掉保底。
export const DROPS = {
  BASE_CHANCE: 0.20,  // 每架敌机基础掉落概率（v2.3 上调，补给更充足）
  WEIGHTS: { power: 0.42, bomb: 0.18, shield: 0.22, life: 0.18 }, // 池内权重（v2.4 加入生命）
  HEAVY_FORCED: ['tank', 'turret'], // 重型单位必掉，且优先火力
  POWER_FULL_BONUS: 50, // 满级后拾取火力道具折算分
  BOMB_MAX: 9,
  SHIELD_DURATION: 5, // 护盾无敌 5s
  LIFE_CHANCE: 0.06,  // 额外判定：非重型敌机 6% 概率单独掉生命（与权重池叠加）
  SHIELD_CHANCE: 0.10, // 额外判定：10% 概率单独掉护盾
  // v2.6：道具爆出后自动下落（带初速与加速度，到顶速后匀速），不再停在原地
  FALL_V0: 45,        // 爆出瞬间的下落初速 px/s（避免"悬停"观感）
  FALL_ACCEL: 210,    // 下落加速度 px/s²（约 0.62s 达到顶速）
  FALL_SPEED: 175,    // 下落顶速 px/s（约 4s 穿屏，玩家有时间去接）
};
export const LIFE_DROP_EVENT_ONLY = false; // v2.4：生命道具进入随机池与独立爆率

// v2.5 漏网敌机重整：飞出屏幕下缘仍未被击破的敌机，带着剩余血量离场，
// 数秒后从上方重新入场参战（解决"敌机堆在飞机下方打不到"的问题）。
export const RALLY = {
  DELAY: 3.0,      // 离场后重新入场等待（秒）
  MAX_TIMES: 2,    // 每架最多重整 2 次，避免无限循环
  MAX_QUEUE: 6,    // 同时等待重整的队列上限
  EXIT_Y_MARGIN: 30, // 越过 VIEW.H + 该值视为离场
  ENTRY_Y: -30,    // 重新入场起始高度
};

// 超载爆发 (v2.6)：命中敌机即积攒能量，蓝条集满后自动引爆，清空当前屏幕所有敌机。
// 积攒来源 = 造成伤害 + 击破 + 擦弹；Boss 不会被清屏秒杀，改为承受一次重创。
export const OVERDRIVE = {
  MAX: 100,          // 蓝条满值
  PER_DMG: 0.35,     // 每点伤害积攒的能量
  PER_KILL: 4,       // 每次击破额外积攒
  PER_GRAZE: 0.6,    // 每次擦弹积攒
  AUTO: true,        // 集满自动引爆（关闭则改为手动，暂未暴露开关）
  BOSS_DAMAGE: 700,  // 引爆时对 Boss 造成的伤害
  SCORE_BONUS: 300,  // 引爆奖励分
  INVULN: 1.0,       // 引爆后无敌时长（秒）
  CLEAR_BULLETS: true, // 是否同时清空屏幕上的敌方子弹
};

// v2.4 循序渐进难度曲线：敌机血量 / 攻击频率 / 弹速 / 波次数量随存活时间分档递增。
// 每 TIME_STEP 秒升一档，最多 MAX_STEPS 档（到达上限后不再变难）。
export const RAMP = {
  TIME_STEP: 20,        // 每 20 秒一档
  MAX_STEPS: 6,         // 最多 6 档（120 秒到顶）
  HP_PER_STEP: 0.12,    // 每档敌机血量 +12%
  FIRE_PER_STEP: 0.12,  // 每档开火频率 +12%（射速随时间平滑上升，120 秒时约 1.7 倍）
  SPEED_PER_STEP: 0.05, // 每档敌弹速度 +5%
  COUNT_PER_STEP: 0.6,  // 每档每波额外敌机数（向下取整累加）
};

// 计分 (6.6)
export const SCORE = {
  GRAZE: 10,
  BOSS_KILL: 5000,
  REGION_CLEAR: 3000,
  POWER_FULL: 50,
};

// 三区战役与 Boss (6.5)
export const REGIONS = [
  {
    id: 1, name: '近地轨道', bossName: '哨戒舰 · 铁翼',
    bossHp: 2470, waves: 9, waveTotal: 27.5, quota: 18, // v2.6 清理 18 架后出 Boss
    palette: { top: '#0b1026', bottom: '#1b2a4a', accent: '#5fa8ff' },
  },
  {
    id: 2, name: '陨石带', bossName: '重型轰炸舰 · 熔核',
    bossHp: 3990, waves: 8, waveTotal: 29.0, quota: 24,
    palette: { top: '#1a1208', bottom: '#3a2a12', accent: '#ff9a3c' },
  },
  {
    id: 3, name: '母舰外围', bossName: '旗舰 · 天穹之影',
    bossHp: 6080, waves: 8, waveTotal: 30.0, quota: 30,
    palette: { top: '#0a0418', bottom: '#2a0f3a', accent: '#c77dff' },
  },
];

// v2.6 关卡阈值：清理足够数量敌机后停止刷怪，清屏即出 Boss。
// MAX_WAVE_MULT 为兜底上限（刷到该倍数波次仍没达到阈值也强制结束，避免"不打枪就永远不出 Boss"）。
export const QUOTA = { MAX_WAVE_MULT: 2 };

// Boss 三阶段参数 (6.5)。phase thresholds by hp ratio。
export const BOSS = {
  PHASE_THRESHOLDS: [0.66, 0.33], // 血量降至 66% / 33% 切阶段
  PHASE_SPEED_MULT: [1.0, 1.18, 1.36],
  PHASE_INTERVAL: [1.8, 1.5, 1.2], // 发射间隔 (秒)（v2.3 放宽，弹幕更疏）
  PHASE_SWAY_MULT: [1.0, 1.5, 1.5],
  SWITCH_CLEAR_TIME: 0.8, // 切换时清空敌弹并停火 (秒)
  ENTER_TIME: 2.2,        // 入场演出 (秒)
  MIN_PHASE_TIME: 6.0,    // 每阶段时长约束 ≥6 秒 (F-05)
  PATTERNS: ['aimed', 'ring', 'cross', 'spiral'], // 四模式轮换
};

// 炸弹 (FR-CBT-04)
export const BOMB = {
  CLEAR_DELAY: 0.3,   // 0.3s 内清空全屏敌弹
  DAMAGE: 150,        // 对全场敌人 150 伤害
  INVULN: 1.5,        // 玩家 1.5s 无敌
};

// 受击反馈 (FR-PRS-04)
export const HIT_FEEDBACK = {
  FLASH_MAX_ALPHA: 0.6, FLASH_MAX_MS: 120,
  SHAKE_MAX_MS: 250, SHAKE_MAX_OFFSET: 8,
};

// 难度分层 (FR-LVL-04 / 8.3 可砍，默认标准)
// v2.3：标准档整体调软（敌机更少、瞄准有偏差、弹速更慢、初始 4 命）
export const DIFFICULTY = {
  standard: { label: '标准', bulletDensity: 0.9,  aimError: 25,   intervalMult: 1.15, initLives: 4, bulletSpeedMult: 0.85 },
  casual:   { label: '休闲', bulletDensity: 0.7,  aimError: 60,   intervalMult: 1.35, initLives: 6, bulletSpeedMult: 0.72 },
};

// 性能预算参考 (5.1) — 仅用于诊断面板展示/验收口径
export const PERF = {
  FPS_MEAN_MIN: 58, FRAME_P99_MAX: 20, LOW_1PCT_MIN: 45,
  FIRST_INTERACTIVE_MS: 1500,
};

// 单键存储约束 (附录 G.1)
export const STORAGE_KEY = 'raiden.v1';
export const STORAGE_SCHEMA_VERSION = 1;
export const STORAGE_MAX_BYTES = 4096;
