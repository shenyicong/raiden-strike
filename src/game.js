/**
 * game.js —— 主游戏类：状态机、关卡流程、实体调度、渲染
 */

import {
  VIEW, PLAYER, WEAPON, DROP, LEVELS, BOSS_DELAY, SCORE, COLORS,
} from './config.js';
import { Input } from './input.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { Bullets } from './bullets.js';
import { Enemy, Boss, spawnFormation } from './enemies.js';
import { drawDrop } from './sprites.js';
import { HUD } from './hud.js';
import { sfx, unlock } from './audio.js';
import { rand, chance, clamp, circleHit, formatScore, TAU } from './utils.js';

export const STATE = {
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  CLEAR: 'clear',
  GAMEOVER: 'gameover',
  WIN: 'win',
};

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.input = new Input(canvas);
    this.fx = new FX();
    this.player = new Player(this.fx);
    this.bullets = new Bullets();
    this.hud = new HUD(this);

    this.state = STATE.READY;
    this.time = 0;
    this.score = 0;
    this.kills = 0;
    this.levelIndex = 0;
    this.enemies = [];
    this.pending = [];       // 待出场的阵型
    this.drops = [];
    this.boss = null;

    this.waveQueue = [];
    this.levelTimer = 0;
    this.bossTimer = -1;
    this.clearTimer = 0;
    this.slowMo = 0;
    this.banner = null;
    this.autoFire = false;      // 触屏模式自动开火
    this.pointerSeen = false;
    this._bossRewarded = false;
    this._raf = null;
    this._last = 0;
    this._acc = 0;
    this._fps = 60;
    this._fpsAcc = 0;
    this._fpsFrames = 0;

    this.bindOverlay();
    this.bindTouch();
  }

  get level() {
    return LEVELS[this.levelIndex];
  }

  /* ------------------------------------------------------------ *
   * 生命周期
   * ------------------------------------------------------------ */

  bindOverlay() {
    this.overlay = document.getElementById('overlay');
    this.overlayTitle = document.getElementById('ovTitle');
    this.overlaySub = document.getElementById('ovSub');
    this.overlayStats = document.getElementById('ovStats');
    this.overlayBtn = document.getElementById('ovBtn');
    this.overlayHint = document.getElementById('ovHint');

    this.overlayBtn.addEventListener('click', () => {
      unlock();
      sfx.ui();
      if (this.state === STATE.READY || this.state === STATE.GAMEOVER || this.state === STATE.WIN) {
        this.startRun();
      } else if (this.state === STATE.PAUSED) {
        this.resume();
      }
    });
  }

  /** 触屏设备：拖动即自动开火，并在开局提示一次 */
  bindTouch() {
    const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
    this.touchMode = isTouch;
    const hint = document.getElementById('touchHint');
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        this.pointerSeen = true;
        this.autoFire = true;
        if (hint && this.state === STATE.PLAYING) {
          hint.classList.add('show');
          setTimeout(() => hint.classList.remove('show'), 2600);
        }
      }
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') this.autoFire = false;
    });
    if (isTouch && hint) hint.textContent = '拖动屏幕移动 · 自动射击';
  }

  start() {
    this.resize();
    addEventListener('resize', () => this.resize());
    this._last = performance.now();
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 0.1) dt = 0.1;      // 防止切标签页后瞬移
      this.step(dt);
    };
    this._raf = requestAnimationFrame(loop);
    this.showReady();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = VIEW.w;
    const h = VIEW.h;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
  }

  startRun() {
    this.state = STATE.PLAYING;
    this.score = 0;
    this.kills = 0;
    this.levelIndex = 0;
    this.player.reset();
    this.bullets.clear();
    this.enemies.length = 0;
    this.pending.length = 0;
    this.drops.length = 0;
    this.boss = null;
    this.overlay.classList.remove('show');
    this.loadLevel(0);
    sfx.ui();
  }

  showReady() {
    this.state = STATE.READY;
    this.hud.draw(this);
    this.overlayTitle.textContent = '雷 霆 战 机';
    this.overlaySub.textContent = 'RAIDEN STRIKE · 街机纵版弹幕射击';
    this.overlayStats.innerHTML = `
      <div class="keys">
        <div><kbd>W A S D</kbd> / <kbd>方向键</kbd> 移动</div>
        <div><kbd>空格</kbd> / <kbd>J</kbd> 射击（可长按）</div>
        <div><kbd>K</kbd> / <kbd>X</kbd> 炸弹（清屏）</div>
        <div><kbd>Shift</kbd> 精确移动（低速）</div>
        <div><kbd>P</kbd> / <kbd>Esc</kbd> 暂停　<kbd>M</kbd> 静音</div>
      </div>
      <p class="tip">鼠标 / 手指也可直接拖动战机。吃 <b style="color:#39e7ff">P</b> 升级火力，<b style="color:#ffd166">B</b> 补给炸弹，<b style="color:#ff6b9d">♥</b> 加命。</p>
    `;
    this.overlayBtn.textContent = '开始任务';
    this.overlayHint.textContent = '按 Enter / 空格 也可开始';
    this.overlay.classList.add('show');
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.overlayTitle.textContent = '暂 停';
    this.overlaySub.textContent = `第 ${this.levelIndex + 1} 区 · ${this.level.name}`;
    this.overlayStats.innerHTML = `<div class="keys"><div>得分 <b>${formatScore(this.score)}</b></div><div>击坠 <b>${this.kills}</b></div><div>火力 <b>Lv.${this.player.level}</b></div></div>`;
    this.overlayBtn.textContent = '继续游戏';
    this.overlayHint.textContent = '按 P / Esc 也可继续';
    this.overlay.classList.add('show');
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
    this._last = performance.now();
    this.overlay.classList.remove('show');
    sfx.ui();
  }

  togglePause() {
    if (this.state === STATE.PLAYING) this.pause();
    else if (this.state === STATE.PAUSED) this.resume();
  }

  gameOver() {
    this.state = STATE.GAMEOVER;
    sfx.gameOver();
    this.overlayTitle.textContent = '任 务 失 败';
    this.overlaySub.textContent = `止步于 第 ${this.levelIndex + 1} 区`;
    this.overlayStats.innerHTML = this.statBlock();
    this.overlayBtn.textContent = '重新出击';
    this.overlayHint.textContent = '按 Enter 重新开始';
    this.overlay.classList.add('show');
  }

  win() {
    this.state = STATE.WIN;
    sfx.win();
    this.overlayTitle.textContent = '任 务 完 成';
    this.overlaySub.textContent = '三区全清 · 敌旗舰已击沉';
    this.overlayStats.innerHTML = this.statBlock() +
      `<p class="tip">恭喜通关！截图纪念一下你的战绩吧。</p>`;
    this.overlayBtn.textContent = '再来一局';
    this.overlayHint.textContent = '按 Enter 重新开始';
    this.overlay.classList.add('show');
  }

  statBlock() {
    return `<div class="stats">
      <div><span>总分</span><b>${formatScore(this.score)}</b></div>
      <div><span>击坠</span><b>${this.kills}</b></div>
      <div><span>到达区域</span><b>${this.levelIndex + 1} / ${LEVELS.length}</b></div>
      <div><span>剩余生命</span><b>${Math.max(0, this.player.lives)}</b></div>
      <div><span>用时</span><b>${Math.floor(this.time)}s</b></div>
    </div>`;
  }

  /* ------------------------------------------------------------ *
   * 关卡
   * ------------------------------------------------------------ */

  loadLevel(index) {
    this.levelIndex = index;
    const L = LEVELS[index];
    this.bullets.clear();
    this.enemies.length = 0;
    this.pending.length = 0;
    this.drops.length = 0;
    this.boss = null;
    this.bossTimer = -1;
    this.levelTimer = 0;
    this.clearTimer = 0;

    // 复制波次脚本，避免修改源数据
    this.waveQueue = L.waves.map((w) => ({ ...w, fired: false }));
    this.banner = {
      title: L.name,
      sub: `AREA ${index + 1} / ${LEVELS.length}`,
      life: 2.6,
      maxLife: 2.6,
    };
    this.hud.setLevel(index);
    sfx.alarm();
  }

  spawnFromPending(dt) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.delay -= dt;
      if (p.delay > 0) continue;
      // 真正创建敌机
      const e = new Enemy(p.type, p.spawnX, -34, {
        hpMul: p.hpMul,
        speedMul: p.speedMul,
      });
      e.targetY = p.targetY;
      // 用「下沉到目标线再开始行为」的方式排出队形
      e.spawnY = -34;
      this.enemies.push(e);
      this.pending.splice(i, 1);
    }
  }

  updateWaves(dt) {
    // Boss 已登场或正在倒数 → 停止刷怪
    if (this.boss || this.clearTimer > 0) return;

    // Boss 登场倒计时
    if (this.bossTimer >= 0) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) {
        this.bossTimer = -1;
        this.spawnBoss();
      }
      return;
    }

    // 全部波次已出完且场上清空 → 开始倒数 Boss
    if (!this.waveQueue.length && !this.pending.length && !this.enemies.length) {
      this.bossTimer = BOSS_DELAY;
      return;
    }

    this.levelTimer += dt;
    for (const w of this.waveQueue) {
      if (!w.fired && this.levelTimer >= w.t) {
        w.fired = true;
        this.pending.push(
          ...spawnFormation(w, 1 + this.levelIndex * 0.18, 1 + this.levelIndex * 0.08)
        );
      }
    }
    this.waveQueue = this.waveQueue.filter((w) => !w.fired);
    this.spawnFromPending(dt);
  }

  spawnBoss() {
    const L = this.level;
    this.boss = new Boss(this.levelIndex + 1, L.bossName, L.bossHp);
    this.hud.bossIntro = 2.4;
    this.fx.shake = 10;
    sfx.alarm();
    // 清掉残余小怪，让 Boss 战干净
    for (const e of this.enemies) {
      if (e.alive) this.fx.explode(e.x, e.y, 0.8, e.color);
    }
    this.enemies.length = 0;
    this.pending.length = 0;
  }

  /* ------------------------------------------------------------ *
   * 主循环
   * ------------------------------------------------------------ */

  step(dt) {
    this.input.beginFrame();

    // FPS 统计
    this._fpsAcc += dt;
    this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this._fps = this._fpsFrames / this._fpsAcc;
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }

    // 全局按键
    if (this.input.pressed('pause')) {
      if (this.state === STATE.PLAYING) this.pause();
      else if (this.state === STATE.PAUSED) this.resume();
    }
    if (this.state === STATE.READY || this.state === STATE.GAMEOVER || this.state === STATE.WIN) {
      if (this.input.pressed('fire') || this.input.pressed('bomb')) {
        unlock();
        this.startRun();
      }
    }

    const active = this.state === STATE.PLAYING;

    if (active) {
      this.time += dt;
      this.updateGameplay(dt);
    }

    // 视觉表现始终推进（暂停时也保持轻微呼吸感，但很慢）
    const vdt = active ? dt : dt * 0.25;
    this.fx.update(vdt);
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    this.hud.update(dt);

    this.render();
  }

  updateGameplay(dt) {
    const p = this.player;

    // 玩家
    p.update(dt, this.input, this.bullets);

    // 炸弹
    if (this.input.pressed('bomb')) {
      p.useBomb(this.bullets, this.enemies, this.boss);
    }

    // 关卡波次
    this.updateWaves(dt);

    // 敌机
    const list = this.enemies;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (!e.alive) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      e.update(dt, p, this.bullets);

      // 撞机
      if (p.alive && p.isVulnerable() &&
          circleHit(e.x, e.y, e.radius * 0.82, p.x, p.y, p.radius)) {
        p.takeDamage(1);
        e.damage(9999, e.x, e.y);
      }
    }

    // Boss
    if (this.boss) {
      this.boss.update(dt, p, this.bullets, this.fx);
      if (this.boss.alive && p.alive && p.isVulnerable() &&
          circleHit(this.boss.x, this.boss.y, this.boss.radius * 0.8, p.x, p.y, p.radius)) {
        p.takeDamage(1);
      }
      if (this.boss.dead) {
        this.onBossDead();
      }
    }

    // 子弹
    this.bullets.update(dt, p, this.enemies, this.fx);

    // 子弹命中 Boss（单独处理，Boss 不在 enemies 数组里）
    if (this.boss && this.boss.alive && !this.boss.entering) {
      const bl = this.bullets.list;
      for (let i = bl.length - 1; i >= 0; i--) {
        const b = bl[i];
        if (!b.friendly) continue;
        if (!circleHit(b.x, b.y, b.r, this.boss.x, this.boss.y, this.boss.radius * 0.88)) continue;
        this.boss.damage(b.dmg, b.x, b.y);
        this.fx.spark(b.x, b.y, b.color, 2);
        if (b.pierce > 0) b.pierce--;
        else {
          bl[i] = bl[bl.length - 1];
          bl.pop();
        }
      }
    }

    // 阵亡结算：小怪
    for (const e of this.enemies) {
      if (e.alive || e.scored) continue;
      e.scored = true;
      this.kills++;
      this.score += Math.round(e.score);
      this.fx.explode(e.x, e.y, e.radius > 20 ? 1.5 : 1, e.color);
      sfx.explode();
      if (chance(e.type === 'tank' ? 0.55 : 0.13)) {
        this.dropItem(e.x, e.y, e.type === 'tank' || e.type === 'turret' ? DROP.power : null);
      } else if (chance(0.02)) {
        this.dropItem(e.x, e.y, DROP.life);
      }
    }

    // 道具
    this.updateDrops(dt);

    // Boss 击破 → 倒数进入下一区
    if (this.boss && this.boss.dead && this.clearTimer > 0) {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) {
        this.nextLevel();
        return;
      }
    }

    // 玩家阵亡 → 结算
    if (!p.alive && p.lives <= 0) {
      this.gameOver();
      return;
    }
  }

  updateDrops(dt) {
    const p = this.player;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.y += d.vy * dt;
      d.vy = Math.min(150, d.vy + 40 * dt);
      d.t += dt;
      // 靠近玩家时被吸引
      if (p.alive) {
        const dx = p.x - d.x;
        const dy = p.y - d.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 130) {
          const pull = 340 * (1 - dist / 130) + 120;
          d.x += (dx / dist) * pull * dt;
          d.y += (dy / dist) * pull * dt;
        }
        if (dist < 19) {
          this.collect(d);
          this.drops.splice(i, 1);
          continue;
        }
      }
      if (d.y > VIEW.h + 30) this.drops.splice(i, 1);
    }
  }

  dropItem(x, y, kind) {
    let type = kind;
    if (!type) {
      const r = Math.random();
      type = r < 0.55 ? DROP.power : r < 0.8 ? DROP.bomb : DROP.shield;
    }
    this.drops.push({ x, y, vy: 70, type, t: 0 });
  }

  collect(d) {
    const p = this.player;
    sfx.pickup();
    switch (d.type) {
      case DROP.power: {
        const up = p.addPower(1);
        if (up) {
          sfx.powerUp();
          this.fx.text(p.x, p.y - 34, `火力 Lv.${p.level}`, '#39e7ff', 16);
          this.fx.burst(p.x, p.y, {
            count: 16, speed: 160, life: 0.5, size: 3, colors: ['#39e7ff', '#ffffff'],
          });
        } else {
          this.score += 50;
          this.fx.text(p.x, p.y - 30, '+50', '#8ff9ff', 13);
        }
        break;
      }
      case DROP.bomb:
        p.bombs = Math.min(9, p.bombs + 1);
        this.fx.text(p.x, p.y - 34, '炸弹 +1', '#ffd166', 15);
        break;
      case DROP.life:
        p.lives = Math.min(9, p.lives + 1);
        this.fx.text(p.x, p.y - 34, '生命 +1', '#ff6b9d', 15);
        sfx.powerUp();
        break;
      case DROP.shield:
        p.shieldTime = Math.max(p.shieldTime, 5);
        this.fx.text(p.x, p.y - 34, '护盾 5s', '#9be7ff', 15);
        break;
      default:
        break;
    }
  }

  onBossDead() {
    if (this._bossRewarded) return;
    this._bossRewarded = true;
    const b = this.boss;
    this.score += b.score;
    this.kills++;
    this.fx.bigExplode(b.x, b.y);
    sfx.bigExplode();
    this.drops.push({ x: b.x - 26, y: b.y, vy: 60, type: DROP.power, t: 0 });
    this.drops.push({ x: b.x + 26, y: b.y, vy: 60, type: DROP.bomb, t: 0 });
    // 不切状态：继续跑死亡演出与道具回收，2.6s 后进入下一区
    this.clearTimer = 2.6;
    this.banner = {
      title: '区 域 肃 清',
      sub: this.levelIndex + 1 < LEVELS.length ? '准备进入下一区' : '全部区域完成',
      life: 2.6,
      maxLife: 2.6,
    };
    sfx.levelClear();
    this.score += SCORE.levelClear;
  }

  nextLevel() {
    this._bossRewarded = false;
    this.state = STATE.PLAYING;
    this.clearTimer = 0;
    this.boss = null;
    if (this.levelIndex + 1 >= LEVELS.length) {
      this.win();
      return;
    }
    this.loadLevel(this.levelIndex + 1);
  }

  /* ------------------------------------------------------------ *
   * 渲染
   * ------------------------------------------------------------ */

  render() {
    const ctx = this.ctx;
    const L = this.level;

    // 背景渐变
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.h);
    g.addColorStop(0, L.bg[0]);
    g.addColorStop(1, L.bg[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);

    // 扫描线状星云（缓慢流动，增加纵深）
    const t = performance.now() / 1000;
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 3; i++) {
      const yy = ((t * (14 + i * 9) + i * 240) % (VIEW.h + 200)) - 100;
      const rg = ctx.createRadialGradient(VIEW.w / 2, yy, 0, VIEW.w / 2, yy, 260);
      rg.addColorStop(0, L.accent);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, yy - 260, VIEW.w, 520);
    }
    ctx.globalAlpha = 1;

    // 星空
    this.fx.drawBackground(ctx, VIEW.w, VIEW.h, 0, L.accent);

    // 屏幕震动
    const sh = this.fx.shake;
    ctx.save();
    if (sh > 0.2) {
      ctx.translate(rand(-sh, sh) * 0.5, rand(-sh, sh) * 0.5);
    }

    // 道具
    for (const d of this.drops) drawDrop(ctx, d.x, d.y, d.type, d.t);

    // 敌机
    for (const e of this.enemies) if (e.alive) e.draw(ctx);

    // Boss
    if (this.boss && (!this.boss.dead)) this.boss.draw(ctx);

    // 玩家与子弹
    this.player.draw(ctx);
    this.bullets.draw(ctx);

    // 粒子
    this.fx.draw(ctx);
    this.fx.drawTexts(ctx);

    ctx.restore();

    // 闪白
    if (this.fx.flash > 0.01) {
      ctx.globalAlpha = Math.min(0.85, this.fx.flash);
      ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);
      ctx.globalAlpha = 1;
    }

    // HUD
    this.hud.draw(this);

    // 关卡横幅
    if (this.banner) {
      const b = this.banner;
      const k = 1 - b.life / b.maxLife;
      const a = b.life > b.maxLife - 0.4 ? (b.maxLife - b.life) / 0.4
        : b.life < 0.6 ? b.life / 0.6 : 1;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 30px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
      ctx.shadowColor = L.accent;
      ctx.shadowBlur = 18;
      ctx.fillText(b.title, VIEW.w / 2, VIEW.h * 0.42);
      ctx.shadowBlur = 0;
      ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = L.accent;
      ctx.fillText(b.sub, VIEW.w / 2, VIEW.h * 0.42 + 26);
      // 分隔线
      ctx.strokeStyle = L.accent;
      ctx.globalAlpha *= 0.6;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(VIEW.w / 2 - 90, VIEW.h * 0.42 - 30);
      ctx.lineTo(VIEW.w / 2 + 90, VIEW.h * 0.42 - 30);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 暗角
    const vg = ctx.createRadialGradient(
      VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.32,
      VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.78
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
}
