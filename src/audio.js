// audio.js — WebAudio 程序化音频 (FR-PRS-03 / FR-SYS-01)。三路总线：master/sfx/music。
import { busGains } from './settings.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buses = null; // {master, sfx, music}
    this.musicTimer = null;
    this.unlocked = false;
    this.suspendedSince = 0;
  }

  // 首次用户交互时调用（FR-CORE-02 / FR-SYS-08）。
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.buses = {
      master: this.ctx.createGain(),
      sfx: this.ctx.createGain(),
      music: this.ctx.createGain(),
    };
    this.buses.sfx.connect(this.buses.master);
    this.buses.music.connect(this.buses.master);
    this.buses.master.connect(this.ctx.destination);
    this.applyGains({ master: 70, sfx: 70, music: 50 });
  }

  applyGains(vol) {
    if (!this.buses) return;
    const g = busGains({ volume: vol });
    const t = this.ctx.currentTime;
    this.buses.master.gain.setTargetAtTime(g.master, t, 0.01);
    this.buses.sfx.gain.setTargetAtTime(g.sfx, t, 0.01);
    this.buses.music.gain.setTargetAtTime(g.music, t, 0.01);
  }

  // 解锁音频上下文；返回是否成功。失败不阻断游戏 (NFR-REL-03 / R-01)。
  async unlock() {
    this.init();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { return false; }
    }
    this.unlocked = this.ctx.state === 'running';
    if (this.ctx.state === 'suspended') this.suspendedSince = performance.now();
    return this.unlocked;
  }

  // 静音快捷键 M 与总线联动 (FR-SYS-05)。
  setMuted(muted) {
    if (this.buses) this.buses.master.gain.value = muted ? 0 : 1;
  }

  _blip(freq, dur, type = 'square', bus = 'sfx', gain = 0.3) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.buses[bus]);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // 六类音效 (FR-PRS-03)。
  sfx(name) {
    switch (name) {
      case 'shoot':    this._blip(880, 0.06, 'square', 'sfx', 0.12); break;
      case 'explosion':this._blip(120, 0.25, 'sawtooth', 'sfx', 0.3); break;
      case 'pickup':   this._blip(660, 0.08, 'triangle', 'sfx', 0.25); break;
      case 'powerup':  this._blip(520, 0.12, 'square', 'sfx', 0.3); this._blip(780, 0.12, 'square', 'sfx', 0.25); break;
      case 'alarm':    this._blip(300, 0.18, 'sawtooth', 'sfx', 0.25); break;
      // v2.6 超载爆发：低频轰鸣 + 高频扫尾
      case 'overdrive':this._blip(150, 0.38, 'sawtooth', 'sfx', 0.32); this._blip(920, 0.22, 'square', 'sfx', 0.2); break;
      case 'win':      this._blip(523, 0.2, 'triangle', 'music', 0.3); this._blip(784, 0.3, 'triangle', 'music', 0.3); break;
    }
  }

  // 极简背景音乐循环（音乐总线）。
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const notes = [220, 277, 330, 277];
    let i = 0;
    this.musicTimer = setInterval(() => {
      if (this.ctx.state === 'running') this._blip(notes[i % notes.length], 0.4, 'triangle', 'music', 0.18);
      i++;
    }, 480);
  }
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
}
