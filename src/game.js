// game.js — 主循环与编排 (FR-CORE / FR-CBT / FR-ENM / FR-LVL)。rAF + dt 钳制。
import {
  VIEW, GLOBAL, PLAYER, ENEMIES, ENEMY_HIT_FACTOR, REGIONS, BOSS, DIFFICULTY,
  SCORE, DROPS, BOMB, RAMP, RALLY, OVERDRIVE, ENEMY_DAMAGE, STORAGE_SCHEMA_VERSION,
  MODES, DEFAULT_MODE, ENDGAME, FEEL,
} from './config.js';
import { STATES, StateMachine } from './statemachine.js';
import { Player, Enemy, Bullet, Particle, Boss, Shockwave, FloatText } from './entities.js';
import { GrazeTracker, comboMultiplier, gradeRun } from './scoring.js';
import { rollDrop } from './drops.js';
import { getPhase, patternForPhase, phaseInterval } from './boss.js';
import { WaveDirector } from './levels.js';
import { busGains, motionFlags, hitboxVisible } from './settings.js';
import { load, save, recordRun, emptyData, normalizeMode } from './storage.js';
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
    this.runTime = 0;  // v2.4 本局存活时间（难度递进用）
    this.overdrive = 0; // v2.6 超载能量（0 ~ OVERDRIVE.MAX）
    this.overdriveUsed = false;   // v2.6.2：本局是否已引爆（一局仅一次）
    this._overdriveNotified = false; // v2.6.2：是否已提示"能量已满"
    this.regionKills = 0; // v2.6 本区已清理敌机数（达标出 Boss）
    this.rally = [];    // v2.5 待重整的漏网敌机队列
    this.shipId = shipById(this.settings.ship).id; // 归一：未知/缺失回退到雷霆号
    if (!isUnlocked(this.shipId, this.data.unlocked)) this.shipId = 'raiden';
    // ── V2.8.0 ──
    this.mode = normalizeMode(this.settings.mode);   // 战役 / 无尽 (FR-2.3)
    this.combo = 0; this.comboTimer = 0; this.maxCombo = 0; // 连击 (FR-3.3)
    this.hitstop = 0;                                // 命中停顿剩余秒数 (FR-3.4)
    this.idleTime = 0;                               // 无目标空屏计时 (FR-1.3)
    this.shockwaves = [];                            // 击破冲击波环 (FR-3.2)
    this.floats = [];                                // 分数飘字 (FR-3.2)
    this.bossCycle = 0;                              // 无尽模式已出精英 Boss 轮次
    this.stats = this._emptyStats();                 // 结算统计 (FR-1.4)
    this.summary = null;                             // 最近一局结算数据
    performance.mark?.('boot_start');
  }

  get difficulty() { return DIFFICULTY[this.settings.difficulty] || DIFFICULTY.standard; }

  // 当前模式配置（FR-2.4）：难度上限、掉落、计分倍率、Boss 频率全部取自 MODES
  get modeCfg() { return MODES[this.mode] || MODES[DEFAULT_MODE]; }

  _emptyStats() {
    // unlocked：本局解锁的战机 id，用于结算页展示「本局解锁」(FR-1.4)
    return { kills: 0, shotsFired: 0, shotsHit: 0, hitsTaken: 0, graze: 0, bossKills: 0, unlocked: [] };
  }

  // 连击倍率：1 + 0.02×(combo-1)，封顶 ×2.0 (FR-3.3)
  get comboMult() { return comboMultiplier(this.combo); }

  // 是否处于减弱动效档（打击感据此降级，FR-3.6）
  get reducedMotion() { return this.settings.motion === 'reduced'; }

  // 综合计分倍率 = 连击倍率 × 模式倍率 (FR-2.4 / FR-3.3)
  addScore(base) {
    const v = Math.round(base * this.comboMult * (this.modeCfg.scoreMult || 1));
    this.score += v;
    return v;
  }

  startRun() {
    // V2.8.0：模式以标题页选择为准（FR-2.3），未知值由 normalizeMode 兜底为战役
    this.mode = normalizeMode(this.settings.mode || this.mode);
    // 战机选择：存档未解锁则回退到雷霆号 (v2.1)
    this.shipId = isUnlocked(this.settings.ship, this.data.unlocked) ? this.settings.ship : 'raiden';
    this.player = new Player(this.shipId);
    this.player.lives = Math.max(1, this.difficulty.initLives + this.player.ship.livesBonus);
    this.player.level = 1; this.player.energy = 0;
    this.enemies = []; this.pBullets = []; this.eBullets = []; this.particles = []; this.drops = [];
    this.rally = [];   // v2.5 待重整的漏网敌机队列
    this.boss = null;
    this.regionIndex = 0;
    // 无尽模式：波次不设上限（持续续波），战役模式沿用 waves×2 兜底
    this.waves = new WaveDirector(0, this.settings.difficulty, this.modeCfg.endless ? Infinity : null);
    this.score = 0; this.graze = new GrazeTracker();
    this.toast = null;
    this.runTime = 0; // v2.4 难度递进计时归零
    this.rally = [];  // v2.5 重整队列清空
    this.overdrive = 0; // v2.6 超载能量清零
    this.overdriveUsed = false;   // v2.6.2：本局引爆标记重置
    this._overdriveNotified = false; // v2.6.2：满能提示重置
    this.regionKills = 0; // v2.6 本区清理计数清零
    // ── V2.8.0 每局重置 ──
    this.combo = 0; this.comboTimer = 0; this.maxCombo = 0;
    this.hitstop = 0; this.idleTime = 0;
    this.shockwaves = []; this.floats = [];
    this.bossCycle = 0; this.stats = this._emptyStats(); this.summary = null;
    // 结束态不能直连 playing（状态机合法转换：gameover/win/victory -> ready -> playing）。
    // 少了这一步，"再来一局"点了会静默失败：状态仍是结束态，结算面板一直盖着。
    if (this.sm.is(STATES.GAMEOVER) || this.sm.is(STATES.WIN) || this.sm.is(STATES.VICTORY)) {
      this.sm.transition(STATES.READY);
    }
    this.sm.transition(STATES.PLAYING);
    this.runStart = performance.now();
    performance.mark?.('run_start');
    // v2.7.0：同步调用（不再 .then 异步链，否则 resume() 脱离用户手势上下文被浏览器拒绝）。
    // 本方法经由 onStart/onAction 手势处理器进入，startMusic 内部亦会同步触发 resume()。
    this.audio.unlock();                       // 创建并恢复 AudioContext（手势内调用即生效）
    this.audio.startMusic(this.regionIndex);  // v2.6.1 按区域选曲
  }

  pauseToggle() {
    if (this.sm.is(STATES.PLAYING)) { this.sm.pause(); this.audio.stopMusic(); } // v2.6.1 暂停即停乐
    else if (this.sm.is(STATES.PAUSED)) { this.sm.resume(); this.audio.startMusic(this.regionIndex, !!this.boss); } // v2.7：恢复时按当前 Boss 状态切回正确曲目
  }
  interrupt() { if (this.sm.is(STATES.PLAYING)) this.sm.pause(); }

  // v2.2：炸弹恢复可用（键盘 K/X，或手机右下角按钮）；炸弹依然只能靠拾取获得。
  useBomb() {
    if (!this.sm.is(STATES.PLAYING) || this.player.bombs <= 0 || !this.player.alive) {
      if (this.sm.is(STATES.PLAYING) && this.player.bombs <= 0) this.say('没有炸弹了', 1.2);
      return;
    }
    this.player.bombs -= 1;
    this.eBullets = []; // 0.3s 内清空（此处瞬时清空等效）
    for (const e of this.enemies) { e.hp -= BOMB.DAMAGE; if (e.hp <= 0 && !e.dead) this.killEnemy(e); }
    if (this.boss) this.boss.hp -= BOMB.DAMAGE;
    this.player.invuln = Math.max(this.player.invuln, BOMB.INVULN);
    this.flash = 0.6;
    this.audio.sfx('explosion');
    this.say(`炸弹！剩余 ${this.player.bombs}`, 1.2);
  }

  say(text, t = 2.2) { this.toast = { text, t }; }

  // 按进度发放战机解锁；解锁结果写入存档并弹出提示。
  // cond = { regionReached, win, score }
  _grantUnlocks(cond) {
    const cur = Array.isArray(this.data.unlocked) ? this.data.unlocked : [];
    const granted = gradeUnlocks(cur, cond);
    if (!granted.length) return granted;
    this.data.unlocked = cur.concat(granted);
    // V2.8.0：累计本局解锁，供结算页展示 (FR-1.4)
    if (this.stats) this.stats.unlocked = (this.stats.unlocked || []).concat(granted);
    save(this.backend, this.data);
    this.say('解锁新战机：' + granted.map((id) => shipById(id).name).join('、'), 3.2);
    return granted;
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

  // v2.4 难度递进：随存活时间连续增长（不是一档一跳），含敌机射速。
  // level = 存活秒数 / TIME_STEP，封顶 MAX_STEPS。
  // V2.8.0：封顶改由 MODES[mode].rampMaxSteps 决定 —— 无尽模式难度持续上涨 (FR-2.2/2.4)。
  rampLevel() {
    const cap = this.modeCfg.rampMaxSteps ?? RAMP.MAX_STEPS;
    return Math.max(0, Math.min(cap, this.runTime / RAMP.TIME_STEP));
  }
  rampScale() {
    const s = this.rampLevel();
    return {
      level: s,
      hpMult: 1 + RAMP.HP_PER_STEP * s,      // 血量（血条更长）
      fireMult: 1 + RAMP.FIRE_PER_STEP * s,  // 射速：开火频率随时间平滑上升
      speedMult: 1 + RAMP.SPEED_PER_STEP * s,
      extra: Math.floor(RAMP.COUNT_PER_STEP * s),
    };
  }

  update(dt) {
    // V2.8.0 命中停顿 Hitstop (FR-3.4)：冻结世界推进 2~4 帧强化重量感。
    // 仅跳过世界推进，不修改 dt、不丢弃输入状态，故操作手感不受影响。
    if (this.hitstop > 0) { this.hitstop = Math.max(0, this.hitstop - dt); return; }
    const p = this.player;
    this.runTime += dt; // v2.4 难度递进计时
    // V2.8.0 连击窗口 (FR-3.3)：超过 COMBO_WINDOW 未再击破则连击归零
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) { this.combo = 0; this.comboTimer = 0; }
    }
    const inp = this.input ? this.input.state : { left: false, right: false, up: false, down: false, fire: false, precision: false };
    // 拖动目标
    if (this.input && this.input.dragId !== null) {
      p.x = clamp(this.input.dragX, p.hitR, VIEW.W - p.hitR);
      p.y = clamp(this.input.dragY, p.hitR, VIEW.H - p.hitR);
    }
    const shots = p.update(dt, inp, inp.precision);
    if (shots) {
      this.stats.shotsFired += shots.length; // V2.8.0 命中率统计 (FR-1.4)
      for (const s of shots) this.pBullets.push(new Bullet(s.x, s.y, s.vx, s.vy, { dmg: s.dmg, fromPlayer: true, homing: s.homing, sway: s.sway, swayAmp: s.swayAmp, swayFreq: s.swayFreq, swayPhase: s.swayPhase, r: 4 }));
      this.audio.sfx('shoot');
    }

    // ── 波次与 Boss 触发 ────────────────────────────────────────────────
    // 战役：达到本区清理阈值即停止刷怪，清屏后拉区末 Boss（FR-2.1）；
    // 无尽：持续刷怪、难度随时间上涨，每 bossEliteEvery 波出精英 Boss（FR-2.2）。
    const endless = !!this.modeCfg.endless;
    if (this.waves && !this.waves.done) {
      if (!endless && this.regionKills >= this.regionQuota) this.waves.done = true;
      else {
        const spawned = this.waves.update(dt, this.rampScale()); // v2.4 按时间成长
        this.enemies.push(...spawned);
      }
    }
    if (!this.boss && this.enemies.length === 0) {
      if (!endless) {
        if (this.waves && this.waves.done) this._spawnBoss();
      } else {
        const every = this.modeCfg.bossEliteEvery || 8;
        const cycle = Math.floor((this.waves?.idx || 0) / every);
        if (cycle > this.bossCycle) { this.bossCycle = cycle; this._spawnBoss(); }
      }
    }

    // ── Anti-Deadlock 兜底 (FR-1.3) ──────────────────────────────────────
    // 无敌人 / 无 Boss / 无待重整队列持续超过 DEADLOCK_TIMEOUT 秒，强制推进流程，
    // 杜绝"屏幕空空却永远不结束"的死锁（例如残敌卡在屏外、波次导演异常收尾）。
    const noTarget = this.enemies.length === 0 && !this.boss && this.rally.length === 0;
    if (noTarget) {
      this.idleTime += dt;
      if (this.idleTime >= ENDGAME.DEADLOCK_TIMEOUT) { this.idleTime = 0; this._breakDeadlock(); }
    } else {
      this.idleTime = 0;
    }

    // 敌机更新 + 开火（v2.7：传入玩家位置，自爆机据此追踪俯冲）
    for (const e of this.enemies) {
      const fire = e.update(dt, this.difficulty, this.player);
      if (fire && this.boss === null) this.spawnEnemyBullet(e.x, e.y, this._aimAngle(e), GLOBAL.ENEMY_BULLET_SPEED * this.difficulty.bulletSpeedMult * this.rampScale().speedMult, 4, false); // v2.3 弹速下调 + v2.4 随时间回升
    }
    // v2.5 漏网敌机：飞出下缘且未击破 -> 离场并进入重整队列（不再无限堆积在屏幕下方）
    for (const e of this.enemies) {
      if (!e.dead && e.y > VIEW.H + RALLY.EXIT_Y_MARGIN) {
        e.dead = true; // 不计分、不掉落
        if (e.reentries < RALLY.MAX_TIMES && this.rally.length < RALLY.MAX_QUEUE) {
          this.rally.push({
            type: e.type, hp: e.hp, maxHp: e.maxHp, fireMult: e.fireMult,
            reentries: e.reentries + 1, t: RALLY.DELAY,
          });
        }
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
    this._updateRally(dt);

    // Boss 更新
    if (this.boss) {
      const fire = this.boss.update(dt, this.difficulty);
      if (this.boss.syncPhase()) {
        this.eBullets = [];
        this.audio.sfx('alarm');
        this.audio.sfx('bossPhase');  // V2.8.0 Boss 阶段切换音效 (FR-3.5)
        this.applyHitstop();          // V2.8.0 阶段切换命中停顿 (FR-3.4)
      }
      if (fire) this.fireBossPattern();
      if (this.boss.hp <= 0) this.onBossDead();
    }

    // 子弹更新
    for (const b of this.pBullets) b.update(dt, p);
    for (const b of this.eBullets) b.update(dt, p);

    // 碰撞
    this.collide();

    // v2.6.2 超载爆发：AUTO 已关闭，集满后不再自动引爆，改由玩家手动释放（按钮 / L 键）。
    // 仅保留自动分支作为兜底（极少用），且本局已引爆过则永不再次触发。
    if (OVERDRIVE.AUTO && !this.overdriveUsed && this.overdrive >= OVERDRIVE.MAX) this._triggerOverdrive();

    // 道具吸附 (FR-CBT-05)。v2.6：未被吸附时按「初速 + 加速度 → 顶速」自动下落，不再停在原地。
    for (const d of this.drops) {
      const dd = Math.hypot(d.x - p.x, d.y - p.y);
      if (dd < GLOBAL.ATTRACT_RADIUS && p.alive) {
        const a = Math.atan2(p.y - d.y, p.x - d.x);
        d.x += Math.cos(a) * 420 * dt; d.y += Math.sin(a) * 420 * dt;
        d.vy = 0; // 被吸附时改为直奔玩家，取消惯性
      } else {
        d.vy = Math.min(DROPS.FALL_SPEED, (d.vy ?? 0) + DROPS.FALL_ACCEL * dt);
        d.y += d.vy * dt;
      }
      if (dd < 16) this.applyDrop(d);
    }
    this.drops = this.drops.filter((d) => d.y < VIEW.H + 20);

    // 粒子
    for (const pt of this.particles) pt.update(dt);
    this.particles = this.particles.filter((pt) => !pt.dead);
    // V2.8.0 冲击波环与分数飘字 (FR-3.2)
    for (const s of this.shockwaves) s.update(dt);
    this.shockwaves = this.shockwaves.filter((s) => !s.dead);
    for (const f of this.floats) f.update(dt);
    this.floats = this.floats.filter((f) => !f.dead);

    // 短提示倒计时 + 炸弹按钮按下反馈
    if (this.toast) { this.toast.t -= dt; if (this.toast.t <= 0) this.toast = null; }
    if (this.input && this.input.bombFlash > 0) this.input.bombFlash -= dt;

    // 区域过渡无敌计时
    if (this.transition > 0) { this.transition -= dt; p.invuln = Math.max(p.invuln, 0.05); }

    // 清理出界子弹/死敌
    this.pBullets = this.pBullets.filter((b) => !b.dead);
    this.eBullets = this.eBullets.filter((b) => !b.dead);

    // 坠机重生后仍无敌
    if (!p.alive && p.respawn <= 0 && p.lives > 0) p.alive = true;
    if (!p.alive && p.lives <= 0) this.onGameOver();
  }

  // v2.5：等待中的敌机到期后带着原有血量从上方重新入场
  _updateRally(dt) {
    if (!this.rally || !this.rally.length) return;
    for (const r of this.rally) r.t -= dt;
    const ready = this.rally.filter((r) => r.t <= 0);
    if (!ready.length) return;
    this.rally = this.rally.filter((r) => r.t > 0);
    for (const r of ready) {
      const x = 30 + Math.random() * (VIEW.W - 60);
      this.enemies.push(new Enemy(r.type, x, RALLY.ENTRY_Y, {
        hp: r.hp, maxHp: r.maxHp, fireMult: r.fireMult, reentries: r.reentries,
      }));
    }
    this.say(`敌机重整：${ready.length} 架带伤重返战场`, 1.6);
  }

  _aimAngle(e) {
    const err = this.difficulty.aimError;
    const base = Math.atan2(this.player.y - e.y, this.player.x - e.x);
    return base + (Math.random() - 0.5) * (err / 100);
  }

  // v2.6.1：敌弹现在带伤害值（普通 150 / Boss 150 = 原等效 100 的 +50%）
  spawnEnemyBullet(x, y, angle, speed, r = 4, fromPlayer = false, dmg = ENEMY_DAMAGE.BULLET) {
    if (this.eBullets.length >= GLOBAL.BULLET_POOL) return; // 上限丢弃新子弹 (NFR-PERF-02)
    this.eBullets.push(new Bullet(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, { r, fromPlayer, dmg }));
  }

  fireBossPattern() {
    const b = this.boss;
    const pat = patternForPhase(b.phase, b.patternIndex);
    const speed = BOSS.BULLET_SPEED * BOSS.PHASE_SPEED_MULT[b.phase] * this.difficulty.bulletSpeedMult; // v2.3 弹速下调 + v2.6.1 回调（v2.7 基础速度入 config）
    const bd = ENEMY_DAMAGE.BOSS;
    if (pat === 'aimed') {
      const a = Math.atan2(this.player.y - b.y, this.player.x - b.x);
      this.spawnEnemyBullet(b.x, b.y, a, speed, 5, false, bd);
    } else if (pat === 'ring') {
      const n = BOSS.RING_COUNT || 14; // v2.6.1 环形弹加密
      for (let i = 0; i < n; i++) this.spawnEnemyBullet(b.x, b.y, (i / n) * Math.PI * 2, speed, 5, false, bd);
    } else if (pat === 'cross') {
      // 双翼交叉针弹（v2.6.1 中央再加一发）
      this.spawnEnemyBullet(b.x - 40, b.y, Math.PI / 2 + 0.3, speed * 1.2, 5, false, bd);
      this.spawnEnemyBullet(b.x + 40, b.y, Math.PI / 2 - 0.3, speed * 1.2, 5, false, bd);
      this.spawnEnemyBullet(b.x, b.y, Math.PI / 2, speed * 1.2, 5, false, bd);
    } else if (pat === 'spiral') {
      const a = (b.patternIndex * 0.5) % (Math.PI * 2);
      const k = BOSS.SPIRAL_COUNT || 3; // v2.6.1 螺旋弹加密
      for (let i = 0; i < k; i++) this.spawnEnemyBullet(b.x, b.y, a + i * (Math.PI * 2 / k), speed, 5, false, bd);
    }
    // v2.6.2 新增三种弹道，丰富 Boss 攻击层次：
    else if (pat === 'fan') {
      // 扇形散射：以瞄准角为中心展开 7 发弧线弹
      const a = Math.atan2(this.player.y - b.y, this.player.x - b.x);
      const n = 7, spread = 0.9;
      for (let i = 0; i < n; i++) {
        const ang = a - spread / 2 + spread * (i / (n - 1));
        this.spawnEnemyBullet(b.x, b.y, ang, speed * 0.85, 5, false, bd);
      }
    } else if (pat === 'wall') {
      // 弹墙：横向一排向下弹，随机留一个缺口供玩家穿越
      const gapX = 40 + Math.random() * (VIEW.W - 80);
      const gapW = 64;
      for (let x = 22; x < VIEW.W - 10; x += 34) {
        if (Math.abs(x - gapX) < gapW / 2) continue;
        this.spawnEnemyBullet(x, b.y, Math.PI / 2, speed * 0.72, 5, false, bd);
      }
    } else if (pat === 'burst') {
      // 三连瞄准爆发：正前方及左右各一发，压迫躲避空间
      const a = Math.atan2(this.player.y - b.y, this.player.x - b.x);
      for (let k = -1; k <= 1; k++) this.spawnEnemyBullet(b.x, b.y, a + k * 0.18, speed * 1.1, 5, false, bd);
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
          this.stats.shotsHit += 1;                 // V2.8.0 命中率统计 (FR-1.4)
          e.hitFlash();                             // V2.8.0 命中闪烁 (FR-3.1)
          this.spawnHitSpark(b.x, b.y);             // V2.8.0 命中火花 (FR-3.1)
          this.audio.sfx('hit', this.combo);        // V2.8.0 命中音效，音高随连击微升
          this.addOverdrive(b.dmg * OVERDRIVE.PER_DMG); // v2.6 命中积攒超载能量
          if (e.hp <= 0) this.killEnemy(e);
          break;
        }
      }
      if (!b.dead && this.boss && !this.boss.entering) {
        if (Math.hypot(b.x - this.boss.x, b.y - this.boss.y) <= BOSS.HIT_RADIUS + b.r) { // v2.7 命中半径入 config
          this.boss.hp -= b.dmg; b.dead = true;
          this.stats.shotsHit += 1;
          this.spawnHitSpark(b.x, b.y);
          this.audio.sfx('hit', this.combo);
          this.addOverdrive(b.dmg * OVERDRIVE.PER_DMG); // v2.6 打 Boss 同样积攒
        }
      }
    }
    // 敌弹 vs 玩家（含擦弹）
    for (const b of this.eBullets) {
      if (b.dead) continue;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d <= p.hitR + b.r) {
        if (p.shield > 0 && p.alive) {
          // V2.8.0 护盾挡下：火花 + 破碎音效（0.3s 节流，避免弹幕密集时音爆）(FR-3.5)
          if (this.t - (this._shieldSfxT || -1) > 0.3) {
            this._shieldSfxT = this.t;
            this.audio.sfx('shieldBreak');
            this.spawnHitSpark(b.x, b.y);
          }
          b.dead = true;
        } else if (p.takeHit(b.dmg)) { this.onPlayerHit(); b.dead = true; }
      } else if (d <= GLOBAL.GRAZE_OUTER && p.alive) {
        if (this.graze.check(b.id, d)) { this.score += SCORE.GRAZE; this.addOverdrive(OVERDRIVE.PER_GRAZE); } // v2.6 擦弹也积攒
      }
    }
  }

  // v2.6 本区击杀阈值：清理够数就停止刷怪，清屏后拉 Boss
  get regionQuota() { return REGIONS[this.regionIndex]?.quota ?? 20; }

  // v2.6 积攒超载能量。来源：造成伤害 / 击破 / 擦弹。上限 OVERDRIVE.MAX。
  // v2.6.2：本局已引爆过则不再积攒（蓝条保持归零，"一局仅一次"）。
  addOverdrive(amount) {
    if (!(amount > 0) || this.overdriveUsed) return;
    this.overdrive = Math.min(OVERDRIVE.MAX, this.overdrive + amount);
    // 首次集满：给出"可释放"提示（按钮由渲染层绘制）
    if (!this._overdriveNotified && this.overdrive >= OVERDRIVE.MAX) {
      this._overdriveNotified = true;
      this.say('超载能量已满！点击[爆发]按钮或按 L 键引爆', 3.0);
    }
  }

  // v2.6.2：玩家手动释放超载爆发（按钮 / L 键）。仅在本局未引爆且能量已满时可触发。
  releaseOverdrive() {
    if (this.sm.is(STATES.PLAYING) && !this.overdriveUsed && this.overdrive >= OVERDRIVE.MAX) {
      this._triggerOverdrive();
    }
  }
  // 供输入层判断"爆发按钮当前是否可点"
  canReleaseOverdrive() {
    return this.sm.is(STATES.PLAYING) && !this.overdriveUsed && this.overdrive >= OVERDRIVE.MAX;
  }

  // v2.6 蓝条集满引爆：清空当前屏幕所有敌机（Boss 改为重创）+ 清敌弹 + 短暂无敌。
  // 清屏击破只计分与特效，不掉落道具，避免一次爆发塞满屏幕。
  // v2.6.2：引爆后置 overdriveUsed=true 并清零蓝条，本局不再积攒 / 不再可触发（一局仅一次）。
  _triggerOverdrive() {
    if (this.overdriveUsed) return; // 兜底：已引爆则不重复
    this.overdriveUsed = true;
    this.overdrive = 0; // 先清零，防止同帧重复触发
    const cleared = this.enemies.filter((e) => !e.dead);
    for (const e of cleared) {
      e.dead = true;
      this.score += e.score;
      this.regionKills += 1; // 清屏击破同样计入本区阈值
      this.spawnExplosion(e.x, e.y, e.radius);
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (cleared.length) this.audio.sfx('explosion');

    if (this.boss && !this.boss.entering) {
      this.boss.hp -= OVERDRIVE.BOSS_DAMAGE;
      this.spawnExplosion(this.boss.x, this.boss.y, 40);
      if (this.boss.hp <= 0) this.onBossDead();
    }
    if (OVERDRIVE.CLEAR_BULLETS && this.eBullets.length) {
      for (const b of this.eBullets) this.spawnExplosion(b.x, b.y, 3);
      this.eBullets = [];
    }
    if (this.player) this.player.invuln = Math.max(this.player.invuln, OVERDRIVE.INVULN);
    this.score += OVERDRIVE.SCORE_BONUS;
    this.flash = Math.max(this.flash, 0.5);
    this.shake = Math.max(this.shake, 0.35);
    this.audio.sfx('overdrive');
    this.say(`超载爆发！清除 ${cleared.length} 架敌机`, 2.0);
    performance.mark?.('overdrive');
  }

  // V2.8.0 击破 (FR-3.2/3.3)：连击累积 + 倍率计分 + 多层爆炸 + 音效 + 分数飘字 + 轻震屏。
  killEnemy(e) {
    e.dead = true;
    this.registerKill(); // 连击计数与倍率 (FR-3.3)
    const gained = this.addScore(e.score); // 分数 × 连击倍率 × 模式倍率
    this.stats.kills += 1;
    this.regionKills += 1; // v2.6 本区清理计数（达标即出 Boss）
    this.addOverdrive(OVERDRIVE.PER_KILL); // v2.6 击破积攒超载能量
    const heavy = e.type === 'tank' || e.type === 'turret';
    this.spawnKillFx(e.x, e.y, e.radius, heavy);
    this.audio.sfx(heavy ? 'killHeavy' : 'kill'); // 分机型击破音效 (FR-3.5)
    // 分数飘字：连击 ≥2 时附带倍率提示 (FR-3.2)
    const label = this.combo > 1 ? `+${gained} ×${this.comboMult.toFixed(2)}` : `+${gained}`;
    this.addFloat(e.x, e.y, label, this.combo > 1 ? '#ffd166' : '#ffffff');
    const drop = rollDrop(e.type, Math.random, this.modeCfg.dropChance);
    // v2.6：带下落初速出场，视觉上"抛出即下落"
    if (drop) this.drops.push({ x: e.x, y: e.y, kind: drop, vy: DROPS.FALL_V0 });
  }

  // 连击累积 (FR-3.3)：窗口内连续击破累加，超时由 update 归零。
  registerKill() {
    this.combo += 1;
    this.comboTimer = FEEL.COMBO_WINDOW;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
  }

  // 分数飘字 (FR-3.2)
  addFloat(x, y, text, color) {
    if (this.reducedMotion) return; // 减弱动效档不飘字（避免额外绘制开销）
    this.floats.push(new FloatText(x, y, text, color));
  }

  // 命中停顿 (FR-3.4)：重型敌机 / Boss 阶段切换时冻结 2~4 帧，强化重量感。
  applyHitstop(frames = null) {
    if (this.reducedMotion) return; // FR-3.6 降级：减弱动效档关闭停顿
    const f = frames ?? FEEL.HITSTOP_FRAMES;
    this.hitstop = Math.max(this.hitstop, f / (FEEL.HITSTOP_FPS || 60));
  }

  // 命中火花 (FR-3.1)：子弹命中敌机时的白色火花，方向沿子弹飞行方向散开。
  spawnHitSpark(x, y) {
    const n = this.reducedMotion ? Math.ceil(FEEL.SPARK_COUNT / 2) : FEEL.SPARK_COUNT;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120;
      this.particles.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.12 + Math.random() * 0.12, '#ffffff', 1.6 + Math.random() * 1.4));
    }
  }

  // 多层爆炸 (FR-3.2)：核心闪光 → 冲击波环 → 碎片 → 烟雾，四层叠加形成重量感。
  spawnKillFx(x, y, r, heavy = false) {
    const scale = this.reducedMotion ? 0.5 : 1; // FR-3.6 降级：粒子减半
    // ① 核心闪光
    this.shockwaves.push(new Shockwave(x, y, 2, r * 1.6, 0.22, '#ffffff'));
    // ② 冲击波环
    this.shockwaves.push(new Shockwave(x, y, r * 0.6, r * (heavy ? 3.2 : 2.4), heavy ? 0.45 : 0.34, '#ffd166'));
    // ③ 碎片
    const n = Math.round(Math.min(30, Math.round(r * 1.2)) * scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 160;
      this.particles.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + Math.random() * 0.4, '#ffcf6b', 2 + Math.random() * 2));
    }
    // ④ 烟雾（低速暗色粒子，延长余韵）
    const smoke = Math.round((heavy ? 10 : 5) * scale);
    for (let i = 0; i < smoke; i++) {
      const a = Math.random() * Math.PI * 2, sp = 10 + Math.random() * 40;
      this.particles.push(new Particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.6 + Math.random() * 0.5, '#6b5b4a', 3 + Math.random() * 3));
    }
    // 轻震屏（重型与 Boss 更重）
    if (!this.reducedMotion) {
      this.shake = Math.max(this.shake, heavy ? FEEL.SHAKE_HEAVY : FEEL.SHAKE_LIGHT);
    }
    if (heavy) this.applyHitstop(); // 重型敌机命中停顿 (FR-3.4)
  }

  spawnExplosion(x, y, r) {
    // 兼容旧调用点：统一走多层爆炸
    this.spawnKillFx(x, y, r, false);
  }

  applyDrop(d) {
    this.audio.sfx('pickup');
    if (d.kind === 'power') { const bonus = this.player.addEnergy(); if (bonus) this.score += bonus; this.audio.sfx('powerup'); }
    else if (d.kind === 'bomb') {
      this.player.bombs = Math.min(PLAYER.BOMBS_MAX, this.player.bombs + 1);
      this.say(`炸弹 +1（剩余 ${this.player.bombs}）`, 1.4);
    }
    else if (d.kind === 'shield') this.player.giveShield();
    else if (d.kind === 'life') {
      this.player.lives = Math.min(PLAYER.LIVES_MAX, this.player.lives + 1);
      this.say(`生命 +1（剩余 ${this.player.lives}）`, 1.6);
    }
    this.drops = this.drops.filter((x) => x !== d);
  }

  onPlayerHit() {
    this.stats.hitsTaken += 1;   // V2.8.0：结算评级"无伤"判定依据 (FR-1.4)
    this.combo = 0; this.comboTimer = 0; // 受击打断连击 (FR-3.3)
    this.flash = 0.6;
    if (!this.reducedMotion) this.shake = 0.25; // 白闪≤120ms 由 decay 控制；震动≤250ms
    this.audio.sfx('playerHit');  // V2.8.0 玩家受击专属音效 (FR-3.5)
    if (!this.reducedMotion) this.applyHitstop(2);
    performance.mark?.('player_hit');
  }

  // V2.8.0 Boss 击破：按模式分流转——
  // 战役最后一区 → victory (FR-1.1)；战役中途 → region-clear 过渡 (FR-1.5)；无尽 → 循环继续 (FR-2.2)。
  onBossDead() {
    const bx = this.boss.x, by = this.boss.y;
    this.stats.bossKills += 1;
    this.addScore(SCORE.BOSS_KILL);
    this.spawnKillFx(bx, by, 60, true);
    this.spawnKillFx(bx, by, 90, true); // v2.7：Boss 击破追加一圈大爆炸
    this.flash = Math.max(this.flash, 0.45); // v2.7：Boss 击破白闪
    if (!this.reducedMotion) this.shake = Math.max(this.shake, 0.5); // v2.7：Boss 击破震屏
    this.applyHitstop(4); // V2.8.0：Boss 击破命中停顿 (FR-3.4)
    this.audio.sfx('bossDie');
    this.boss = null;
    this.addScore(SCORE.REGION_CLEAR);

    if (this.modeCfg.endless) {
      // 无尽模式：无胜利条件，区域视觉循环，继续刷波 (FR-2.2)
      this.regionIndex = (this.regionIndex + 1) % REGIONS.length;
      if (this.waves) this.waves.region = this.regionIndex;
      this.regionKills = 0;
      this.transition = 1.6;
      this.audio.setTrack?.(this.regionIndex); // 换区换曲
      this.say(`第 ${this.stats.bossKills} 个精英 Boss 击破！继续推进`, 2.0);
      return; // 保持 playing，不进入过渡态
    }

    if (this.regionIndex >= REGIONS.length - 1) {
      // FR-1.1 战役胜利条件：击败第 3 区最终 Boss
      this.sm.transition(STATES.VICTORY);
      this.audio.sfx('win');
      this._grantUnlocks({ win: true, regionReached: REGIONS.length });
      this.finishRun('victory');
    } else {
      this.regionIndex += 1;
      this._grantUnlocks({ regionReached: this.regionIndex + 1 }); // 到达新区 -> 发放该区对应战机
      this.transition = ENDGAME.REGION_CLEAR_TIME; // 区域过渡无敌 (FR-LVL-05)
      this.waves = new WaveDirector(this.regionIndex, this.settings.difficulty);
      this.regionKills = 0; // v2.6 新区重新计阈值
      this.audio.setTrack?.(this.regionIndex); // v2.6.1 换区换曲
      // FR-1.5：进入区域通关过渡态，演出结束后自动回到 playing
      this.sm.transition(STATES.REGION_CLEAR);
      setTimeout(() => { if (this.sm.is(STATES.REGION_CLEAR)) this.sm.transition(STATES.PLAYING); }, ENDGAME.REGION_CLEAR_TIME * 1000);
      this.say(`第 ${this.regionIndex} 区突破！`, 2.0);
    }
  }

  onGameOver() {
    if (this.sm.is(STATES.GAMEOVER)) return;
    this.sm.transition(STATES.GAMEOVER);        // FR-1.2 生命耗尽即失败
    this.finishRun('gameover');
  }

  // V2.8.0 统一结算 (FR-1.4)：胜负均进入，产出评级与全部统计。
  finishRun(outcome = 'gameover') {
    // 分数解锁先结算，保证「本局解锁」能进结算数据 (FR-1.4)
    this._grantUnlocks({ score: this.score });
    const date = new Date().toISOString().slice(0, 10);
    const duration = Math.round((performance.now() - this.runStart) / 1000);
    const acc = this.stats.shotsFired ? this.stats.shotsHit / this.stats.shotsFired : 0;
    const noMiss = this.stats.hitsTaken === 0;
    const grade = gradeRun({ score: this.score, noMiss });
    this.summary = {
      outcome,                 // 'victory' | 'gameover'
      mode: this.mode,
      modeLabel: this.modeCfg.label,
      score: this.score,
      grade,
      kills: this.stats.kills,
      bossKills: this.stats.bossKills,
      maxCombo: this.maxCombo,
      accuracy: acc,           // 命中率 0~1
      duration,                // 对局用时（秒）
      region: this.regionIndex + 1,
      difficulty: this.settings.difficulty,
      date,
      noMiss,
      unlocked: (this.stats.unlocked || []).slice(), // 本局解锁的战机 id (FR-1.4)
      unlockedNames: (this.stats.unlocked || []).map((id) => shipById(id).name),
    };
    const run = {
      score: this.score, difficulty: this.settings.difficulty, date, duration,
      region: this.regionIndex + 1, mode: this.mode, grade,
    };
    this.data = recordRun(this.data, run);     // 分模式写入，战役/无尽互不覆盖 (FR-2.5)
    save(this.backend, this.data); // 失败静默降级 (FR-SAV-02)
    this.audio.stopMusic(); // v2.6.1 结算时停掉 BGM
    return this.summary;
  }

  // 召唤 Boss（战役区末 Boss / 无尽精英 Boss 共用）
  _spawnBoss() {
    if (this.boss) return;
    this.boss = new Boss(this.regionIndex);
    this.audio.setTrack?.(this.regionIndex, true); // v2.6.1 Boss 战切紧张版
    this.audio.sfx?.('bossSpawn');                 // V2.8.0 Boss 出场音效 (FR-3.5)
    if (!this.reducedMotion) this.shake = Math.max(this.shake, 0.3);
    performance.mark?.('boss_enter');
  }

  // V2.8.0 Anti-Deadlock 强制推进 (FR-1.3)：空屏超过 DEADLOCK_TIMEOUT 秒必定打破僵局。
  _breakDeadlock() {
    if (this.modeCfg.endless) {
      // 无尽：直接把精英 Boss 提上场（并把本轮波次标记为已结算，避免重复触发）
      this.bossCycle = Math.floor((this.waves?.idx || 0) / (this.modeCfg.bossEliteEvery || 8)) + 1;
      this._spawnBoss();
      this.say('战场空置过久：精英 Boss 提前登场', 2.4);
      return;
    }
    // 战役：波次未收尾则强制收尾，随后立即召唤区末 Boss
    if (this.waves && !this.waves.done) this.waves.done = true;
    this._spawnBoss();
    this.say('战场空置过久：Boss 提前登场', 2.4);
  }

  // 设置变更后持久化 (FR-SYS-01/07)。
  persistSettings() {
    this.data.settings = this.settings;
    save(this.backend, this.data);
    if (this.audio) this.audio.applyGains(this.settings.volume);
  }
}
