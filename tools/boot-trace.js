// tools/boot-trace.js — 复现浏览器启动/交互路径的回归测试。
// 覆盖两类真实故障：
//  1) 沙箱 iframe 里 localStorage 抛 SecurityError -> 必须降级而非黑屏
//  2) 每帧 sync 重建 DOM / querySelector().onclick 崩溃 -> 必须可点击且不崩
// 注意：main.js 是自启动模块，同一个模块实例只执行一次，
//       因此这两个断言必须放在同一个测试里，共用同一套环境。
import { test } from 'node:test';
import assert from 'node:assert/strict';

function buildEnv() {
  const draw = [];
  const ctx2d = new Proxy({}, {
    get(t, k) {
      if (k === 'canvas') return { width: 960, height: 1440 };
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k in t) return t[k];
      return () => { draw.push(k); };
    },
    set(t, k, v) { t[k] = v; return true; },
  });

  class ET {
    constructor() { this._l = {}; }
    addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }
    removeEventListener(t, fn) { this._l[t] = (this._l[t] || []).filter((f) => f !== fn); }
    dispatch(t, ev = {}) { for (const fn of this._l[t] || []) fn({ preventDefault() {}, stopPropagation() {}, ...ev }); }
  }

  function makeEl(tag) {
    const el = Object.assign(new ET(), {
      tagName: tag, style: {}, className: '', _html: '', children: [], attrs: {}, dataset: {},
      appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
      setAttribute(k, v) { this.attrs[k] = v; },
      hasAttribute(k) { return k in this.attrs; },
      getAttribute(k) { return this.attrs[k] ?? null; },
      matches(sel) {
        if (sel === '[data-action]') return 'data-action' in this.attrs;
        if (sel === '[data-field]') return 'data-field' in this.attrs;
        return false;
      },
      focus() {},
      querySelector(sel) {
        const id = sel.startsWith('#') ? sel.slice(1) : sel;
        return this.children.find((c) => c.id === id) || null;
      },
    });

    // 关键：Object.assign 会把访问器(getter/setter)复制成普通数据属性，
    // 导致 innerHTML 的 setter 丢失。必须用 defineProperty 显式挂载。
    Object.defineProperty(el, 'innerHTML', {
      configurable: true,
      get() { return this._html; },
      set(v) {
        this._html = v;
        this.children = [];
        const tagRe = /<(button|input|select)\b([^>]*)>/gi;
        let m;
        while ((m = tagRe.exec(v))) {
          const tag2 = m[1].toLowerCase();
          const attrStr = m[2];
          const attrs = {};
          const aRe = /([\w-]+)\s*=\s*"([^"]*)"/g;
          let a;
          while ((a = aRe.exec(attrStr))) attrs[a[1]] = a[2];
          const bRe = /(?:^|\s)(checked)(?=\s|$)/g;
          let b; while ((b = bRe.exec(attrStr))) attrs[b[1]] = '';
          const c = Object.assign(new ET(), {
            tagName: tag2, attrs, style: {}, dataset: {},
            getAttribute(k) { return this.attrs[k] ?? null; },
            hasAttribute(k) { return k in this.attrs; },
            matches() { return false; },
            focus() {},
          });
          c.id = attrs.id || '';
          if (attrs['data-action']) c.dataset.action = attrs['data-action'];
          if (attrs['data-field']) c.dataset.field = attrs['data-field'];
          c.parentElement = this;
          this.children.push(c);
        }
      },
    });
    return el;
  }

  const canvas = Object.assign(makeEl('canvas'), {
    width: 480, height: 720,
    getContext: () => ctx2d,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 720 }),
    setPointerCapture() {},
  });

  const stage = makeEl('div');
  const frames = [];

  const win = Object.assign(new ET(), {
    innerWidth: 1200, innerHeight: 900, devicePixelRatio: 2,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    AudioContext: undefined,
  });
  // 复现沙箱 iframe：读取 localStorage 直接抛错
  Object.defineProperty(win, 'localStorage', {
    get() { throw new Error('SecurityError: access denied'); },
  });

  const doc = Object.assign(new ET(), {
    getElementById: (id) => (id === 'game' ? canvas : stage),
    createElement: makeEl,
    hidden: false,
    body: stage,
  });

  return { win, doc, canvas, stage, frames, draw };
}

test('启动与交互：沙箱下不黑屏，且点开始能真正进入游戏', async () => {
  const env = buildEnv();
  globalThis.window = env.win;
  globalThis.document = env.doc;
  globalThis.location = { search: '' };
  let T = 0;
  globalThis.performance = { now: () => T, mark() {} };
  globalThis.requestAnimationFrame = env.win.requestAnimationFrame;

  await import('../src/main.js');

  // --- 1) 必须排入渲染循环（黑屏 = 这里为 0） ---
  assert.ok(env.frames.length >= 1, '启动后应排入渲染循环，实际 ' + env.frames.length);

  // --- 2) 跑若干帧，必须有实际绘制 ---
  for (let i = 0; i < 8; i++) {
    T += 16;
    const f = env.frames.shift();
    assert.equal(typeof f, 'function', '第 ' + i + ' 帧回调缺失 —— 主循环中断');
    f(T);
  }
  assert.ok(env.draw.includes('fillRect'), '应发生背景填充绘制');
  assert.ok(env.draw.includes('fillText'), '应绘制 HUD 文字');

  // --- 3) overlay 必须已生成在 stage 内 ---
  const overlay = env.stage.children.find((c) => c.className === 'overlay');
  assert.ok(overlay, '应创建 overlay 容器');

  // --- 4) 关键：多跑几十帧后（模拟主循环每帧 sync），按钮节点必须仍然存在 ---
  for (let i = 0; i < 60; i++) { T += 16; const f = env.frames.shift(); if (f) f(T); }
  const startBtn = overlay.children.find((c) => c.id === 'btn-start');
  assert.ok(startBtn, '跑了 60 帧后开始按钮仍应存在，实际子节点: '
    + overlay.children.map((c) => c.id || c.tagName).join(','));
  assert.equal(startBtn.getAttribute('data-action'), 'start', '按钮应带稳定的 data-action');

  // --- 5) 点击必须真正生效 ---
  overlay.dispatch('click', { target: startBtn });
  for (let i = 0; i < 3; i++) { T += 16; const f = env.frames.shift(); if (f) f(T); }
  assert.equal(overlay.style.display, 'none', '点击开始后标题遮罩应隐藏（已进入游戏）');
});
