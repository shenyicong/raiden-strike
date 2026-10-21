# 擎天战机 RAIDEN STRIKE・游戏逻辑全集（V2.7.0）

> 本文档覆盖 
>
> `src/`
>
>  下全部 18 个模块的逻辑、关键算法与数值参数，以及一局游戏的完整流程串联。
> 源码目录：
>
> `C:\Users\零柒\WorkBuddy\2026-10-20-16-19-06\raiden-strike\src\`
> 可玩产物：
>
> `raiden-strike.html`
>
> （已重新打包，浏览器直接打开即玩）



***

## 〇、V2.7.0 调优总览（本次变更）



* **修复「设置点不开」**：暂停态进入设置后，主循环每帧 `sync('paused')` 会把设置面板重建回暂停菜单 —— `ui.sync()` 现将 `settings` 视为合法视图并在暂停态保持，不再被覆盖。

* **修复「触屏按钮是隐形热区」**：`render.js` 的 `_drawTouchButtons` 此前只定义从未被调用，手机端炸 / 暂停 / 慢按钮只在坐标上 "隐形响应"；现由 `main.js` 在触屏设备每帧绘制。

* **修复「桌面端误触发触屏按钮」**：`InputManager` 新增 `touchMode`，炸 / 暂停 / 慢热区仅触屏设备命中；爆发按钮不受门控（桌面端同样绘制与响应）。

* **修复「Boss 战暂停恢复音乐错轨」**：`AudioEngine.startMusic(region, boss)` 支持 Boss 状态，`pauseToggle` 恢复时按 `!!this.boss` 切回紧张版曲目（此前恢复后错误地回到关卡主题）。

* **自爆机（kamikaze）改为追踪俯冲**：从 "直线下落" 升级为朝玩家当前位置偏转、保持向下主导动量（永不反向上升），成为真正的威胁单位。

* **数据一致性**：`WEAPONS.pellets` 修正为与实际弹道数一致（Lv.4=3、Lv.5=6），`theoreticalDps` / Boss 阶段时长模型不再失真；新增 `GLOBAL.ENEMY_BULLET_SPEED`、`BOSS.BULLET_SPEED`、`BOSS.HIT_RADIUS`，敌弹基础速度、Boss 弹速、Boss 命中半径等字面量全部集中入 `config.js`。

* **手感与听感打磨**：Boss 击破追加震屏 + 白闪 + 双圈爆炸；BGM 底鼓音高 32.7Hz→65.4Hz（低音炮上可闻）；诊断面板 `P99` 改为真实 99 分位（原取 max）。



***

## 一、工程与运行架构



* **纯前端**：ES Module + Canvas2D + WebAudio，**零第三方依赖、零运行时构建**。

* **源码 → 产物**：`src/*.js` 由 `tools/bundle.js` 打包成单文件 `raiden-strike.html`（自包含，双击即玩）。

* **入口&#x20;**`main.js`：初始化 canvas / DPR 缩放、renderer /audio/input /game/ui，启动 `requestAnimationFrame` 主循环；任何启动异常都会画到画布上提示，**绝不黑屏**。

* **主循环&#x20;**`loop()`：每帧执行 `game.step(dt)` → `draw()` → `ui.sync(state)`；`dt` 钳制 ≤0.1s，防止切标签页返回后瞬移。

* **DOM 覆盖层 UI**：标题 / 暂停 / 设置 / 结算用 DOM 浮层，HUD（分数、命、炸弹、火力、蓝条）画在 canvas 上。



***

## 二、模块清单（18 个）



| 文件                | 职责                                            |
| ----------------- | --------------------------------------------- |
| `config.js`       | 全部平衡数值的唯一来源（版本、玩家、敌机、武器、掉落、Boss、过载、难度、区域等）    |
| `entities.js`     | 实体类：Player / Enemy / Bullet / Particle / Boss |
| `weapons.js`      | 火力进化（能量→等级）、5 级弹道形态、拾取 / 掉级                   |
| `ships.js`        | 战机规格与解锁规则                                     |
| `levels.js`       | 三区波次脚本 + `WaveDirector` 波次导演                  |
| `drops.js`        | 击破掉落判定（权重池 + 重型必掉 + 独立爆率）                     |
| `scoring.js`      | 计分 + 擦弹判定 + `GrazeTracker`                    |
| `audio.js`        | WebAudio 程序化音乐与音效（三总线）                        |
| `settings.js`     | 设置派生：音量对数映射、动效 / 判定点开关                        |
| `game.js`         | 主循环与编排：开局 / 更新 / 碰撞 / 事件 / Boss 触发 / 过载       |
| `render.js`       | Canvas2D 程序化绘制（背景、实体、HUD、蓝条、爆发按钮）             |
| `input.js`        | 键盘 + 触摸 + 屏幕按钮命中检测                            |
| `boss.js`         | Boss 三阶段与弹幕模式选择                               |
| `statemachine.js` | 六态状态机（合法转换表）                                  |
| `ui.js`           | DOM 覆盖层界面（标题 / 暂停 / 设置 / 结算）+ aria-live       |
| `storage.js`      | 本地成绩与设置读写（localStorage 封装 + 降级）               |
| `util.js`         | 纯函数工具（clamp/lerp/ 随机源 / 触屏判定）                 |
| `main.js`         | 启动与渲染循环入口                                     |



***

## 三、核心配置 `config.js`

### 全局 / 玩家



* `VIEW`: 逻辑分辨率 480×720，宽高比 2:3。

* `GLOBAL`: 单帧时间上限 0.1s、子弹池 900、粒子池 1400、道具吸附半径 130、判定 / 擦弹半径 9/21px、玩家弹速 700、**敌弹基础速度 150（v2.7 入配置）**。

* `PLAYER`: 判定半径 9px、常规移速 300（精确半速 150）、初始 3 命 3 炸、受击无敌 1.8s、重生等待 1.0s、最多 9 命 / 9 炸、`AUTO_FIRE=true`（全程自动开火）、每命耐久 `LIFE_HP=100`。

* `ENEMY_DAMAGE`: 普通 / Boss 子弹伤害均 150（原等效 100 的 +50%，v2.6.1 上调）。

### 战机 `SHIPS`（6 款，v2.1）

`raiden` 雷霆号（均衡）/ `phantom` 幻影（高速、判定 6px、命−1）/ `fortress` 重装堡垒（命 + 2）/ `falcon` 猎鹰（射速 + 25%）/ `aurora` 极光（伤害 + 30%）/ `phoenix` 凤凰（受击不掉火力）。各含 `speedMult/fireMult/dmgMult/hitR/livesBonus` 与 `unlock` 条件（default /region:N /win/score:N）。

### 武器 `WEAPONS`（5 级）

能量阈值 100+120+150+200=570；满级后拾取火力折算 50 分。每级弹道（速度 700px/s）：



1. 单发 2. 双列 3. 中央重炮 + 双散射 4. 双列 + 交替追踪弹（3 发）5. 双列 + 双散射 + 双追踪（6 发）。

> v2.7 修正：
>
> `pellets`
>
>  与实发弹数一致（Lv.4=3、Lv.5=6），此前标称 4/4 与 
>
> `spawnPlayerShots`
>
>  不符，理论 DPS 与 Boss 阶段时长模型失真；修正后 Lv.1→Lv.5 理论 DPS 约 10.1 倍。

### 敌机 `ENEMIES`

`scout`(直飞，14 血，0 射) / `fighter`(摆动，30 血，1.5 射) / `tank`(慢，95 血，1.05 射) / `kamikaze`(**追踪俯冲**,18 血) / `turret`(定点，60 血，1.73 射)。命中半径取半径 ×0.82。v2.7：`kamikaze` 由直线下落改为**朝玩家追踪俯冲**（保持向下主导动量，永不反向上升）。

### 掉落 `DROPS`（V2.7.0 已调）



* `BASE_CHANCE=0.20`（每架敌机基础掉落概率）。

* 权重池 `WEIGHTS`: **power 0.55 / bomb 0.17 / shield 0.20 / life 0.08**（v2.7.0：火力↑、生命↓）。

* 重型（`tank`/`turret`）**必掉火力**。

* 独立爆率：`LIFE_CHANCE=0.025`（下调）、`SHIELD_CHANCE=0.10`。

* 道具自动下落：初速 45、加速度 210、顶速 175 px/s（约 4s 穿屏，玩家有时间接）。

### 过载爆发 `OVERDRIVE`（V2.7.0 重点）



* `MAX=100`，积攒：每点伤害 0.20、每击破 2.2、每擦弹 0.30。

* `AUTO=false`**（关闭自动引爆）；**`ONCE_PER_RUN=true`**（一局仅一次）**。

* 引爆：清屏所有敌机（Boss 改为受 700 重创）+ 清敌弹 + 1.0s 无敌 + 300 分。

### 难度递进 `RAMP`（v2.4）

每 20s 升一档（最多 6 档 / 120s）：血量 +12%/ 档、射速 +12%/ 档、弹速 +5%/ 档、每波额外 +0.6 架。

### 区域与 Boss `REGIONS` / `BOSS`

三区：`近地轨道`(bossHp 2970, quota 18) / `陨石带`(4790, quota 24) / `母舰外围`(7300, quota 30)。

Boss 三阶段阈值 66%/33%；弹速倍率 1.15/1.35/1.55；发射间隔 1.2/1.0/0.8s；环形弹 18、螺旋 5。

`PATTERNS`：`aimed, ring, cross, spiral, fan, wall, burst`（v2.7.0 新增后三种）。

> v2.7：
>
> `BOSS.BULLET_SPEED=132`
>
> （弹速基数）、
>
> `BOSS.HIT_RADIUS=40`
>
> （可被命中半径，机身主体不含能量环）集中入配置。

### 其他



* `BOMB`：清屏 0.3s、全场 150 伤、1.5s 无敌。

* `DIFFICULTY`：standard（密度 0.9、瞄准误差 25、初始 4 命、弹速 0.85）/casual（密度 0.7、误差 60、初始 6 命、弹速 0.72）。

* `SCORE`：擦弹 10、Boss 击破 5000、区域通关 3000、满级火力 50。

* `RALLY`：漏网敌机离场 3s 后带伤重返（最多 2 次）。



***

## 四、实体系统 `entities.js`

**Player**



* 字段：`x/y`、`level`、`energy`、`lives`、`bombs`、`invuln`、`shield`、`fireTimer`、`alive`、`respawn`、`lifeHp`（当前命耐久）。

* `update(dt,input,precision)`：八向移动归一（斜向不超速）；`AUTO_FIRE` 或 `input.fire` 触发 `spawnPlayerShots`。

* `takeHit(dmg=100)`：无敌 / 护盾忽略；否则扣 `lifeHp`，扣光一条命才 `lives-=1`，溢出伤害继续扣下一条；非凤凰机型 `level` 降一级；受击 1.8s 无敌。

* `giveShield()`：护盾 5s（刷新不叠加）。

**Enemy**：`hp/maxHp/radius/speed/score/behavior/fireRate/fireTimer/reentries`。`update(dt, difficulty, player)` 按行为（straight/sway/slow/dive/static）移动，到时请求开火；v2.7 起传入 `player` 供 `dive` 追踪俯冲使用。`hitR = radius*0.82`。

**Bullet**：`vx/vy/dmg/r/fromPlayer/homing`；追踪弹轻微转向玩家；出界即死。

**Particle / Boss**：Boss 含 `phase/patternIndex/fireTimer/entering/holdFire`，`syncPhase()` 按血量切换阶段并清空敌弹 + 停火 0.8s，`update` 横向正弦摆动后按间隔请求开火。



***

## 五、武器与火力 `weapons.js`



* `levelFromEnergy(energy)`：逐级扣除 `energyToNext` 映射等级。

* `applyPowerItem`：能量 +34（满级折算 50 分）。

* `downgradeOnHit`：受击降一级（不低于 1）。

* `spawnPlayerShots(level,x,y,t,dmgMult)`：返回子弹描述数组，形态随等级变化（见三、武器）。



***

## 六、战机 `ships.js`

`shipById`(归一)/`isUnlocked`/`usableShips`/`gradeUnlocks(cond={regionReached,win,score})`/`unlockText`。进度达标时 Game 自动授予未解锁机型并弹提示。



***

## 七、关卡波次 `levels.js`



* `FORMATIONS = ['line','vee','arc','dive']`，按波序循环、同区不重复。

* `WaveDirector`：**阈值驱动**—— 导演只管持续刷怪（时间轴用尽则 `_extend()` 续波，数量随难度递进成长），由 Game 按本区清理数 `regionKills >= quota` 决定停止刷怪；清屏后拉 Boss。`maxWaves = waves*2` 兜底防止 "不打枪就永不出 Boss"。



***

## 八、掉落 `drops.js`

`rollDrop(type,rng)`：重型必掉 `power`；否则 `BASE_CHANCE` 命中走权重池 `weightedPick`；未命中再 `bonusRoll`（独立掷 `life`/`shield`）。`expectedPowerItems/Energy` 仅供测试与平衡校验。



***

## 九、计分擦弹 `scoring.js`



* `classifyHit(dist)`：≤9 命中、9–21 擦弹、否则无。

* `GrazeTracker.check(bulletId,dist)`：同颗子弹仅计一次擦弹（`Set` 去重）。



***

## 十、音频 `audio.js` + `settings.js`



* **曲库&#x20;**`MUSIC_TRACKS`：6 套 8 步音序（r0/r1/r2 关卡 + b0/b1/b2 Boss），含 bass/arp/lead/hat/kick，BPM 132–164。

* **步进音序器**：`startMusic(region, boss)` 用 lookahead 提前 0.2s 排音符，定时器 25ms 抖动不传到听感；`setTrack(region,boss)` 按区域 / Boss 切曲。v2.7：`startMusic` 增加 `boss` 参数，供暂停恢复时切回正确曲目（修复 Boss 战恢复后音乐错轨）。

* **三总线**：master → sfx / music。`applyGains` 经 `busGains` 设置增益；`setMuted` 取消静音恢复真实增益。

* **音效**：shoot/explosion/pickup/powerup/alarm/overdrive/win，全合成。

* **V2.7.0 修复 "没音乐" 根因**：`busGains` 给音乐总线 `sliderToGain(music)*2.6` 上限封顶 1.0（原 `master×music` 默认仅≈0.004≈-48dB，等于静音）；合成器单音音量整体上调（bass 0.16→0.42 等）；默认音乐音量 50→85；`startMusic` 在音频上下文被挂起时**自动 retry resume**。

* **V2.7 底鼓修正**：kick 音高 32.7Hz（midi 24，多数扬声器不可闻）→ 65.4Hz（midi 36），鼓点清晰可辨。



***

## 十一、超载爆发（V2.7.0 重点逻辑）



* **积攒**：`addOverdrive(amount)` 在命中 / 击破 / 擦弹时调用；`overdriveUsed=true` 后不再积攒。

* **提示**：首次集满 `say('超载能量已满！点击[爆发]按钮或按 L 键引爆')`，`renderer` 画底部正中 "爆发" 按钮 + 脉冲提示。

* **手动释放**：`releaseOverdrive()`（按钮点击 / L 键）在 "playing 且未引爆且已满" 时调用 `_triggerOverdrive()`。

* **触发效果**：清屏敌机（计分 + 特效，不掉落）、对 Boss 造成 `BOSS_DAMAGE=700`、清空敌弹、玩家 1.0s 无敌、+300 分；置 `overdriveUsed=true`、蓝条归零，**本局不再可触发**（一局仅一次）。

* `canReleaseOverdrive()` 供输入层判断 "爆发按钮当前是否可点"。



***

## 十二、Boss 弹幕 `boss.js` + `game.fireBossPattern()`



* `getPhase(hp,maxHp)`：66%/33% 阈值为 0/1/2 阶段。

* `patternForPhase(phase,shotIndex)`：`PATTERNS[shotIndex % n]` 轮换，每阶段重置序列。

* `game.fireBossPattern()` 七种弹道（速度 = 132 × 阶段弹速倍率 × 难度弹速）：


  * `aimed` 瞄准单发、`ring` 18 环、`cross` 双翼 + 中央针弹、`spiral` 5 条旋转、

  * `fan`：以瞄准角为中心 7 发扇形散射（v2.7.0）；

  * `wall`：横向一排下弹，随机留 64px 缺口供穿越（v2.7.0）；

  * `burst`：正前 + 左右各一发三连瞄准（v2.7.0）。



***

## 十三、主循环 `game.js`



* `startRun()`：重置玩家 / 敌机 / 弹幕 / 分数 / Boss / 区域 / 过载 / 击杀计数；结束态先转 READY 再转 PLAYING（避免 "再来一局" 静默失败）；`audio.unlock().then(startMusic)`。

* `update(dt)` 顺序：

1. 玩家移动 / 自动开火 → 玩家子弹入池；

2. 波次：未达 quota 则 `waves.update` 刷怪，达 quota 置 done；done 且场上无普通敌机 → 生成 Boss（切 Boss 曲）；

3. 敌机更新 + 开火（瞄准角带误差；v2.7 传入玩家位置供自爆机追踪）；漏网敌机下落超界进 `rally` 重整队列；

4. Boss 更新 / 阶段切换 / 开火；

5. 子弹更新；

6. `collide()`：玩家子弹↔敌机 / Boss（积攒过载、击破；Boss 命中半径取 `BOSS.HIT_RADIUS`）、敌弹↔玩家（受击 / 擦弹积攒）；

7. 过载分支（AUTO 兜底，已关闭）；

8. 道具吸附下落 + 拾取；粒子衰减；提示倒计时；区域过渡无敌；出界清理；坠机重生 / 游戏结束判定。

* `useBomb()`：清敌弹 + 全场 150 伤 + 1.5s 无敌。

* `pauseToggle()`：v2.7 恢复时按 `!!this.boss` 传入 `startMusic`，Boss 战恢复仍用紧张版曲目。

* `onBossDead()`：加 Boss 击破分 + 区域通关分；v2.7 追加震屏 / 白闪 / 双圈爆炸；最后一区→WIN（解锁通关机型、结算），否则进下一区（CLEAR 态 2.2s 后回 PLAYING、换曲、重置 quota）。

* `onGameOver()` / `finishRun()`：记录成绩、解锁判定、停乐、存档。



***

## 十四、渲染 `render.js`



* `drawBackground`（渐变 + 星空 + 暗角）、`drawPlayer`（矢量机型 + 推进器 + 护盾环 + 判定点）、`drawEnemy`/`drawBoss`（含血条）、`drawBullet`/`drawDrop`/`drawParticle`（外发光）。

* `drawHUD`：分数、命（含每命耐久条）、炸弹、火力等级、本区清理进度（`CLEAR x/quota` 或 `BOSS 待命`）、机型、静音图标。

* `_drawOverdriveBar`：蓝条（集满闪烁 `OVERDRIVE READY`）。

* `_drawOverdriveButton`：**集满且未引爆时在屏幕底部正中画红色 "爆发" 按钮 + 提示文字**。

* `drawTouchButtons`：v2.7 由私有方法公开化，`main.js` 在 `game.mobile` 时每帧调用（修复 "触屏按钮隐形" 缺陷）。



***

## 十五、输入 `input.js`



* 键盘：WASD / 方向键移动、空格 / J 兼容开火、K/X 炸弹、Shift 精确、P/Esc 暂停、M 静音、**L 释放过载**、Enter 开始。

* 触摸：拖动跟手（按下的 "机身相对手指" 偏移保持）、右下 "炸"、左下 "‖" 暂停 /"慢" 精确；`hitButton` 命中屏幕按钮（含 overload 按钮，仅可释放时拦截，否则让位拖动）；阻断浏览器手势避免拖动被滚动抢走；失焦 / 隐藏 / 旋转 → `onInterrupt` 暂停。

* v2.7：`touchMode` 门控 —— 炸 / 暂停 / 慢热区仅触屏设备命中（桌面端不绘制也不误触发），爆发按钮两端可用。



***

## 十六、状态机 `statemachine.js`

六态：`ready/playing/paused/clear/gameover/win`；`TRANSITIONS` 合法转换表，非法转换忽略不抛异常。`playing` 可转 `paused/clear/gameover/win`；`gameover/win` 只能回 `ready`。



***

## 十七、UI `ui.js`



* 单一事件入口：事件委托挂在 overlay 上（`data-action` / `data-field`），**绝不每帧重建 innerHTML**（避免按钮点不动 / 黑屏历史 bug）。

* 视图：标题（含战机选择卡）、暂停、设置（主 / 音效 / 音乐 / 判定点 / 动效 / 难度滑块）、结算（前五榜、再来一局）。

* `sync(state)` 仅在视图切换时重建；标题态只刷新文本（`_refreshTitle`）。v2.7：暂停态保持设置视图 ——`sync` 将 `settings` 视为合法目标，不再被每帧重建回暂停菜单。



***

## 十八、存储 `storage.js`



* `STORAGE_KEY='raiden.v1'`，单键存储（≤4096 字节）。

* `load`：版本不符 / 解析失败返回 `emptyData()`（不抛错）；补齐缺失字段。

* `save`：超限 / 异常静默降级返回 false。

* `recordRun`：更新最高分与前五榜，保留 `unlocked`。

* `clearAll`：清本地记录。



***

## 十九、工具 `util.js`

`clamp/lerp/dist/dist2/normalizeDir/makeRng(xorshift32 可注入随机源)/isTouchDevice`（matchMedia + 触点数 + UA 兜底，桌面带触屏不计移动端）。



***

## 二十、一局游戏流程串联



1. 标题页选机型 → 点击 / Enter → `startRun()`（解锁 audio、起 BGM）。

2. `PLAYING`：`WaveDirector` 按阈值刷怪（敌机随时间递进变强），玩家自动开火、移动、拾取道具（火力↑/ 炸弹 / 生命 / 护盾）。

3. 击破积攒过载能量；漏网敌机 `RALLY` 重整；擦弹加分 + 积攒。

4. 本区清理达 `quota` → 停刷 → 清屏 → 生成 Boss（切紧张版 BGM）→ 三阶段七弹道。

5. 蓝条集满 → 提示 + "爆发" 按钮 → **玩家手动引爆**（清屏 / Boss 重创），一局一次。

6. Boss 死 → 区域通关分；非末区进下一区（2.2s 过渡 + 无敌 + 换曲），末区→WIN。

7. 命耗尽 → GAMEOVER；均触发 `finishRun`（成绩入库、解锁判定、停乐、回标题）。



***

*文档与产物版本一致：V2.7.0，52 项测试通过（acceptance 22 + sim 30）。源码改动涉及 config/entities/game/audio/render/input/ui/main/scoring 及测试同步更新。*