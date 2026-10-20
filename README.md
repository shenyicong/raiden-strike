<div align="center">

# 🚀 雷霆战机 · RAIDEN STRIKE **V2.0**

**纯原生 HTML5 + Canvas 的街机纵版弹幕射击游戏 · 零依赖 · 零图片资源 · 零构建**

[![HTML5](https://img.shields.io/badge/HTML5-Canvas-E34F26?style=flat-square&logo=html5&logoColor=white)](#)
[![JS](https://img.shields.io/badge/JavaScript-ES%20Modules-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](#)
[![Deps](https://img.shields.io/badge/Dependencies-0-00ff9d?style=flat-square)](#)
[![License](https://img.shields.io/badge/License-MIT-39e7ff?style=flat-square)](#)
[![Version](https://img.shields.io/badge/Version-2.0.0-5fa8ff?style=flat-square)](#)

### ▶ 在线试玩 https://shenyicong.github.io/raiden-strike/

</div>

---

## 📌 这是什么

一个**开箱即玩**的街机纵向射击游戏，致敬经典《雷电》系列：操纵战机穿越三区敌舰封锁线，击沉分段 Boss。

**没有任何构建工具、没有任何 npm 依赖、没有一张图片素材。** 所有机体、弹幕、粒子、星空、UI 由 Canvas 2D 路径实时绘制，音效由 WebAudio 振荡器实时合成。整个游戏就是一堆 `.js` 文件 —— 下载后用浏览器打开即可。

---

## 🕹 怎么玩（两种入口）

**方式 A · 单文件版（推荐，双击就玩）**
直接双击 `raiden-strike.html` 即可，无需服务器、无需联网。
> V2.0 新增：把 17 个 ES Module 内联成单个 classic `<script>`，**彻底修复 v1.0 在 `file://` 下因 ES Module CORS 直接白屏（"游戏打不开"）的问题**。

**方式 B · 模块化版（开发 / 部署用）**
```bash
git clone https://github.com/shenyicong/raiden-strike.git
cd raiden-strike
python -m http.server 8080      # 需要静态服务器（ES Module 限制）
# 浏览器打开 http://localhost:8080
```

---

## 🎮 操作

| 按键 | 功能 |
|---|---|
| `W A S D` / `方向键` | 移动战机 |
| 自动射击 | 无需按键，持续开火 |
| `K` / `X` | 炸弹：清空全屏弹幕并造成大量伤害 |
| `Shift` | 精确移动（半速，弹幕里穿针用） |
| `P` / `Esc` | 暂停 |
| `M` | 静音开关 |
| `Enter` | 开始 / 继续 |

**鼠标 / 触屏**：直接拖动战机，拖动期间自动开火 —— 手机上也能玩。

> 判定点只有机身中心那个**白色小点**（半径 9px），比视觉尺寸小很多，按判定点躲弹即可。

---

## ✨ 核心特性

### 战斗手感
- **五级火力进化**：吃 `P` 道具逐级升级，中弹掉一级。
- **擦弹爽感**：判定点小 + 精确移动模式，配合受击无敌闪烁。
- **炸弹清屏**：瞬间清空敌弹、全场伤害、屏幕白闪、强制短暂无敌。
- **道具吸附**：靠近 130px 内的道具会被自动吸过来。

### 关卡结构
- **三个区域**：近地轨道 → 陨石带 → 母舰外围，每区独立配色与波次脚本。
- **波次编队**：横排、V 字、弧线、俯冲四种阵型，逐区变强。
- **三段式 Boss**：血量降到 66% / 33% 触发阶段转换，四种弹幕模式轮换。

### 视听表现
- **程序化绘制**：所有机体、弹幕、粒子、星空、UI 都是代码画出来的。
- **纯 WebAudio 合成音效**：主 / 音效 / 音乐三条独立音量总线。
- **三层视差星空** + 动态星云 + 屏幕震动 + 受击白闪 + 暗角。
- **粒子池 / 子弹池**：循环复用，大规模爆炸也不掉帧。

---

## 🆕 V2.0 相对 V1.0 的修复与增强

| 类别 | 问题（v1.0） | V2.0 处理 |
|---|---|---|
| **可运行性** | `file://` 双击因 ES Module CORS 白屏（"游戏打不开"） | 新增单文件 `raiden-strike.html`，内联全部模块，双击即玩 |
| **交互** | 覆盖层每帧 `innerHTML` 重建销毁按钮 → "点不动" | `ui.js` 改用**事件委托** + 视图状态缓存，按钮永不被销毁 |
| **健壮性** | `matchMedia` 在沙箱 / 老浏览器抛错致整页白屏 | 全程 `?.` 可选链保护（`main.js`） |
| **持久化** | 无最高分 / 设置保存 | `storage.js` 接入 `localStorage`，带降级（隐私模式不崩） |
| **无障碍** | 无屏幕阅读器 / 动效偏好支持 | `aria-live` 状态播报 + `prefers-reduced-motion` 响应 + 焦点描边 |
| **工程化** | 无自动化测试 | `tests/` 23 项验收 + 模拟测试，`tools/` 冒烟 / 点击回归，全绿 |

---

## 🗂 目录结构

```
raiden-strike/
├── index.html            # 入口页面（需静态服务器；或用下面单文件版）
├── raiden-strike.html    # ★ V2.0 单文件自包含版：双击即玩，修复 file:// 打不开
├── dist.bundle.js        # 单文件版内联脚本（供无头冒烟测试）
├── package.json          # version 2.0.0
├── LICENSE
├── src/                  # 17 个 ES Module（开发 / 测试用）
│   ├── config.js         # ★ 所有平衡性参数（改这里调难度 / 手感）
│   ├── util.js           # 数学工具
│   ├── weapons.js        # 五级火力
│   ├── scoring.js        # 计分（含擦弹）
│   ├── drops.js          # 掉落道具
│   ├── boss.js           # 三段式 Boss
│   ├── storage.js        # 最高分 / 设置持久化（localStorage，带降级）
│   ├── settings.js       # 设置模型
│   ├── statemachine.js   # 六态状态机
│   ├── entities.js       # 玩家 / 敌机实体
│   ├── levels.js         # 波次脚本
│   ├── render.js         # Canvas 绘制
│   ├── audio.js          # WebAudio 合成（主 / 音效 / 音乐三总线）
│   ├── input.js          # 键鼠触统一输入
│   ├── ui.js             # DOM 覆盖层（事件委托 + aria-live）
│   ├── game.js           # 主类：状态机 / 关卡流程 / 实体调度 / 渲染
│   └── main.js           # 入口
├── tests/                # 验收 + 模拟测试（node --test）
└── tools/                # 打包 / 冒烟 / 点击回归
```

### 想改点什么？

| 想调整 | 改哪里 |
|---|---|
| 难度、Boss 血量、波次脚本 | `src/config.js` → `LEVELS` |
| 玩家速度 / 生命 / 无敌时间 | `src/config.js` → `PLAYER` |
| 火力等级形态 | `src/weapons.js` |
| 子弹伤害与射速 | `src/config.js` → `WEAPON` |
| 配色主题 | `src/config.js` → `COLORS` + `LEVELS[].bg/accent` |

---

## 🔧 技术要点

**固定逻辑分辨率 + 容器等比缩放**
游戏内部永远以 `480×720` 逻辑坐标绘制，画布用 `devicePixelRatio` 放大保证高清；外层容器双重约束，横屏、竖屏、小窗口都不会被裁切。

**帧率无关的运动**
所有位移都乘 `dt`，阻尼用指数平滑 `1 - exp(-λ·dt)`；单帧 `dt` 上限 0.1s 防止切标签页回来后物体瞬移。

**对象池**
子弹上限 900、粒子池 1400，用 `swap-pop` 原地删除，避免 `splice` 数组搬移与 GC 抖动。

**独立命中判定**
玩家碰撞半径 9px，视觉翼展约 44px —— 街机手感的关键在于"感觉碰到了才算"。

---

## 📄 License

MIT License · 随便用、随便改、随便发。如果做成自己的版本，欢迎在 issue 里丢个链接。
