// statemachine.js — 六态状态机 (FR-CORE-01)。
// ready / playing / paused / clear / gameover / win；任意时刻仅一态，非法转换忽略且不抛异常。
export const STATES = {
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  CLEAR: 'clear',
  GAMEOVER: 'gameover',
  WIN: 'win',
  // V2.8.0 (FR-1.5)：区域通关过渡与战役通关表现态
  REGION_CLEAR: 'region-clear',
  VICTORY: 'victory',
};

// 合法转换表（PRD 附录B 状态机完整状态流转表）。未在表中的转换视为非法，被忽略。
// win 为 V2.7 及更早的历史通关态，保留以兼容旧存档与既有测试；V2.8 起战役通关统一走 victory。
const TRANSITIONS = {
  ready:        ['playing'],
  playing:      ['paused', 'clear', 'gameover', 'win', 'region-clear', 'victory'],
  paused:       ['playing', 'ready'],
  clear:        ['playing', 'region-clear'],
  'region-clear': ['playing', 'victory'],
  victory:      ['ready'],
  gameover:     ['ready'],
  win:          ['ready'],
};

export class StateMachine {
  constructor(initial = STATES.READY) {
    this.state = initial;
  }
  is(s) { return this.state === s; }
  // 尝试切换。非法转换返回 false，状态不变，绝不抛异常。
  transition(to) {
    const allowed = TRANSITIONS[this.state] || [];
    if (!allowed.includes(to)) return false;
    this.state = to;
    return true;
  }
  // 暂停（playing->paused）。供中断即暂停统一调用；仅在 playing 时生效。
  pause() { return this.transition(STATES.PAUSED); }
  resume() { return this.transition(STATES.PLAYING); }
}
