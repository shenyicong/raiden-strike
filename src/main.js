// main.js — 启动与渲染循环。零构建，ES Module 直接由浏览器加载 (NFR-MAINT-03)。
import { VIEW, HIT_FEEDBACK } from './config.js';
import { STATES } from './statemachine.js';
import { Renderer } from './render.js';
import { AudioEngine } from './audio.js';
import { InputManager } from './input.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { clearAll, emptyData } from './storage.js';
import { isUnlocked, shipById } from './ships.js';
import { isTouchDevice } from './util.js';

const canvas = document.getElementById('game');
const wrap = document.getElementById('stage');
canvas._logicalW = VIEW.W; canvas._logicalH = VIEW.H;
const dpr = Math.min(3, window.devicePixelRatio || 1);
canvas.width = VIEW.W * dpr; canvas.height = VIEW.H * dpr;
const ctx = canvas.getContext('2d');
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

function fit() {
  const maxW = window.innerWidth * 0.95, maxH = window.innerHeight * 0.95;
  let w = maxW, h = w * (VIEW.H / VIEW.W);
  if (h > maxH) { h = maxH; w = h * (VIEW.W / VIEW.H); }
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
}
window.addEventListener('resize', fit); fit();

const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
const audio = new AudioEngine();
const renderer = new Renderer(ctx, {});
// 沙箱 iframe / 隐私模式下访问 localStorage 会直接抛 SecurityError，必须 try/catch 降级到内存实现。
function safeStorage() {
  try {
    const t = window.localStorage; t.getItem('__probe'); return t;
  } catch (_) {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
  }
}
const backend = safeStorage();
let game, ui, input;

// 启动兜底：任何初始化异常都画到画布上，绝不黑屏静默。
function fatal(err) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ff7a7a'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('启动失败', canvas.width / 2, canvas.height / 2 - 20);
  ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif';
  const msg = String(err && err.message || err).slice(0, 60);
  ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
  console.error('[raiden-strike] boot failed:', err);
}

function boot() {
  game = new Game({ renderer, audio, input, backend, prefersReducedMotion: prefersReduced });
  game.mobile = isTouchDevice(); // 设备自适应：触屏端显示虚拟按钮 (v2.2)
  renderer.setSettings(game.settings);
  ui = new UI(wrap, game);
  input = new InputManager(canvas, {
    onPause: () => { game.pauseToggle(); ui.sync(game.sm.state); },
    onMute: () => { game.muted = !game.muted; audio.setMuted(game.muted); },
    onBomb: () => game.useBomb(), // v2.2：键盘 K/X 与手机炸弹按钮共用
    onOverdrive: () => game.releaseOverdrive(), // v2.6.2：超载爆发手动释放
    canOverdrive: () => game.canReleaseOverdrive(), // v2.6.2：能量已满且本局未引爆
    getPlayerPos: () => ({ x: game.player.x, y: game.player.y }), // 拖动跟手用
    onInterrupt: () => { game.interrupt(); ui.sync(game.sm.state); },
    onStart: () => {
      if (game.sm.is(STATES.READY) || game.sm.is(STATES.GAMEOVER) || game.sm.is(STATES.WIN)) {
        game.startRun(); ui.sync(game.sm.state);
      }
    },
  });
  input.touchMode = game.mobile; // v2.7：触屏按钮仅触屏设备响应（桌面不绘制也不误触发）
  game.input = input;
  ui.onAction = (a) => {
    if (a.startsWith('ship:')) {  // 选战机：仅已解锁机型可切换 (v2.1)
      const id = a.slice(5);
      try {
        if (isUnlocked(id, game.data.unlocked)) {
          game.settings.ship = id;
          game.persistSettings();
          ui.setStatus('已选择战机 ' + shipById(id).name);
        }
      } catch (_) { /* 选择失败不影响游戏 */ }
      ui.title();
      return;
    }
    if (a === 'start' || a === 'restart') { game.startRun(); ui.sync(game.sm.state); return; }
    if (a === 'resume') { game.sm.resume(); }
    else if (a === 'title') { game.sm.transition(STATES.READY); }
    else if (a === 'settings') { ui.settings(); return; }
    else if (a === 'clear') { game.data = clearAll(backend); game.settings = game.data.settings; ui.settings(); return; }
    ui.sync(game.sm.state);
  };
  ui.sync(game.sm.state);
  audio.unlock();
  requestAnimationFrame(loop);
}
performance.mark?.('ready');

let last = performance.now();
let loopDead = false;
function loop(now) {
  if (loopDead) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    game.step(dt, now);
    draw();
    ui.sync(game.sm.state);
    if (game.diag) updateDiag();
  } catch (e) { loopDead = true; fatal(e); return; }
  requestAnimationFrame(loop);
}

function draw() {
  const reduced = game.settings.motion === 'reduced';
  ctx.save();
  if (game.shake > 0 && !reduced) {
    ctx.translate((Math.random() - 0.5) * HIT_FEEDBACK.SHAKE_MAX_OFFSET, (Math.random() - 0.5) * HIT_FEEDBACK.SHAKE_MAX_OFFSET); // v2.7 震屏幅度入 config
  }
  renderer.drawBackground(game.regionIndex, reduced);
  for (const e of game.enemies) renderer.drawEnemy(e);
  if (game.boss) renderer.drawBoss(game.boss);
  for (const b of game.pBullets) renderer.drawBullet(b);
  for (const b of game.eBullets) renderer.drawBullet(b);
  for (const pt of game.particles) renderer.drawParticle(pt);
  for (const d of game.drops) renderer.drawDrop(d);
  renderer.drawPlayer(game.player, game.settings, game.t);
  renderer.drawHUD(game);
  // v2.7：触屏端每帧绘制虚拟按钮（此前按钮从未渲染，只在热区"隐形响应"）
  if (game.mobile) renderer.drawTouchButtons(game);
  renderer.drawFlash();
  ctx.restore();
  // aria-live 状态同步（去抖：仅在变化时）
  const status = `分数${game.score} 命${game.player.lives} 火力${game.player.level}`;
  if (status !== boot._lastStatus) { ui.setStatus(status); boot._lastStatus = status; }
}

// 诊断面板 (NFR-OBS-01)
let diagEl = null;
function updateDiag() {
  if (!diagEl) {
    diagEl = document.createElement('div'); diagEl.className = 'diag';
    wrap.appendChild(diagEl);
  }
  const samples = game.fpsSamples;
  const mean = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
  // v2.7：真正的 99 分位（此前取的是 max，标签名不副实）
  const p99 = samples.length ? samples.slice().sort((a, b) => a - b)[Math.floor(samples.length * 0.99)] : 0;
  const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB' : 'n/a';
  diagEl.textContent = `FPS均值 ${mean.toFixed(1)} | P99 ${p99.toFixed(1)} | 堆 ${heap} | 敌弹 ${game.eBullets.length} | 粒子 ${game.particles.length}`;
}

try { boot(); } catch (e) { fatal(e); }
