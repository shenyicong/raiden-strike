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
};

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
export const ENEMIES = {
  scout:    { hp: 16,  radius: 13, speed: 130, fireRate: 0,    score: 100, behavior: 'straight' },
  fighter:  { hp: 34,  radius: 16, speed: 95,  fireRate: 1.35, score: 180, behavior: 'sway' },
  tank:     { hp: 110, radius: 24, speed: 58,  fireRate: 0.9,  score: 420, behavior: 'slow' },
  kamikaze: { hp: 20,  radius: 14, speed: 210, fireRate: 0,    score: 220, behavior: 'dive' },
  turret:   { hp: 70,  radius: 18, speed: 45,  fireRate: 1.6,  score: 260, behavior: 'static' },
};
export const ENEMY_HIT_FACTOR = 0.82; // 敌机命中半径系数

// 掉落规格 (6.6)
export const DROPS = {
  BASE_CHANCE: 0.14,  // 每架敌机基础掉落概率
  WEIGHTS: { power: 0.55, bomb: 0.25, shield: 0.20 }, // 池内权重
  HEAVY_FORCED: ['tank', 'turret'], // 重型单位必掉，且优先火力
  POWER_FULL_BONUS: 50, // 满级后拾取火力道具折算分
  BOMB_MAX: 9,
  SHIELD_DURATION: 5, // 护盾无敌 5s
};
export const LIFE_DROP_EVENT_ONLY = true; // 生命道具不在随机池，仅指定事件发放 (6.6)

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
    bossHp: 2600, waves: 9, waveTotal: 25.0,
    palette: { top: '#0b1026', bottom: '#1b2a4a', accent: '#5fa8ff' },
  },
  {
    id: 2, name: '陨石带', bossName: '重型轰炸舰 · 熔核',
    bossHp: 4200, waves: 8, waveTotal: 26.4,
    palette: { top: '#1a1208', bottom: '#3a2a12', accent: '#ff9a3c' },
  },
  {
    id: 3, name: '母舰外围', bossName: '旗舰 · 天穹之影',
    bossHp: 6400, waves: 8, waveTotal: 27.2,
    palette: { top: '#0a0418', bottom: '#2a0f3a', accent: '#c77dff' },
  },
];

// Boss 三阶段参数 (6.5)。phase thresholds by hp ratio。
export const BOSS = {
  PHASE_THRESHOLDS: [0.66, 0.33], // 血量降至 66% / 33% 切阶段
  PHASE_SPEED_MULT: [1.0, 1.18, 1.36],
  PHASE_INTERVAL: [1.5, 1.25, 1.0], // 发射间隔 (秒)
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
export const DIFFICULTY = {
  standard: { label: '标准', bulletDensity: 1.0,  aimError: 0,    intervalMult: 1.0,  initLives: 3, bulletSpeedMult: 1.0 },
  casual:   { label: '休闲', bulletDensity: 0.8,  aimError: 40,   intervalMult: 1.15, initLives: 5, bulletSpeedMult: 1.0 },
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
