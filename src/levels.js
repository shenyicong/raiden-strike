// levels.js — 三区战役波次脚本 (FR-LVL-01/02 / 6.5)。四类编队不重复。
// v2.6：波次改为"按击杀阈值推进"——导演记录已刷出的敌机数，达到本区 quota 即停止刷怪，
//       清屏后由 Game 拉出 Boss；时间轴不够长时按同一编队循环续波（数量仍随对局时间成长）。
import { VIEW, REGIONS, DIFFICULTY, QUOTA } from './config.js';
import { Enemy } from './entities.js';

const FORMATIONS = ['line', 'vee', 'arc', 'dive'];

// 单波生成：供时间轴与续波共用（w 为全局波次序号，编队按序号循环，同区不重复 FR-ENM-02）。
export function buildWave(w, regionIndex, difficultyKey = 'standard', time = 0) {
  const region = REGIONS[regionIndex];
  const diff = DIFFICULTY[difficultyKey] || DIFFICULTY.standard;
  const density = diff.bulletDensity; // 休闲档 0.8 -> 减少敌机
  const formation = FORMATIONS[w % FORMATIONS.length];
  const count = Math.max(3, Math.round((3 + w * 0.85) * (0.6 + 0.4 * density))); // v2.3 同波敌机数约 -20%
  return { time, enemies: spawnFormation(formation, w, regionIndex, count) };
}

// 生成某区的波次时间轴。返回 [{ time, enemies:[{type,x,y}] }]。
export function buildTimeline(regionIndex, difficultyKey = 'standard') {
  const region = REGIONS[regionIndex];
  const waves = region.waves;
  const timeline = [];
  let t = 2.2; // 首波前置间隔 (6.7)
  for (let w = 0; w < waves; w++) {
    timeline.push(buildWave(w, regionIndex, difficultyKey, t));
    t += region.waveTotal / waves; // 均匀分布，总时长≈waveTotal
  }
  return timeline;
}

function spawnFormation(formation, wave, regionIndex, count) {
  const out = [];
  const types = pickTypes(regionIndex, count);
  const topY = -30;
  if (formation === 'line') {
    for (let i = 0; i < count; i++) {
      const x = VIEW.W * (i + 1) / (count + 1);
      out.push({ type: types[i], x, y: topY });
    }
  } else if (formation === 'vee') {
    for (let i = 0; i < count; i++) {
      const cx = VIEW.W / 2;
      const off = (i - (count - 1) / 2);
      out.push({ type: types[i], x: cx + off * 34, y: topY + Math.abs(off) * 18 });
    }
  } else if (formation === 'arc') {
    for (let i = 0; i < count; i++) {
      const a = Math.PI * (0.15 + 0.7 * i / (count - 1 || 1));
      out.push({ type: types[i], x: VIEW.W / 2 + Math.cos(a) * 150, y: topY + Math.sin(a) * 60 });
    }
  } else { // dive — kamikaze 俯冲
    for (let i = 0; i < count; i++) {
      out.push({ type: 'kamikaze', x: VIEW.W * (i + 1) / (count + 1), y: topY, targetX: VIEW.W * (i + 1) / (count + 1) });
    }
  }
  return out;
}

function pickTypes(regionIndex, count) {
  // 随区域提升重型比例；保证 tank/turret 出现以触发必掉火力。
  const pool = ['scout', 'fighter', 'scout', 'fighter', 'tank', 'turret', 'kamikaze'];
  const out = [];
  for (let i = 0; i < count; i++) {
    // 每区保证至少 1 个 heavy（必掉火力）
    if (i === 0) out.push(regionIndex === 0 ? 'tank' : 'turret');
    else out.push(pool[(i + regionIndex) % pool.length]);
  }
  return out;
}

// 波次导演：按时间轴生成敌机。
// v2.6：改为"阈值驱动"——导演只管持续刷怪（时间轴用尽则续波，数量仍随对局时间成长），
//       何时停由 Game 按本区击杀数决定（达标即置 done，清屏后拉 Boss）。
//       maxWaves 为兜底上限，避免玩家一直不还击时关卡永不结束。
export class WaveDirector {
  // V2.8.0：maxWaves 可显式传入；无尽模式传 Infinity 表示永不收尾、持续续波 (FR-2.2)。
  constructor(regionIndex, difficultyKey = 'standard', maxWaves = null) {
    this.region = regionIndex;
    this.difficultyKey = difficultyKey;
    this.timeline = buildTimeline(regionIndex, difficultyKey);
    this.maxWaves = maxWaves ?? ((REGIONS[regionIndex]?.waves ?? 8) * (QUOTA?.MAX_WAVE_MULT ?? 2));
    this.elapsed = 0;
    this.idx = 0;
    this.spawned = 0;   // 已刷出敌机总数（供调试/统计）
    this.done = false;
  }
  // 时间轴用尽但阈值还没达成 -> 接着往下排波，编队继续循环
  _extend() {
    const region = REGIONS[this.region];
    const last = this.timeline[this.timeline.length - 1];
    const t = (last ? last.time : 2.2) + (region?.waveTotal ?? 28) / (region?.waves ?? 8);
    this.timeline.push(buildWave(this.idx, this.region, this.difficultyKey, t));
  }
  // scale = { hpMult, fireMult, extra } —— v2.4 由存活时间推导，实现循序渐进
  update(dt, scale = null) {
    this.elapsed += dt;
    const spawned = [];
    if (this.done) return spawned;
    const hpMult = scale ? scale.hpMult : 1;
    const fireMult = scale ? scale.fireMult : 1;
    const extra = scale ? (scale.extra | 0) : 0;
    while (this.idx < this.timeline.length && this.elapsed >= this.timeline[this.idx].time) {
      const list = this.timeline[this.idx].enemies;
      for (const e of list) {
        spawned.push(new Enemy(e.type, e.x, e.y, { targetX: e.targetX, hpMult, fireMult }));
        this.spawned += 1;
      }
      // 数量成长：从本波阵型里随机复制若干架，位置左右错开，保持阵型观感
      for (let k = 0; k < extra && list.length; k++) {
        const src = list[(k * 3 + this.idx) % list.length];
        const off = ((k % 2) ? 1 : -1) * (24 + k * 6);
        spawned.push(new Enemy(src.type, Math.max(16, Math.min(VIEW.W - 16, src.x + off)), src.y - 24,
          { targetX: src.targetX, hpMult, fireMult }));
        this.spawned += 1;
      }
      this.idx += 1;
      if (this.idx >= this.timeline.length && this.idx < this.maxWaves) this._extend();
    }
    // 兜底：波次刷到上限仍未达标也收尾（清屏后照常出 Boss）
    if (this.idx >= this.timeline.length && this.idx >= this.maxWaves) this.done = true;
    return spawned;
  }
}
