/**
 * input.js —— 键盘 / 鼠标 / 触摸 统一输入
 * 同时输出「持续按住」与「本帧刚按下」两种状态。
 */

const KEYMAP = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
  Space: 'fire',
  KeyJ: 'fire',
  KeyK: 'bomb',
  KeyX: 'bomb',
  KeyL: 'bomb',
  ShiftLeft: 'focus',
  ShiftRight: 'focus',
  KeyP: 'pause',
  Escape: 'pause',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.state = Object.create(null);   // 当前按住
    this.prev = Object.create(null);    // 上一帧
    this.pointer = { active: false, x: 0, y: 0, down: false };
    this.enabled = true;

    addEventListener('keydown', (e) => {
      const k = KEYMAP[e.code];
      if (!k) return;
      // 阻止空格/方向键滚动页面
      e.preventDefault();
      this.state[k] = true;
    });

    addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (!k) return;
      e.preventDefault();
      this.state[k] = false;
    });

    addEventListener('blur', () => {
      this.state = Object.create(null);
      this.pointer.down = false;
    });

    const toLocal = (ev) => {
      const r = canvas.getBoundingClientRect();
      const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const cy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
      this.pointer.x = (cx / r.width) * canvas.width;
      this.pointer.y = (cy / r.height) * canvas.height;
    };

    canvas.addEventListener('pointerdown', (e) => {
      toLocal(e);
      this.pointer.active = true;
      this.pointer.down = true;
      canvas.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.pointer.active) toLocal(e);
    });
    const up = (e) => {
      this.pointer.down = false;
      e.preventDefault?.();
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // 触摸设备：直接拖动战机
    canvas.addEventListener('touchstart', (e) => {
      toLocal(e);
      this.pointer.active = true;
      this.pointer.down = true;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      toLocal(e);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      this.pointer.down = false;
      e.preventDefault();
    }, { passive: false });
  }

  /** 每帧开始前调用，刷新 prev 快照 */
  beginFrame() {
    this.prev = { ...this.state };
  }

  down(action) {
    return !!this.state[action];
  }

  /** 本帧刚按下（边沿触发） */
  pressed(action) {
    return !!this.state[action] && !this.prev[action];
  }

  /** 归一化的方向向量 */
  axis() {
    let x = 0;
    let y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('up')) y -= 1;
    if (this.down('down')) y += 1;
    if (x && y) {
      const inv = Math.SQRT1_2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }
}
