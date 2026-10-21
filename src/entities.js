// entities.js — 游戏实体（玩家/敌机/子弹/粒子/Boss）。无 DOM 依赖，浏览器与可测。
import {
  VIEW, PLAYER, GLOBAL, ENEMIES, ENEMY_HIT_FACTOR, BOMB, BOSS, REGIONS,
} from './config.js';
import { WEAPONS } from './config.js';
import { spawnPlayerShots, levelFromEnergy, downgradeOnHit, applyPowerItem } from './weapons.js';
import { getPhase, onPhaseSwitch } from './boss.js';
import { shipById } from './ships.js';
import { clamp } from './util.js';

let _id = 1;
export const nextId = () => _id++;

export class Player {
  constructor(shipId = 'raiden') {
    this.ship = shipById(shipId); // 战机规格：速度/射速/伤害/判定半径 (v2.1)
    this.x = VIEW.W / 2;
    this.y = VIEW.H - 90;
    this.level = 1;
    this.energy = 0;
    this.lives = PLAYER.INIT_LIVES + this.ship.livesBonus;
    this.bombs = PLAYER.INIT_BOMBS;
    this.invuln = 0;       // 受击无敌剩余
    this.shield = 0;       // 护盾无敌剩余
    this.fireTimer = 0;
    this.alive = true;
    this.respawn = 0;      // 坠机重生等待
    this.lifeHp = PLAYER.LIFE_HP; // v2.6.1 当前这条命的剩余耐久
  }
  get hitR() { return this.ship.hitR; }
  get invulnerable() { return this.invuln > 0 || this.shield > 0; }
  // 当前这条命的耐久比例 0~1（HUD 装甲条用）
  get lifeRatio() { return Math.max(0, Math.min(1, this.lifeHp / PLAYER.LIFE_HP)); }

  addEnergy() {
    const r = applyPowerItem({ energy: this.energy, level: this.level });
    this.energy = r.energy;
    this.level = r.level;
    return r.bonus; // 满级折算分
  }
  setLevelFromEnergy() { this.level = levelFromEnergy(this.energy); }

  update(dt, input, precisionOn) {
    if (!this.alive) {
      this.respawn -= dt;
      if (this.respawn <= 0) this.alive = true;
      return;
    }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.shield > 0) this.shield -= dt;

    const base = precisionOn ? PLAYER.PRECISION_SPEED : PLAYER.MOVE_SPEED;
    const speed = base * this.ship.speedMult;
    let dx = 0, dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    const len = Math.hypot(dx, dy) || 1;
    if (dx || dy) { dx /= len; dy /= len; } // 斜向归一 (FR-INP-02)
    this.x = clamp(this.x + dx * speed * dt, this.hitR, VIEW.W - this.hitR);
    this.y = clamp(this.y + dy * speed * dt, this.hitR, VIEW.H - this.hitR);

    // 自动连发 (FR-CBT-02)。v2.6：默认全程自动开火，无需长按射击键；
    // 保留 input.fire（拖动/空格）作为兼容通道，AUTO_FIRE 关闭时回退为按键开火。
    this.fireTimer -= dt;
    if ((PLAYER.AUTO_FIRE || input.fire) && this.fireTimer <= 0) {
      this.fireTimer = 1 / (WEAPONS[this.level - 1].fireRate * this.ship.fireMult);
      return spawnPlayerShots(this.level, this.x, this.y, performance.now() / 1000, this.ship.dmgMult);
    }
    return null;
  }

  // 受击：无敌/护盾时忽略；否则掉命+掉级+1.8s 无敌。返回是否真正受击。
  // 凤凰「烈焰护持」：掉命但火力不降级。
  // 受击：无敌/护盾时忽略；否则按伤害扣耐久，扣光一条命才掉命（v2.6.1）。
  // dmg 默认 = 一整条命的耐久，等价于旧行为"一击掉一命"，老调用点无需改动。
  // 伤害溢出会继续扣下一条命，所以 150 点伤害 = 两发掉三命（相对 +50%）。
  takeHit(dmg = PLAYER.LIFE_HP) {
    if (!this.alive || this.invulnerable) return false;
    let lost = 0;
    this.lifeHp -= dmg;
    while (this.lifeHp <= 0) { this.lifeHp += PLAYER.LIFE_HP; lost += 1; }
    this.lives -= lost;
    if (this.ship.id !== 'phoenix') this.level = downgradeOnHit(this.level);
    this.invuln = PLAYER.HIT_INVULN;
    if (this.lives <= 0) { this.alive = false; this.respawn = PLAYER.RESPAWN_WAIT; this.lifeHp = PLAYER.LIFE_HP; }
    return true;
  }
  giveShield() { this.shield = Math.max(this.shield, 5); } // 刷新不叠加
}

export class Enemy {
  constructor(type, x, y, opts = {}) {
    const spec = ENEMIES[type];
    // v2.4 成长缩放：hpMult 提高血量（血条更长），fireMult 提高开火频率（攻击量）
    const hpMult = opts.hpMult ?? 1;
    const fireMult = opts.fireMult ?? 1;
    this.type = type;
    this.x = x; this.y = y;
    this.hpMult = hpMult; this.fireMult = fireMult; // v2.5 重整时沿用同一成长倍率
    this.reentries = opts.reentries || 0;           // 已重整次数
    this.hp = Math.round(opts.hp ?? spec.hp * hpMult);
    this.maxHp = Math.round(opts.maxHp ?? spec.hp * hpMult); // 血条按满血显示剩余比例
    this.radius = spec.radius;
    this.speed = spec.speed;
    this.score = spec.score;
    this.behavior = spec.behavior;
    this.fireRate = spec.fireRate * fireMult;
    this.fireTimer = Math.random() * (1 / Math.max(0.01, spec.fireRate));
    this.t = 0;
    this.swayDir = opts.swayDir ?? 1;
    this.dead = false;
  }
  get hitR() { return this.radius * ENEMY_HIT_FACTOR; }

  // v2.7：自爆机改为"追踪俯冲"——朝玩家当前位置偏转，但保持向下的主导动量，
  // 永不反向上升（玩家在上方时仍继续下坠，避免飞出战场）。
  // player 由 Game 传入（可选；未传时回退到 targetX / 画面下缘）。
  update(dt, difficulty, player) {
    this.t += dt;
    const intMult = difficulty?.intervalMult ?? 1;
    switch (this.behavior) {
      case 'straight': this.y += this.speed * dt; break;
      case 'sway':
        this.y += this.speed * dt;
        this.x += Math.sin(this.t * 2) * 40 * dt * this.swayDir;
        break;
      case 'slow': this.y += this.speed * dt; break;
      case 'dive': {
        const alive = !!(player && player.alive);
        const tx = alive ? player.x : (this.targetX ?? VIEW.W / 2);
        const ty = alive ? player.y : VIEW.H + 60;
        const ang = Math.atan2(ty - this.y, tx - this.x);
        const sp = this.speed;
        let vx = Math.cos(ang) * sp;
        let vy = Math.sin(ang) * sp;
        if (vy < sp * 0.55) {
          // 垂直分量不足时钳制为向下 0.55×（水平分量相应收敛，保持总速率 ≈ 速度规格）
          const horiz = Math.sqrt(1 - 0.55 * 0.55) * sp;
          vx = (vx >= 0 ? 1 : -1) * Math.min(Math.abs(vx), horiz);
          vy = sp * 0.55;
        }
        this.x += vx * dt;
        this.y += vy * dt;
        break;
      }
      case 'static':
        // 定点停留（小幅度上下浮动），不前进
        this.y += Math.sin(this.t * 1.5) * 8 * dt;
        break;
    }
    if (this.fireRate > 0) {
      this.fireTimer -= dt * intMult;
      if (this.fireTimer <= 0) {
        this.fireTimer = 1 / this.fireRate;
        return true; // 请求开火
      }
    }
    return false;
  }
}

export class Bullet {
  constructor(x, y, vx, vy, opts = {}) {
    this.id = nextId();
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = opts.dmg ?? 1;
    this.r = opts.r ?? 4;
    this.fromPlayer = !!opts.fromPlayer;
    this.homing = !!opts.homing;
    this.dead = false;
  }
  update(dt, player) {
    if (this.homing && player && player.alive) {
      // 简易追踪：轻微转向玩家
      const ang = Math.atan2(player.y - this.y, player.x - this.x);
      const cur = Math.atan2(this.vy, this.vx);
      const na = cur + clamp(ang - cur, -1.5 * dt, 1.5 * dt);
      const sp = Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(na) * sp; this.vy = Math.sin(na) * sp;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < -20 || this.x > VIEW.W + 20 || this.y < -20 || this.y > VIEW.H + 20) this.dead = true;
  }
}

export class Particle {
  constructor(x, y, vx, vy, life, color, size) {
    this.id = nextId();
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.color = color; this.size = size;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
}

export class Boss {
  constructor(regionIndex) {
    const region = REGIONS[regionIndex];
    this.region = regionIndex;
    this.name = region.bossName;
    this.maxHp = region.bossHp;
    this.hp = region.bossHp;
    this.x = VIEW.W / 2;
    this.y = -60;
    this.targetY = 120;
    this.phase = 0;
    this.patternIndex = 0;
    this.fireTimer = BOSS.PHASE_INTERVAL[0];
    this.enterTimer = BOSS.ENTER_TIME;
    this.holdFire = 0;       // 阶段切换停火
    this.entering = true;
    this.dead = false;
    this.sway = 0;
  }
  // 阶段切换检测：返回 true 表示本帧发生切换（需清空敌弹+停火）。
  syncPhase() {
    const p = getPhase(this.hp, this.maxHp);
    if (p !== this.phase) {
      this.phase = p;
      this.patternIndex = 0; // 每阶段重置弹幕序列 (FR-ENM-05)
      const sw = onPhaseSwitch();
      this.holdFire = sw.holdFire;
      return true;
    }
    return false;
  }
  update(dt, difficulty) {
    if (this.entering) {
      this.enterTimer -= dt;
      this.y += (this.targetY - this.y) * Math.min(1, dt * 2);
      if (this.enterTimer <= 0) { this.entering = false; this.y = this.targetY; }
      return null; // 入场期间无弹幕
    }
    this.sway += dt * 0.8 * BOSS.PHASE_SWAY_MULT[this.phase];
    this.x = VIEW.W / 2 + Math.sin(this.sway) * 90;

    if (this.holdFire > 0) { this.holdFire -= dt; return null; }
    const intMult = (difficulty?.intervalMult ?? 1) * BOSS.PHASE_INTERVAL[this.phase];
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = intMult;
      this.patternIndex += 1;
      return true; // 请求按当前 pattern 开火
    }
    return null;
  }
}
