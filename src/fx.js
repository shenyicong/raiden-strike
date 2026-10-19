/**
 * fx.js —— 粒子、爆炸、屏幕震动、飘字
 * 全部用 Canvas2D 立即模式绘制，简单可靠。
 */

import { rand, randInt, TAU } from './utils.js';

export class Particle {
  constructor() {
    this.alive = false;
    this.reset();
  }

  reset() {
    this.alive = false;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.life = 0; this.maxLife = 1;
    this.size = 2; this.size2 = 0;
    this.color = '#fff';
    this.drag = 0.94;
    this.gravity = 0;
    this.shape = 0;   // 0 圆 / 1 方 / 2 线
    this.spin = 0;
    this.rot = 0;
    this.glow = false;
  }

  init(o) {
    this.alive = true;
    this.x = o.x; this.y = o.y;
    this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.maxLife = o.life || 0.5;
    this.life = this.maxLife;
    this.size = o.size || 3;
    this.size2 = o.size2 !== undefined ? o.size2 : this.size * 0.15;
    this.color = o.color || '#fff';
    this.drag = o.drag !== undefined ? o.drag : 0.94;
    this.gravity = o.gravity || 0;
    this.shape = o.shape || 0;
    this.spin = o.spin || 0;
    this.rot = o.rot || 0;
    this.glow = !!o.glow;
    this.alive = true;
    return this;
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.alive = false; return; }
    const d = Math.pow(this.drag, dt * 60);
    this.vx *= d;
    this.vy *= d;
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
  }

  draw(ctx) {
    const t = this.life / this.maxLife;      // 1 → 0
    const s = this.size2 + (this.size - this.size2) * t;
    if (s <= 0.2) return;
    ctx.globalAlpha = Math.min(1, t * 1.6);
    ctx.fillStyle = this.color;
    if (this.glow) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.arc(this.x, this.y, s * 2.6, 0, TAU);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = Math.min(0.28, t * 0.5);
      ctx.fill();
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.fillStyle = '#ffffff';
    }
    if (this.shape === 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, s, 0, TAU);
      ctx.fill();
    } else if (this.shape === 1) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.fillRect(-s * 3, -s * 0.4, s * 6, s * 0.8);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

export class FX {
  constructor(maxParticles = 1400) {
    this.particles = [];
    for (let i = 0; i < maxParticles; i++) this.particles.push(new Particle());
    this.cursor = 0;

    this.shake = 0;
    this.shakeDecay = 6;

    this.texts = [];

    this.flash = 0;
    this.flashColor = '#ffffff';

    // 星空（三层视差）
    this.stars = [];
    for (let i = 0; i < 220; i++) {
      this.stars.push({
        x: Math.random() * 480,
        y: Math.random() * 720,
        z: rand(0.25, 1),
        s: rand(0.6, 1.9),
      });
    }
  }

  _next() {
    // 环形扫描找到一个空闲粒子
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.particles.length;
      if (!p.alive) return p;
    }
    // 全满时强制复用
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.particles.length;
    return p;
  }

  spawn(o) {
    return this._next().init(o);
  }

  /** 通用爆裂 */
  burst(x, y, {
    count = 14, speed = 200, life = 0.5, size = 3, colors = ['#ffffff', '#ffd166', '#ff6b6b'],
    drag = 0.92, spread = TAU, angle = 0, shape = 0, glow = true, gravity = 0,
  } = {}) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const sp = speed * rand(0.35, 1.15);
      this.spawn({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: life * rand(0.6, 1.25),
        size: size * rand(0.6, 1.4),
        color: colors[(Math.random() * colors.length) | 0],
        drag, shape, glow, gravity,
        spin: rand(-8, 8),
      });
    }
  }

  /** 小型命中火花 */
  spark(x, y, color = '#8ff9ff', count = 4) {
    this.burst(x, y, {
      count, speed: 140, life: 0.22, size: 2.2, colors: [color, '#ffffff'], drag: 0.86,
    });
  }

  /** 普通敌机爆炸 */
  explode(x, y, scale = 1, color = '#ff8c42') {
    this.burst(x, y, {
      count: Math.round(16 * scale), speed: 230 * scale, life: 0.5,
      size: 3.4 * scale, colors: ['#ffffff', '#ffe066', color, '#ff6b6b'],
    });
    this.burst(x, y, {
      count: Math.round(6 * scale), speed: 60 * scale, life: 0.8,
      size: 9 * scale, colors: ['#ff9f43', '#ff6b6b'], drag: 0.9, glow: true,
    });
    this.shake = Math.min(14, this.shake + 3 * scale);
  }

  /** Boss 大爆炸 */
  bigExplode(x, y, color = '#ff9f43') {
    for (let i = 0; i < 5; i++) {
      const ox = rand(-40, 40);
      const oy = rand(-40, 40);
      setTimeout(() => {
        this.burst(x + ox, y + oy, {
          count: 26, speed: 340, life: 0.85, size: 5,
          colors: ['#ffffff', '#ffe066', color, '#ff6b6b'], gravity: 120,
        });
      }, i * 70);
    }
    this.shake = 26;
    this.flash = 0.55;
    this.flashColor = '#ffffff';
  }

  /** 推进器尾焰 */
  thruster(x, y, color = '#39e7ff') {
    this.spawn({
      x: x + rand(-2.2, 2.2),
      y,
      vx: rand(-18, 18),
      vy: rand(120, 210),
      life: rand(0.14, 0.26),
      size: rand(2.2, 4.4),
      color: Math.random() < 0.5 ? color : '#ffffff',
      drag: 0.9,
      glow: true,
    });
  }

  /** 环绕护盾火花 */
  shieldSpark(x, y) {
    const a = rand(0, TAU);
    this.spawn({
      x: x + Math.cos(a) * 22,
      y: y + Math.sin(a) * 22,
      vx: Math.cos(a) * 40,
      vy: Math.sin(a) * 40,
      life: 0.25,
      size: 1.8,
      color: '#9be7ff',
      glow: true,
    });
  }

  /** 飘字 */
  text(x, y, str, color = '#ffe066', size = 14) {
    this.texts.push({ x, y, str, color, size, life: 0.9, maxLife: 0.9, vy: -46 });
  }

  screenFlash(a, color = '#ffffff') {
    this.flash = Math.max(this.flash, a);
    this.flashColor = color;
  }

  update(dt) {
    for (const p of this.particles) if (p.alive) p.update(dt);

    this.shake = Math.max(0, this.shake - this.shake * this.shakeDecay * dt - 6 * dt);
    this.flash = Math.max(0, this.flash - dt * 2.2);

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= 0.94;
      if (t.life <= 0) this.texts.splice(i, 1);
    }

    // 星空滚动
    for (const s of this.stars) {
      s.y += (30 + s.z * 190) * dt;
      if (s.y > 724) { s.y = -4; s.x = Math.random() * 480; }
    }
  }

  drawBackground(ctx, w, h, dt, accent = '#39e7ff') {
    // 星空
    for (const s of this.stars) {
      const a = 0.22 + s.z * 0.7;
      ctx.globalAlpha = a;
      ctx.fillStyle = s.z > 0.75 ? accent : '#ffffff';
      const len = s.z > 0.75 ? 1 + s.z * 5 : 1;
      ctx.fillRect(s.x, s.y, s.s, len * s.s);
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx) {
    for (const p of this.particles) if (p.alive) p.draw(ctx);
  }

  drawTexts(ctx) {
    for (const t of this.texts) {
      const a = Math.min(1, t.life / t.maxLife * 1.4);
      ctx.globalAlpha = a;
      ctx.font = `600 ${t.size}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 8;
      ctx.fillText(t.str, t.x, t.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }
}
