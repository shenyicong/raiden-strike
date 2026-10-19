/**
 * player.js —— 玩家战机
 * 手感要点：判定点小、Shift 精确移动、受伤后短暂无敌并闪烁。
 */

import { PLAYER, WEAPON, VIEW, COLORS } from './config.js';
import { clamp, damp, TAU, rand } from './utils.js';
import { drawPlayer } from './sprites.js';
import { sfx } from './audio.js';

export class Player {
  constructor(fx) {
    this.fx = fx;
    this.reset();
  }

  reset() {
    this.x = VIEW.w / 2;
    this.y = VIEW.h - 110;
    this.radius = PLAYER.radius;
    this.alive = true;
    this.lives = PLAYER.maxLife;
    this.bombs = PLAYER.maxBombs;
    this.level = 1;
    this.power = 0;          // 到下一级的能量
    this.fireTimer = 0;
    this.invuln = 1.2;       // 开局短暂无敌
    this.shieldTime = 0;
    this.respawnTimer = 0;
    this.tilt = 0;
    this.t = 0;
    this.grazeCount = 0;
    this.shotSide = 0;
    this.weaponLabel = '';
  }

  isVulnerable() {
    return this.alive && this.invuln <= 0 && this.shieldTime <= 0;
  }

  /** 拾取火力，返回是否升级 */
  addPower(n = 1) {
    if (this.level >= WEAPON.maxLevel) return false;
    this.power += n * 34;
    if (this.power >= WEAPON.powerStep) {
      this.power -= WEAPON.powerStep;
      this.level++;
      return true;
    }
    return false;
  }

  takeDamage() {
    if (!this.isVulnerable()) return false;
    this.lives--;
    this.invuln = PLAYER.invincibleTime;
    this.level = Math.max(1, this.level - 1);
    this.power = 0;
    this.fx.explode(this.x, this.y, 1.6, '#39e7ff');
    this.fx.screenFlash(0.4, '#ff4d6d');
    sfx.damage();
    if (this.lives <= 0) {
      this.alive = false;
      this.respawnTimer = PLAYER.respawnDelay;
    }
    return true;
  }

  respawn() {
    this.alive = true;
    this.x = VIEW.w / 2;
    this.y = VIEW.h - 90;
    this.invuln = 2.2;
    this.fireTimer = 0;
    this.tilt = 0;
  }

  update(dt, input, bullets) {
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);

    if (!this.alive) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0 && this.lives > 0) this.respawn();
      return;
    }

    // --- 移动 ---
    const ax = input.axis();
    const focus = input.down('focus');
    const sp = focus ? PLAYER.focusSpeed : PLAYER.speed;

    // 指针/触摸拖动优先
    let moved = false;
    if (input.pointer.down) {
      const tx = input.pointer.x;
      const ty = input.pointer.y - 26;   // 手指不遮挡机身
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy);
      const step = sp * dt * 1.9;
      if (d > 1) {
        const k = Math.min(1, step / d);
        this.x += dx * k;
        this.y += dy * k;
        moved = true;
      }
    }
    if (!moved && (ax.x || ax.y)) {
      this.x += ax.x * sp * dt;
      this.y += ax.y * sp * dt;
    }

    this.x = clamp(this.x, 18, VIEW.w - 18);
    this.y = clamp(this.y, 34, VIEW.h - 24);

    // 机身倾斜（视觉）
    const targetTilt = input.pointer.down ? 0 : ax.x;
    this.tilt = damp(this.tilt, targetTilt, 12, dt);

    // 尾焰
    this.fx.thruster(this.x - 4, this.y + 14);
    this.fx.thruster(this.x + 4, this.y + 14);

    // 护盾粒子
    if (this.shieldTime > 0 && Math.random() < 0.5) this.fx.shieldSpark(this.x, this.y);

    // --- 射击 ---
    this.fireTimer -= dt;
    const rate = WEAPON.fireRate[this.level - 1];
    if (this.fireTimer <= 0) {
      this.fireTimer = 1 / rate;
      this.shoot(bullets);
    }
  }

  shoot(bullets) {
    const lv = this.level;
    const dmg = WEAPON.damage[lv - 1];
    const sp = WEAPON.speed;
    const x = this.x;
    const y = this.y - 18;
    const add = (ox, oy, ang, extra = {}) =>
      bullets.spawn({
        x: x + ox, y: y + oy,
        vx: Math.sin(ang) * sp,
        vy: -Math.cos(ang) * sp,
        r: 4.2, dmg, friendly: true, kind: 'laser', len: 24,
        color: COLORS.playerBullet, life: 1.6,
        ...extra,
      });

    this.shotSide ^= 1;

    if (lv === 1) {
      add(0, 0, 0);
      add(-4, 4, -0.03);
      add(4, 4, 0.03);
    } else if (lv === 2) {
      add(-5, 0, -0.02);
      add(5, 0, 0.02);
      add(-9, 6, -0.09);
      add(9, 6, 0.09);
    } else if (lv === 3) {
      add(0, -4, 0, { r: 5.2, dmg: dmg * 1.15 });
      add(-6, 2, -0.05);
      add(6, 2, 0.05);
      add(-12, 8, -0.16);
      add(12, 8, 0.16);
    } else if (lv === 4) {
      add(0, -6, 0, { r: 5.6, dmg: dmg * 1.2 });
      add(-7, 0, -0.06);
      add(7, 0, 0.06);
      add(-14, 6, -0.19);
      add(14, 6, 0.19);
      // 交替侧翼微追踪弹
      const side = this.shotSide ? 1 : -1;
      bullets.spawn({
        x: x + side * 18, y: y + 10,
        vx: side * 90, vy: -300,
        r: 4, dmg: dmg * 0.6, friendly: true, kind: 'orb',
        color: '#a0ffe6', life: 2.2, homing: 3.2,
      });
    } else {
      // Lv5：中央重炮 + 四向散射 + 双追踪
      add(0, -8, 0, { r: 7, dmg: dmg * 1.45, len: 34, color: '#ffffff' });
      add(-8, 0, -0.08);
      add(8, 0, 0.08);
      add(-16, 6, -0.22);
      add(16, 6, 0.22);
      add(-20, 12, -0.38, { dmg: dmg * 0.8 });
      add(20, 12, 0.38, { dmg: dmg * 0.8 });
      bullets.spawn({
        x: x - 18, y: y + 10, vx: -120, vy: -320,
        r: 4.4, dmg: dmg * 0.65, friendly: true, kind: 'orb',
        color: '#a0ffe6', life: 2.4, homing: 4,
      });
      bullets.spawn({
        x: x + 18, y: y + 10, vx: 120, vy: -320,
        r: 4.4, dmg: dmg * 0.65, friendly: true, kind: 'orb',
        color: '#a0ffe6', life: 2.4, homing: 4,
      });
    }

    sfx.shoot();
  }

  /** 炸弹：清屏 */
  useBomb(bullets, enemies, boss) {
    if (this.bombs <= 0 || !this.alive) return false;
    this.bombs--;
    bullets.list = bullets.list.filter((b) => b.friendly);
    for (const e of enemies) {
      if (e.alive) e.damage(e.hp > 0 ? 260 : 260, e.x, e.y);
    }
    if (boss && boss.alive) boss.damage(320, boss.x, boss.y);
    this.fx.screenFlash(0.9, '#bffaff');
    this.fx.shake = 22;
    for (let i = 0; i < 5; i++) {
      this.fx.burst(this.x + rand(-140, 140), this.y + rand(-200, 80), {
        count: 20, speed: 320, life: 0.7, size: 4.5,
        colors: ['#ffffff', '#8ff9ff', '#39e7ff'],
      });
    }
    this.invuln = Math.max(this.invuln, 1.1);
    sfx.bomb();
    return true;
  }

  draw(ctx) {
    if (!this.alive) return;
    // 无敌闪烁
    const blink = this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0;
    ctx.globalAlpha = blink ? 0.35 : 1;

    // 护盾
    if (this.shieldTime > 0) {
      const a = 0.3 + Math.sin(this.t * 8) * 0.12;
      ctx.strokeStyle = `rgba(155,231,255,${a + 0.25})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 24 + Math.sin(this.t * 6) * 1.4, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = `rgba(57,231,255,${a * 0.25})`;
      ctx.fill();
    }

    drawPlayer(ctx, this.x, this.y, this.t, this.tilt);

    // 判定点
    if (PLAYER.hitboxDot) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(this.x, this.y, 2.4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,120,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 5.2, 0, TAU);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }
}
