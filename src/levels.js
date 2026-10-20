// levels.js — 三区战役波次脚本 (FR-LVL-01/02 / 6.5)。每区 8–9 波，四类编队不重复。
import { VIEW, REGIONS, DIFFICULTY } from './config.js';
import { Enemy } from './entities.js';

const FORMATIONS = ['line', 'vee', 'arc', 'dive'];

// 生成某区的波次时间轴。返回 [{ time, enemies:[{type,x,y}] }]。
export function buildTimeline(regionIndex, difficultyKey = 'standard') {
  const region = REGIONS[regionIndex];
  const diff = DIFFICULTY[difficultyKey] || DIFFICULTY.standard;
  const density = diff.bulletDensity; // 休闲档 0.8 -> 减少敌机
  const waves = region.waves;
  const timeline = [];
  let t = 2.2; // 首波前置间隔 (6.7)
  for (let w = 0; w < waves; w++) {
    const formation = FORMATIONS[w % FORMATIONS.length]; // 同区不重复 (FR-ENM-02)
    const count = Math.max(3, Math.round((3 + w * 0.85) * (0.6 + 0.4 * density))); // v2.3 同波敌机数约 -20%
    const enemies = spawnFormation(formation, w, regionIndex, count);
    timeline.push({ time: t, enemies });
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
export class WaveDirector {
  constructor(regionIndex, difficultyKey = 'standard') {
    this.region = regionIndex;
    this.timeline = buildTimeline(regionIndex, difficultyKey);
    this.elapsed = 0;
    this.idx = 0;
    this.done = false;
  }
  update(dt) {
    this.elapsed += dt;
    const spawned = [];
    while (this.idx < this.timeline.length && this.elapsed >= this.timeline[this.idx].time) {
      for (const e of this.timeline[this.idx].enemies) {
        spawned.push(new Enemy(e.type, e.x, e.y, { targetX: e.targetX }));
      }
      this.idx += 1;
    }
    if (this.idx >= this.timeline.length) this.done = true;
    return spawned;
  }
}
