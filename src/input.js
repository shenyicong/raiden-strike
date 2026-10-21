// input.js — 输入管理 (FR-INP-01..07 / FR-CORE-07)。
// 键盘 WASD+方向移动；K/X 炸弹；P/Esc 暂停；M 静音；Shift 精确。
// v2.6：射击改为全程自动（PLAYER.AUTO_FIRE），空格/J 仅作兼容保留，不再需要长按。
// v2.2：拖动改为"相对偏移跟手"（手指按在机身哪，飞机就跟到哪，不再有 60px 跳变）；
//       移动端新增屏幕炸弹按钮（手机无键盘）；阻断浏览器手势，避免竖向拖动被滚动/下拉刷新抢走。
import { VIEW } from './config.js';

// 触屏端屏幕按钮（逻辑坐标）。桌面端不绘制、不响应。
export const TOUCH_BUTTONS = {
  bomb:  { x: VIEW.W - 46, y: VIEW.H - 46, r: 30, label: '炸' },
  pause: { x: 42, y: VIEW.H - 52, r: 22, label: '‖' },
  slow:  { x: 42, y: VIEW.H - 112, r: 22, label: '慢' },
};

// v2.6.2：超载爆发"释放"按钮（逻辑坐标）。集满且本局未引爆时由渲染层绘制并响应点击。
// 仅当 canOverdrive 回调为 true 才拦截点击，否则回退为拖动，避免挡住正常操作区域。
export const OVERDRIVE_BUTTON = { x: VIEW.W / 2, y: VIEW.H - 96, r: 30, label: '爆发' };

export class InputManager {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.h = handlers;
    this.keys = new Set();
    this.pointers = new Map();      // pointerId -> {x,y}
    this.dragId = null;             // 当前用于拖动的指针
    this.dragX = 0; this.dragY = 0; // 拖动目标（逻辑坐标）
    this.offX = 0; this.offY = -60; // 手指与机身的相对偏移（跟手用，FR-INP-04）
    this.fire = false;
    this.precision = false;
    this.bombFlash = 0;             // 按钮按下反馈计时（供渲染层读取）
    this.slowOn = false;            // 触屏端"精确慢速"开关状态
    this.touchMode = false;         // v2.7：触屏按钮（炸/暂停/慢）仅触屏设备响应；桌面端不绘制也不响应
    this._bind();
  }

  get state() {
    const k = this.keys;
    return {
      left: k.has('arrowleft') || k.has('a'),
      right: k.has('arrowright') || k.has('d'),
      up: k.has('arrowup') || k.has('w'),
      down: k.has('arrowdown') || k.has('s'),
      fire: this.fire || k.has(' ') || k.has('j'),
      precision: this.precision || k.has('shift'),
    };
  }

  _bind() {
    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    this.canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    // 指针捕获丢失（Android 偶发）时仍继续跟手：在 window 上再挂一份 move
    this.canvas.addEventListener('pointermove', (e) => this._onMove(e));
    window.addEventListener('pointermove', (e) => this._onMove(e));
    window.addEventListener('pointerup', (e) => this._onUp(e));
    window.addEventListener('pointercancel', (e) => this._onCancel(e));
    this.canvas.addEventListener('lostpointercapture', (e) => this._onCancel(e));
    // 移动端：阻断滚动/下拉刷新/双击缩放，否则竖向拖动会被浏览器手势打断（表现为"拖不动/有延迟"）
    const stop = (e) => { if (e.cancelable) e.preventDefault(); };
    this.canvas.addEventListener('touchstart', stop, { passive: false });
    this.canvas.addEventListener('touchmove', stop, { passive: false });
    this.canvas.addEventListener('touchend', stop, { passive: false });
    this.canvas.addEventListener('contextmenu', stop);
    // 中断即暂停 (FR-CORE-07)：失焦/隐藏/旋转
    window.addEventListener('blur', () => this.h.onInterrupt?.());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.h.onInterrupt?.(); });
    window.addEventListener('orientationchange', () => this.h.onInterrupt?.());
  }

  _onKey(e, down) {
    const key = e.key.toLowerCase();
    // 阻止方向键/空格滚动页面
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(key)) e.preventDefault();
    if (down) {
      if (key === 'p' || key === 'escape') { this.h.onPause?.(); return; }
      if (key === 'm') { this.h.onMute?.(); return; }
      if (key === 'k' || key === 'x') { this.h.onBomb?.(); return; } // v2.2 恢复使用
      if (key === 'l') { this.h.onOverdrive?.(); return; } // v2.6.2 释放超载爆发
      if (key === 'enter') { this.h.onStart?.(); return; }
      this.keys.add(key);
      if (key === 'shift') this.precision = true;
    } else {
      this.keys.delete(key);
      if (key === 'shift') this.precision = false;
    }
  }

  // 画布坐标 -> 逻辑坐标（考虑缩放）。
  _toLogical(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = rect.width / this.canvas._logicalW;
    const sy = rect.height / this.canvas._logicalH;
    return { x: (e.clientX - rect.left) / sx, y: (e.clientY - rect.top) / sy };
  }

  // 命中哪个屏幕按钮？返回 key 或 null（按钮互不重叠，取距离最近且在半径内的）。
  // v2.7：炸/暂停/慢 三个触屏按钮仅在 touchMode（触屏设备）下命中；
  //       爆发按钮所有设备均可点（桌面端同样绘制），不可释放时让位给拖动。
  hitButton(x, y) {
    if (this.touchMode) {
      for (const key of ['bomb', 'pause', 'slow']) {
        const b = TOUCH_BUTTONS[key];
        if (Math.hypot(x - b.x, y - b.y) <= b.r) return key;
      }
    }
    // v2.6.2 超载爆发按钮（仅可释放时命中，否则视为空白让位给拖动）
    if (this.h.canOverdrive?.()) {
      if (Math.hypot(x - OVERDRIVE_BUTTON.x, y - OVERDRIVE_BUTTON.y) <= OVERDRIVE_BUTTON.r) return 'overdrive';
    }
    return null;
  }

  _onDown(e) {
    const p0 = this._toLogical(e);
    // 屏幕按钮优先：多指时另一根手指点按钮也不会打断正在拖动的那一根
    const btn = this.hitButton(p0.x, p0.y);
    if (btn) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.bombFlash = 0.18;
      if (btn === 'bomb') this.h.onBomb?.();
      else if (btn === 'pause') this.h.onPause?.();
      else if (btn === 'slow') { this.precision = !this.precision; this.slowOn = this.precision; }
      else if (btn === 'overdrive') this.h.onOverdrive?.(); // v2.6.2 释放超载爆发
      return;
    }
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.dragId === null) {
      // 仅首根手指接管拖动锚点（多指不抢，FR-INP-07）
      this.dragId = e.pointerId;
      // 跟手偏移：以按下瞬间"机身相对手指"的位置为准，之后手指走多少，机身走多少
      const pl = this.h.getPlayerPos?.() || null;
      if (pl) {
        this.offX = pl.x - p0.x;
        this.offY = Math.min(pl.y - p0.y, -20); // 机身略高于手指，避免被手指挡住
      } else { this.offX = 0; this.offY = -60; }
      this.dragX = p0.x + this.offX; this.dragY = p0.y + this.offY;
      this.fire = true;
    }
    this.h.onStart?.();
    this.h.onPointerDown?.(e);
  }

  _onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerId === this.dragId) {
      const p = this._toLogical(e);
      this.dragX = p.x + this.offX; this.dragY = p.y + this.offY; // 保持按下时的相对偏移
    }
  }

  _onUp(e) {
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.dragId) {
      this.dragId = null;
      this.fire = false;
    }
  }

  _onCancel(e) {
    // pointercancel / lostpointercapture：停止该指针拖动，清空锚点，不瞬移 (FR-INP-07)
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.dragId) {
      this.dragId = null;
      this.fire = false;
    }
  }
}
