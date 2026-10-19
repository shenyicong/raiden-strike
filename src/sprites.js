/**
 * sprites.js —— 用 Canvas 路径程序化绘制所有机型
 * 好处：零图片资源、矢量清晰、随时改配色。
 * 所有函数都在「以 (0,0) 为机身中心、机头朝上」的坐标系下绘制。
 */

export function drawPlayer(ctx, x, y, t = 0, tilt = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt * 0.16);

  // 推进器火焰
  const f = 1 + Math.sin(t * 40) * 0.22;
  const fg = ctx.createLinearGradient(0, 12, 0, 30 * f);
  fg.addColorStop(0, 'rgba(180,255,255,0.95)');
  fg.addColorStop(0.4, 'rgba(57,231,255,0.7)');
  fg.addColorStop(1, 'rgba(57,231,255,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-5, 12);
  ctx.lineTo(0, 20 + 14 * f);
  ctx.lineTo(5, 12);
  ctx.closePath();
  ctx.fill();

  // 主翼
  ctx.fillStyle = '#16324f';
  ctx.strokeStyle = '#3d7fa8';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(7, -4);
  ctx.lineTo(22, 6);
  ctx.lineTo(20, 12);
  ctx.lineTo(6, 9);
  ctx.lineTo(0, 14);
  ctx.lineTo(-6, 9);
  ctx.lineTo(-20, 12);
  ctx.lineTo(-22, 6);
  ctx.lineTo(-7, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 机身高光
  ctx.fillStyle = '#2a5d86';
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(5, -2);
  ctx.lineTo(3, 12);
  ctx.lineTo(-3, 12);
  ctx.lineTo(-5, -2);
  ctx.closePath();
  ctx.fill();

  // 座舱
  const cg = ctx.createLinearGradient(0, -14, 0, 2);
  cg.addColorStop(0, '#bffaff');
  cg.addColorStop(1, '#1b6f8f');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.ellipse(0, -7, 3.6, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // 翼尖光点
  ctx.fillStyle = '#39e7ff';
  ctx.shadowColor = '#39e7ff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(-20, 9, 1.8, 0, Math.PI * 2);
  ctx.arc(20, 9, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

export function drawScout(ctx, x, y, color = '#ff6b6b') {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#3a1420';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 14);
  ctx.lineTo(9, 2);
  ctx.lineTo(15, -8);
  ctx.lineTo(0, -14);
  ctx.lineTo(-15, -8);
  ctx.lineTo(-9, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  ctx.beginPath();
  ctx.arc(0, -2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawFighter(ctx, x, y, color = '#ffa94d') {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#3a2410';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 17);
  ctx.lineTo(7, 4);
  ctx.lineTo(18, -2);
  ctx.lineTo(16, -12);
  ctx.lineTo(5, -9);
  ctx.lineTo(0, -16);
  ctx.lineTo(-5, -9);
  ctx.lineTo(-16, -12);
  ctx.lineTo(-18, -2);
  ctx.lineTo(-7, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(3, -6);
  ctx.lineTo(-3, -6);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(-13, -8, 1.7, 0, Math.PI * 2);
  ctx.arc(13, -8, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawTank(ctx, x, y, color = '#b197fc', hpRatio = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#231b3a';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  // 六边形装甲
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const px = Math.cos(a) * 24;
    const py = Math.sin(a) * 24;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 内圈
  ctx.strokeStyle = 'rgba(177,151,252,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.stroke();
  // 核心
  const pulse = 0.6 + Math.sin(performance.now() / 180) * 0.4;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12 * pulse;
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // 血条
  if (hpRatio < 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-22, 28, 44, 4);
    ctx.fillStyle = hpRatio > 0.4 ? color : '#ff4d6d';
    ctx.fillRect(-22, 28, 44 * hpRatio, 4);
  }
  ctx.restore();
}

export function drawKamikaze(ctx, x, y, color = '#ffd43b') {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#3d3310';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 15);
  ctx.lineTo(6, 0);
  ctx.lineTo(12, -10);
  ctx.lineTo(0, -6);
  ctx.lineTo(-12, -10);
  ctx.lineTo(-6, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 9;
  ctx.beginPath();
  ctx.arc(0, 2, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

export function drawTurret(ctx, x, y, color = '#4dabf7', hpRatio = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#122335';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  // 底部平台
  ctx.beginPath();
  ctx.ellipse(0, 4, 19, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 炮塔
  ctx.beginPath();
  ctx.arc(0, -2, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 炮口
  ctx.fillStyle = color;
  ctx.fillRect(-2.4, -18, 4.8, 14);
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(0, -2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (hpRatio < 1) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-18, 20, 36, 3.5);
    ctx.fillStyle = hpRatio > 0.4 ? color : '#ff4d6d';
    ctx.fillRect(-18, 20, 36 * hpRatio, 3.5);
  }
  ctx.restore();
}

/**
 * Boss：程序化分段绘制，形态由 level 决定
 * @param {number} damageFlash 0~1，受击白闪
 */
export function drawBoss(ctx, x, y, t, level = 1, damageFlash = 0, hullRatio = 1) {
  const accent = ['#ff4d6d', '#ff9f43', '#00ff9d'][Math.min(level - 1, 2)];
  ctx.save();
  ctx.translate(x, y);

  const breathe = Math.sin(t * 1.6) * 2;
  ctx.translate(0, breathe);

  // 外层能量环
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.28 + Math.sin(t * 3) * 0.12;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 76, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 主体
  ctx.fillStyle = '#161a2b';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(0, 62);
  ctx.lineTo(46, 34);
  ctx.lineTo(88, 20);
  ctx.lineTo(96, -6);
  ctx.lineTo(58, -20);
  ctx.lineTo(30, -48);
  ctx.lineTo(0, -58);
  ctx.lineTo(-30, -48);
  ctx.lineTo(-58, -20);
  ctx.lineTo(-96, -6);
  ctx.lineTo(-88, 20);
  ctx.lineTo(-46, 34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 装甲分层
  ctx.fillStyle = '#20263d';
  ctx.beginPath();
  ctx.moveTo(0, 40);
  ctx.lineTo(34, 18);
  ctx.lineTo(26, -26);
  ctx.lineTo(0, -44);
  ctx.lineTo(-26, -26);
  ctx.lineTo(-34, 18);
  ctx.closePath();
  ctx.fill();

  // 侧翼炮
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(s * 70, 8);
    ctx.fillStyle = '#0d1120';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(-2.5, 14, 5, 12);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // 核心
  const pulse = 0.7 + Math.sin(t * 4.2) * 0.3;
  const cg = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
  cg.addColorStop(0, '#ffffff');
  cg.addColorStop(0.35, accent);
  cg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cg;
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 核心护甲板（随血量脱落）
  if (hullRatio > 0.35) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
      ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26);
      ctx.stroke();
    }
  }

  // 受击白闪
  if (damageFlash > 0) {
    ctx.globalAlpha = damageFlash * 0.55;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, 62);
    ctx.lineTo(46, 34);
    ctx.lineTo(88, 20);
    ctx.lineTo(96, -6);
    ctx.lineTo(58, -20);
    ctx.lineTo(30, -48);
    ctx.lineTo(0, -58);
    ctx.lineTo(-30, -48);
    ctx.lineTo(-58, -20);
    ctx.lineTo(-96, -6);
    ctx.lineTo(-88, 20);
    ctx.lineTo(-46, 34);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/** 道具图标 */
export function drawDrop(ctx, x, y, kind, t) {
  const conf = {
    1: ['#39e7ff', 'P'],
    2: ['#ffd166', 'B'],
    3: ['#ff6b9d', '♥'],
    4: ['#9be7ff', 'S'],
  }[kind] || ['#ffffff', '?'];
  const [color, letter] = conf;
  const bob = Math.sin(t * 5 + x * 0.05) * 1.6;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(Math.sin(t * 2.4) * 0.12);
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = 'rgba(8,14,26,0.9)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-11, -11, 22, 22, 5);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 0, 1);
  ctx.restore();
}
