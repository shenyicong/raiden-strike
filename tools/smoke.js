// 无头冒烟测试：用最小 DOM 桩运行打包后的游戏，确认 boot + 渲染循环 + 开始游戏 + 暂停
// 全程不抛异常。这正是验证"游戏是否能打开"的最直接手段。
const fs = await import('fs');
const path = await import('path');

// ---- 最小 DOM / 浏览器环境桩 ----
function makeCtx() {
  return new Proxy({}, {
    get(_t, p) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'getImageData') return () => ({ data: [] });
      return () => {};
    },
    set() { return true; },
  });
}
function makeEl() {
  const el = {
    style: {}, _children: [],
    setAttribute() {}, appendChild(c) { this._children.push(c); return c; },
    addEventListener() {}, focus() {},
    querySelector() { return makeEl(); },
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 300 }; },
    getContext() { return makeCtx(); },
    width: 480, height: 720, _logicalW: 480, _logicalH: 720,
    set innerHTML(_v) {}, get innerHTML() { return ''; },
    set textContent(_v) {}, get textContent() { return ''; },
    set onclick(_v) {}, set oninput(_v) {}, set onchange(_v) {},
  };
  return el;
}

const winHandlers = {};
const store = new Map();
const canvas = makeEl();
const stage = makeEl();

globalThis.window = {
  devicePixelRatio: 1,
  innerWidth: 800, innerHeight: 900,
  matchMedia: () => ({ matches: false }),
  addEventListener: (t, fn) => { (winHandlers[t] ||= []).push(fn); },
  AudioContext: class {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
    createGain() { return { gain: { value: 0, setTargetAtTime() {}, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; }
    resume() { return Promise.resolve(); }
    // v2.6.1 BGM 用到的合成能力：噪声缓冲（打击乐）+ 滤波器
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; }
    createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect() {} }; }
  },
};
globalThis.document = {
  getElementById: (id) => (id === 'game' ? canvas : stage),
  createElement: () => makeEl(),
  addEventListener: (t, fn) => { (winHandlers[t] ||= []).push(fn); },
  hidden: false,
};
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};
globalThis.location = { search: '' };
let T = 0;
globalThis.performance = { now: () => T, mark() {} };
if (!globalThis.crypto || !globalThis.crypto.randomUUID) {
  globalThis.crypto = { randomUUID: () => 'id-' + Math.random().toString(36).slice(2) };
}

let rafCb = null;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.cancelAnimationFrame = () => {};

function fire(type, ev) { for (const fn of (winHandlers[type] || [])) fn(ev); }

// ---- 运行打包后的游戏（IIFE 入口） ----
const bundle = fs.readFileSync(path.join(process.cwd(), 'dist.bundle.js'), 'utf8');
let opened = false;
try {
  (0, eval)(bundle); // 在全局作用域执行，脚本内自由变量解析到上面的 globalThis 桩
  opened = true;
} catch (e) {
  console.error('❌ boot 抛错：', e && e.stack || e);
  process.exit(1);
}
if (!rafCb) { console.error('❌ boot 后未启动渲染循环 (requestAnimationFrame 未被调用)'); process.exit(1); }

// 驱动若干帧（标题态）
function frames(n) {
  for (let i = 0; i < n; i++) {
    if (!rafCb) break;
    const cb = rafCb; rafCb = null;
    T += 16;
    cb(T);
  }
}
try {
  frames(5);
  // 按 Enter 开始游戏
  fire('keydown', { key: 'Enter', preventDefault() {} });
  frames(120); // 约 2 秒，应生成敌机、自动射击、Boss 触发前的过程
  // 暂停 / 继续
  fire('keydown', { key: 'p', preventDefault() {} });
  frames(3);
  fire('keydown', { key: 'p', preventDefault() {} });
  frames(60);
  // 静音
  fire('keydown', { key: 'm', preventDefault() {} });
  frames(5);
} catch (e) {
  console.error('❌ 运行循环抛错：', e && e.stack || e);
  process.exit(1);
}

console.log('✅ 游戏成功启动并运行 ' + (5 + 120 + 3 + 60 + 5) + ' 帧无异常（标题→开始→暂停→继续→静音全流程）');
process.exit(0);
