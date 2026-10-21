// settings.js — 设置派生行为 (FR-SYS-01/02/03/07 / 6.2)。
// 三路音量 0–100 对数映射至 −60–0dB；任一路为 0 即静音。
export function sliderToGain(slider0to100) {
  const s = Math.max(0, Math.min(100, slider0to100));
  if (s <= 0) return 0;            // 静音
  if (s >= 100) return 1;          // 0dB
  // −60..0 dB 线性映射到 0..100
  const db = (s / 100) * 60 - 60;  // s=100 -> 0dB; s=0 -> -60dB
  return Math.pow(10, db / 20);
}

// 主/音效/音乐增益。
// v2.7.0 重写：此前公式是 master × sliderToGain(x)，两层对数相乘，默认下仅 ≈0.004（≈-48dB），
// 等于静音，是"没音乐"的真正根因（叠加自动播放策略后表现尤为明显）。
// 新方案：音乐/音效使用「绝对响度」（不叠加 master 的对数级联），仅在主音量=0 时整体静音，
// 并让 master 做轻度联动（调低变轻但不至于消失）。这样即便老存档 music=50 也清晰可闻。
export function busGains(settings) {
  const v = settings.volume || { master: 70, sfx: 70, music: 85 };
  const m = sliderToGain(v.master); // 0..1，仅作"是否静音"开关 + 轻度联动
  const off = m <= 0;
  const link = 0.5 + 0.5 * m; // master 轻度联动：70→0.56，100→1.0，越低越轻但不消失
  const musicAbs = Math.min(1, 0.18 + (v.music / 100) * 0.82); // 50→0.59，85→0.88
  const sfxAbs = Math.min(1, 0.5 + (v.sfx / 100) * 0.5); // 50→0.75，70→0.85
  return {
    master: m,
    sfx: off ? 0 : sfxAbs * link,
    music: off ? 0 : musicAbs * link,
  };
}

// 减弱动效档的渲染影响 (FR-SYS-03 / NFR-A11Y-09/10)：
// 关闭屏幕震动与白闪、粒子数量减半、星空层数 3→2；弹幕与判定点清晰度不变。
export function motionFlags(settings) {
  const reduced = settings.motion === 'reduced';
  return {
    reduced,
    shake: !reduced,
    flash: !reduced,
    particleScale: reduced ? 0.5 : 1.0,
    starLayers: reduced ? 2 : 3,
  };
}

export function hitboxVisible(settings) {
  return settings.hitboxDot !== false; // 默认显示 (FR-SYS-02)
}
