/**
 * enemies.js —— 小怪与 Boss
 * 小怪用「行为函数」区分，方便扩展新机型。
 */

import { ENEMY, VIEW, COLORS } from './config.js';
import { rand, clamp, circleHit, norm, TAU } from './utils.js';
import {
  drawScout, drawFighter, drawTank, drawKamikaze, drawTurret, drawBoss,
} from './sprites.js';
import { sfx } from './audio.js';

const DRAWERS = {
  scout: drawScout,
  fighter: drawFighter,
  tank: drawTank,
  kamikaze: drawKamikaze,
  turret: drawTurret,
};

/** 小怪基类 */
export class Enemy {
  constructor(type, x, y, opts = {}) {
    const c = ENEMY[type];
    this.type = type;
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.hp = c.hp * (opts.hpMul || 1);
    this.maxHp = this.hp;
    this.radius = c.radius;
    this.speed = c.speed * (opts.speedMul || 1);
    this.score = c.score;
    this.color = c.color;
    this.fireRate = c.fireRate;
    this.fireTimer = rand(0.4, 1.6);
    this.alive = true;
    this.t = 0;
    this.age = 0;
    this.spawning = opts.entryDelay || 0; // 出场保护/渐入
    this.phase = rand(0, TAU);
    this.hitFlash = 0;
    this.path = opts.path || null;
    this.angle = 0;
    this.harmless = false;
    // 编队入场：先下沉到目标高度，再进入行为循环
    this.targetY = opts.targetY !== undefined ? opts.targetY : y;
    this.idle = opts.targetY !== undefined;
    this.vx = 0;
    this.vy = 0;
    this.scored = false;
    this.gone = false;
  }

  damage(d, hx, hy) {
    if (!this.alive) return;
    this.hp -= d;
    this.hitFlash = Math.min(1, this.hitFlash + 0.55);
    if (this.hp <= 0) {
      this.alive = false;
      this.onDeath?.(hx, hy);
    }
  }

  /** 朝玩家发射单发瞄准弹 */
  aimShot(bullets, player, opts = {}) {
    const { x, y } = this;
    const d = norm(player.x - x, player.y - y);
    const sp = opts.speed || 190;
    bullets.spawn({
      x, y: y + 8,
      vx: d.x * sp, vy: d.y * sp,
      r: opts.r || 5,
      dmg: 1,
      kind: opts.kind || 'orb',
      color: opts.color || COLORS.enemyBullet,
      life: 6,
    });
    sfx.enemyShoot();
  }

  /** 扇形散射 */
  fanShot(bullets, player, count = 5, spread = 0.7, speed = 170, offset = 0) {
    const base = Math.atan2(player.y - this.y, player.x - this.x) + offset;
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * (spread / Math.max(1, count - 1));
      bullets.spawn({
        x: this.x, y: this.y + 8,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r: 4.6, dmg: 1, kind: 'orb', color: COLORS.enemyBullet, life: 6,
      });
    }
    sfx.enemyShoot();
  }

  /** 环形弹幕 */
  ringShot(bullets, count = 12, speed = 150, offset = 0) {
    for (let i = 0; i < count; i++) {
      const a = offset + (TAU / count) * i;
      bullets.spawn({
        x: this.x, y: this.y,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r: 4.6, dmg: 1, kind: 'orb', color: COLORS.bossBullet, life: 7,
      });
    }
    sfx.enemyShoot();
  }

  update(dt, player, bullets) {
    this.t += dt;
    this.age += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3.4);
    if (this.spawning > 0) {
      this.spawning -= dt;
      return;
    }

    // 先移动到目标高度，再切换为各自的行为
    if (this.idle) {
      if (this.y < this.targetY) {
        this.y += this.speed * 2.6 * dt;
      } else {
        this.idle = false;
        this.age = 0;
      }
      return;
    }

    this.behavior(dt, player);

    if (this.fireRate > 0 && player.alive && this.y > -20 && this.y < VIEW.h) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = this.fireRate * rand(0.8, 1.25);
        this.doAttack(player, bullets);
      }
    }

    // 出界回收
    if (this.y > VIEW.h + 70 || this.x < -120 || this.x > VIEW.w + 120) {
      this.alive = false;
      this.gone = true;
    }
  }

  behavior(dt, player) {
    switch (this.type) {
      case 'scout':
        this.y += this.speed * dt;
        this.x += Math.sin(this.age * 2.4 + this.phase) * 42 * dt;
        break;
      case 'fighter':
        this.y += this.speed * dt * (this.age < 1.6 ? 1.5 : 0.55);
        this.x += Math.sin(this.age * 1.5 + this.phase) * 78 * dt;
        break;
      case 'tank':
        this.y += this.speed * dt * (this.y < 150 ? 1.6 : 0.28);
        this.x += Math.cos(this.age * 0.9 + this.phase) * 46 * dt;
        break;
      case 'kamikaze': {
        const d = norm(player.x - this.x, player.y - this.y);
        this.angle = Math.atan2(d.y, d.x);
        this.vx = d.x * this.speed;
        this.vy = d.y * this.speed;
        this.y += this.vy * dt;
        this.x += this.vx * dt;
        break;
      }
      case 'turret':
        this.y += this.speed * dt * (this.y < 110 ? 2.2 : 0.16);
        this.x += Math.sin(this.age * 0.7 + this.phase) * 26 * dt;
        break;
      default:
        this.y += this.speed * dt;
    }
    this.x = clamp(this.x, 16, VIEW.w - 16);
  }

  doAttack(player, bullets) {
    switch (this.type) {
      case 'fighter':
        this.aimShot(bullets, player, { speed: 200 });
        break;
      case 'tank':
        if (this.age % 3 < 1.5) this.fanShot(bullets, player, 3, 0.45, 175);
        else this.aimShot(bullets, player, { speed: 235, r: 6, color: '#d0bfff' });
        break;
      case 'turret':
        this.aimShot(bullets, player, { speed: 260, r: 4, kind: 'needle', color: '#74c0fc' });
        break;
      default:
        break;
    }
  }

  draw(ctx) {
    if (this.spawning > 0) {
      ctx.globalAlpha = 0.5;
    }
    if (this.type === 'kamikaze') {
      const a = Math.atan2(this.vy || 1, this.vx || 0) - Math.PI / 2;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(a);
      ctx.translate(-this.x, -this.y);
      drawKamikaze(ctx, this.x, this.y, this.color);
      ctx.restore();
    } else {
      DRAWERS[this.type](ctx, this.x, this.y, this.color, this.hp / this.maxHp);
    }
    // 受击白闪
    if (this.hitFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,255,255,${this.hitFlash * 0.5})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.95, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }
}

/** Boss */
export class Boss {
  constructor(level, name, hp) {
    this.level = level;
    this.name = name;
    this.x = VIEW.w / 2;
    this.y = -100;
    this.targetY = 130;
    this.radius = 62;
    this.hp = hp;
    this.maxHp = hp;
    this.alive = true;
    this.entering = true;
    this.enterT = 0;
    this.t = 0;
    this.age = 0;
    this.hitFlash = 0;
    this.phase = 1;
    this.attackTimer = 1.6;
    this.patternTimer = 0;
    this.patternIndex = 0;
    this.angle = 0;
    this.dead = false;
    this.dying = 0;
    this.score = 5000 * level;
  }

  get hpRatio() {
    return Math.max(0, this.hp / this.maxHp);
  }

  damage(d, hx, hy) {
    if (!this.alive || this.entering) return;
    this.hp -= d;
    this.hitFlash = Math.min(1, this.hitFlash + 0.4);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.dying = 1;
    }
  }

  update(dt, player, bullets, fx) {
    this.t += dt;
    this.age += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 3);

    if (this.entering) {
      this.enterT += dt;
      const k = Math.min(1, this.enterT / 2.2);
      const ease = 1 - Math.pow(1 - k, 3);
      this.y = -100 + (this.targetY + 100) * ease;
      if (k >= 1) {
        this.entering = false;
        sfx.alarm();
      }
      return;
    }

    if (!this.alive) {
      // 死亡演出
      this.dying -= dt;
      this.y += 22 * dt;
      if (Math.random() < 0.55) {
        fx.burst(this.x + rand(-70, 70), this.y + rand(-50, 50), {
          count: 5, speed: 220, life: 0.55, size: 4,
          colors: ['#ffffff', '#ffe066', '#ff6b6b'],
        });
      }
      if (this.dying <= 0) this.dead = true;
      return;
    }

    // 血量分段 → 阶段
    const r = this.hpRatio;
    const newPhase = r > 0.66 ? 1 : r > 0.33 ? 2 : 3;
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.attackTimer = 0.7;
      this.patternTimer = 0;
      this.patternIndex = 0;
      fx.burst(this.x, this.y, {
        count: 34, speed: 380, life: 0.8, size: 5,
        colors: ['#ffffff', '#ffe066', '#ff6b6b'],
      });
      fx.shake = 18;
      sfx.alarm();
    }

    // 悬浮运动
    const sway = this.phase >= 2 ? 1.5 : 1;
    this.x = VIEW.w / 2 + Math.sin(this.age * 0.85 * sway) * (VIEW.w * 0.29);
    this.y = this.targetY + Math.sin(this.age * 1.6) * 16;

    // 死亡后不再开火
    if (!this.alive) return;

    // 攻击节奏：阶段越高越密
    const speedMul = [1, 1.18, 1.36][this.phase - 1];
    this.attackTimer -= dt * speedMul;
    if (this.attackTimer <= 0) {
      this.patternTimer -= 1;
      this.fire(player, bullets);
      const gap = [1.5, 1.25, 1.0][this.phase - 1];
      this.attackTimer = gap * rand(0.9, 1.1);
    }
  }

  fire(player, bullets) {
    const p = this.phase;
    this.patternIndex = (this.patternIndex + 1) % 4;

    // 1. 三连瞄准散射
    if (this.patternIndex === 0) {
      for (let k = 0; k < 3; k++) {
        setTimeout(() => {
          if (!this.alive) return;
          this.fanShot(bullets, player, 3 + p, 0.5, 200 + p * 20);
        }, k * 110);
      }
    }
    // 2. 环形弹幕
    else if (this.patternIndex === 1) {
      this.angle += 0.24;
      this.ringShot(bullets, 14 + p * 4, 130 + p * 12, this.angle);
    }
    // 3. 双翼交叉针弹
    else if (this.patternIndex === 2) {
      for (const s of [-1, 1]) {
        const ox = this.x + s * 70;
        const oy = this.y + 14;
        const base = Math.atan2(player.y - oy, player.x - ox);
        for (let i = 0; i < 3 + p; i++) {
          const a = base + (i - (1 + p) / 2) * 0.13;
          bullets.spawn({
            x: ox, y: oy,
            vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
            r: 3.2, dmg: 1, kind: 'needle', color: '#ffd166', life: 5,
          });
        }
      }
      sfx.enemyShoot();
    }
    // 4. 螺旋弹幕
    else {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = this.age * 3 + (TAU / n) * i;
        bullets.spawn({
          x: this.x, y: this.y,
          vx: Math.cos(a) * 165, vy: Math.sin(a) * 165,
          r: 5, dmg: 1, kind: 'orb', color: '#ff9f43', life: 7,
        });
      }
      sfx.enemyShoot();
    }
  }

  fanShot(bullets, player, count = 5, spread = 0.6, speed = 200) {
    const base = Math.atan2(player.y - this.y, player.x - this.x);
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * (spread / Math.max(1, count - 1));
      bullets.spawn({
        x: this.x, y: this.y + 20,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r: 5.4, dmg: 1, kind: 'orb', color: COLORS.enemyBullet, life: 6,
      });
    }
    sfx.enemyShoot();
  }

  ringShot(bullets, count, speed, offset) {
    for (let i = 0; i < count; i++) {
      const a = offset + (TAU / count) * i;
      bullets.spawn({
        x: this.x, y: this.y,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r: 4.8, dmg: 1, kind: 'orb', color: COLORS.bossBullet, life: 8,
      });
    }
    sfx.enemyShoot();
  }

  draw(ctx) {
    drawBoss(ctx, this.x, this.y, this.t, this.level, this.hitFlash, this.hpRatio);
  }
}

/** 生成一组波次阵型 */
export function spawnFormation(wave, hpMul, speedMul) {
  const out = [];
  const n = wave.count;
  const y0 = wave.y || 90;
  const cx = VIEW.w / 2;

  for (let i = 0; i < n; i++) {
    let x = cx;
    let y = y0;
    let delay = 0;

    switch (wave.pattern) {
      case 'line':
        x = VIEW.w * 0.15 + (VIEW.w * 0.7) * (n === 1 ? 0.5 : i / (n - 1));
        delay = i * (wave.delay || 0.2);
        break;
      case 'v': {
        const half = (n - 1) / 2;
        const off = i - half;
        x = cx + off * 46;
        y = y0 + Math.abs(off) * 26;
        delay = Math.abs(off) * 0.12;
        break;
      }
      case 'arc': {
        const t = n === 1 ? 0.5 : i / (n - 1);
        x = 50 + (VIEW.w - 100) * t;
        y = y0 - Math.sin(t * Math.PI) * 70;
        delay = i * (wave.delay || 0.14);
        break;
      }
      case 'dive':
        x = rand(60, VIEW.w - 60);
        y = y0 + rand(-30, 30);
        delay = i * (wave.delay || 0.3);
        break;
      default:
        x = rand(60, VIEW.w - 60);
        delay = i * (wave.delay || 0.2);
    }

    out.push({
      type: wave.type,
      x: clamp(x, 30, VIEW.w - 30),
      y: -30 - i * 4,
      spawnX: x,
      spawnY: y,
      delay,
      hpMul,
      speedMul,
      targetY: y,
    });
  }
  return out;
}
