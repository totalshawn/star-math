# 《星算速算家》UI 流程图（UI_FLOW）

版本 v0.1（骨架稿）｜ 作者：程前锦（前端开发专家）｜ 日期 2026-10-03
对应 UI：`docs/UI_SPEC.md` v1.2（**坐标与视觉的唯一事实源**）
对应架构：`docs/FRONTEND_SPEC.md` v1.2

---

## 0. 本文档的定位与边界

| 项 | 说明 |
|---|---|
| **本文档装什么** | 界面**跳转关系**、进入/退出条件、**状态机**、**数据依赖字段**、**验收点** |
| **本文档不装什么** | 坐标、色值、字号、圆角、组件规格、文案定稿 —— **全部留在 UI_SPEC.md** |
| **为什么不装坐标** | 坐标变更频率远高于流程。v1.0→v1.1 主页重排，v1.1→v1.2 又改了 3 处。坐标进两份文档 = 改一处要同步两处 |
| **冲突时的裁决** | **任何坐标冲突以 `UI_SPEC.md` 为准**，本文档只写「见 UI_SPEC §x」，不复制数值 |
| **状态** | **v0.1 骨架稿** —— 界面级流程已完整，界面内细节待 ui-designer 补 |

**一句话分工**：UI_FLOW 是"稳定的导航图"，UI_SPEC 是"可变的施工图"。

---

## 1. 全局跳转关系总图

```ascii
                              ┌─────────┐
                              │  BOOT   │ 资源加载 / 进度条 / 预热音频
                              └────┬────┘ 读存档 → 检查隐私同意版本
                                   │
                    ┌──────────────┴──────────────┐
          未同意    │                             │  已同意 / 已同意过
                    ▼                             ▼
            ┌───────────────┐            ┌─────────────┐
            │   CONSENT     │            │    HOME     │◀──────┐
            │  （overlay）   │────────────┤  主页       │       │
            │ 模态·不可跳过 │  两个按钮   │ 11 个可交互区│       │
            │ 无倒计时/无挡板│  权重对等   └──────┬──────┘       │
            └───────────────┘                   │              │
                                                │              │
     ┌──────────────┬──────────────┬────────────┼─────────┐    │
     │              │              │            │         │    │
     ▼              ▼              ▼            ▼         ▼    │
 ┌───────┐   ┌──────────┐   ┌──────────┐  ┌─────────┐ ┌─────┐│
 │ GAME  │   │  REVIEW  │   │SETTINGS  │  │LEADER-  │ │ PAUSE││
 │闯关主屏│   │ 复习页   │   │  设置页   │  │  BOARD   │ │(覆盖)││
 │7 态子机│   │ 4 态子机 │   │A/B/C 分组 │  │3 级状态  │ └─────┘│
 └───┬───┘   └────┬─────┘   └─────┬─────┘  └─────────┘       │
     │            │              │                            │
     ▼            ▼              │                            │
 ┌─────────┐  ┌──────────┐       │                            │
 │ RESULT  │  │REVIEW_END│       │                            │
 │  结算页  │  │复习组结束│       │                            │
 └──┬───┬───┘  └────┬─────┘       │                            │
     │   │          │              │                            │
     │   └──────────┴──────────────┤                            │
     │      「再玩一局」            │                            │
     │                             ▼                            │
     │                    ┌─────────────────┐                   │
     │                    │  PARENT_GATE    │（overlay·模态）  │
     │                    │  算术题 / PIN   │                   │
     │                    └────────┬────────┘                   │
     │                             │ 通过                       │
     │                             ▼                            │
     └──「练一练」(wrong≥3) ──▶ REVIEW                          │
     └──「回主页」──────────────────────────────────────────────┘
```

**表格化跳转条件**（实现时以本表为准，不看上面的图）：

| 从 | 到 | 触发条件 | 转场 |
|---|---|---|---|
| BOOT | CONSENT | `privacyNoticeVersion < CONSENT_VERSION` | fade-in 240ms + scrim 0.72 |
| BOOT | HOME | 已同意 或 `savedVer >= currentVer` | fade-in 300ms |
| CONSENT | HOME | 「暂不开启」**或**「确认并开始」 | fade 200ms |
| HOME | GAME | tap「开始挑战」CTA | 上滑推入 380ms `easeOutCubic` |
| HOME | REVIEW | tap 错题本气泡（**数量 > 0 才可点**） | 淡入 260ms + 背景**立即切纯色平涂**（无渐变转场） |
| HOME | SETTINGS | tap 齿轮 | 右滑入 280ms |
| HOME | SETTINGS | tap「家长设置」入口 | 右滑入 280ms **→ 立即叠 PARENT_GATE** |
| GAME | PAUSE | `game.js` 内部暂停条件 | 无转场（overlay flag） |
| GAME | RESULT | `TIME_OUT` 归零 / 正解达 10 且关卡终 | 白闪 + scale 收缩 420ms（`timeScale 0.3x` 同步） |
| RESULT | GAME | 「再玩一局」 | 上滑 380ms |
| RESULT | HOME | 「回主页」 | 横滑 300ms |
| RESULT | REVIEW | tap「练一练」卡片（**仅 `wrong >= 3` 时存在**） | 淡入 260ms |
| REVIEW | REVIEW_END | 组内最后一题处理完 | 淡入 260ms |
| REVIEW_END | REVIEW | 「再来一组」 | 原地重置，不重进场景 |
| REVIEW_END | HOME | 「回主页」 | 横滑 300ms |
| SETTINGS | HOME | 「返回」（**任何层级都可用**） | 反向右滑 240ms |
| SETTINGS | PARENT_GATE | tap B 组入口 / C 组入口 | scrim 淡入 200ms |
| PARENT_GATE | SETTINGS | 校验通过 | scrim 淡出 180ms |
| 任意 | LEADERBOARD | 从 RESULT 页排行榜入口 | 右滑入 280ms |

**Overlay vs 场景的划分依据**（重要，实现时不要改）：

| 元素 | 类型 | 理由 |
|---|---|---|
| `CONSENT` | **overlay** | 弹层是"打断当前流程做一次性确认"，语义上是覆盖。若入场景栈，「返回」会回到弹层 → **退不出的死锁** |
| `PARENT_GATE` | **overlay** | 语义是"页面路由的前置守卫"，比作为场景更自然；且必须保证「返回」永远可用 |
| `PAUSE` | **overlay** | 游戏中断，不希望产生新的返回层级 |
| `REVIEW` / `SETTINGS` / `LEADERBOARD` | **场景** | 有独立进入/退出生命周期，需要转场动画，需要独立的 `onHide` 存档时机 |

---

## 2. BOOT 场景

**坐标**：见 UI_SPEC §9 验收演示（启动相关）
**实现**：`miniprogram/scenes/boot.js`

| 项 | 内容 |
|---|---|
| **进入条件** | 小游戏启动（冷启动 / 热启动） |
| **退出条件** | 资源就绪 **且** 同意检查完成 |
| **数据依赖** | `platform.assets`（manifest）、`SaveManager.state`、`CONSENT_VERSION` |
| **状态机** | 无子状态（线性流程） |
| **验收点** | 冷启动 ≤1.5s 可交互；iOS 首次 `audio.resume()` 在用户首个手势内完成 |

**流程**：

```pseudo
showLogo() → yieldFrame()                       // 先让 logo 画出来
await loadGroup(critical, drawProgress, ...)     // 首屏必需资源
switchTo(consentNeeded ? CONSENT_overlay : HOME) // ★ 首分支
loadGroup(preGame, ...)                          // HOME 期间后台加载
```

> **★ R12**：这一行是**唯一的**隐私同意检查入口。漏写 = 无单独同意 = 不可上架。
> code review checklist 显式列一条；提审前用全新微信账号首启截图验证。

---

## 3. HOME 场景

**坐标**：见 UI_SPEC §18.1（v1.1 修订版，**不使用** §2.9 的旧主页坐标）
**实现**：`miniprogram/scenes/home.js`

| 项 | 内容 |
|---|---|
| **进入条件** | BOOT（已同意）/ RESULT·REVIEW_END·SETTINGS 返回 |
| **退出条件** | tap 开始 / 错题本气泡 / 齿轮 / 家长设置入口 / 排行榜入口 |
| **数据依赖** | `profile.grade`、`grades[g].{difficultyOffset, mastery, bestDl, bestScore, playCount}`、`collection.{stars,coins,title,nickname,avatarId}`、`settings.{mute,bgm,reduceMotion,fontScale,leftHanded,vibrateEnabled,vibrateIntensity,showTimerBar,autoNextDelayMs}`、`MistakeBook.dueCount(grade)` |

**可交互元素注册表**（注册顺序 = z 序，从上到下）：

```pseudo
function layoutHome(save, ctx) {
    // 顺序必须与 UI_SPEC §18.1 的 y 序一致，避免层级穿插
    registerHit(currencyBar)        // 只读
    registerHit(muteBtn)            // x 上限 < 微信胶囊 x
    registerHit(avatarArea)         // → 称号墙（v2 占位，本期不跳）
    registerHit(gradeCards[6])      // 未解锁年级 disabled 且**不响应**
    registerHit(masteryBar)         // 只读
    registerHit(difficultyTuner)    // 7 段分段按钮
    registerHit(promptBubble)       // 「最高 DL 引导上抬」，7 天 1 次，非模态
    registerHit(startCTA)           // 主 CTA
    registerHit(characterRow[4])    // 角色选择
    registerHit(mistakeBubble)      // 错题本；dueCount==0 时不显示数字 0
    registerHit(parentEntry)        // → PARENT_GATE
    registerHit(leaderboardEntry)
    registerHit(settingsEntry)      // 齿轮
}
```

**`difficultyOffset` 的读写**（唯一入口，不允许别处改）：

```pseudo
tap(段 k)
    save.grades[grade].difficultyOffset = k - 3          // k∈[0,6] → offset∈[-3,+3]
    previewText = PREVIEW_TEXT[k]                        // ★ 不显示 ±数字，显示「挑战一下」
    actualDL   = displayDL(difficulty.recompute(...))    // ★ 显示钳制后的值
    SaveManager.commit('difficultyOffset')
    track('difficulty_set', { offset: k-3, source: 'tuner' })   // 埋点仍记真实 offset
```

| **验收点** | 说明 |
|---|---|
| 难度预览文案 | `-2 → 「慢慢来」`，`+2 → 「挑战一下」`；**绝不出现「+2」** |
| 实际 DL 显示 | 六年级 +3 +3 → 显示 `DL 10`（不是 14） |
| 引导气泡 | 「每 7 天最多弹 1 次」，**不点「试试看」不产生任何负面后果** |
| 错题本气泡 | `dueCount == 0` → 显示 👍，**不显示数字 0**，且不可点 |
| 切换角色 | 头像与角色行选中态同步更新（同一个 `avatarId`） |

---

## 4. GAME 场景（闯关主屏）

**坐标**：见 UI_SPEC §2（游戏主屏，v1.0 未变）
**实现**：`miniprogram/scenes/game.js`

| 项 | 内容 |
|---|---|
| **进入条件** | HOME tap CTA / RESULT「再玩一局」 |
| **退出条件** | `TIME_OUT` → RESULT |
| **数据依赖** | `profile.grade`、`grades[g].settings.autoNextDelayMs`、`settings.*`（震动/低刺激/字体/左手/软条） |
| **状态机** | 7 态，见下 |

### 4.1 七态子状态机

| 状态 | 停留 | 进入条件 | 退出条件 | 关键副作用 |
|---|---|---|---|---|
| `INTRO` | 900ms | 进入 GAME / `LEVEL_UP` 结束 | 超时 或 tap 跳过 | banner「EX N」；角色 `jump`；BGM 起；`timer.armLevel()` |
| `ASK` | 350ms | INTRO 结束 / `WRONG`·`JUDGE` 结束 | 动画完成 | `generator.next()`；`inputBuf.reset()`；`timer.startSoftLimit()`；**软条与「下一题」按钮均隐藏** |
| `INPUT` | 不定 | ASK 完成 | 判定产生 | 角色 `answer`；记录 `questionStartRealTime`；`combo.startGrace()` |
| `JUDGE` | 450ms | 判定为**正确** | 定时到 / tap「下一题」 | `scoring.award()`；`fx.starBurst`；`fx.shockwave`；`combo.incr()`；`timer.addTime()`；`inputBuf.lock()`；**按钮浮现 + 软条定格** |
| `WRONG` | 700ms | 判定为**错误** / 软限时 ×1.8 超时 | 定时到 | `scoring.miss()`；`fx.flash('red')`；`combo.break()`；`difficulty.onWrong()`；`inputBuf.lock()` |
| `LEVEL_UP` | 800ms | 正解达 10 | 定时到 | `level++`；banner「EX N+1」；`fx.confetti()`；`timer.carryOver()`；`difficulty.onLevelUp()` |
| `TIME_UP` | 900ms | `timer.leftMs <= 0` | 定时到 | `timeTween(0.12, 900)`；角色 `timeup`；`timer.freeze()`；BGM 淡出 |

**转场守卫**（防抖，实现必读）：

```pseudo
// 「正解刚好到 10」与「倒计时同一帧归零」可能同时触发 → 会跳两次状态
fsm.go(target, { delayMs })
    delayMs > 0 → 排入 pendingGo
    transitionLock > 0 → 拒绝新的 go 请求
    锁定期 120ms
```

**强制规则**：`inputBuf.lock()` 之后的 450ms 内**所有按键输入被丢弃**。这既防连点跳题，也天然形成视频里"答完有 0.45s 反馈窗口"的节奏。

| **验收点** | 说明 |
|---|---|
| 判定锁定 | 450ms 内狂点键盘无效 |
| 慢动作与倒计时 | `timeTween(0.25, 260)` 期间**倒计时不变慢**（走 `onRealStep`） |
| 「下一题」按钮 | 见 §4.3 几何约束 |
| 换后台 | 无瞬移、倒计时不跳变、声音恢复 |

### 4.2 角色状态映射

`idle / answer / correct / combo / wrong / timeup` 六态，素材映射见 FRONTEND_SPEC 附录 A。
状态**切换本身**在低刺激模式下保留；**位移/旋转/残影**被替换为原地缩放（见 §8）。

### 4.3 「下一题」按钮与软倒计时条（★ v1.2 硬约束）

坐标见 UI_SPEC §2.7.1。**几何约束必须写成断言**（`tools/check-geometry.js`）：

```pseudo
// 卡底 830 → 键盘顶 848，卡外只有 18px → 放不下 72—80px 的按钮
// → 按钮与软条必须收进白卡内部
NEXT_BTN = 白卡内浮层（判定后浮现）
SOFT_BAR = 白卡内底部进度槽

assert(答题位底 734  <  按钮顶)      // 间隙 4px  —— ★ 不得遮挡答题位
assert(按钮底       <  软条顶)        // 不重叠
assert(卡内提示右缘 <  按钮左)        // 不重叠
assert(软条底       <  卡片底)        // 在卡内
assert(键盘顶       >  卡片底)        // ★ 卡外无任何元素
```

| **验收点** | 说明 |
|---|---|
| 按钮不遮挡答题位 | 4px 间隙 |
| 按钮与软条共存 | **不再互斥**（v1.2 作废 v1.1 的互斥规则） |
| 关闭 `showTimerBar` | 软条消失，**键盘仍在原位不移动** |
| 1-2 年级 | `autoNextDelayMs=0` → 按钮常驻，答对后不自动切 |
| 左手模式 | 按钮与软条**位置不变**（纯信息不镜像） |

---

## 5. REVIEW 场景（★ 独立视觉体系）

**坐标**：见 UI_SPEC §15.1、§15.2
**实现**：`miniprogram/scenes/review.js`

| 项 | 内容 |
|---|---|
| **进入条件** | HOME 错题本气泡 / RESULT「练一练」卡片（`wrong >= 3`） |
| **退出条件** | 组内最后一题处理完 → REVIEW_END；或跳过全部 |
| **数据依赖** | `MistakeBook.getDueItems(grade, limit)`、`profile.grade`、`grades[g].mastery` |

**为什么必须独立场景**（不要合并回 GAME）：

> 1-2 年级走「练一练」时要把整个键盘区**替换**成 3 选 1 大按钮区 —— 这是**布局级**差异。
> 且复习页长得像闯关页，孩子就有考试压力，而复习本该是零压力。

| 维度 | GAME | REVIEW |
|---|---|---|
| 背景 | 粉紫渐变 + 装饰 | **纯色平涂，无渐变无装饰** |
| 倒计时 | 胶囊 + 软条 | **完全没有** |
| 顶部 | HUD + 数据条 + 进度点阵 | **全部移除**，替换为复习专用条 |
| 关卡横幅 | `EX N` 斜切彩带 | **无横幅** |
| 白卡描边 | 5px `ink-900` | 3px `brand-300`（更轻） |
| 错误反馈 | 抖动 + 变红 | **不抖不变红**，算式停留 + 手写描红 |
| 正确反馈 | 跳跃 + 随连击粒子 | 跳跃 + **6 颗**（减半，不铺张） |
| 跳过 | 无 | **常驻可见** |

**四态子状态机**：

| 状态 | 停留 | 退出条件 | 关键表现 |
|---|---|---|---|
| `ASK` | 出题 | 题目就绪 | 从 `getDueItems` 取下一条 |
| `PRESENT` | 不定 | 玩家响应 | 认一认：等点 ⌀180；练一练：等选 3 选 1；考一考：等键盘 |
| `FEEDBACK` | 正确 1400ms / **错误 2000ms** | 定时到 | 错误：**停留 2s（不可跳过）→ 描红 600ms → 进下一题** |
| `REVIEW_END` | — | 「再来一组」/「回主页」 | 全正反馈文案 |

**三种模式与年级映射**：

| 模式 | 答题区 | 关键设计 |
|---|---|---|
| 🟢 认一认 | **无输入区**，两个 ⌀180 大圆钮 | 展示算式 + 正确答案 |
| 🟡 练一练 | **3 选 1** 大按钮 | ★ **干扰项 = 该题上次答错的数**（`lastWrongAnswer`） |
| 🔴 考一考 | 复用完整数字键盘 | **无软倒计时条** |

```pseudo
function modesForGrade(grade, mastery)
    if grade <= 2: return [LEARN, PRACTICE]           // ★ 完全不出现键盘
    if grade >= 3 and mastery <= 1: return [LEARN, PRACTICE, QUIZ]   // 低熟练度先认
    if grade >= 3: return [PRACTICE, QUIZ]
```

> `mastery` 是**该年级**的熟练度。五年级 mastery 可能仍低（换年级=换知识点），从 learn 起在教育上是对的。

| **验收点** | 说明 |
|---|---|
| 1-2 年级无键盘 | 屏幕上**看不到任何数字键盘** |
| 干扰项来源 | 3 个选项含"该题上次答错的数" |
| 错误零压力 | 2s 静止 + 描红 + Toast **无红底**、不抖不变红 |
| 全正反馈 | 0 道拿下 → 「完成啦，明天再来～」，**不出现"全错"** |
| 不扣分 | 复习全程不掉分、不掉星 |

---

## 6. RESULT 场景

**坐标**：见 UI_SPEC §2.9 + §18.2（增补）
**实现**：`miniprogram/scenes/result.js`

| 项 | 内容 |
|---|---|
| **进入条件** | GAME 的 `TIME_OUT` |
| **退出条件** | 「再玩一局」/「回主页」/「练一练」（`wrong>=3`） |
| **数据依赖** | 本局 summary、`grades[g].{bestScore,mastery}`、`collection.{stars,coins}`、`newBestScore` |

**元素优先级**（z 序 + 视觉权重）：

```pseudo
renderResult()
    drawSectionScore()        // 本关表现 3 星（顶部，大尺寸）
    // ★ 两者绝不在同一屏同一区域：中间 40px 留白 + hairline 分隔
    drawNewRecordBanner()     // 仅 newBestScore==true
    drawSectionMastery()      // 熟练度 5 星（小尺寸，y ≥ 独立分区）
    drawSectionCoins()        // 金币行 + 「看视频翻倍」
    // ★★ 即时巩固卡片：wrong>=3 时出现，**必须放在「再玩一局」之上**
    if summary.wrong >= 3: drawMistakeCard()
    drawMainCTA()             // 「再玩一局」= 主 CTA
    drawWeeklyReport()        // 每周首次结算
```

**合规约束**（「看视频翻倍」）：

| # | 约束 |
|---|---|
| 1 | 文案**必须**说明代价与收益（"看一段视频" + "金币 ×2"），不得省略"视频" |
| 2 | **不得**用「点击领取」「免费领」「不看就亏了」等诱导话术 |
| 3 | **不置于主 CTA 位置**，视觉权重明显低于「再玩一局」 |
| 4 | 本次会话已用过 → 「明天再来」且**不可点击** |
| 5 | 儿童主动点击时若未达 `parentGateOpen` → 轻提示「这一项会打开一段视频广告」 |

| **验收点** | 说明 |
|---|---|
| 熟练度星 vs 关卡星 | 尺寸/描边/文案/位置四重区分，不混淆 |
| 即时巩固卡片位置 | **在「再玩一局」之上**（转化率最高时刻） |
| 熟练度提升 | 「3 → 4」仅在本次提升时显示 |

---

## 7. SETTINGS 场景（家长门保护）

**坐标**：见 UI_SPEC §14.2（分组结构）、§14.3（分段控件）、§14.4（低刺激模式）
**实现**：`miniprogram/scenes/settings.js` + `ui/parentGate.js` + `ui/consentModal.js`

| 项 | 内容 |
|---|---|
| **进入条件** | HOME 齿轮（直接进 A 组）/ HOME 家长设置入口（**先进家长门**） |
| **退出条件** | 「返回」（任何层级都可用） |
| **数据依赖** | `settings.*`（全部 8 个字段）、`privacyNoticeVersion`、`settings.parentPinHash` |

**A/B/C 三分组**：

| 组 | 位置 | 进入条件 | 项 |
|---|---|---|---|
| **A. 孩子的设置** | 白底 | 无门槛 | 音效 / BGM / 震动开关 / 震动强度(3段) / 字体大小(3段) / 左手模式 / 显示单题限时条 / 自动下一题延迟(3段) |
| **B. 家长设置** | ★ `n-50` 灰底 + 2px `brand-300` 分隔线 + 24px 间距 | **家长门** | 难度微调 / 排行榜开关 / 匿名统计开关 / 错题云同步 / 清除数据 / 卸载重置 |
| **C. 家长同意记录** | B 组内 | **家长门**（二次） | 已同意项列表 + 每项**独立**关闭开关（无挽留） |

> **设计原则**：家长控制项与儿童设置项**必须物理隔离**。混在一个长列表里让小孩一路往下滑是错的。

**家长门两模式**：

| 模式 | 触发 | 表现 |
|---|---|---|
| 算术题 | 无 `parentPinHash` | 键盘上移、更紧凑（4 行 × 78px）；**每次重新生成**（防背答案） |
| PIN | 有 `parentPinHash` | 4 个 ⌀20 圆点，**不显示明文**；错误时整行左右抖 ±8px / 3 次 |

**低刺激模式不是普通开关**（三个理由）：① 同时是低端机适配 + 敏感儿童兜底 + 家长健康保护；② 效果对用户不可见；③ 措辞若用「减少动效」会让人以为只是变简单。开启后**就地播放 1.2s 对比动画**（左半屏普通 / 右半屏低刺激）。

| **验收点** | 说明 |
|---|---|
| B 组先拦后进 | **先弹家长门，通过后才显示 B 组**（不是先进去再拦） |
| 算术题每次重生 | 连续两次进入答案不同 |
| 分段控件 | 震动/字体/自动下一题用**分段控件**，不用开关（三态表达不了「关闭」） |
| 文案不暴露数字 | 震动「关闭/轻微/明显」，字体「标准/大/特大」 |
| 家长门「返回」 | 永远可用，**不能把孩子困在弹窗里** |

---

## 8. LEADERBOARD 场景

**坐标**：见 UI_SPEC §16
**实现**：`miniprogram/scenes/leaderboard.js`

| 项 | 内容 |
|---|---|
| **进入条件** | RESULT 排行榜入口 |
| **退出条件** | 「返回」 |
| **数据依赖** | `Cloud.getLeaderboard()`、本地近 10 局记录 |

**三级状态 + ★ v1.2 关键顺序**：

```pseudo
function enterLeaderboard()
    // ★★ 判断顺序必须是「先判数据可用性，再决定要不要骨架屏」，不能反过来
    snap = Cloud.getLeaderboard()
    if snap === null:
        fsm.go('LOCAL', localTop10())    // ★ 直接进，不播骨架屏（此分支禁止 showSkeleton）
        return
    else:
        fsm.go('LOADING'); startTimer(1500)   // v2 才可能走到
```

| 状态 | 进入条件 | 表现 | 计时 |
|---|---|---|---|
| `LOADING` | `snap != null` | 骨架屏 5 行占位块，呼吸 0.5↔0.8 / 900ms | ★ 用 `dtReal`（真实时间，不受 `timeScale` 影响） |
| `CLOUD` | ≤1.5s 且有云端数据 | 正常列表 | — |
| `CACHED` | >1.5s 但有影子缓存 | 列表 + 顶部 32px 琥珀条 | — |
| `LOCAL` | 无云端数据 / `snap === null` | 列表 + 顶部说明卡 | — |

**v1 结论**：`getLeaderboard()` 恒 null → **v1 排行榜是零等待界面**（首帧即最终态，无转圈无闪烁），同时满足 UI_SPEC §9 G6「首屏 <1.5s」。但三级状态机仍要完整实现（v2 不用重写）。

**`local` 态说明卡文案**（定稿，语气中性不制造缺失感）：

> 「云端榜单还没开好，先看看自己」
> 「成绩只存在这台设备上」

| **验收点** | 说明 |
|---|---|
| 零等待 | v1 首帧即最终态 |
| 无空白页 | 0ms / 1.4s / 1.6s / 5s 截图均无空白、无转圈 |
| `verified == false` | **不显示任何标记**（不加"未验证"——那会暗示排名不可信） |
| `local` 态行内容 | 显示时间 + 分数 + 「本地」，**不含头像、不含昵称** |
| 1.5s 计时 | 用真实时间，慢动作演出中不延长 |

---

## 9. 三个 Overlay

### 9.1 CONSENT — 首次启动家长同意弹层

**坐标**：见 UI_SPEC §17
**实现**：`miniprogram/ui/consentModal.js`

| 项 | 内容 |
|---|---|
| **进入条件** | `privacyNoticeVersion < CONSENT_VERSION` 且非 `REVOKED` |
| **退出条件** | 「暂不开启」**或**「确认并开始」 |
| **状态** | **三态**：`UNDECIDED` / `GRANTED` / `REVOKED`。`REVOKED` 是终态，不重复弹层 |

**★ 三条不可违反的红线**：

| # | 红线 | 理由 |
|---|---|---|
| 1 | 两个复选框**默认全部不勾选** | 《个保法》第 29 条要求单独同意 |
| 2 | 「暂不开启」与「确认并开始」**视觉权重完全对等**（同尺寸/同圆角/同字号，只差填充色） | 撤回不得比同意更难。做成弱化按钮 = 变相阻碍撤回 = **不合规** |
| 3 | **不做倒计时、不做自动跳转、不做"不开启就玩不了"的挡板** | 家长向弹层，不设进度压力 |

**撤回流程（无挽留）**：

```pseudo
function revokeConsent(item)
    Cloud.disable(item)      // 1. 立即停止上传
    // 2. ★ 不清除已有本地数据
    // 3. ★ 不弹任何"你确定要关闭吗"挽留弹窗（挽留 = 变相阻碍 = 不合规）
    // 4. 关闭动画 200ms，该行文字转 ink-300 + 删除线
```

### 9.2 PARENT_GATE — 家长门

见 §7。

**★ 三条**：① 必须在弹窗出现**之前**校验；② 算术题每次重新生成；③ 「返回」永远可用。

### 9.3 PAUSE — 暂停浮层

| 项 | 内容 |
|---|---|
| **进入条件** | GAME 内暂停条件 |
| **退出条件** | 继续 / 重开 / 回主页 |
| **数据依赖** | `settings.{mute,bgm,vibrateEnabled}` |

---

## 10. 设置项 → 影响面映射

**这张表是联调期的排查清单**：改了某个设置项，就去检查列出的所有位置。

| 设置项 | 影响模块 | 是否需要重建 |
|---|---|---|
| `leftHanded` | 键盘列序 / 答题位 / 算式区 | ★ 三步：重排 Layout + 标脏 L_STATIC + **重注册 HIT**（最容易漏） |
| `fontScale` | 算式字号 / 键盘数字 / 「第 N 问」/ 标签文字 / 结算大分数 | HUD 与数据条**不缩放** |
| `reduceMotion` | 10 项特效（见 FRONTEND_SPEC §14.1） | 立即生效，无重建 |
| `showTimerBar` | 软条是否绘制 | ★ v1.2：**不再移动键盘** |
| `vibrateIntensity` | 震动幅度 × 触觉类型 | 受年级上限压制 |
| `autoNextDelayMs` | 「下一题」按钮时序 | — |
| `mute` / `bgm` | 音频通道 | — |
| `difficultyOffset` | 生成器 DL + 难度微调器显示 | ★ 钳制在 `recompute()` 内 |
| `globalDifficultyOffset` | 同上 | 同上 |

**年级上限对设置的压制**（两张独立的压制表）：

| 压制 | 规则 |
|---|---|
| 震动 | `min(强度档位上限, 年级上限)`；1-2 年级上限 L2，5-6 年级 L3；`vibrateEnabled=false` 时全部归零 |
| 自动下一题延迟 | 按年级默认值预填，家长可改 |
| 字体 | 叠加后走三道钳制（见 FRONTEND_SPEC §14.1） |

---

## 11. 跨界面数据流

```pseudo
// 读：场景层读 → 传给 UI 组件的 render(params) —— UI 组件**不**直接读 data/
render(params):
    drawTitle(params.title)
    drawStars(params.mastery)

// 写：只能走 UI 事件 → 场景处理 → data 层
tap(段 k)
    → scenes/home.js 处理
    → data/progressModel.js 写入
    → SaveManager.commit('difficultyOffset')
    → emit(SETTINGS_CHANGED) → 由需要的模块订阅
```

**禁止的三种耦合**：

| 禁止 | 理由 |
|---|---|
| `ui/*` 直接 require `data/*` | UI 组件要能被 H5 预览单独复用；且避免"存档变了 UI 自己重绘"的隐式耦合 |
| `data/*` require `scenes/*` 或 `ui/*` | 会形成环 |
| `fx/*` 实现文件直接读 `MODE.reduceMotion` | 应在 `fx/index.js` 收口（CI 卡口） |

---

## 12. 全局验收点（跨界面）

| 类 | 验收点 |
|---|---|
| **首屏** | 冷启动 ≤1.5s 可交互（iPhone 6s / nova 3） |
| **包体** | 主包 ≤1.5MB（红线 4MB），`check-size.js` 通过 |
| **降级** | 资源加载失败 → 角色占位图兜底，**不白屏** |
| **低端机** | 粒子降级到 90 时帧率 ≥30fps |
| **左手模式** | 切 3 次无残影、命中区与视觉一致、无镜像文字 |
| **低刺激** | 关掉动效后**答对答错仍可区分** |
| **离线** | 全流程可玩；排行榜 v1 零等待走 local |
| **合规** | 首次弹层默认全不勾 / 两按钮权重对等 / B 组先拦 / 撤回无挽留 |

---

## 13. 文档维护约定

| 变更类型 | 更新哪份 |
|---|---|
| 坐标 / 色值 / 字号 / 文案 | **只改 UI_SPEC.md** |
| 界面跳转关系 / 状态机拆并 | 只改本文档 |
| 字段增删 | STORAGE_SPEC.md → 同步 UI_SPEC.md（如涉及展示）+ FRONTEND_SPEC.md（如涉及消费点） |
| 钳制规则 / 性能预算 / 算法 | 只改 FRONTEND_SPEC.md |

**冲突裁决**：任何坐标冲突以 `UI_SPEC.md` 为准。本文档出现具体数值即为笔误，应改为「见 UI_SPEC §x」。

**待补（骨架稿的已知缺口）**：

- [ ] 各界面的**界面内**状态转移细节（目前只到场景级）
- [ ] 首页 11 个可交互区的**优先级排序表**（重叠时的 z 序仲裁）
- [ ] 与 QA 的**验收演示脚本**逐屏对齐（UI_SPEC §10.3 目前只覆盖游戏主屏）
- [ ] 空态 / 边界态：无错题可复习、排行榜无记录、存档损坏、首次选定年级
