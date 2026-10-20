// render.js — Canvas 2D 程序化绘制 (FR-PRS-01/02/05/06)。
import { VIEW, PLAYER, GLOBAL, REGIONS, BOSS, OVERDRIVE } from './config.js';
import { TOUCH_BUTTONS } from './input.js';
import { hitboxVisible, motionFlags } from './settings.js';

export class Renderer {
  constructor(ctx, settings) {
    this.ctx = ctx;
    this.settings = settings;
    this.stars = this._initStars(3);
    this.flash = 0; // 0..1 白闪强度
  }
  setSettings(s) { this.settings = s; }

  _initStars(layers) {
    const arr = [];
    for (let l = 0; l < layers; l++) {
      const n = 30 + l * 20;
      const stars = [];
      for (let i = 0; i < n; i++) {
        stars.push({ x: Math.random() * VIEW.W, y: Math.random() * VIEW.H, s: 0.5 + l * 0.6 });
      }
      arr.push({ stars, speed: 30 + l * 50 });
    }
    return arr;
  }

  updateStars(dt, reduced) {
    const layers = reduced ? 2 : 3;
    for (let l = 0; l < layers; l++) {
      for (const st of this.stars[l].stars) {
        st.y += this.stars[l].speed * dt;
        if (st.y > VIEW.H) { st.y = 0; st.x = Math.random() * VIEW.W; }
      }
    }
  }

  drawBackground(regionIndex, reduced) {
    const p = REGIONS[regionIndex].palette;
    const g = this.ctx.createLinearGradient(0, 0, 0, VIEW.H);
    g.addColorStop(0, p.top); g.addColorStop(1, p.bottom);
    this.ctx.fillStyle = g; this.ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    const layers = reduced ? 2 : 3;
    for (let l = 0; l < layers; l++) {
      this.ctx.fillStyle = `rgba(255,255,255,${0.3 + l * 0.2})`;
      for (const st of this.stars[l].stars) this.ctx.fillRect(st.x, st.y, st.s, st.s);
    }
    // 暗角 (FR-PRS-06)
    const vg = this.ctx.createRadialGradient(VIEW.W / 2, VIEW.H / 2, VIEW.H * 0.3, VIEW.W / 2, VIEW.H / 2, VIEW.H * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    this.ctx.fillStyle = vg; this.ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  }

  // ── v2.3：画风回归第一版（矢量描边 + 渐变座舱 + 发光翼尖） ────────────────
  // 是否开启发光（减弱动效时关闭 shadowBlur，省性能）
  _glow(on) {
    this.ctx.shadowBlur = on ? 8 : 0;
    return this.ctx;
  }

  // 机身轮廓：沿用 v2.1 的机型差异，但改用 v1.0 的绘制语言
  _shipOutline(id) {
    switch (id) {
      case 'phantom':  return [[0, -22], [6, -4], [17, 6], [15, 12], [5, 9], [0, 15], [-5, 9], [-15, 12], [-17, 6], [-6, -4]];      // 细长高速
      case 'fortress': return [[0, -16], [9, -2], [24, 8], [21, 17], [7, 12], [0, 18], [-7, 12], [-21, 17], [-24, 8], [-9, -2]];   // 宽厚重甲
      case 'falcon':   return [[0, -20], [8, -2], [20, 8], [12, 16], [4, 10], [0, 16], [-4, 10], [-12, 16], [-20, 8], [-8, -2]];   // 双翼后掠
      case 'aurora':   return [[0, -24], [8, -4], [14, 10], [0, 14], [-14, 10], [-8, -4]];                                          // 菱形重炮
      case 'phoenix':  return [[0, -20], [10, -2], [22, 12], [9, 7], [0, 17], [-9, 7], [-22, 12], [-10, -2]];                       // 展翼
      default:         return [[0, -22], [7, -4], [22, 6], [20, 12], [6, 9], [0, 14], [-6, 9], [-20, 12], [-22, 6], [-7, -4]];     // 经典箭形
    }
  }

  drawPlayer(p, settings, t) {
    if (!p.alive) return;
    const ctx = this.ctx;
    const blink = p.invuln > 0 && Math.floor(t * 2 * PLAYER.BLINK_HZ) % 2 === 0;
    if (blink) return; // 2Hz 闪烁
    const reduced = this.settings && this.settings.motion === 'reduced';
    const ship = p.ship || { id: 'raiden', color: '#7fe7ff' };
    const main = ship.color;
    ctx.save();
    ctx.translate(p.x, p.y);

    // 推进器火焰（渐变）
    const f = 1 + Math.sin(t * 40) * 0.22;
    const fg = ctx.createLinearGradient(0, 12, 0, 30 * f);
    fg.addColorStop(0, 'rgba(180,255,255,0.95)');
    fg.addColorStop(0.4, 'rgba(57,231,255,0.7)');
    fg.addColorStop(1, 'rgba(57,231,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(0, 20 + 14 * f); ctx.lineTo(5, 12); ctx.closePath(); ctx.fill();

    // 主翼：深色填充 + 主色描边
    const pts = this._shipOutline(ship.id);
    ctx.fillStyle = '#16324f';
    ctx.strokeStyle = main;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // 机身高光
    ctx.fillStyle = '#2a5d86';
    ctx.beginPath();
    ctx.moveTo(0, -20); ctx.lineTo(5, -2); ctx.lineTo(3, 12); ctx.lineTo(-3, 12); ctx.lineTo(-5, -2);
    ctx.closePath(); ctx.fill();

    // 座舱（渐变）
    const cg = ctx.createLinearGradient(0, -14, 0, 2);
    cg.addColorStop(0, '#bffaff'); cg.addColorStop(1, '#1b6f8f');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.ellipse(0, -7, 3.6, 8, 0, 0, Math.PI * 2); ctx.fill();

    // 翼尖光点
    ctx.fillStyle = main; ctx.shadowColor = main; ctx.shadowBlur = reduced ? 0 : 8;
    ctx.beginPath();
    ctx.arc(pts[2][0], pts[2][1] + 3, 1.8, 0, Math.PI * 2);
    ctx.arc(pts[pts.length - 3][0], pts[pts.length - 3][1] + 3, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 护盾环
    if (p.shield > 0) {
      ctx.strokeStyle = p.shield < 1 && Math.floor(t * 2 * PLAYER.BLINK_HZ) % 2 === 0 ? 'rgba(120,200,255,0.3)' : 'rgba(120,200,255,0.8)';
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    // 判定点 (FR-CBT-06)：半径随机型变化，保持所见即所得
    if (hitboxVisible(settings)) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.hitR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,80,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.hitR, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // 敌机：v1.0 五种机型各自的矢量造型
  drawEnemy(e) {
    const ctx = this.ctx;
    const reduced = this.settings && this.settings.motion === 'reduced';
    const ratio = Math.max(0, Math.min(1, e.hp / (e.maxHp || e.hp || 1)));
    ctx.save(); ctx.translate(e.x, e.y);
    const poly = (pts, fill, stroke, lw = 1.4) => {
      ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    const glow = (color, r, x = 0, y = 0) => {
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = reduced ? 0 : 7;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    };
    const hpBar = (w, y, color) => {
      if (ratio >= 1) return;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-w / 2, y, w, 4);
      ctx.fillStyle = ratio > 0.4 ? color : '#ff4d6d'; ctx.fillRect(-w / 2, y, w * ratio, 4);
    };

    if (e.type === 'scout') {
      poly([[0, 14], [9, 2], [15, -8], [0, -14], [-15, -8], [-9, 2]], '#3a1420', '#ff6b6b');
      glow('#ff6b6b', 3, 0, -2);
    } else if (e.type === 'fighter') {
      poly([[0, 17], [7, 4], [18, -2], [16, -12], [5, -9], [0, -16], [-5, -9], [-16, -12], [-18, -2], [-7, 4]], '#3a2410', '#ffa94d');
      ctx.fillStyle = '#ffa94d';
      ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(3, -6); ctx.lineTo(-3, -6); ctx.closePath(); ctx.fill();
      glow('#ffa94d', 1.7, -13, -8); glow('#ffa94d', 1.7, 13, -8);
    } else if (e.type === 'tank') {
      const hex = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        hex.push([Math.cos(a) * 24, Math.sin(a) * 24]);
      }
      poly(hex, '#231b3a', '#b197fc', 2);
      ctx.strokeStyle = 'rgba(177,151,252,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
      glow('#b197fc', 6, 0, 0);
      hpBar(44, 28, '#b197fc');
    } else if (e.type === 'kamikaze') {
      poly([[0, 15], [6, 0], [12, -10], [0, -6], [-12, -10], [-6, 0]], '#3d3310', '#ffd43b');
      glow('#ffd43b', 3.2, 0, 2);
    } else { // turret
      ctx.fillStyle = '#122335'; ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, 4, 19, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -2, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4dabf7'; ctx.fillRect(-2.4, -18, 4.8, 14);
      glow('#4dabf7', 3, 0, -2);
      hpBar(36, 20, '#4dabf7');
    }
    ctx.restore();
  }

  // Boss：v1.0 分段矢量造型，配色随区域
  drawBoss(b) {
    const ctx = this.ctx;
    const accent = (REGIONS[b.region] && REGIONS[b.region].palette.accent) || '#ff4d6d';
    const t = performance.now() / 1000;
    const reduced = this.settings && this.settings.motion === 'reduced';
    ctx.save(); ctx.translate(b.x, b.y);
    if (!reduced) ctx.translate(0, Math.sin(t * 1.6) * 2); // 呼吸

    // 外层能量环
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.28 + Math.sin(t * 3) * 0.12;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 76, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;

    // 主体
    ctx.fillStyle = '#161a2b'; ctx.strokeStyle = accent; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, 62); ctx.lineTo(46, 34); ctx.lineTo(88, 20); ctx.lineTo(96, -6); ctx.lineTo(58, -20);
    ctx.lineTo(30, -48); ctx.lineTo(0, -58); ctx.lineTo(-30, -48); ctx.lineTo(-58, -20); ctx.lineTo(-96, -6);
    ctx.lineTo(-88, 20); ctx.lineTo(-46, 34); ctx.closePath(); ctx.fill(); ctx.stroke();

    // 装甲分层
    ctx.fillStyle = '#20263d';
    ctx.beginPath();
    ctx.moveTo(0, 40); ctx.lineTo(34, 18); ctx.lineTo(26, -26); ctx.lineTo(0, -44); ctx.lineTo(-26, -26); ctx.lineTo(-34, 18);
    ctx.closePath(); ctx.fill();

    // 侧翼炮
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * 70, 8);
      ctx.fillStyle = '#0d1120'; ctx.strokeStyle = accent; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, 0, 15, 21, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = accent; ctx.globalAlpha = 0.85; ctx.fillRect(-2.5, 14, 5, 12); ctx.globalAlpha = 1;
      ctx.restore();
    }

    // 核心
    const pulse = 0.7 + Math.sin(t * 4.2) * 0.3;
    const cg = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
    cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.35, accent); cg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cg; ctx.globalAlpha = pulse;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // 血条 (FR-PRS-05)
    const w = VIEW.W * 0.7, x = (VIEW.W - w) / 2, y = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = accent; ctx.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), 8);
  }

  // 子弹：v1.0 的外发光 + 亮核
  drawBullet(b) {
    const ctx = this.ctx;
    const reduced = this.settings && this.settings.motion === 'reduced';
    const color = b.fromPlayer ? '#39e7ff' : '#ffd43b';
    if (!reduced) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.4);
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(1, b.r * 0.42), 0, Math.PI * 2); ctx.fill();
  }

  // 道具：沿用第一版的圆牌样式 + 发光
  drawDrop(d) {
    const ctx = this.ctx;
    const reduced = this.settings && this.settings.motion === 'reduced';
    const c = d.kind === 'power' ? '#ffd43b' : d.kind === 'bomb' ? '#39e7ff'
      : d.kind === 'life' ? '#ff6b6b' : '#51cf66';
    ctx.fillStyle = 'rgba(10,14,26,0.85)';
    ctx.strokeStyle = c; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(d.x, d.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = reduced ? 0 : 8;
    ctx.beginPath(); ctx.arc(d.x, d.y, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0a0e1a'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(d.kind === 'life' ? '♥' : d.kind[0].toUpperCase(), d.x, d.y + 3);
  }

  drawParticle(pt) {
    const a = Math.max(0, pt.life / pt.maxLife);
    this.ctx.globalAlpha = a;
    this.ctx.fillStyle = pt.color;
    this.ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    this.ctx.globalAlpha = 1;
  }

  drawHUD(g) {
    const ctx = this.ctx;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${g.score.toLocaleString()}`, 8, VIEW.H - 10);
    ctx.fillText(`LIFE ${'♥'.repeat(Math.max(0, g.player.lives))}`, 8, 30);
    // v2.6.1 当前这条命的耐久条：敌弹伤害 150 点时，一发扣掉整条并溢出一半到下一条
    const ar = Math.max(0, Math.min(1, g.player.lifeRatio ?? 1));
    ctx.fillStyle = 'rgba(10,18,38,0.75)'; ctx.fillRect(8, 36, 104, 4);
    ctx.fillStyle = ar > 0.5 ? '#51cf66' : (ar > 0.25 ? '#ffd166' : '#ff6b6b');
    ctx.fillRect(8, 36, 104 * ar, 4);
    ctx.strokeStyle = 'rgba(127,180,255,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(7.5, 35.5, 105, 5);
    ctx.fillStyle = '#fff';
    ctx.fillText(`BOMB ${g.player.bombs}`, 120, 30);
    ctx.fillText(`PWR Lv.${g.player.level}`, 220, 30);
    // v2.6 本区清理进度：达标后转提示 BOSS 即将出现
    const quota = g.regionQuota || 0;
    const kills = Math.max(0, g.regionKills || 0);
    ctx.fillStyle = kills >= quota ? '#ffd166' : '#9fb0d0';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(kills >= quota ? 'BOSS 待命' : `CLEAR ${kills}/${quota}`, 330, 30);
    ctx.fillStyle = (g.player.ship && g.player.ship.color) || '#7fe7ff';
    ctx.fillText(`SHIP ${g.player.ship ? g.player.ship.name : '雷霆号'}`, 8, 50);
    ctx.fillStyle = '#fff';
    if (g.muted) { ctx.fillText('🔇', VIEW.W - 24, 30); }
    this._drawOverdriveBar(g);
  }

  // v2.6 超载能量条：横向蓝条，集满时高亮闪烁提示即将引爆
  _drawOverdriveBar(g) {
    const max = OVERDRIVE.MAX || 100;
    const v = Math.max(0, Math.min(1, (g.overdrive || 0) / max));
    const x = 8, y = 60, w = VIEW.W - 16, h = 8;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(10,18,38,0.75)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(127,180,255,0.55)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const full = v >= 1;
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#2f7bff');
    grad.addColorStop(1, full ? '#b6e3ff' : '#59d7ff');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w * v, h);
    if (full && !this._reducedMotion()) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin((performance.now() / 90));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = full ? '#b6e3ff' : '#8fb6e6';
    ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(full ? 'OVERDRIVE READY' : `OVERDRIVE ${Math.round(v * 100)}%`, x, y - 2);
  }

  _reducedMotion() { return !!(this.settings && this.settings.motion === 'reduced'); }

  // 触屏端虚拟按钮：炸弹（右下）、暂停（左下）、精确慢速（左侧）
  _drawTouchButtons(g) {
    const ctx = this.ctx;
    const inp = g.input || {};
    const hasBomb = g.player.bombs > 0;
    const draw = (key, opts = {}) => {
      const b = TOUCH_BUTTONS[key];
      const active = opts.active;
      ctx.globalAlpha = opts.dim ? 0.45 : (active ? 0.95 : 0.7);
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = active ? '#ffd166' : '#101a30'; ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = active ? '#ffd166' : (opts.dim ? '#5a6a8a' : '#7fb4ff');
      ctx.stroke();
      ctx.globalAlpha = opts.dim ? 0.55 : 1;
      ctx.fillStyle = active ? '#1a1206' : '#e8eefc';
      ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x, b.y + 5);
      if (key === 'bomb') {
        ctx.font = '10px sans-serif'; ctx.fillStyle = active ? '#1a1206' : '#9fb0d0';
        ctx.fillText('x' + g.player.bombs, b.x, b.y + 22);
      }
      ctx.globalAlpha = 1;
    };
    draw('bomb', { dim: !hasBomb, active: inp.bombFlash > 0 });
    draw('pause', { active: !!(g.sm && g.sm.is && g.sm.is('paused')) });
    draw('slow', { active: !!inp.slowOn });
  }

  drawFlash() {
    if (this.flash <= 0) return;
    this.ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
    this.ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  }
}
