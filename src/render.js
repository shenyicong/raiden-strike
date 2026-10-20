// render.js — Canvas 2D 程序化绘制 (FR-PRS-01/02/05/06)。
import { VIEW, PLAYER, GLOBAL, REGIONS, BOSS } from './config.js';
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

  drawPlayer(p, settings, t) {
    if (!p.alive) return;
    const ctx = this.ctx;
    const blink = p.invuln > 0 && Math.floor(t * 2 * PLAYER.BLINK_HZ) % 2 === 0;
    if (blink) return; // 2Hz 闪烁
    ctx.save();
    ctx.translate(p.x, p.y);
    // 机身（程序化箭头）
    ctx.fillStyle = '#7fe7ff';
    ctx.beginPath();
    ctx.moveTo(0, -18); ctx.lineTo(12, 12); ctx.lineTo(4, 8); ctx.lineTo(0, 14);
    ctx.lineTo(-4, 8); ctx.lineTo(-12, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cdfaff';
    ctx.beginPath(); ctx.arc(0, -2, 3, 0, Math.PI * 2); ctx.fill();
    // 引擎火焰
    ctx.fillStyle = 'rgba(255,180,80,0.8)';
    ctx.beginPath(); ctx.moveTo(-4, 14); ctx.lineTo(0, 22 + Math.random() * 6); ctx.lineTo(4, 14); ctx.closePath(); ctx.fill();
    // 护盾环
    if (p.shield > 0) {
      ctx.strokeStyle = p.shield < 1 && Math.floor(t * 2 * PLAYER.BLINK_HZ) % 2 === 0 ? 'rgba(120,200,255,0.3)' : 'rgba(120,200,255,0.8)';
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // 判定点 (FR-CBT-06)
    if (hitboxVisible(settings)) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER.HIT_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,80,80,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, PLAYER.HIT_RADIUS, 0, Math.PI * 2); ctx.stroke();
    }
  }

  drawEnemy(e) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(e.x, e.y);
    ctx.fillStyle = '#ff7a7a';
    if (e.type === 'scout') { ctx.fillRect(-10, -6, 20, 12); }
    else if (e.type === 'fighter') { ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(12, -8); ctx.lineTo(-12, -8); ctx.closePath(); ctx.fill(); }
    else if (e.type === 'tank') { ctx.fillStyle = '#c98bff'; ctx.fillRect(-18, -12, 36, 24); }
    else if (e.type === 'kamikaze') { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); }
    else if (e.type === 'turret') { ctx.fillStyle = '#90ffb0'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#0a3'; ctx.fillRect(-3, 0, 6, 16); }
    ctx.restore();
  }

  drawBoss(b) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.fillStyle = '#ff5577';
    ctx.beginPath();
    ctx.moveTo(0, 26); ctx.lineTo(40, -10); ctx.lineTo(18, -18); ctx.lineTo(0, -8);
    ctx.lineTo(-18, -18); ctx.lineTo(-40, -10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(0, -2, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 血条 (FR-PRS-05)
    const w = VIEW.W * 0.7, x = (VIEW.W - w) / 2, y = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = '#ff4466'; ctx.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), 8);
  }

  drawBullet(b) {
    const ctx = this.ctx;
    if (b.fromPlayer) { ctx.fillStyle = '#aef'; }
    else { ctx.fillStyle = '#ff9'; }
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }

  drawParticle(pt) {
    const a = Math.max(0, pt.life / pt.maxLife);
    this.ctx.globalAlpha = a;
    this.ctx.fillStyle = pt.color;
    this.ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    this.ctx.globalAlpha = 1;
  }

  drawDrop(d) {
    const ctx = this.ctx;
    const c = d.kind === 'power' ? '#ffd166' : d.kind === 'bomb' ? '#7fd0ff' : '#9affc0';
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(d.x, d.y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(d.kind[0].toUpperCase(), d.x, d.y + 3);
  }

  drawHUD(g) {
    const ctx = this.ctx;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${g.score.toLocaleString()}`, 8, VIEW.H - 10);
    ctx.fillText(`LIFE ${'♥'.repeat(Math.max(0, g.player.lives))}`, 8, 30);
    ctx.fillText(`BOMB ${g.player.bombs}`, 120, 30);
    ctx.fillText(`PWR Lv.${g.player.level}`, 220, 30);
    if (g.muted) { ctx.fillText('🔇', VIEW.W - 24, 30); }
  }

  drawFlash() {
    if (this.flash <= 0) return;
    this.ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
    this.ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  }
}
