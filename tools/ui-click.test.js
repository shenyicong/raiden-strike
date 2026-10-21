// tools/ui-click.test.js — 验证"每帧 sync 后按钮仍可点击"（黑屏之外的第二类致命 bug）
//
// V2.0 改用「事件委托」：ui.js 只在 overlay 上挂一个 click 监听器，按钮本身不绑定
// onclick。因此无论标题页 innerHTML 是否每帧重建，点击都通过冒泡到 overlay 的委托
// 监听器解析 data-action —— 这正是修复"点不动"的核心机制。本测试据此还原真实点击。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---- 最小 DOM 桩：支持事件委托所需的 API -----------------------------
class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag;
    this._html = '';
    this.children = [];
    this.style = {};
    this.attrs = {};
    this.className = '';
    this.textContent = '';
    this.parentElement = null;
    this.listeners = {};
  }
  set innerHTML(v) {
    this._html = v;
    // 还原真实语义：innerHTML 赋新值 => 旧子节点全部销毁，重新解析
    this.children = parseNodes(v).map((el) => { el.parentElement = this; return el; });
  }
  get innerHTML() { return this._html; }
  appendChild(el) { el.parentElement = this; this.children.push(el); return el; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  matches(sel) {
    if (sel === '[data-action]') return this.hasAttribute('data-action');
    if (sel === '[data-field]') return this.hasAttribute('data-field');
    return false;
  }
  addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); }
  dispatch(type, event) { (this.listeners[type] || []).forEach((fn) => fn(event)); }
  querySelector(sel) {
    const id = sel.startsWith('#') ? sel.slice(1) : sel;
    return this._find((c) => c.attrs.id === id);
  }
  _find(pred, node = this) {
    for (const c of node.children) {
      if (pred(c)) return c;
      const r = this._find(pred, c);
      if (r) return r;
    }
    return null;
  }
  focus() {}
}

// 解析全部开标签及其属性（id / data-action / data-field / type 等）
function parseNodes(html) {
  const nodes = [];
  const re = /<(\w+)([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const el = new FakeEl(m[1]);
    const are = /([\w-]+)="([^"]*)"/g;
    let a;
    while ((a = are.exec(m[2]))) el.attrs[a[1]] = a[2];
    nodes.push(el);
  }
  return nodes;
}

test('UI 每帧 sync 后，开始按钮仍能通过事件委托点击（不依赖节点重建）', async () => {
  // ui.js 内部使用全局 document，先注入最小桩
  globalThis.document = { createElement: (tag) => new FakeEl(tag) };
  const { UI } = await import('../src/ui.js');
  const root = new FakeEl('div');
  let started = 0;
  const fakeGame = {
    data: { best: null, top5: [] },
    settings: { volume: { master: 70, sfx: 70, music: 50 }, hitboxDot: true, motion: 'standard', difficulty: 'standard' },
    score: 0, graze: { count: 0 },
    persistSettings() {},
  };

  const ui = new UI(root, fakeGame);
  ui.onAction = (a) => { if (a === 'start') started++; };

  // 模拟游戏主循环跑 60 帧，每帧都调用 sync（这正是原 bug 的触发条件）
  for (let i = 0; i < 60; i++) ui.sync('ready');

  // 拿到当前 DOM 里带 data-action 的开始按钮
  const btn = ui.overlay.querySelector('#btn-start');
  assert.ok(btn, '标题页应存在开始按钮');
  assert.equal(btn.hasAttribute('data-action'), true, '开始按钮必须带 data-action（委托解析依据）');

  // 真实浏览器里 click 事件冒泡到 overlay 的委托监听器，由 _closest 解析 data-action
  ui.overlay.dispatch('click', { target: btn, stopPropagation() {} });

  // 再跑几帧（点击后若按钮被重建，委托监听仍在 overlay 上，不应失效）
  for (let i = 0; i < 30; i++) ui.sync('ready');

  const btn2 = ui.overlay.querySelector('#btn-start');
  ui.overlay.dispatch('click', { target: btn2, stopPropagation() {} });

  assert.equal(started, 2, `两次点击应各触发一次 start，实际 ${started} 次`);
});

test('v2.1 标题页：渲染 6 张战机卡，未解锁的置灰且标注解锁条件', async () => {
  globalThis.document = { createElement: (tag) => new FakeEl(tag) };
  const { UI } = await import('../src/ui.js');
  const { emptyData } = await import('../src/storage.js');
  const data = emptyData();
  const fakeGame = {
    data, settings: data.settings, score: 0, graze: { count: 0 }, player: { bombs: 0, ship: null },
    persistSettings() {},
  };
  const ui = new UI(new FakeEl('div'), fakeGame);
  let picked = null;
  ui.onAction = (a) => { if (a.startsWith('ship:')) picked = a; };
  ui.sync('ready');

  const cards = ui.overlay.children.filter((c) => String(c.attrs['data-action'] || '').startsWith('ship:'));
  assert.equal(cards.length, 6, '标题页应有 6 架战机的选择卡');
  const locked = cards.filter((c) => String(c.attrs.class || '').includes('locked'));
  assert.equal(locked.length, 4, '初始仅有雷霆号/幻影可选，其余 4 架置灰');
  assert.ok(ui.overlay.innerHTML.includes('到达第 2 区解锁'), '未解锁卡应显示解锁条件');

  // 点击已解锁机型应派发切换事件（未解锁机型由 main.js 侧忽略）
  const phantom = cards.find((c) => c.attrs['data-action'] === 'ship:phantom');
  ui.overlay.dispatch('click', { target: phantom, stopPropagation() {} });
  assert.equal(picked, 'ship:phantom');
});

// v2.7 修复回归：暂停态打开设置后，主循环每帧 sync('paused') 不得把设置面板重建回暂停菜单。
// 旧实现 settings() 手动置 view='settings'，但 sync 会把 paused 解析为 'pause' 并重建 DOM，
// 导致设置面板打开一帧即被顶掉（"设置点不开"）。
test('v2.7 设置面板：暂停态每帧 sync 后仍保持设置视图，不被暂停菜单覆盖', async () => {
  globalThis.document = { createElement: (tag) => new FakeEl(tag) };
  const { UI } = await import('../src/ui.js');
  const root = new FakeEl('div');
  const fakeGame = {
    data: { best: null, top5: [] },
    settings: { volume: { master: 70, sfx: 70, music: 50 }, hitboxDot: true, motion: 'standard', difficulty: 'standard' },
    score: 0, graze: { count: 0 },
    persistSettings() {},
  };
  const ui = new UI(root, fakeGame);
  ui.sync('paused');   // 打开暂停菜单
  ui.settings();       // 进入设置面板（view='settings'）
  assert.ok(ui.overlay.querySelector('#v-master'), '设置面板应存在主音量滑块');

  // 模拟主循环每帧 sync（状态仍为 paused）：设置面板不得被重建覆盖
  for (let i = 0; i < 30; i++) ui.sync('paused');
  assert.ok(ui.overlay.querySelector('#v-master'), '30 帧后设置滑块仍应在（不得被暂停菜单覆盖）');
  assert.equal(ui.overlay.querySelector('#b-resume'), null, '不应出现暂停菜单的"继续"按钮');

  // 返回游戏：状态切到 playing 后遮罩隐藏
  ui.sync('playing');
  assert.equal(ui.overlay.style.display, 'none', '回到 playing 后设置面板应隐藏');
});
