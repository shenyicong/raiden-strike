// game.js — 主循环与编排 (FR-CORE / FR-CBT / FR-ENM / FR-LVL)。rAF + dt 钳制。
import {
  VIEW, GLOBAL, PLAYER, ENEMIES, ENEMY_HIT_FACTOR, REGIONS, BOSS, DIFFICULTY,
  SCORE, DROPS, BOMB, STORAGE_SCHEMA_VERSION,
} from './config.js';
import { STATES, StateMachine } from './statemachine.js';
import { Player, Enemy, Bullet, Particle, Boss } from './entities.js';
import { GrazeTracker } from './scoring.js';
import { rollDrop } from './drops.js';
import { getPhase, patternForPhase, phaseInterval } from './boss.js';
import { WaveDirector } from './levels.js';
import { busGains, motionFlags, hitboxVisible } from './settings.js';
import { load, save, recordRun, emptyData } from './storage.js';
import { shipById, gradeUnlocks, isUnlocked } from './ships.js';
import { clamp } from './util.js';

export class Game {
  constructor({ renderer, audio, input, backend, prefersReducedMotion = false }) {
    this.renderer = renderer;
    this.audio = audio;
    this.input = input;
    this.backend = backend;
    this.sm = new StateMachine(STATES.READY);
    this.settings = load(backend, prefersReducedMotion).settings;
    this.data = load(backend, prefersReducedMotion);
    this.player = new Player();
    this.enemies = []; this.pBullets = []; this.eBullets = []; this.particles = []; this.drops = [];
    this.boss = null;
    this.regionIndex = 0;
    this.waves = null;
    this.score = 0; this.graze = new GrazeTracker();
    this.muted = false;
    this.flash = 0; this.shake = 0;
    this.transition = 0; // 区域过渡无敌计时
    this.runId = crypto.randomUUID?.() || `r${Date.now()}`;
    this.runStart = 0; this.fpsSamples = []; this.lastFpsT = 0; this.fpsFrames = 0;
    this.diag = new URLSearchParams(location.search).get('diag') === '1';
    this.t = 0;
    this.toast = null; // 短提示（解锁/收集）文本 + 倒计时
    this.shipId = shipById(this.settings.ship).id; // 归一：未知/缺失回退到雷霆号
    if (!isUnlocked(this.shipId, this.data.unlocked)) this.shipId = 'raiden';
    performance.mark?.('boot_start');
  }

  get difficulty() { return DIFFICULTY[this.settings.difficulty] || DIFFICULTY.standard; }

  startRun() {
    // 战机选择：存档未解锁则回退到雷霆号 (v2.1)
    this.shipId = isUnlocked(this.settings.ship, this.data.unlocked) ? this.settings.ship : 'raiden';
    this.player = new Player(this.shipId);
    this.player.lives = Math.max(1, this.difficulty.initLives + this.player.ship.livesBonus);
    this.player.level = 1; this.player.energy = 0;
    this.enemies = []; this.pBullets = []; this.eBullets = []; this.particles = []; this.drops = [];
    this.boss = null;
    this.regionIndex = 0;
    this.waves = new WaveDirector(0, this.settings.difficulty);
    this.score = 0; this.graze = new GrazeTracker();
    this.toast = null;
    this.sm.transition(STATES.PLAYING);
    this.runStart = performance.now();
    performance.mark?.('run_start');
    this.audio.unlock().then(() => this.audio.startMusic());
  }

  pauseToggle() {
    if (this.sm.is(STATES.PLAYING)) this.sm.pause();
    else if (this.sm.is(STATES.PAUSED)) this.sm.resume();
  }
  interrupt() { if (this.sm.is(STATES.PLAYING)) this.sm.pause(); }

  // v2.1：炸弹改为纯收集品 —— 可以拾取、计入库存，但不能主动引爆。
  // 保留方法以便后续若要恢复「可用炸弹」只需在此处改一行。
  useBomb() {
    if (!this.sm.is(STATES.PLAYING)) return;
    if (this.player.bombs <= 0) return;
    this.toast = { text: '炸弹仅可收集，无法主动使用', t: 1.8 };
  }

  say(text, t = 2.2) { this.toast = { text, t }; }

  // 按进度发放战机解锁；解锁结果写入存档并弹出提示。
  // cond = { regionReached, win, score }
  _grantUnlocks(cond) {
    const cur = Array.isArray(this.data.unlocked) ? this.data.unlocked : [];
    const granted = gradeUnlocks(cur, cond);
    if (!granted.length) return;
    this.data.unlocked = cur.concat(granted);
    save(this.backend, this.data);
    this.say('解锁新战机：' + granted.map((id) => shipById(id).name).join('、'), 3.2);
  }

  // 主循环步；dt 已钳制 0.1。仅 PLAYING 推进逻辑 (FR-CORE-03)。
  step(dt, now) {
    this.t += dt;
    // 诊断帧率采样 (NFR-OBS-01)
    if (this.diag) {
      this.fpsFrames++;
      if (now - this.lastFpsT >= 1000) {
        const fps = this.fpsFrames * 1000 / (now - this.lastFpsT);
        this.fpsSamples.push(fps); this.fpsFrames = 0; this.lastFpsT = now;
      }
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt / 0.12 * 0.6);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);

    if (this.sm.is(STATES.PLAYING)) this.update(dt);
    this.renderer.updateStars(dt, this.settings.motion === 'reduced');
  }

  update(dt) {
    const p = this.player;
    const inp = this.input ? this.input.state : { left: false, right: false, up: false, down: false, fire: false, precision: false };
    // 拖动目标
    if (this.input && this.input.dragId !== null) {
      p.x = clamp(this.input.dragX, p.hitR, VIEW.W - p.hitR);
      p.y = clamp(this.input.dragY, p.hitR, VIEW.H - p.hitR);
    }
    const shots = p.update(dt, inp, inp.precision);
    if (shots) { for (const s of shots) this.pBullets.push(new Bullet(s.x, s.y, s.vx, s.vy, { dmg: s.dmg, fromPlayer: true, homing: s.homing, r: 4 })); this.audio.sfx('shoot'); }

    // 波次
    if (this.waves && !this.waves.done) {
      const spawned = this.waves.update(dt);
      this.enemies.push(...spawned);
    }
    // Boss 触发：波次完成且场上无普通敌机
    if (this.waves && this.waves.done && !this.boss && this.enemies.length === 0) {
      this.boss = new Boss(this.regionIndex);
      performance.mark?.('boss_enter');
    }

    // 敌机更新 + 开火
    for (const e of this.enemies) {
      const fire = e.update(dt, this.difficulty);
      if (fire && this.boss === null) this.spawnEnemyBullet(e.x, e.y, this._aimAngle(e), 180 * this.difficulty.bulletSpeedMult, 4, false);
    }
    this.enemies = this.enemies.filter((e) => !e.dead);

    // Boss 更新
    if (this.boss) {
      const fire = this.boss.update(dt, this.difficulty);
      if (this.boss.syncPhase()) { this.eBullets = []; this.audio.sfx('alarm'); }
      if (fire) this.fireBossPattern();
      if (this.boss.hp <= 0) this.onBossDead();
    }

    // 子弹更新
    for (const b of this.pBullets) b.update(dt, p);
    for (const b of this.eBullets) b.update(dt, p);

    // 碰撞
    this.collide();

    // 道具吸附 (FR-CBT-05)
    for (const d of this.drops) {
      const dd = Math.hypot(d.x - p.x, d.y - p.y);
      if (dd < GLOBAL.ATTRACT_RADIUS) {
        const a = Math.atan2(p.y - d.y, p.x - d.x);
        d.x += Math.cos(a) * 420 * dt; d.y += Math.sin(a) * 420 * dt;
      } else { d.y += 60 * dt; }
      if (dd < 16) this.applyDrop(d);
    }
    this.drops = this.drops.filter((d) => d.y < VIEW.H + 20);

    // 粒子
    for (const pt of this.particles) pt.update(dt);
    this.particles = this.particles.filter((pt) => !pt.dead);

    // 短提示倒计时
    if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) this.toast = null; }

    // 区域过渡无敌计时
    if (this.transition > 0) { this.transition -= dt; p.invuln = Math.max(p.invuln, 0.05); }

    // 清理出界子弹/死敌
    this.pBullets = this.pBullets.filter((b) => !b.dead);
    this.eBullets = this.eBullets.filter((b) => !b.dead);

    // 坠机重生后仍无敌
    if (!p.alive && p.respawn <= 0 && p.lives > 0) p.alive = true;
    if (!p.alive && p.lives <= 0) this.onGameOver();
  }

  _aimAngle(e) {
    const err = this.difficulty.aimError;
    const base = Math.atan2(this.player.y - e.y, this.player.x - e.x);
    return base + (Math.random() - 0.5) * (err / 100);
  }

  spawnEnemyBullet(x, y, angle, speed, r = 4, fromPlayer = false) {
    if (this.eBullets.length >= GLOBAL.BULLET_POOL) return; // 上限丢弃新子弹 (NFR-PERF-02)
    this.eBullets.push(new Bullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, { r, fromPlayer }));
  }

  fireBossPattern() {
    const b = this.boss;
    const pat = patternForPhase(b.phase, b.patternIndex);
    const speed = 160 * BOSS.PHASE_SPEED_MULT[b.phase] * this.difficulty.bulletSpeedMult;
    if (pat === 'aimed') {
      const a = Math.atan2(this.player.y - b.y, this.player.x - b.x);
      this.spawnEnemyBullet(b.x, b.y, a, speed, 5);
    } else if (pat === 'ring') {
      for (let i = 0; i < 14; i++) this.spawnEnemyBullet(b.x, b.y, (i / 14) * Math.PI * 2, speed, 5);
    } else if (pat === 'cross') {
      // 双翼交叉针弹
      this.spawnEnemyBullet(b.x - 40, b.y, Math.PI / 2 + 0.3, speed * 1.2, 5);
      this.spawnEnemyBullet(b.x + 40, b.y, Math.PI / 2 - 0.3, speed * 1.2, 5);
    } else if (pat === 'spiral') {
      const a = (b.patternIndex * 0.5) % (Math.PI * 2);
      for (let k = 0; k < 3; k++) this.spawnEnemyBullet(b.x, b.y, a + k * (Math.PI * 2 / 3), speed, 5);
    }
  }

  collide() {
    const p = this.player;
    // 玩家子弹 vs 敌机/Boss
    for (const b of this.pBullets) {
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) <= e.hitR + b.r) {
          e.hp -= b.dmg; b.dead = true;
          if (e.hp <= 0) this.killEnemy(e);
          break;
        }
      }
      if (!b.dead && this.boss && !this.boss.entering) {
        if (Math.hypot(b.x - this.boss.x, b.y - this.boss.y) <= 40 + b.r) {
          this.boss.hp -= b.dmg; b.dead = true;
        }
      }
    }
    // 敌弹 vs 玩家（含擦弹）
    for (const b of this.eBullets) {
      if (b.dead) continue;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d <= p.hitR + b.r) {
        if (p.takeHit()) { this.onPlayerHit(); b.dead = true; }
      } else if (d <= GLOBAL.GRAZE_OUTER && p.alive) {
        if (this.graze.check(b.id, d)) this.score += SCORE.GRAZE;
      }
    }
  }

  killEnemy(e) {
    e.dead = true;
    this.score += e.score;
    this.spawnExplosion(e.x, e.y, e.radius);
    this.audio.sfx('explosion');
    const drop = rollDrop(e.type);
    if (drop) this.drops.push({ x: e.x, y: e.y, kind: drop });
  }

  spawnExplosion(x, y, r) {
    const n = Math.min(30, Math.round(r * 1.2)) * (this.settings.motion === 'reduced' ? 0.5 : 1);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 160;
      this.particles.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + Math.random() * 0.4, '#ffcf6b', 2 + Math.random() * 2));
    }
  }

  applyDrop(d) {
    this.audio.sfx('pickup');
    if (d.kind === 'power') { const bonus = this.player.addEnergy(); if (bonus) this.score += bonus; this.audio.sfx('powerup'); }
    else if (d.kind === 'bomb') {
      // 炸弹只能收集入库（库存用于结算展示），不可主动引爆 (v2.1)
      this.player.bombs = Math.min(PLAYER.BOMBS_MAX, this.player.bombs + 1);
      this.say(`炸弹 +1（库存 ${this.player.bombs}）`, 1.4);
    }
    else if (d.kind === 'shield') this.player.giveShield();
    this.drops = this.drops.filter((x) => x !== d);
  }

  onPlayerHit() {
    this.flash = 0.6; this.shake = 0.25; // 白闪≤120ms 由 decay 控制；震动≤250ms
    this.audio.sfx('explosion');
    performance.mark?.('player_hit');
  }

  onBossDead() {
    this.score += SCORE.BOSS_KILL;
    this.spawnExplosion(this.boss.x, this.boss.y, 60);
    this.boss = null;
    this.score += SCORE.REGION_CLEAR;
    if (this.regionIndex >= REGIONS.length - 1) {
      this.sm.transition(STATES.WIN);
      this.audio.sfx('win');
      this._grantUnlocks({ win: true, regionReached: REGIONS.length });
      this.finishRun();
    } else {
      this.regionIndex += 1;
      this._grantUnlocks({ regionReached: this.regionIndex + 1 }); // 到达新区 -> 发放该区对应战机
      this.transition = 2.2; // 区域过渡无敌 (FR-LVL-05)
      this.waves = new WaveDirector(this.regionIndex, this.settings.difficulty);
      this.sm.transition(STATES.CLEAR);
      setTimeout(() => { if (this.sm.is(STATES.CLEAR)) this.sm.transition(STATES.PLAYING); }, 2200);
    }
  }

  onGameOver() {
    if (this.sm.is(STATES.GAMEOVER)) return;
    this.sm.transition(STATES.GAMEOVER);
    this.finishRun();
  }

  finishRun() {
    const date = new Date().toISOString().slice(0, 10);
    const duration = Math.round((performance.now() - this.runStart) / 1000);
    const run = { score: this.score, difficulty: this.settings.difficulty, date, duration, region: this.regionIndex + 1 };
    this._grantUnlocks({ score: this.score }); // 分数达标解锁 (凤凰)
    this.data = recordRun(this.data, run);
    save(this.backend, this.data); // 失败静默降级 (FR-SAV-02)
  }

  // 设置变更后持久化 (FR-SYS-01/07)。
  persistSettings() {
    this.data.settings = this.settings;
    save(this.backend, this.data);
    if (this.audio) this.audio.applyGains(this.settings.volume);
  }
}
