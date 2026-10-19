/**
 * hud.js —— 平视显示：分数、生命、炸弹、火力、Boss 血条、提示
 */

import { VIEW, LEVELS } from './config.js';
import { formatScore } from './utils.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.bossIntro = 0;
    this.scoreDisplay = 0;
    this.t = 0;
  }

  setLevel() {
    this.bossIntro = 2.4;
  }

  update(dt) {
    this.t += dt;
    if (this.bossIntro > 0) this.bossIntro -= dt;
    // 分数滚动动画
    const target = this.game.score;
    if (this.scoreDisplay < target) {
      this.scoreDisplay = Math.min(target, this.scoreDisplay + Math.max(30, (target - this.scoreDisplay) * 8 * dt));
    } else {
      this.scoreDisplay = target;
    }
  }

  draw(g) {
    const ctx = g.ctx;
    const p = g.player;

    ctx.save();
    ctx.textBaseline = 'alphabetic';

    /* ---------- 左上：分数 ---------- */
    ctx.textAlign = 'left';
    ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('SCORE', 14, 20);
    ctx.font = '700 22px "Segoe UI", "Consolas", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#39e7ff';
    ctx.shadowBlur = 10;
    ctx.fillText(formatScore(this.scoreDisplay), 14, 42);
    ctx.shadowBlur = 0;

    /* ---------- 右上：区域 / 击坠 ---------- */
    ctx.textAlign = 'right';
    ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('AREA', VIEW.w - 14, 20);
    ctx.font = '700 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = g.level.accent;
    ctx.fillText(`${g.levelIndex + 1} / ${LEVELS.length}`, VIEW.w - 14, 39);
    ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(`KILLS ${g.kills}`, VIEW.w - 14, 56);

    /* ---------- 左下：生命 / 炸弹 ---------- */
    const by = VIEW.h - 18;
    // 生命
    ctx.textAlign = 'left';
    for (let i = 0; i < Math.min(6, p.lives - (p.alive ? 0 : 0)); i++) {
      const x = 16 + i * 16;
      ctx.save();
      ctx.translate(x, by - 5);
      ctx.fillStyle = '#ff6b9d';
      ctx.shadowColor = '#ff6b9d';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.bezierCurveTo(-7, -2, -4, -8, 0, -4);
      ctx.bezierCurveTo(4, -8, 7, -2, 0, 4);
      ctx.fill();
      ctx.restore();
    }
    if (p.lives > 6) {
      ctx.fillStyle = '#ff6b9d';
      ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`x${p.lives}`, 16 + 6 * 16, by);
    }

    // 炸弹
    ctx.shadowBlur = 0;
    for (let i = 0; i < p.bombs; i++) {
      const x = 16 + i * 15;
      const y = by - 22;
      ctx.fillStyle = '#ffd166';
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(x + 4, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    /* ---------- 右下：火力等级 ---------- */
    ctx.textAlign = 'right';
    ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('POWER', VIEW.w - 14, by - 24);
    ctx.font = '700 16px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = p.level >= 5 ? '#ffe066' : '#39e7ff';
    ctx.shadowColor = p.level >= 5 ? '#ffe066' : '#39e7ff';
    ctx.shadowBlur = 10;
    ctx.fillText(`Lv.${p.level}`, VIEW.w - 14, by - 6);
    ctx.shadowBlur = 0;

    // 火力进度条
    const bw = 74;
    const bx = VIEW.w - 14 - bw;
    const byy = by - 42;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx, byy, bw, 3);
    if (p.level < 5) {
      ctx.fillStyle = '#39e7ff';
      ctx.fillRect(bx, byy, bw * Math.min(1, p.power / 100), 3);
    } else {
      ctx.fillStyle = '#ffe066';
      ctx.fillRect(bx, byy, bw, 3);
    }

    /* ---------- Boss 血条 ---------- */
    const boss = g.boss;
    if (boss && !boss.dead) {
      const bw2 = VIEW.w - 80;
      const bx2 = 40;
      const by2 = 74;
      const ratio = boss.hpRatio;

      ctx.textAlign = 'center';
      ctx.font = '700 11px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(boss.name.toUpperCase(), VIEW.w / 2, by2 - 8);

      // 底槽
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx2 - 1, by2 - 1, bw2 + 2, 9);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx2 - 1.5, by2 - 1.5, bw2 + 3, 10);

      // 血量
      const grad = ctx.createLinearGradient(bx2, 0, bx2 + bw2, 0);
      if (boss.phase === 1) {
        grad.addColorStop(0, '#ff8787');
        grad.addColorStop(1, '#ff4d6d');
      } else if (boss.phase === 2) {
        grad.addColorStop(0, '#ffd166');
        grad.addColorStop(1, '#ff9f43');
      } else {
        grad.addColorStop(0, '#ffe066');
        grad.addColorStop(1, '#ff4d6d');
      }
      ctx.fillStyle = grad;
      ctx.shadowColor = '#ff4d6d';
      ctx.shadowBlur = 12;
      ctx.fillRect(bx2, by2, bw2 * ratio, 7);
      ctx.shadowBlur = 0;

      // 分段刻度
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      for (const s of [0.33, 0.66]) {
        ctx.beginPath();
        ctx.moveTo(bx2 + bw2 * s, by2);
        ctx.lineTo(bx2 + bw2 * s, by2 + 7);
        ctx.stroke();
      }

      if (this.bossIntro > 0) {
        const a = Math.min(1, this.bossIntro / 0.6);
        ctx.globalAlpha = a;
        ctx.font = '700 26px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
        ctx.fillStyle = '#ff4d6d';
        ctx.shadowColor = '#ff4d6d';
        ctx.shadowBlur = 20;
        ctx.fillText('WARNING', VIEW.w / 2, VIEW.h * 0.3);
        ctx.shadowBlur = 0;
        ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText('大型敌舰接近中', VIEW.w / 2, VIEW.h * 0.3 + 20);
        ctx.globalAlpha = 1;
      }
    }

    /* ---------- 暂停提示 ---------- */
    if (g.state === 'paused') {
      ctx.fillStyle = 'rgba(2,6,14,0.35)';
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    }

    ctx.restore();
  }
}
