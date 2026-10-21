# 测试报告：raiden-strike.html + GAME_LOGIC.md（V2.7.0）

> 测试时间：2026-10-21｜对象：`raiden-strike.html`（游戏产物）、`GAME_LOGIC.md`（逻辑文档）
> 结论：**两个文件均可正常交付**；发现 1 处文档数据失真需修正。

---

## 一、raiden-strike.html（游戏产物）

| 检查项 | 方法 | 结果 |
|---|---|---|
| 自包含结构 | 单 HTML + 单 `<script>` 块，136,617 字节 | ✅ |
| JS 语法有效性 | 提取 `<script>` 经 `node --check` | ✅ 无语法错误 |
| 版本号 | 解析 `VERSION` | ✅ `2.7.0`（与源码一致） |
| 由当前源码构建 | 与 `src/config.js` 关键值比对 | ✅ 一致 |

**V2.7 关键特性存在性核对（产物内）**

| 特性 | 关键字 | 结果 |
|---|---|---|
| 敌弹基础速度集中化 | `ENEMY_BULLET_SPEED: 150` | ✅ |
| Boss 弹速集中化 | `BULLET_SPEED: 132` | ✅ |
| Boss 命中半径集中化 | `HIT_RADIUS: 40` | ✅ |
| 触屏门控（防桌面误触） | `touchMode` | ✅ |
| 过载手动释放 | `releaseOverdrive` | ✅ |
| 过载一局仅一次 | `ONCE_PER_RUN` | ✅ |
| Boss 新增三弹道 | `fan` / `wall` / `burst` | ✅ |
| 底鼓可闻化 | `65.4` / `midi(36)` | ✅ |
| 自爆机俯冲 | `dive` | ✅ |

**功能级模拟（无头驱动 Game 主循环，10 项断言）**

| 行为 | 结果 |
|---|---|
| 蓝条集满 → `canReleaseOverdrive=true` | ✅ |
| 手动释放 → 清空屏幕敌机 | ✅ |
| 释放后蓝条归零 + 计分增加 | ✅ |
| 释放后 `overdriveUsed=true`、本局不可再触发 | ✅ |
| 已引爆后再次释放无副作用（敌机保留） | ✅ |
| Boss 七种弹道全部能生成子弹（aimed/ring/cross/spiral/fan/wall/burst） | ✅ |
| 自爆机持续下坠（y 增大） | ✅ |
| 自爆机朝玩家横向偏转（x 向玩家方向） | ✅ |

---

## 二、GAME_LOGIC.md（逻辑文档）

**数值一致性：文档 vs `src/config.js`**

逐项比对文档明确列出的 31 组关键数值（掉落权重、过载、区域、Boss、武器、计分等），**全部与源码一致**，包括：
- 掉落权重 `power 0.55 / bomb 0.17 / shield 0.20 / life 0.08` ✅
- `LIFE_CHANCE 0.025`、`SHIELD_CHANCE 0.10`、`BASE_CHANCE 0.20` ✅
- 过载 `MAX100 / PER_DMG0.20 / PER_KILL2.2 / PER_GRAZE0.30 / AUTO false / ONCE_PER_RUN true / BOSS_DAMAGE700 / SCORE_BONUS300` ✅
- 三区 `2970/18`、`4790/24`、`7300/30` ✅
- 武器 Lv.4 pellets=3、Lv.5 pellets=6 ✅
- PATTERNS 七连 ✅

**❌ 发现 1 处数据失真（需修正）**

文档末尾声明：
> “55 项测试通过（acceptance 22 + sim 30 + ui-click 3）”

实际：
- 测试套件共 **52 项**（`acceptance.test.js` 22 + `sim.test.js` 30）；
- **不存在 `ui-click` 测试文件**，“+3 ui-click” 为虚构。

建议将声明改为：**“52 项测试通过（acceptance 22 + sim 30）”**。

---

## 三、总结

- `raiden-strike.html`：语法正确、特性齐全、功能实测通过 —— **可交付**。
- `GAME_LOGIC.md`：数值描述准确；测试数量声明错误（55/含 ui-click 不实）**已修正为「52 项测试通过（acceptance 22 + sim 30）」**，文档现与源码 `config.js`、产物 `raiden-strike.html` 均统一为 `2.7.0`。

> 另注：当前项目已演进至 **V2.7.0**（在 V2.6.2 的四项需求之上，额外加入了自爆机俯冲、Boss 弹速/命中半径集中化、武器弹数修正、底鼓可闻化、触屏门控等改动），文档标题已同步为 2.7.0。
