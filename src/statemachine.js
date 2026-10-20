// statemachine.js — 六态状态机 (FR-CORE-01)。
// ready / playing / paused / clear / gameover / win；任意时刻仅一态，非法转换忽略且不抛异常。
export const STATES = {
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  CLEAR: 'clear',
  GAMEOVER: 'gameover',
  WIN: 'win',
};

// 合法转换表。未在表中的转换视为非法，被忽略。
const TRANSITIONS = {
  ready:    ['playing'],
  playing:  ['paused', 'clear', 'gameover', 'win'],
  paused:   ['playing', 'ready'],
  clear:    ['playing', 'paused'],
  gameover: ['ready'],
  win:      ['ready'],
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
