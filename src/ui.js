// ui.js — DOM 覆盖层界面（标题/暂停/设置/结算）与 aria-live 状态 (NFR-A11Y-04/07/08)。
// 设计要点（两条硬性约束，均来自真实故障）：
//  1) 主循环每帧调用 sync()，绝不能每帧重写 innerHTML —— 否则按钮被销毁，click 永不触发（"点不动"）。
//  2) 按钮绑定一律用事件委托挂在 overlay 上，绝不用 querySelector(...).onclick ——
//     任何一次查不到节点都不允许抛错拖死整个游戏（"黑屏"）。
import { DIFFICULTY } from './config.js';
import { SHIPS } from './config.js';
import { VERSION, MODES, MODE_IDS } from './config.js';
import { isUnlocked, unlockText } from './ships.js';
import { bestOf } from './storage.js';

export class UI {
  constructor(root, game) {
    this.root = root;
    this.game = game;

    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    this.overlay.setAttribute('role', 'dialog');
    root.appendChild(this.overlay);

    this.live = document.createElement('div');
    this.live.className = 'sr-only';
    this.live.setAttribute('aria-live', 'polite');
    root.appendChild(this.live);

    this.view = null;
    this.onAction = () => {};

    // 唯一的事件入口：委托 + 稳定 data-action，不依赖节点是否重建
    this.overlay.addEventListener('click', (e) => this._onClick(e));
    this.overlay.addEventListener('input', (e) => this._onInput(e));
    this.overlay.addEventListener('change', (e) => this._onInput(e));
  }

  setStatus(text) { if (this.live) this.live.textContent = text; }

  // ---- 事件委托 ----------------------------------------------------------
  _closest(el, sel) {
    // 同时支持 Element.closest 与不具备该 API 的精简环境
    let n = el;
    while (n && n !== this.overlay) {
      if (n.matches && n.matches(sel)) return n;
      if (n.getAttribute && n.hasAttribute) {
        if (sel === '[data-action]' && n.hasAttribute('data-action')) return n;
        if (sel === '[data-field]' && n.hasAttribute('data-field')) return n;
      }
      n = n.parentElement;
    }
    return null;
  }

  _onClick(e) {
    const el = this._closest(e.target, '[data-action]');
    const action = el && (el.getAttribute ? el.getAttribute('data-action') : el.dataset.action);
    if (action) {
      if (e.stopPropagation) e.stopPropagation();
      this.onAction(action);
      return;
    }
    // 标题页：点击遮罩空白处也可开始（预览区里按钮可能被裁切）
    if (this.view === 'title') this.onAction('start');
  }

  _onInput(e) {
    const el = this._closest(e.target, '[data-field]');
    if (!el) return;
    const field = el.getAttribute ? el.getAttribute('data-field') : el.dataset.field;
    const g = this.game;
    if (!field || !g || !g.settings) return;
    const isCheck = el.type === 'checkbox';
    const val = isCheck ? el.checked : el.value;
    try {
      if (field === 'master') g.settings.volume.master = +val;
      else if (field === 'sfx') g.settings.volume.sfx = +val;
      else if (field === 'music') g.settings.volume.music = +val;
      else if (field === 'hitboxDot') g.settings.hitboxDot = !!val;
      else if (field === 'motion') g.settings.motion = val;
      else if (field === 'difficulty') g.settings.difficulty = val;
      // V2.8.0 画风回退开关：关闭后战机回退 2D 描边版，供低端设备降负载 (FR-4.4)
      else if (field === 'sprite3d') g.settings.sprite3d = !!val;
      else return;
      g.persistSettings();
    } catch (_) { /* 设置失败不影响游戏 */ }
  }

  // ---- 视图 --------------------------------------------------------------
  hide() {
    // 注意：sync() 在调用本方法前已把 this.view 置为 'hidden'，
    // 因此这里不能再以 view 做早退守卫，否则 display:none 永远不会生效
    // （v2.0/v2.1 的隐藏 bug 根因：点开始后标题遮罩一直盖住游戏画面）。
    this.view = 'hidden';
    this.overlay.style.display = 'none';
    this.overlay.innerHTML = '';
  }

  sync(state) {
    let target;
    if (state === 'ready') target = 'title';
    // v2.7：暂停态下若正停留在设置面板，sync 必须保持设置视图不被覆盖。
    // 此前 settings() 手动置 view='settings'，但主循环每帧 sync('paused') 会把 target 解析为
    // 'pause' 并重建暂停菜单，导致设置面板打开一帧就被顶掉（"设置点不开"）。
    else if (state === 'paused') target = (this.view === 'settings') ? 'settings' : 'pause';
    else if (state === 'gameover') target = 'end';
    else if (state === 'win' || state === 'victory') target = 'win'; // V2.8.0 战役通关态 (FR-1.1)
    // region-clear 为区域过渡表现态，不遮挡画面 (FR-1.5)
    else if (state === 'region-clear') target = 'hidden';
    else target = 'hidden';

    if (target === this.view) {
      if (target === 'title') this._refreshTitle();   // 只刷文本，绝不重建
      return;
    }
    const prev = this.view;
    this.view = target;
    try {
      if (target === 'title') this.title();
      else if (target === 'pause') this.pause();
      else if (target === 'end') this.end(false);
      else if (target === 'win') this.end(true);
      else this.hide();
    } catch (err) {
      // 视图构建失败不允许中断主循环：回退到安全态并记录
      console.error('[raiden-strike] UI render failed:', err);
      this.view = prev;
    }
  }

  _wrap(html) {
    this.overlay.style.display = 'flex';
    this.overlay.innerHTML = html;
  }

  // 战机选择卡：已解锁可选，未解锁显示解锁条件 (v2.1)
  _shipCards() {
    const g = this.game;
    const unlocked = (g && g.data && g.data.unlocked) || [];
    const cur = (g && g.settings && g.settings.ship) || 'raiden';
    return SHIPS.map((s) => {
      const open = isUnlocked(s.id, unlocked);
      const sel = open && s.id === cur;
      return `<button class="ship${sel ? ' sel' : ''}${open ? '' : ' locked'}" type="button"
        data-action="ship:${s.id}" ${open ? '' : 'aria-disabled="true"'}>
          <b style="color:${s.color}">${s.name}</b><span>${s.desc}</span>
          <i>${open ? (sel ? '已选择' : '可用') : '未解锁 · ' + unlockText(s)}</i>
        </button>`;
    }).join('');
  }

  // V2.8.0 模式选择卡 (FR-2.3)：展示各模式历史最高分与评级，选中态高亮
  _modeCards() {
    const g = this.game;
    const cur = (g && g.mode) || 'campaign';
    return MODE_IDS.map((id) => {
      const m = MODES[id];
      const b = bestOf(g.data, id);
      const sel = id === cur;
      return `<button class="ship${sel ? ' sel' : ''}" type="button" data-action="mode:${id}">
          <b>${m.label}</b><span>${m.desc}</span>
          <i>${sel ? '已选择' : '可切换'} · 最高 ${b ? b.score.toLocaleString() + (b.grade ? ' (' + b.grade + ')' : '') : '—'}</i>
        </button>`;
    }).join('');
  }

  title() {
    this._wrap(`
      <div class="panel">
        <h1>擎天战机 RAIDEN STRIKE <span class="ver">v${VERSION.split('.').slice(0, 2).join('.')}</span></h1>
        <p>纵版弹幕射击 · 判定点仅 9px，穿过去！</p>
        <p class="hint">键盘 WASD/方向键移动 · 自动射击 · K/X 炸弹 · Shift 精确 · P/Esc 暂停 · M 静音</p>
        <p class="hint">手机：拖动屏幕移动并自动开火 · 右下角"炸"放炸弹 · 左下角"‖"暂停 · "慢"精确移动</p>
        <h3 class="sec">选择模式</h3>
        <div class="ships" id="mode-list">${this._modeCards()}</div>
        <h3 class="sec">选择战机</h3>
        <div class="ships" id="ship-list">${this._shipCards()}</div>
        <button id="btn-start" class="primary" type="button" data-action="start">开始游戏</button>
        <p class="hint">也可直接点画面任意位置，或按 Enter</p>
        <p class="best" id="t-best"></p>
      </div>`);
    this._refreshTitle();
    this.setStatus('标题界面，选择模式与战机后按 Enter 或点击开始');
  }

  _refreshTitle() {
    const el = this.overlay.querySelector('#t-best');
    if (!el) return;
    const mode = (this.game && this.game.mode) || 'campaign';
    const b = bestOf(this.game.data, mode);
    const label = b ? DIFFICULTY[b.difficulty] && DIFFICULTY[b.difficulty].label : '';
    el.textContent = `${MODES[mode].label}最高：`
      + (b ? b.score.toLocaleString() + (b.grade ? ` [${b.grade}]` : '') + (label ? ' (' + label + ')' : '') : '—');
  }

  pause() {
    this._wrap(`
      <div class="panel">
        <h2>已暂停</h2>
        <button id="b-resume" class="primary" data-action="resume">继续</button>
        <button id="b-restart" data-action="restart">重新开始</button>
        <button id="b-settings" data-action="settings">设置</button>
        <button id="b-title" data-action="title">返回标题</button>
      </div>`);
    this._focus('#b-resume');
  }

  settings() {
    const s = this.game.settings;
    this.view = 'settings';
    this._wrap(`
      <div class="panel settings">
        <h2>设置</h2>
        <label>主音量 <input id="v-master" type="range" min="0" max="100" value="${s.volume.master}" data-field="master"></label>
        <label>音效 <input id="v-sfx" type="range" min="0" max="100" value="${s.volume.sfx}" data-field="sfx"></label>
        <label>音乐 <input id="v-music" type="range" min="0" max="100" value="${s.volume.music}" data-field="music"></label>
        <label>判定点显示 <input id="c-hit" type="checkbox" ${s.hitboxDot ? 'checked' : ''} data-field="hitboxDot"></label>
        <label>动效 <select id="s-motion" data-field="motion"><option value="standard" ${s.motion === 'standard' ? 'selected' : ''}>标准</option><option value="reduced" ${s.motion === 'reduced' ? 'selected' : ''}>减弱</option></select></label>
        <label>2.5D 战机 <input id="c-3d" type="checkbox" ${s.sprite3d !== false ? 'checked' : ''} data-field="sprite3d"></label>
        <label>难度 <select id="s-diff" data-field="difficulty"><option value="standard" ${s.difficulty === 'standard' ? 'selected' : ''}>标准</option><option value="casual" ${s.difficulty === 'casual' ? 'selected' : ''}>休闲</option></select></label>
        <button id="b-back" class="primary" data-action="resume">返回</button>
        <button id="b-clear" data-action="clear">清除本地记录</button>
      </div>`);
    this._focus('#v-master');
  }

  // V2.8.0 统一结算层 (FR-1.4)：胜负共用，展示分数、评级、击破、最大连击、命中率、对局用时、本局解锁，
  // 并提供「再来一局 / 返回标题 / 切换模式」三条出路（杜绝结算后无路可走的死界面）。
  end(win) {
    const d = this.game.data;
    const s = this.game.summary || null;
    const top5 = (d.top5 || []).slice().sort((a, b) => b.score - a.score).slice(0, 5)
      .map((r, i) => `<li>${i + 1}. ${r.score.toLocaleString()} · ${(DIFFICULTY[r.difficulty] || {}).label || ''} · ${(MODES[r.mode] && MODES[r.mode].label) || ''} · ${r.region}区 · ${r.duration}s</li>`).join('');
    const shipName = (this.game.player && this.game.player.ship) ? this.game.player.ship.name : '—';
    const summaryHtml = s ? `
        <p class="best">评级 <b>${s.grade}</b> · ${s.modeLabel || ''}${s.noMiss ? ' · 无伤' : ''}</p>
        <p>本局分数：<b>${s.score.toLocaleString()}</b></p>
        <p>击破 ${s.kills} · 最大连击 ${s.maxCombo} · Boss/精英 ${s.bossKills}</p>
        <p>命中率 ${(s.accuracy * 100).toFixed(1)}% · 用时 ${s.duration}s · 到达 ${s.region}区</p>
        <p>使用战机：${shipName} · 擦弹 ${this.game.graze.count}</p>
        ${(s && s.unlockedNames && s.unlockedNames.length) ? `<p class="best">本局解锁：${s.unlockedNames.join('、')}</p>` : ''}
        <p class="hint">模式最高：${(bestOf(d, s.mode) || {}).score ? bestOf(d, s.mode).score.toLocaleString() : '—'}</p>` : `
        <p>本局分数：${this.game.score.toLocaleString()}</p>
        <p>使用战机：${shipName} · 擦弹 ${this.game.graze.count}</p>`;
    this._wrap(`
      <div class="panel">
        <h2>${win ? '通关！' : '游戏结束'}</h2>
        ${summaryHtml}
        <h3>本地前五榜</h3>
        <ol>${top5 || '<li>暂无记录</li>'}</ol>
        <button id="b-again" class="primary" data-action="restart">再来一局</button>
        <button id="b-title" data-action="title">返回标题</button>
        <button id="b-mode" data-action="switchmode">切换模式</button>
      </div>`);
    this._focus('#b-again');
    this.setStatus((win ? '通关，' : '游戏结束，') + '分数 ' + this.game.score + (s ? '，评级 ' + s.grade : ''));
  }

  _focus(sel) {
    try { const el = this.overlay.querySelector(sel); if (el && el.focus) el.focus(); } catch (_) {}
  }
}
