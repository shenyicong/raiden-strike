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
export function busGains(settings) {
  const v = settings.volume || { master: 70, sfx: 70, music: 50 };
  const master = sliderToGain(v.master);
  // v2.6.2：音乐总线单独提高可用响度。原公式 master × sliderToGain(music) 在默认下仅约 0.004（≈-48dB），
  // 即便合成器音量正常也几乎听不见（"没音乐"的根因）。这里给音乐 2.6× 增益上限封顶 1.0，
  // 保证"能听见"；master=0 时仍静音（音乐随主音量联动）。
  const musicRaw = v.master > 0 ? sliderToGain(v.music) * 2.6 : 0;
  return {
    master,
    sfx: master * sliderToGain(v.sfx),
    music: Math.min(1, musicRaw),
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
