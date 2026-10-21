// audio.js — WebAudio 程序化音频 (FR-PRS-03 / FR-SYS-01)。三路总线：master/sfx/music。
import { busGains } from './settings.js';

// v2.6.1 背景音乐曲库：MIDI 音高（null = 休止），8 步一小节（8 分音符）。
// bass 低音线 / arp 琶音 / lead 主旋律 / hat 踩镲 / kick 底鼓；bpm 决定速度。
// 全部由振荡器 + 噪声实时合成，零音频文件。
const MUSIC_TRACKS = {
  r0: { // 近地轨道：明亮推进
    bpm: 132, bassType: 'square',
    bass: [45, 45, 52, 45, 41, 41, 48, 41],
    arp:  [69, 72, 76, 72, 65, 69, 72, 69],
    lead: [81, null, 79, null, 76, null, 74, 72],
    hat:  [1, 0, 1, 0, 1, 0, 1, 1],
    kick: [1, 0, 0, 0, 1, 0, 0, 0],
  },
  r1: { // 陨石带：低沉压迫
    bpm: 140, bassType: 'sawtooth',
    bass: [38, 38, 45, 38, 36, 36, 43, 36],
    arp:  [62, 65, 69, 65, 60, 64, 67, 64],
    lead: [74, null, 72, null, 69, null, 67, 65],
    hat:  [1, 1, 0, 1, 1, 1, 0, 1],
    kick: [1, 0, 0, 1, 1, 0, 0, 0],
  },
  r2: { // 母舰外围：急促紧张
    bpm: 148, bassType: 'sawtooth',
    bass: [40, 40, 47, 40, 43, 43, 50, 43],
    arp:  [64, 67, 71, 74, 67, 71, 74, 76],
    lead: [79, null, 76, null, 83, null, 79, null],
    hat:  [1, 1, 1, 1, 1, 1, 1, 1],
    kick: [1, 0, 1, 0, 1, 0, 1, 0],
  },
  b0: { // Boss · 铁翼
    bpm: 152, bassType: 'square',
    bass: [45, 45, 45, 46, 45, 45, 48, 45],
    arp:  [69, 72, 75, 72, 69, 72, 75, 76],
    lead: [81, 84, null, 83, 81, null, 79, 77],
    hat:  [1, 1, 1, 1, 1, 1, 1, 1],
    kick: [1, 0, 1, 0, 1, 0, 1, 1],
  },
  b1: { // Boss · 熔核
    bpm: 158, bassType: 'sawtooth',
    bass: [38, 38, 38, 40, 38, 38, 43, 41],
    arp:  [62, 65, 68, 65, 62, 65, 68, 70],
    lead: [77, 80, null, 79, 77, null, 74, 72],
    hat:  [1, 1, 1, 1, 1, 1, 1, 1],
    kick: [1, 1, 0, 1, 1, 0, 1, 1],
  },
  b2: { // Boss · 天穹之影
    bpm: 164, bassType: 'sawtooth',
    bass: [40, 40, 43, 40, 41, 41, 44, 41],
    arp:  [64, 67, 70, 67, 65, 68, 71, 68],
    lead: [88, null, 86, 84, 83, null, 79, 76],
    hat:  [1, 1, 1, 1, 1, 1, 1, 1],
    kick: [1, 1, 1, 0, 1, 1, 1, 0],
  },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buses = null; // {master, sfx, music}
    this.musicTimer = null;
    this.unlocked = false;
    this.suspendedSince = 0;
    this._musicSteps = 0;   // v2.7.0 已调度的音乐步数（诊断用）
    this._lastErr = null;   // v2.7.0 最近一次异常（诊断用）
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
    this.applyGains({ master: 70, sfx: 70, music: 85 }); // v2.6.2 默认音乐音量调高（修复"没音乐"）
  }

  applyGains(vol) {
    if (!this.buses) return;
    this._volume = vol; // 缓存，供 setMuted 取消静音时恢复
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
    if (!this.buses) return;
    // 取消静音时恢复到 applyGains 计算的真实主增益，而不是硬编码 1（避免取消静音后骤然过响）
    if (muted) {
      this.buses.master.gain.value = 0;
    } else {
      this.applyGains(this._volume || { master: 70, sfx: 70, music: 85 });
    }
  }

  _blip(freq, dur, type = 'square', bus = 'sfx', gain = 0.3, at = null) {
    if (!this.ctx) return;
    // v2.7.0：上下文未 running 时先尝试唤醒（用户手势内才真正生效），并丢弃该次发声——
    // 比"静默 return"更利于诊断，且任何一次发声尝试都会推动 autoplay 解锁。
    if (this.ctx.state !== 'running') { this.ctx.resume?.().catch(() => {}); return; }
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    const t = at ?? this.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.buses[bus]);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // 白噪声源：filterType 决定音色（highpass=踩镲/火花，lowpass=爆炸闷响）。
  // bus 决定走音效总线还是音乐总线（V2.8.0：打击感音效必须走 sfx，不再占用音乐总线）。
  _noise(at, dur = 0.05, gain = 0.10, filterType = 'highpass', freq = 7000, bus = 'sfx') {
    // 音频能力缺失/异常时静默降级，绝不打断游戏 (NFR-REL-03 / R-01)
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') { this.ctx.resume?.().catch(() => {}); return; }
    if (!this.ctx.createBuffer || !this.ctx.createBufferSource) return;
    if (!this._noiseBuf) {
      const len = Math.floor(this.ctx.sampleRate * 0.4);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
    }
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(this.buses[bus]);
    src.start(at); src.stop(at + dur + 0.02);
  }

  // 打击乐：hi-hat / 军鼓（走音乐总线）
  _perc(at, dur = 0.05, gain = 0.10, freq = 7000) {
    this._noise(at, dur, gain, 'highpass', freq, 'music');
  }

  // 音效 (FR-PRS-03)。v2.7.0：单音增益整体上调（此前受 busGains 双重对数衰减影响，音效也几不可闻）。
  // V2.8.0 扩充事件音效库 (FR-3.5)：命中 / 击破（分机型变体）/ 玩家受击 / 护盾破碎 /
  //                                Boss 出场 / Boss 阶段切换 / Boss 死亡。
  // 第二参数 combo 用于「命中音高随连击微升」，给连击一个听觉爬升反馈 (FR-3.1)。
  sfx(name, combo = 0) {
    const at = this.ctx ? this.ctx.currentTime : null;
    switch (name) {
      case 'shoot':    this._blip(880, 0.06, 'square', 'sfx', 0.22); break;
      case 'explosion':this._blip(120, 0.25, 'sawtooth', 'sfx', 0.45); break;
      case 'pickup':   this._blip(660, 0.08, 'triangle', 'sfx', 0.3); break;
      case 'powerup':  this._blip(520, 0.12, 'square', 'sfx', 0.38); this._blip(780, 0.12, 'square', 'sfx', 0.3); break;
      case 'alarm':    this._blip(300, 0.18, 'sawtooth', 'sfx', 0.32); break;
      // v2.6 超载爆发：低频轰鸣 + 高频扫尾
      case 'overdrive':this._blip(150, 0.38, 'sawtooth', 'sfx', 0.45); this._blip(920, 0.22, 'square', 'sfx', 0.3); break;
      case 'win':      this._blip(523, 0.2, 'triangle', 'music', 0.35); this._blip(784, 0.3, 'triangle', 'music', 0.35); break;

      // ── V2.8.0 打击感音效 ──
      // 命中：短促高频点击；音高随连击每级 +12 音分，封顶 +24 半音，形成爬升感
      case 'hit': {
        const cents = Math.min(24 * 100, (combo || 0) * 12);
        const f = 1180 * Math.pow(2, cents / 1200);
        this._blip(f, 0.045, 'square', 'sfx', 0.15);
        this._noise(at, 0.03, 0.06, 'highpass', 6000, 'sfx');
        break;
      }
      // 击破：噪声爆发（火花）+ 低频 thump（闷响）
      case 'kill':
        this._noise(at, 0.16, 0.20, 'lowpass', 1800, 'sfx');
        this._blip(150, 0.14, 'sine', 'sfx', 0.30);
        break;
      // 重型击破：更低更长，重量感更强
      case 'killHeavy':
        this._noise(at, 0.28, 0.26, 'lowpass', 1100, 'sfx');
        this._blip(96, 0.26, 'sine', 'sfx', 0.38);
        this._blip(58, 0.32, 'sawtooth', 'sfx', 0.22);
        break;
      // 玩家受击：下行双音，明确"吃亏了"
      case 'playerHit':
        this._blip(320, 0.12, 'sawtooth', 'sfx', 0.34);
        this._blip(160, 0.22, 'square', 'sfx', 0.28);
        break;
      // 护盾破碎：金属感高频短噪
      case 'shieldBreak':
        this._noise(at, 0.10, 0.16, 'highpass', 4200, 'sfx');
        this._blip(1400, 0.07, 'triangle', 'sfx', 0.18);
        break;
      // Boss 出场：低频压迫长音
      case 'bossSpawn':
        this._blip(70, 0.55, 'sawtooth', 'sfx', 0.34);
        this._blip(105, 0.45, 'square', 'sfx', 0.22);
        break;
      // Boss 阶段切换：警报式上行
      case 'bossPhase':
        this._blip(420, 0.10, 'square', 'sfx', 0.26);
        this._blip(560, 0.12, 'square', 'sfx', 0.24);
        break;
      // Boss 死亡：下沉长轰鸣 + 爆裂噪声
      case 'bossDie':
        this._noise(at, 0.5, 0.30, 'lowpass', 900, 'sfx');
        this._blip(180, 0.7, 'sawtooth', 'sfx', 0.36);
        this._blip(90, 0.9, 'sine', 'sfx', 0.30);
        break;
    }
  }

  // ── 背景音乐 ────────────────────────────────────────────────────────────
  // v2.6.1：从"4 个音循环"升级为 8 分音符步进音序器 —— 贝斯 + 琶音 + 主旋律 + 鼓点，
  // 三个区域各一套主题，Boss 战自动切到紧张版。全部由 WebAudio 合成，不引入任何音频文件。
  // 步进用「提前调度」(lookahead) 而非 setInterval 直接发声，避免定时器抖动导致的节奏不稳。

  // 切换曲目：region 0..2 为关卡主题，boss=true 时为 Boss 战版本
  setTrack(region = 0, boss = false) {
    const key = boss ? `b${region}` : `r${region}`;
    if (this._trackKey === key) return;
    this._trackKey = key;
    this.track = MUSIC_TRACKS[key] || MUSIC_TRACKS.r0;
    this.step = 0; // 换曲即从小节头开始
  }

  // 启动 BGM。v2.7：第二参数 boss 决定恢复/启动时使用 Boss 紧张版还是关卡主题，
  // 修复"Boss 战中暂停再恢复，音乐从紧张版错误切回关卡主题"的问题。
  // v2.7.0：进入时若上下文尚未 running 立即同步触发 resume() —— 本方法必须在用户手势内被调用才有效
  // （自动播放策略要求 resume 发生于手势上下文，否则上下文永远 suspended，所有声音静默）。
  startMusic(region = 0, boss = false) {
    if (!this.ctx) return;
    // v2.7.0：若上一局残留 timer 未清（如异常路径），先清除再启动，避免"提前 return 导致永远不响"。
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    this.setTrack(region, boss);
    this._nextNoteTime = this.ctx.currentTime + 0.08;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); // 同步触发恢复（手势内调用即生效）
    const tick = () => {
      if (!this.ctx) return;
      // v2.6.2：上下文被挂起（自动播放策略 / 切后台）时持续尝试恢复，恢复成功后自然开始放乐，
      // 不再因"首帧未 running"而彻底沉默（此前表现为"没音乐"）。
      if (this.ctx.state !== 'running') {
        this.ctx.resume().catch(() => {});
        return;
      }
      try {
        const stepDur = 30 / (this.track?.bpm || 120); // 8 分音符时长 (秒)
        // 提前 0.2s 排好音符，期间定时器抖动不会传到听感上
        while (this._nextNoteTime < this.ctx.currentTime + 0.2) {
          this._scheduleStep(this.step, this._nextNoteTime, stepDur);
          this._nextNoteTime += stepDur;
          this.step = (this.step + 1) % 64;
        }
      } catch (e) { this._lastErr = String((e && e.message) || e); this.stopMusic(); } // 合成失败就收声，不影响游戏 (NFR-REL-03)
    };
    tick();
    this.musicTimer = setInterval(tick, 25);
  }

  _scheduleStep(step, at, stepDur) {
    const t = this.track;
    if (!t) return;
    this._musicSteps = (this._musicSteps || 0) + 1; // v2.7.0 诊断计数
    const i = step % t.bass.length;
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // v2.6.2：合成器单音音量整体上调（原 0.16/0.10/0.07/0.055/0.28），
    // 此前即便音乐总线正常，单音也极弱（≈-34dB）几乎听不见。
    const bass = t.bass[i];
    if (bass != null) this._blip(midi(bass), stepDur * 0.85, t.bassType || 'square', 'music', 0.42, at);
    const arp = t.arp[i];
    if (arp != null) this._blip(midi(arp), stepDur * 0.55, 'triangle', 'music', 0.22, at);
    const lead = t.lead[step % t.lead.length];
    if (lead != null) this._blip(midi(lead), stepDur * 1.4, 'sawtooth', 'music', 0.16, at);
    if (t.hat[i]) this._perc(at, 0.04, 0.12, 8000);
    // v2.7：底鼓音高 midi(24)=32.7Hz（多数扬声器几乎不可闻）→ midi(36)=65.4Hz，鼓点清晰可辨
    if (t.kick && t.kick[i]) this._blip(midi(36), 0.16, 'sine', 'music', 0.55, at);
  }

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    this.step = 0;
  }

  // v2.7.0：诊断快照——HUD 徽标与控制台排错共用。
  debug() {
    return {
      supported: !!this.ctx,
      state: this.ctx ? this.ctx.state : 'none',
      musicTimer: !!this.musicTimer,
      musicSteps: this._musicSteps || 0,
      track: this._trackKey || null,
      muted: this.buses ? this.buses.master.gain.value === 0 : false,
      musicGain: this.buses ? +this.buses.music.gain.value.toFixed(3) : null,
      lastErr: this._lastErr || null,
    };
  }
}
