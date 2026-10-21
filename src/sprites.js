// sprites.js — V2.8.0 预渲染 2.5D 战机 Sprite (FR-4.1 / FR-4.4)。
// 方案 A：启动/首次使用时把矢量战机「离线渲染」成带法线高光、推进器辉光、姿态倾斜的位图，
// 运行期只做 drawImage —— 既有体积光泽感，又不引入 WebGL/Three.js 等任何外部依赖，
// 也不增加每帧计算量（对比每帧 createLinearGradient 更省）。
// 无 DOM 环境（Node 测试）一律返回 null，渲染层自动回退 2D 矢量描边。
import { PALETTE } from './config.js';

// 机身轮廓（与 render._shipOutline 保持一致，避免两套造型漂移）
const OUTLINES = {
  phantom:  [[0, -22], [6, -4], [17, 6], [15, 12], [5, 9], [0, 15], [-5, 9], [-15, 12], [-17, 6], [-6, -4]],
  fortress: [[0, -16], [9, -2], [24, 8], [21, 17], [7, 12], [0, 18], [-7, 12], [-21, 17], [-24, 8], [-9, -2]],
  falcon:   [[0, -20], [8, -2], [20, 8], [12, 16], [4, 10], [0, 16], [-4, 10], [-12, 16], [-20, 8], [-8, -2]],
  aurora:   [[0, -24], [8, -4], [14, 10], [0, 14], [-14, 10], [-8, -4]],
  phoenix:  [[0, -20], [10, -2], [22, 12], [9, 7], [0, 17], [-9, 7], [-22, 12], [-10, -2]],
  raiden:   [[0, -22], [7, -4], [22, 6], [20, 12], [6, 9], [0, 14], [-6, 9], [-20, 12], [-22, 6], [-7, -4]],
};

export const SPRITE_SIZE = 72;      // 离屏画布边长（逻辑像素）
export const POSES = [-1, 0, 1];    // 左倾 / 平飞 / 右倾

const _cache = new Map();
let _domChecked = false;
let _hasDom = false;

// 是否具备离屏渲染能力
export function spritesAvailable() {
  if (!_domChecked) {
    _domChecked = true;
    try {
      _hasDom = typeof document !== 'undefined'
        && typeof document.createElement === 'function'
        && !!document.createElement('canvas').getContext;
    } catch (_) { _hasDom = false; }
  }
  return _hasDom;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function outlineOf(shipId) {
  return OUTLINES[shipId] || OUTLINES.raiden;
}

// 渲染单帧：机身渐变（模拟顶部受光的法线高光）+ 底部暗边 + 座舱 + 翼尖辉光 + 推进器火焰
function renderFrame(shipId, pose, color) {
  const size = SPRITE_SIZE;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;
  ctx.translate(cx, cy);
  ctx.rotate(pose * 0.10);          // 姿态倾斜：转向时轻微侧倾，强化立体感
  ctx.scale(1, 1);

  const pts = outlineOf(shipId);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };

  // 推进器辉光（先画，位于机身之下）
  const fg = ctx.createLinearGradient(0, 10, 0, 34);
  fg.addColorStop(0, 'rgba(190,255,255,0.95)');
  fg.addColorStop(0.45, 'rgba(90,220,255,0.55)');
  fg.addColorStop(1, 'rgba(90,220,255,0)');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(0, 34); ctx.lineTo(5, 12); ctx.closePath(); ctx.fill();

  // 机身：自上而下的明暗渐变 —— 顶部受光亮、底部阴影，形成体积感
  const bg = ctx.createLinearGradient(0, -24, 0, 18);
  bg.addColorStop(0, '#3f6f9c');
  bg.addColorStop(0.42, '#2a5478');
  bg.addColorStop(1, '#12253a');
  ctx.fillStyle = bg;
  path(); ctx.fill();

  // 主色描边 + 内侧高光描边（翼缘反光线）
  ctx.lineWidth = 1.4; ctx.strokeStyle = color;
  path(); ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  path(); ctx.stroke();
  ctx.restore();

  // 中央脊线高光（法线朝上的受光带）
  const hg = ctx.createLinearGradient(-4, 0, 4, 0);
  hg.addColorStop(0, 'rgba(255,255,255,0)');
  hg.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(0, -20); ctx.lineTo(5, -2); ctx.lineTo(3, 12); ctx.lineTo(-3, 12); ctx.lineTo(-5, -2);
  ctx.closePath(); ctx.fill();

  // 座舱：径向渐变玻璃罩
  const cg = ctx.createRadialGradient(0, -8, 1, 0, -6, 9);
  cg.addColorStop(0, '#eafcff'); cg.addColorStop(0.6, '#5fc8e8'); cg.addColorStop(1, '#12445c');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.ellipse(0, -7, 3.6, 8, 0, 0, Math.PI * 2); ctx.fill();

  // 翼尖光点
  ctx.fillStyle = color;
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  for (const p of [pts[2], pts[pts.length - 3]]) {
    ctx.beginPath(); ctx.arc(p[0], p[1] + 3, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;

  return canvas;
}

// 取某机型某姿态的 Sprite（带缓存）。无 DOM 时返回 null。
export function shipSprite(shipId = 'raiden', pose = 0, color = PALETTE.PLAYER) {
  if (!spritesAvailable()) return null;
  const p = POSES.includes(pose) ? pose : 0;
  const key = `${shipId}|${p}|${color}`;
  if (_cache.has(key)) return _cache.get(key);
  let canvas = null;
  try { canvas = renderFrame(shipId, p, color); } catch (_) { canvas = null; }
  _cache.set(key, canvas);
  return canvas;
}

// 姿态索引：由玩家横向输入方向（-1/0/1）映射到 POSES
export function poseFromTilt(tilt = 0) {
  if (tilt > 0.25) return 1;
  if (tilt < -0.25) return -1;
  return 0;
}

// 清空缓存（测试/主题切换用）
export function clearSpriteCache() { _cache.clear(); }
