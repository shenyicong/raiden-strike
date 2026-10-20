// input.js — 输入管理 (FR-INP-01..07 / FR-CORE-07)。
// 键盘 WASD+方向；Space/J 射击；P/Esc 暂停；M 静音；Shift 精确。
// v2.1：移除 K/X 炸弹快捷键 —— 炸弹改为纯收集品，不可主动引爆。
// 指针拖动自动开火；多指不抢锚点；pointercancel/lostpointercapture 清锚点。
export class InputManager {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.h = handlers;
    this.keys = new Set();
    this.pointers = new Map();      // pointerId -> {x,y}
    this.dragId = null;             // 当前用于拖动的指针
    this.dragX = 0; this.dragY = 0; // 拖动目标（逻辑坐标）
    this.fire = false;
    this.precision = false;
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
    this.canvas.addEventListener('pointermove', (e) => this._onMove(e));
    window.addEventListener('pointerup', (e) => this._onUp(e));
    window.addEventListener('pointercancel', (e) => this._onCancel(e));
    this.canvas.addEventListener('lostpointercapture', (e) => this._onCancel(e));
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
      if (key === 'enter') { this.h.onStart?.(); return; }
      // 注：k/x 原为炸弹键，v2.1 起炸弹仅可收集，不再派发使用事件。
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

  _onDown(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.dragId === null) {
      // 仅首根手指接管拖动锚点（多指不抢，FR-INP-07）
      this.dragId = e.pointerId;
      const p = this._toLogical(e);
      this.dragX = p.x; this.dragY = p.y - 60; // 纵向偏移避免遮挡 (FR-INP-04)
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
      this.dragX = p.x; this.dragY = p.y - 60;
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
