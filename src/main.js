/**
 * main.js —— 入口：初始化画布、绑定全局快捷键
 */

import { Game } from './game.js';
import { sfx, setMuted, isMuted, unlock } from './audio.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
game.start();

// 便于自动化测试 / 调试：控制台可直接访问 window.__game
window.__game = game;

// Enter 开始 / 继续
addEventListener('keydown', (e) => {
  if (e.code === 'Enter') {
    e.preventDefault();
    if (game.state === 'ready' || game.state === 'gameover' || game.state === 'win') {
      unlock();
      sfx.ui();
      game.startRun();
    } else if (game.state === 'paused') {
      game.resume();
    }
  }
  if (e.code === 'KeyM') {
    setMuted(!isMuted());
    const el = document.getElementById('muteTag');
    if (el) el.textContent = isMuted() ? '已静音' : '';
    if (!isMuted()) sfx.ui();
  }
});

// 点击画布时解锁音频（浏览器策略）
canvas.addEventListener('pointerdown', () => unlock());

// 标签页隐藏自动暂停
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') game.pause();
});
