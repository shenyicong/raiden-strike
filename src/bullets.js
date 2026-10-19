/**
 * bullets.js —— 子弹系统（玩家 / 敌方）
 * 用数组 + 原地删除（swap-pop）保证性能。
 */

import { circleHit, TAU } from './utils.js';
import { COLORS } from './config.js';

const MAX_BULLETS = 900;

export class Bullets {
  constructor() {
    this.list = [];
  }

  clear() {
    this.list.length = 0;
  }

  spawn(o) {
    if (this.list.length >= MAX_BULLETS) return;
    this.list.push({
      x: o.x, y: o.y,
      vx: o.vx || 0, vy: o.vy || 0,
      r: o.r || 4,
      dmg: o.dmg || 1,
      friendly: !!o.friendly,
      kind: o.kind || 'dot',   // dot | laser | orb | needle
      color: o.color || (o.friendly ? COLORS.playerBullet : COLORS.enemyBullet),
      life: o.life || 4,
      pierce: o.pierce || 0,
      hitSet: o.pierce ? new Set() : null,
      angle: o.angle || 0,
      homing: o.homing || 0,
      target: o.target || null,
      spin: o.spin || 0,
      t: 0,
      len: o.len || 26,
      dead: false,
    });
  }

  update(dt, player, enemies, fx) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      b.t += dt;
      b.life -= dt;

      // 追踪弹
      if (b.homing > 0) {
        let best = null;
        let bestD = Infinity;
        for (const e of enemies) {
          if (!e.alive) continue;
          const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) {
          const want = Math.atan2(best.y - b.y, best.x - b.x);
          let cur = Math.atan2(b.vy, b.vx);
          let d = want - cur;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          cur += Math.max(-b.homing * dt, Math.min(b.homing * dt, d));
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(cur) * sp;
          b.vy = Math.sin(cur) * sp;
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.spin) b.angle += b.spin * dt;

      const out = b.y < -60 || b.y > 800 || b.x < -80 || b.x > 560;
      if (out || b.life <= 0) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }

      // 玩家弹命中敌机
      if (b.friendly) {
        for (const e of enemies) {
          if (!e.alive || e.spawning > 0) continue;
          if (b.hitSet && b.hitSet.has(e)) continue;
          if (!circleHit(b.x, b.y, b.r, e.x, e.y, e.radius)) continue;
          e.damage(b.dmg, b.x, b.y);
          if (b.hitSet) b.hitSet.add(e);
          fx.spark(b.x, b.y, b.color, 3);
          if (b.pierce > 0) {
            b.pierce--;
          } else {
            b.dead = true;
          }
          break;
        }
        if (b.dead) {
          list[i] = list[list.length - 1];
          list.pop();
        }
        continue;
      }

      // 敌弹命中玩家
      if (player.isVulnerable() &&
          circleHit(b.x, b.y, b.r * 0.85, player.x, player.y, player.radius)) {
        player.takeDamage(1, fx);
        list[i] = list[list.length - 1];
        list.pop();
      }
    }
  }

  draw(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.list) {
      if (b.kind === 'laser') {
        // 拉长的激光
        const a = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(a);
        const g = ctx.createLinearGradient(-b.len, 0, 8, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.7, b.color);
        g.addColorStop(1, '#ffffff');
        ctx.fillStyle = g;
        ctx.fillRect(-b.len, -b.r * 0.6, b.len + 8, b.r * 1.2);
        ctx.restore();
      } else if (b.kind === 'orb') {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.4);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.4, b.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 2.4, 0, TAU);
        ctx.fill();
      } else if (b.kind === 'needle') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
        ctx.fillStyle = b.color;
        ctx.fillRect(-b.r * 0.5, -b.r * 3, b.r, b.r * 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-b.r * 0.2, -b.r * 2.2, b.r * 0.4, b.r * 4);
        ctx.restore();
      } else {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.r * 0.85, b.r * 1.5, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.42, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
