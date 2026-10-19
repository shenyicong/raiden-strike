/**
 * audio.js —— 纯 WebAudio 合成音效，零外部资源
 * 所有声音都由振荡器/噪声实时合成，不加载任何音频文件。
 */

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** 首次用户交互时解锁音频上下文 */
export function unlock() {
  const c = ac();
  if (c && c.state === 'suspended') c.resume();
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.55;
}

export function isMuted() {
  return muted;
}

function noise() {
  const c = ac();
  if (!c) return null;
  if (!noiseBuf) {
    const len = c.sampleRate * 0.6;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

/** 基础音：频率滑音 + 包络 */
function tone({ freq = 440, to = freq, type = 'square', dur = 0.12, gain = 0.18, delay = 0 }) {
  const c = ac();
  if (!c || muted) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** 噪声爆裂 */
function burst({ dur = 0.3, gain = 0.25, from = 2200, to = 200, delay = 0 }) {
  const c = ac();
  if (!c || muted) return;
  const src = noise();
  if (!src) return;
  const t0 = c.currentTime + delay;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, to), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export const sfx = {
  shoot() {
    tone({ freq: 900, to: 460, type: 'square', dur: 0.05, gain: 0.045 });
  },
  enemyShoot() {
    tone({ freq: 320, to: 160, type: 'sawtooth', dur: 0.07, gain: 0.035 });
  },
  hit() {
    tone({ freq: 260, to: 180, type: 'square', dur: 0.03, gain: 0.035 });
  },
  explode() {
    burst({ dur: 0.32, gain: 0.28, from: 1800, to: 120 });
    tone({ freq: 120, to: 40, type: 'sine', dur: 0.3, gain: 0.14 });
  },
  bigExplode() {
    burst({ dur: 0.7, gain: 0.4, from: 2400, to: 60 });
    tone({ freq: 90, to: 28, type: 'sine', dur: 0.7, gain: 0.2 });
    tone({ freq: 200, to: 50, type: 'sawtooth', dur: 0.35, gain: 0.1, delay: 0.08 });
  },
  pickup() {
    tone({ freq: 620, to: 980, type: 'triangle', dur: 0.1, gain: 0.13 });
    tone({ freq: 980, to: 1320, type: 'triangle', dur: 0.08, gain: 0.1, delay: 0.07 });
  },
  powerUp() {
    tone({ freq: 440, to: 660, type: 'square', dur: 0.09, gain: 0.1 });
    tone({ freq: 660, to: 880, type: 'square', dur: 0.09, gain: 0.1, delay: 0.08 });
    tone({ freq: 880, to: 1180, type: 'square', dur: 0.12, gain: 0.1, delay: 0.16 });
  },
  bomb() {
    burst({ dur: 1.0, gain: 0.42, from: 3200, to: 50 });
    tone({ freq: 70, to: 24, type: 'sine', dur: 1.0, gain: 0.24 });
  },
  damage() {
    burst({ dur: 0.25, gain: 0.2, from: 900, to: 90 });
    tone({ freq: 300, to: 80, type: 'sawtooth', dur: 0.22, gain: 0.12 });
  },
  alarm() {
    for (let i = 0; i < 3; i++) {
      tone({ freq: 880, to: 660, type: 'sawtooth', dur: 0.14, gain: 0.09, delay: i * 0.22 });
    }
  },
  levelClear() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) =>
      tone({ freq: f, to: f, type: 'triangle', dur: 0.16, gain: 0.12, delay: i * 0.11 })
    );
  },
  gameOver() {
    const notes = [440, 392, 330, 262];
    notes.forEach((f, i) =>
      tone({ freq: f, to: f * 0.98, type: 'triangle', dur: 0.3, gain: 0.13, delay: i * 0.2 })
    );
  },
  win() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) =>
      tone({ freq: f, to: f, type: 'square', dur: 0.18, gain: 0.1, delay: i * 0.1 })
    );
  },
  ui() {
    tone({ freq: 700, to: 900, type: 'square', dur: 0.05, gain: 0.06 });
  },
};
