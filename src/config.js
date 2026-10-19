/**
 * config.js —— 全局常量与平衡性参数
 * 所有可调数值集中在这里，改这一个文件就能调整手感与难度。
 */

/** 逻辑分辨率（竖屏街机比例），实际渲染会等比缩放到窗口 */
export const VIEW = {
  w: 480,
  h: 720,
};

/** 玩家参数 */
export const PLAYER = {
  radius: 9,          // 碰撞半径（小于视觉尺寸，手感更宽容）
  speed: 300,         // 基础移动速度 px/s
  focusSpeed: 150,    // 按住 Shift 的精确移动速度
  maxLife: 3,         // 初始生命
  maxBombs: 3,        // 初始炸弹
  invincibleTime: 1.8,// 受伤后无敌秒数
  respawnDelay: 1.0,  // 坠机后重生等待
  hitboxDot: true,    // 显示判定点
};

/** 武器等级表：level 1~5 对应的火力形态 */
export const WEAPON = {
  maxLevel: 5,
  /** 射速（发/秒） */
  fireRate: [8, 8.6, 9.2, 9.8, 10.5],
  /** 单发伤害 */
  damage: [7, 7, 8, 8, 9],
  /** 子弹速度 */
  speed: 700,
  /** 自动升级所需能量（吃道具累计） */
  powerStep: 100,
};

/** 敌机类型定义 */
export const ENEMY = {
  scout: {
    hp: 16, radius: 13, speed: 130, score: 100, fireRate: 0, color: '#ff6b6b',
  },
  fighter: {
    hp: 34, radius: 16, speed: 95, score: 180, fireRate: 1.35, color: '#ffa94d',
  },
  tank: {
    hp: 110, radius: 24, speed: 58, score: 420, fireRate: 0.9, color: '#b197fc',
  },
  kamikaze: {
    hp: 20, radius: 14, speed: 210, score: 220, fireRate: 0, color: '#ffd43b',
  },
  turret: {
    hp: 70, radius: 18, speed: 45, score: 260, fireRate: 1.6, color: '#4dabf7',
  },
};

/** Boss 定义 */
export const BOSS = {
  radius: 62,
  hpMul: 1,
  enterTime: 2.2,
};

/** 掉落道具类型 */
export const DROP = {
  power: 1,    // 火力
  bomb: 2,     // 炸弹
  life: 3,     // 生命
  shield: 4,   // 护盾（短时无敌）
};

/** 关卡配置：波次脚本 + Boss 血量 */
export const LEVELS = [
  {
    name: '第一区 · 近地轨道',
    bg: ['#03060f', '#081326'],
    accent: '#39e7ff',
    bossHp: 2600,
    bossName: '哨戒舰 · 铁翼',
    waves: [
      { t: 1.0, type: 'scout', count: 5, pattern: 'line', delay: 0.18, y: 120 },
      { t: 3.4, type: 'scout', count: 6, pattern: 'v', delay: 0.12 },
      { t: 6.2, type: 'fighter', count: 3, pattern: 'line', delay: 0.5, y: 110 },
      { t: 8.6, type: 'scout', count: 8, pattern: 'arc', delay: 0.16 },
      { t: 11.8, type: 'kamikaze', count: 4, pattern: 'dive', delay: 0.35 },
      { t: 14.6, type: 'fighter', count: 4, pattern: 'v', delay: 0.3 },
      { t: 18.0, type: 'turret', count: 2, pattern: 'line', delay: 0.8, y: 90 },
      { t: 21.5, type: 'scout', count: 10, pattern: 'line', delay: 0.12 },
      { t: 25.0, type: 'tank', count: 1, pattern: 'line', delay: 0, y: 100 },
    ],
  },
  {
    name: '第二区 · 陨石带',
    bg: ['#0a0410', '#1a0b22'],
    accent: '#ff9f43',
    bossHp: 4200,
    bossName: '重型轰炸舰 · 熔核',
    waves: [
      { t: 1.0, type: 'scout', count: 8, pattern: 'arc', delay: 0.13 },
      { t: 4.0, type: 'fighter', count: 5, pattern: 'v', delay: 0.22 },
      { t: 7.5, type: 'kamikaze', count: 6, pattern: 'dive', delay: 0.26 },
      { t: 10.8, type: 'turret', count: 3, pattern: 'line', delay: 0.6, y: 80 },
      { t: 14.2, type: 'tank', count: 2, pattern: 'line', delay: 1.4, y: 90 },
      { t: 18.4, type: 'fighter', count: 6, pattern: 'arc', delay: 0.24 },
      { t: 22.2, type: 'scout', count: 12, pattern: 'line', delay: 0.1 },
      { t: 26.4, type: 'tank', count: 2, pattern: 'v', delay: 1.0, y: 110 },
    ],
  },
  {
    name: '第三区 · 母舰外围',
    bg: ['#020a0c', '#06202a'],
    accent: '#00ff9d',
    bossHp: 6400,
    bossName: '旗舰 · 天穹之影',
    waves: [
      { t: 1.0, type: 'fighter', count: 6, pattern: 'arc', delay: 0.18 },
      { t: 4.4, type: 'kamikaze', count: 8, pattern: 'dive', delay: 0.2 },
      { t: 8.0, type: 'turret', count: 4, pattern: 'line', delay: 0.5, y: 70 },
      { t: 11.6, type: 'tank', count: 2, pattern: 'v', delay: 1.2, y: 100 },
      { t: 15.6, type: 'scout', count: 14, pattern: 'arc', delay: 0.09 },
      { t: 19.4, type: 'fighter', count: 7, pattern: 'v', delay: 0.16 },
      { t: 23.2, type: 'kamikaze', count: 10, pattern: 'dive', delay: 0.16 },
      { t: 27.2, type: 'tank', count: 3, pattern: 'line', delay: 1.0, y: 90 },
    ],
  },
];

/** 波次清空后到 Boss 出现的间隔 */
export const BOSS_DELAY = 2.2;

/** 得分系数 */
export const SCORE = {
  graze: 10,       // 擦弹
  bossKill: 5000,
  levelClear: 3000,
};

/** 颜色板 */
export const COLORS = {
  player: '#39e7ff',
  playerCore: '#ffffff',
  playerBullet: '#8ff9ff',
  enemyBullet: '#ff5c8a',
  bossBullet: '#ffd166',
  laser: '#ff4d6d',
};
