# 《星算速算家》前端架构与算法方案（FRONTEND_SPEC）

版本 v1.3 ｜ 作者：程前锦（前端开发专家）｜ 日期 2026-10-03（v1.3 对齐 UI_SPEC v1.3）
对应 PRD：`docs/PRD.md` v1.0
对应 UI：`docs/UI_SPEC.md` v1.3（**坐标基准 672×1280，本文所有坐标以该基准为准**）
对应流程：`docs/UI_FLOW.md` v0.1（界面跳转关系与状态机，**不含坐标**）

> **v1.3 变更摘要**：
> ① **包体红线解除**（R2 关闭）—— 实测主包 1.1MB / 角色 0.876MB，7 只角色全保留在主包；
> ② 吸收 `fontBoost`（1—2 年级字号 +2）与「1—2 年级隐藏最高分」；
> ③ 吸收「答错显示正确答案」6 阶段时序，**发现与 `feedLeft` 的时序冲突（R18）**；
> ④ **落地 `shared/__test__/layout-assert.test.js`（G1—G27 布局断言）**，已跑通，
>    **拦截到 1 处新冲突（R15 左手模式「第N问」压算式区）**；
> ⑤ 内存策略按 7 只常驻 ≈11MB 修订分级缓存。
技术栈：**原生 JavaScript（ES2017）+ 微信小游戏 Canvas 2D + WebAudio 合成，零第三方依赖、零构建步骤**

> **v1.1 变更摘要**：吸收 UI_SPEC 附录 A 的 5 个新增界面（难度微调器/复习页/排行榜页/设置页+家长门/首次启动家长同意弹层），新增 §14 章节（UI 咬合实现方案），并对 §2 目录结构、§4 状态机、§5 模块依赖、§6.5 难度推进、附录 B 配置表做了对应修订。新增的三条**强制钳制规则**（fontScale/DL/reduceMotion）写在 §14.1，标注为「不写会出线上事故」。

---

## 0. 阅读指引

| 章节 | 内容 | 给谁看 |
|---|---|---|
| 1 | 框架选型论证（小游戏 vs 小程序） | 主理人 / 决策者 |
| 2 | 完整目录结构（到文件级） | 全体开发 |
| 3 | 游戏主循环设计 | 引擎层开发 |
| 4 | 场景状态机 + 游戏内子状态图 | 引擎层 / 玩法开发 |
| 5 | 模块划分与依赖关系 | 全体开发（**必须先读，否则写循环依赖**） |
| 6 | **关键算法伪代码**（题目生成 / 输入判定 / 连击倍率 / 难度推进 / 时间压力） | 玩法开发（**照抄即可实现**） |
| 7 | 性能优化清单 | 引擎层开发 |
| 8 | 触摸输入处理 | 引擎层开发 |
| 9 | 素材加载与资源管理 | 引擎层 / 美术 |
| 10 | 跨端共享层设计 | 全体开发 |
| 11 | 微信小游戏工程配置 | 全体开发 |
| 12 | 后端接口契约（交给 backend-cloud-dev） | 后端开发 |
| 13 | 风险登记与验收清单 | 主理人 |
| **14** | **UI_SPEC 附录 A 咬合实现方案（v1.2）** | **全体开发** |
| 附录 A | 角色替换入口 | 美术 / 策划 |
| 附录 B | 全局配置速查 | 全体开发 |
| 附录 C | 变更记录与三方字段对照 | 全体开发 |

> **本文档不含完整实现代码**，只出架构与算法。所有伪代码均可直接翻译为 JS。

> **★ 三份文档的分工（v1.2 确立，避免重复劳动）**：
>
> | 文档 | 只写什么 | 不写什么 |
> |---|---|---|
> | `UI_SPEC.md` | **坐标、色值、字号、文案定稿、组件规格** | 代码怎么写 |
> | `UI_FLOW.md` | **界面跳转关系、状态机、进入退出条件、数据依赖** | 任何具体坐标数值 |
> | `FRONTEND_SPEC.md`（本文） | **架构、算法伪代码、模块依赖、性能预算、钳制实现** | 具体坐标与色值（引用 UI_SPEC） |
> | `STORAGE_SPEC.md` | 存档 schema、接口契约、防刷规则 | UI 布局 |
>
> **冲突裁决**：坐标冲突以 `UI_SPEC.md` 为准。`UI_FLOW.md` 出现具体数值即为笔误。

---

## 1. 框架选型论证：微信小游戏 vs 小程序

### 1.1 结论

**采用微信小游戏（minigame）形态**。渲染层用小游戏原生的全屏上屏 Canvas 2D，UI 全部 Canvas 自绘，仅在必要时（无）使用原生组件。

### 1.2 逐维度对比

| 维度 | 微信小游戏 Canvas | 小程序 Page + Canvas | 胜出 | 理由 |
|---|---|---|---|---|
| **渲染能力：粒子迸射** | 一张上屏 Canvas，`drawImage` 逐粒子 blit，1k 粒子压力可控 | Canvas 组件内绘制，但受 WXML 节点同层渲染限制，`<canvas>` 外无法叠原生层 | **小游戏** | 我们的全部 FX 都在一张画布内完成，不需要与原生组件混排 |
| **渲染能力：屏幕震动** | 直接 `ctx.translate(dx,dy)` 整屏偏移，零成本 | 同样可以（Canvas 内 translate），但外层 WXML 节点不跟随移动，会出现"画布移了、遮罩没移" | **小游戏** | 全屏只有一张画布，震动天然整体 |
| **渲染能力：裁剪** | `ctx.clip()` + 离屏 canvas 自由嵌套 | 单 canvas 组件内 `clip` 可用，但无法对整个页面做区域裁剪 | **小游戏** | 关卡切屏彩带需要全屏裁剪 |
| **离屏渲染** | `wx.createCanvas()` 第二次调用起返回**离屏** canvas；`wx.createOffscreenCanvas({type:'2d'})`（2.16.1+） | `wx.createOffscreenCanvas` 需 2.16.1+，且 `type` 必须与 `getContext` 一致 | **小游戏** | 离屏层是 60fps 的前提，两边能力接近 |
| **包体限制** | 主包 **≤ 4MB**，主包+分包 **≤ 30MB**，单个普通分包不限 | 主包 **≤ 2MB**，总包 ≤ 20MB | **小游戏** | 我们的角色 PNG 是大头，小游戏多一倍的启动包空间 |
| **启动耗时** | 主包下载即启动，无页面框架、无组件树、无 `setData` 序列化 | 需启动小程序框架、初始化逻辑层与渲染层，弱机首屏常 > 1.5s | **小游戏** | 小游戏冷启动无框架税，实测低 300–600ms |
| **开发效率（本研究）** | 直接操作像素，UI 自由度 100%；无 `setData` 心智负担 | 写 Canvas 组件要处理 `type="2d"`、组件生命周期、`this.triggerEvent` | **小游戏** | 全自绘场景下，小程序那套抽象是纯负担 |
| **开发效率（若要做运营后台）** | 弱：无页面路由、无组件库 | 强：可挂 Vant Weapp 做活动页 | 小程序 | 但本项目运营页只有"排行榜/结算榜"，用 Canvas 弹层即可，不必开小程序 |
| **手感延迟** | 触摸事件直接进游戏逻辑层；音频 WebAudio 可在首帧同步播放 | 触摸需跨逻辑层→渲染层，再由合成层派发 touch 事件，多一跳 | **小游戏** | 3 秒一题的爽快循环对按键→音效延迟极敏感（阈值约 80ms） |
| **后台/恢复** | `canvas.requestAnimationFrame` 切后台**自动停**，回前台自动恢复；配 `wx.onHide/onShow` 处理存档 | `requestAnimationFrame` 与 Page 生命周期绑定，必须手动 `cancelAnimationFrame` | 平手 | 两边都要写 onHide 存档 |
| **风险：审核与合规** | 小游戏需软著/备案（个人主体可走"普通小游戏"备案）；虚拟支付受限，广告需开通流量主 | 小程序需软著，但无版号要求 | 小程序 | ⚠️ **这是小游戏唯一的实质劣势**，见 §13 风险 R1 |
| **风险：设备覆盖** | 需微信 8.0+ / 基础库 2.x | 覆盖更广（含低版本微信的老设备） | 小程序 | 目标用户是"家长手机"，机型普遍较新，可接受 |

### 1.3 决策理由（正式）

选 **小游戏**，三条核心理由：

1. **渲染天花板更高，且是必需而非可选**。PRD §3.3 要求"环形冲击波、屏幕震动按连击增强、粒子迸射、彩带飘落、分数跳动数字滚动"。这五项在单张全屏 Canvas 上是 30 行代码，在小程序里要么退回 CSS 动画（受 WXML 节点限制、层级穿插），要么在 Canvas 里手写全部合成。我们选最高的那条路。
2. **包体是硬约束，当前素材已超**。实测现有 7 张角色 PNG 合计 **4.83MB**（见 §9.4），已超小游戏主包 4MB 上限但**未超小程序主包 2MB 更早触顶**。小游戏给了 2 倍余量做压缩缓冲，容错更高。
3. **手感延迟是本产品的核心竞争力**。3 秒一题的连击爽感建立在"按下即响"的 80ms 感知窗口内。小游戏省掉的框架跳转是实打实的。

**放弃的备选方案与降级预案**：
- 若审核周期或主体资质卡住 → 保留全部 `shared/` + `core/` + `scenes/` + `ui/` + `fx/` 代码不变，仅新增一个 `miniprogram-page/` 适配壳（用 `<canvas type="2d">` 承载同一个 `app.js`）。此预案成本 = 1 人日，故**架构上必须先做跨端共享层（§10）**，这是不为"现在"做，而是为"降级预案"做的。

### 1.4 包体红线（**v1.3 实测已达标，R2 解除**）

| 项 | 上限 | **v1.3 实测** | 余量 |
|---|---|---|---|
| 小游戏主包 | 4 MB | **1.1 MB** | **2.9 MB** ✅ |
| └ 角色目录（7 只全在主包） | — | 0.876 MB | — |
| └ 代码 + UI 位图 | — | ≈ 0.22 MB | — |
| 主包 + 分包 | 30 MB | 1.1 MB（**无分包**） | — |
| 首屏可交互 | ≤ 2s（弱机 ≤ 3s） | ≤ 1.2s | ✅ |
| dpr 适配 | 1~3 | 封顶 2.5 | ✅ |

**7 只可选主角全部保留在主包**。v1.1 曾建议"只放 3 只、其余分包"，
**该建议已作废** —— 那是把源文件体积（5.31MB）误当打包体积导致的过度保守，
会白白牺牲"4 只可选主角"这个卖点（详见 §9.4）。

`check-size.js` CI 卡口**继续保留**作为防回归护栏：包体现在达标不代表以后达标。

---

## 2. 完整目录结构（到文件级）

> 约定：文件均使用 **CommonJS**（小游戏环境 `require` 天然支持，H5 侧用一个 20 行的 `require` shim 映射到 `window` 命名空间，保持零构建）。

```
star-math-studio/
│
├─ shared/                          ★ 跨端共享核心：零平台 API、纯逻辑、可单测、可跨端
│  ├─ config.js                     全局配置唯一入口：年级难度表、DL 档位、倍率档、时间参数、配色 token、每关题数。改难度/换皮只改这里
│  ├─ fsm.js                        通用有限状态机：注册 enter/exit/update/render/touch 钩子、状态栈、互斥与历史跳转
│  ├─ events.js                     事件名常量表 + 事件总线契约（on/off/emit），杜绝拼写错误
│  ├─ scoring.js                    计分：基础分 × 连击倍率 × 速度奖励、分数显示插值、分数滚动动画数据
│  ├─ difficulty.js                 DL 推进：连击升档、分数升档、连续答错保底降档、迟滞(hysteresis)策略
│  ├─ combo.js                      连击累积、倍率档位查询、连击保护(grace)窗口、连击跳档特效事件
│  ├─ timer.js                      关卡倒计时（tick/加时/结转）、单题软限时、超时判定
│  ├─ question/
│  │  ├─ opTable.js                 DL → (数值范围 / 运算类型集合 / 小数位上限 / 干扰强度) 映射表，纯数据
│  │  ├─ generator.js               题目生成器：answer-first 反向构造法 + 心算友好度筛选 + 避免重复
│  │  └─ validator.js               输入串规范化（定点整数化）、定长/前缀/冲突三态判定、退格与槽位切换
│  ├─ util/
│  │  ├─ num.js                     定点整数工具：parseScaled / formatScaled / cmpScaled / digitCount（无浮点误差）
│  │  ├─ rng.js                     mulberry32 可复现随机数（带 seed，便于复现 bug 与题库回放）
│  │  ├─ easing.js                  缓动函数集：outCubic / outBack / outElastic / outBounce / shake 曲线
│  │  └─ letters.js                 中文数字/数字转汉字（仅用于"伙伴台词"文案，可选）
│  └─ __test__/                     纯 Node 断言脚本（`node shared/__test__/run.js`），无需测试框架
│     ├─ run.js                     测试入口：聚合所有 case
│     ├─ num.test.js                 定点数解析/格式化/比较的边界 case
│     ├─ generator.test.js          生成器不变量：答案非负、整除、心算友好度、DL 范围
│     └─ validator.test.js          输入判定的三态逻辑穷举（暴力对拍）
│
├─ miniprogram/                     ★ 微信小游戏工程（此目录整体作为小游戏项目根目录上传）
│  ├─ game.js                       小游戏入口：创建上屏 canvas、装配 platform、new App 启动
│  ├─ game.json                     小游戏配置：竖屏、状态栏、分包、超时
│  ├─ project.config.json           开发者工具工程配置：appid、ES6 转码、忽略目录
│  ├─ project.private.config.json   本地私有配置（真机调试开关），加入 .gitignore
│  │
│  ├─ platform/                     ★ 平台适配层：把微信 API 包装成 shared 定义的 Platform 接口
│  │  ├─ wx.js                      Platform 接口的微信实现（canvas/存储/触摸/震动/生命周期/广告/分享）
│  │  ├─ audio.js                   WebAudio 合成器：BGM 循环乐段 + 音效包络（上行音阶/低鸣/tick/心跳）
│  │  └─ storage.js                 wx.setStorageSync 封装 + 存档 schema 版本迁移（v1→v2 字段增删）
│  │
│  ├─ data/                          ★ v1.1 新增：存档与本地数据（对齐后端 STORAGE_SPEC §9.2）
│  │  ├─ saveManager.js               存档单例：boot() 同步加载、state 全局只读、commit() 合并写、脏标记节流
│  │  ├─ progressModel.js             GradeProgress 计算：mastery 星级、difficultyOffset 持久化、bestDl 追踪
│  │  ├─ mistakeBook.js               错题本：本地增删改查、getDueItems(grade, limit)、按 fingerprint 去重
│  │  ├─ collection.js                货币与收藏：stars/coins/title/nickname/avatarId 读写与增减
│  │  └─ cloud.js                     云端占位：v1 全部方法 return null（getLeaderboard 恒 null，见 §14.5）
│  │
│  ├─ core/                         ★ 引擎层：与玩法无关的运行时
│  │  ├─ app.js                     装配根：依次初始化 platform → assets → viewport → loop → scenes，按序启动
│  │  ├─ loop.js                    固定步长累加器主循环：rAF 驱动、逻辑步 1/60s、最多 5 次追帧、时间缩放、可见性暂停
│  │  ├─ viewport.js                竖屏适配：dpr 封顶、safeArea 内缩、设计分辨率 750×1334 双向映射、resize 重排
│  │  ├─ ticker.js                  全局节拍器：注册每帧回调，按插入序执行，回调数组原地复用不重建
│  │  ├─ input.js                   触摸 → 命中区域分发：坐标映射、多点触控、SLOP 防滑、按压态
│  │  ├─ sceneStack.js              场景栈：push/pop/replace + 推入/弹出转场动画
│  │  └─ assets.js                  资源管理器：manifest、并发加载(4)、进度、失败占位、懒加载 API
│  │
│  ├─ render/                       ★ 渲染层：把绘制拆成"层"以复用离屏位图
│  │  ├─ renderer.js                主渲染器：4 层合成（背景层/静态层/动态层/UI 层），层间 blit
│  │  ├─ layer.js                   离屏层封装：懒创建、脏标记(dirty)、resize、透明度
│  │  ├─ drawList.js                绘制指令批处理：收集 {op,args} 后统一执行，减少 ctx 状态切换
│  │  ├─ textCache.js               文本测量 LRU 缓存 + 数字图集（0-9/×/./+ 用位图 blit 替代 fillText）
│  │  ├─ shapeCache.js              圆角矩形 / 星形 / 彩带三角 / 光晕的位图缓存（避免每帧建 Path）
│  │  └─ dpr.js                     dpr 计算与封顶：dpr = min(pixelRatio, 2.5)，位图预缩放尺寸换算
│  │
│  ├─ ui/                           ★ UI 组件层：每个文件对应 PRD 里的一层或一个控件
│  │  ├─ theme.js                   从 shared/config 派生的颜色/字号/圆角/间距 token + 安全区偏移
│  │  ├─ hud.js                     L1 顶部 HUD：关卡进度点阵、倒计时、总分
│  │  ├─ databar.js                 L2 数据条：正解 N/10、失误 N、连击 N、倍率徽章
│  │  ├─ banner.js                  L3 关卡横幅：EX N 斜切彩带 + 大标题 + 入退场动画
│  │  ├─ stage.js                   L4 角色台：公仔待机呼吸、跳跃、待机彩带
│  │  ├─ questionCard.js            L5 题目白卡：题型标签、"第 N 问"、竖排算式、右侧红圈答题位（支持商余双槽）
│  │  ├─ keypad.js                  L6 数字键盘：4 行布局、按下态、连击彩色高亮、答案位数提示
│  │  ├─ comboBadge.js              连击徽章：`5 コンボ` + `×1.25` 斜切小卡 + 护盾环
│  │  ├─ button.js                  通用圆角大按钮（≥88rpx 逻辑高），带按压缩放与禁用态
│  │  ├─ progress.js                加载进度条（首屏用，带百分比数字）
│  │  ├─ toast.js                   轻提示气泡："算得真快！""再快一点点！"
│  │  ├─ consentModal.js       v1.1：首次启动家长同意弹层（§14.6）；双按钮视觉权重严格对等
│  │  ├─ parentGate.js          v1.1：家长门弹层（算术题 / PIN 双模式，§14.4）
│  │  ├─ settingsPage.js        v1.1：设置页 A/B/C 三分组容器 + 家长门路由（B 组才拦截）
│  │  ├─ segmentedControl.js    v1.1：分段控件（震动强度/字体/自动下一题，0 是"关闭"必须三态）
│  │  ├─ difficultyTuner.js     v1.1：7 段难度微调器 + 区间预览文案（不暴露 ±数字）
│  │  ├─ masteryStars.js        v1.1：熟练度 5 星组件（与关卡 3 星视觉区分，防混淆）
│  │  ├─ leaderboardPage.js     v1.1：排行榜三级状态机 UI（cloud/cached/local，1.5s 强制降级）
│  │  ├─ reviewBar.js           v1.1：复习页顶部专用条（组内 5 点进度，替代 HUD）
│  │  ├─ reviewAnswerArea.js    v1.1：复习三种答题区（认一认⌀180 / 练一练3选1 / 考一考键盘）
│  │  ├─ handwritingTrace.js    v1.1：手写描红动画（lineDashOffset 递减，单次遍历）
│  │  └─ coinBar.js             v1.1：主页星星/金币余额条（§18.1 y20—76）
│  │
│  ├─ scenes/                       ★ 场景层
│  │  ├─ boot.js                    启动场景：加载资源 → 进度条 → 预热 BGM → **首次启动检查家长同意** → 转 home
│  │  ├─ home.js                    主页：货币条+头像昵称称号+Logo+年级卡3×2+熟练度条+难度微调器+CTA+角色行+错题本气泡
│  │  ├─ game.js                    游戏场景：内含子状态机（INTRO/ASK/INPUT/JUDGE/LEVEL_UP/TIME_UP/GAME_OVER）
│  │  ├─ review.js              v1.1：**独立复习场景**（★ 不可复用 game 加 isReview 分支，理由见 §14.3）
│  │  ├─ result.js                  结算页：总分/最高分/正确率/最大连击/熟练度分区/货币行/伙伴展示/再来一局
│  │  ├─ leaderboard.js        v1.1：排行榜场景（3 段 Tab + 三级状态，§14.5）
│  │  ├─ settings.js           v1.1：设置场景（A 孩子设置 / B 家长设置 / C 同意记录）
│  │  └─ pause.js                   暂停浮层（覆盖在 game 之上，非独立场景）：继续/重开/静音/震动开关/回主页
│  │
│  ├─ fx/                           ★ 特效层：全部基于对象池，零 GC 压力
│  │  ├─ index.js               v1.1：★ 特效层统一入口。**所有对外特效函数在此做 reduceMotion 拦截**
│  │  │                            （对应 UI_SPEC §19.3：不在每个特效内部写 if，避免漏）
│  │  ├─ pool.js                    通用对象池：预分配 + alive 位图游标 + swap-remove（不用 splice）
│  │  ├─ particles.js               粒子发射器：星星迸射、彩带屑、失误灰烬、金币下落（数量受 §19.3 ×40% 缩放）
│  │  ├─ shockwave.js               连击环形冲击波（半径 easeOut + 透明度线性衰减；低刺激走固定⌀180 静态环）
│  │  ├─ shake.js                   屏幕震动：振幅 = f(combo) × 衰减包络 × 年级上限，低刺激下位移强制 0
│  │  ├─ floatText.js               飘字：分数跳动、加时 "+1.5s"、倍率跃升 "×1.5!"（低刺激下**保留**，是必要反馈）
│  │  ├─ confetti.js                关卡切屏彩带：从顶部斜向飘落的三角旗（低刺激下 0 条，改横幅下移 80px）
│  │  ├─ flash.js                   闪光：升级白闪、答错红闪、连击高光扫过（低刺激下高光扫过不执行）
│  │  └─ characterAnim.js      v1.1：角色动作统一层，按 reduceMotion 切换「位移式」/「原地缩放式」两套曲线
│  │
│  ├─ assets/                       ★ 资源目录（= 主包体积，必须压到 ≤1.5MB）
│  │  ├─ characters/                角色 PNG —— **角色替换入口**（详见 shared/characters.js 映射表）
│  │  │  ├─ char_bunny_star.png     兔耳小人·举星星（默认主角，答对/庆祝）
│  │  │  ├─ char_bunny_jump.png     兔耳小人·跳跃（连击升级）
│  │  │  ├─ char_bunny_sleep.png    兔耳小人·闭眼（待机）
│  │  │  ├─ char_rabbit.png         白色小兔（可选主角）
│  │  │  ├─ char_cat.png            白色小猫（可选主角）
│  │  │  ├─ char_bear.png           蓝色小熊（可选主角）
│  │  │  └─ char_chick.png          黄色小鸡（可选主角）
│  │  ├─ ui/                        UI 位图：键帽底、九宫格白卡底、圆点、倍率徽章底、图标
│  │  └─ bg/                        背景：底色渐变（代码生成）+ 彩带纹理（位图，可选）
│  │
│  └─ styles/
│     └─ theme.js                   UI 主题装配：把 shared/config 的 token 转成绘制常量（可选，见 note）
│
├─ web/                             ★ H5 预览版（零依赖，双击 index.html 即跑，用于快速验收 UI/算法）
│  ├─ index.html                    宿主页：居中 9:16 画布 + 加载进度 + 一行说明 + 键盘映射表
│  ├─ boot.js                       H5 入口：创建 DOM canvas、装配 dom platform、new App 启动
│  ├─ require-shim.js               20 行 CommonJS shim：把 require 映射到 window.starMath 命名空间
│  ├─ platform/
│  │  ├─ dom.js                     Platform 接口的浏览器实现（canvas/内存存储/Pointer Events/无震动）
│  │  └─ audio.js                   Web Audio API 合成（与小游戏版同算法、不同调用）
│  └─ README.md                     H5 与小游戏差异清单（震动不可用、无广告、无分享）
│
├─ tools/                           ★ 开发辅助脚本（不进包）
│  ├─ check-size.js                 遍历统计主包/分包体积，超 4MB 报警并列出 Top20 大文件
│  ├─ gen-atlas.js                  图片图集生成：把 ui/ 下小图合成一张图集 PNG + 写 json 索引
│  └─ optimize-assets.sh            素材压缩流水线：pngquant + cwebp 一键出包内资源
│
├─ package.json                     仅 devDependencies（sharp / pngquant-bin），运行时零依赖
└─ docs/
   ├─ PRD.md                        产品需求文档
   ├─ FRONTEND_SPEC.md              本文档
   └─ UI_SPEC.md                    UI 视觉规范（ui-designer 提供）
```

### 2.1 目录设计的三条硬规则

1. **`shared/` 铁律**：目录下任何文件**不得出现** `wx.`、`document.`、`window.`、`navigator.` 字符串。用 `tools/check-purity.js` 做 CI 检查，违反直接退出码 1。这是跨端复用的唯一保障。
2. **`platform/` 是唯一允许直接调用 `wx.*` 的游戏侧目录**。其他任何文件要碰平台能力，必须经由 `core/app.js` 注入的 `platform` 对象。
3. **`miniprogram/assets/` 之外不放资源**。任何在开发目录里的图，必须经过 `tools/optimize-assets.sh` 落到 `assets/` 才能被引用，禁止直接引用 `../../analyze/*.png`。
4. **★ v1.2 新增第 4 条硬规则**：`fx/` 目录下的**任何特效实现文件不得直接读 `MODE.reduceMotion`**，只能在 `fx/index.js` 收口。理由与检查脚本见 §14.1。

### 2.2 CI 卡口脚本清单（`tools/`，全部退出码 1 即失败）

| 脚本 | 检查什么 | 违反后果 | 关联风险 |
|---|---|---|---|
| `layout-assert.test.js` | ★ v1.3 **已落地并跑通**：G1—G27 布局几何 / 镜像 / 字号 / 对比度断言（38 条） | 元素重叠、左手模式叠字、对比度不足 | **R15** |
| `check-purity.js` | `shared/` 下无 `wx.`/`document.`/`window.`/`navigator.` | 跨端复用失败 | R10 |
| `check-reduce-motion.js` | `fx/` 下除 `index.js`/`characterAnim.js`/`mode.js` 外不读 `MODE.reduceMotion` | 低刺激模式失效 → 可用性事故 | R13 |
| `check-size.js` | 主包 ≤ 4MB（**v1.3 实测 1.1MB ✅**），超限即失败 | 无法上传 | R2（已解除，保留作护栏） |
| `check-assets-blacklist.sh` | 确认 `char_styleguide` 未进包 | 误打进包 +0.78MB | R2 |
| `check-geometry.js` | 已并入 `layout-assert.test.js` G1—G8（不单独存在，避免两处几何定义漂移） | 元素重叠 | R15 |
| `fontClamp.test.js` | 算式字号 ≥ `基准 × 0.92`（★ v1.3 起基准含 `fontBoost`） | 高年级字变小 / 低年级 boost 失效 | R14 / R16 |
| `loadSubpackage` grep | ★ v1.3 新增：代码内**无** `loadSubpackage` 调用 | 无谓的分包逻辑（本项目无分包需求） | — |

**运行方式**（零依赖，Node 直接跑）：

```bash
node shared/__test__/layout-assert.test.js    # 布局断言，退出码 1 = 有 FAIL
node shared/__test__/run.js                   # 全部单测（数字/生成器/判定/布局）
```



---

## 3. 游戏主循环设计

### 3.1 设计目标

| 目标 | 方案 |
|---|---|
| 不同帧率下手感一致（60Hz / 90Hz / 120Hz 屏、弱机 30fps） | **固定步长累加器**：逻辑固定 1/60s，渲染每帧一次 |
| 掉帧不"瞬移" | 单帧最多追 5 步（`MAX_STEPS=5`），超出的时间丢弃并记账 |
| 慢动作 / 加速演出 | `timeScale` 统一缩放 dt，影响所有系统 |
| 切后台不"炸帧" | `onHide` 停循环 + 重置时间基准；`onShow` 首帧 dt 强制为 0 |
| 长时间运行不"越跑越慢" | dt 上限钳制 + 所有更新用 dt 增量（无累积状态） |

### 3.2 主循环伪代码

```pseudo
// ===== miniprogram/core/loop.js =====
const STEP_MS      = 1000 / 60      // 逻辑固定步长
const MAX_STEPS    = 5              // 单帧最多追 5 步，防死亡螺旋
const MAX_DT_MS    = 250            // dt 硬上限，超出视为异常（切后台/断点）
const TAB_DT_MS    = 16             // 切后台回来首帧的 dt（等于 1 步，几乎无感）

function Loop(opts) {
  this.raf        = opts.raf          // 注入：小游戏用 canvas.requestAnimationFrame，H5 用 window.rAF
  this.caf        = opts.caf
  this.onStep     = opts.onStep       // (dtSeconds) => void   逻辑更新
  this.onRender   = opts.onRender     // (alpha) => void       渲染（alpha 用于插值）
  this.timeScale  = 1.0               // 时间缩放：0=暂停 1=正常 0.35=慢动作
  this.rafId      = 0
  this.acc        = 0                 // 累加器（毫秒）
  this.lastTs     = 0
  this.running    = false
  this.needResetBase = true           // 下一次 tick 强制把基准设为当前时间
  this.droppedMs  = 0                 // 累计丢弃的 ms（性能观测用）
  this.frameCount = 0
  this.fpsSamples = new Float32Array(60); this.fpsIdx = 0   // FPS 环形缓冲（预分配）
}

Loop.prototype.start = function () {
  if (this.running) return
  this.running = true
  this.needResetBase = true            // start 时也要重置，避免用 0 当基准导致一次巨型 dt
  this.acc = 0
  this.rafId = this.raf(this._tick)
}

Loop.prototype.stop = function () {
  this.running = false
  if (this.rafId) { this.caf(this.rafId); this.rafId = 0 }
}

// 切后台 / 切回前台 / 从暂停恢复：都调它，保证 dt 不跳变
Loop.prototype.resetBase = function () {
  this.needResetBase = true
  this.acc = 0
}

Loop.prototype._tick = function (ts) {
  if (!this.running) return
  this.rafId = this.raf(this._tick)     // 立刻预约下一帧，末尾再处理异常也不会丢帧

  // ── 1. 计算原始 dt（毫秒）
  let rawDt
  if (this.needResetBase) { rawDt = TAB_DT_MS; this.lastTs = ts; this.needResetBase = false }
  else { rawDt = ts - this.lastTs; this.lastTs = ts }

  // ── 2. 异常钳制：切后台/断点/系统休眠回来的巨量 dt 一律丢弃
  if (rawDt < 0)     rawDt = 0
  if (rawDt > MAX_DT_MS) { this.droppedMs += rawDt - MAX_DT_MS; rawDt = MAX_DT_MS }

  // ── 3. 时间缩放 + 累加
  this.acc += rawDt * this.timeScale

  // ── 4. 固定步长追帧
  let steps = 0
  while (this.acc >= STEP_MS && steps < MAX_STEPS) {
    this.onStep(STEP_MS / 1000)        // 固定 1/60s 传给逻辑层 → 手感与帧率解耦
    this.acc -= STEP_MS
    steps++
  }
  if (steps === MAX_STEPS && this.acc >= STEP_MS) {
    this.droppedMs += this.acc          // 追不上就记账丢弃，绝不无限追
    this.acc = 0
  }

  // ── 5. FPS 采样（预分配环形缓冲，无每帧分配）
  if (rawDt > 0) {
    this.fpsSamples[this.fpsIdx] = 1000 / rawDt
    this.fpsIdx = (this.fpsIdx + 1) % this.fpsSamples.length
    this.frameCount++
  }

  // ── 6. 渲染（alpha = 累加器余量/步长，可用于插值，本项目 UI 动画用 easing 不用插值，保留接口）
  this.onRender(this.acc / STEP_MS)
}

// ── 掉帧降级：连续低 FPS 时由 app 决定降粒子/关阴影，见 §7.6
Loop.prototype.avgFps = function () {
  let sum = 0, n = 0
  for (let i = 0; i < this.fpsSamples.length; i++) if (this.fpsSamples[i] > 0) { sum += this.fpsSamples[i]; n++ }
  return n === 0 ? 60 : sum / n
}
```

### 3.3 时间缩放（timeScale）使用规范

`timeScale` **只允许**由 FX/演出层设置，且必须在演出结束时**强制复位为 1**。为防忘记复位，`timeScale` 的设置走一个带自动复位的接口：

```pseudo
// core/loop.js 附加
Loop.prototype.timeTween = function (targetScale, holdMs) {
  // 用一个内部补间在 120ms 内把 timeScale 平滑过渡到 targetScale，
  // 保持 holdMs 后恢复 1.0。返回 token，可提前取消。
  // 典型用法：答错 → timeTween(0.25, 260)；GameOver → timeTween(0.12, 900)
}
```

**重要**：`timer.js` 的关卡倒计时使用 **未缩放的 dt**（`onStep` 传入的固定步 × 不受 timeScale 影响的独立通道）—— 慢动作时倒计时不应该变慢。
实现方式：`Loop` 额外回调 `onRealStep(realDt)`，始终以 `STEP_MS/1000` 传入，不乘 timeScale。倒计时与连击计时用 `onRealStep`，物理/动画用 `onStep`。

### 3.4 生命周期挂接（微信小游戏）

```pseudo
// miniprogram/platform/wx.js
wx.onHide(() => {
  loop.stop()            // rAF 本来也会自动停，显式停是为了状态可控
  platform.saveAll()     // 同步存档（onHide 里有时间预算，必须同步写）
  app.emit('app_hide')
})
wx.onShow(() => {
  platform.audio.resume()          // 见下方坑位
  loop.resetBase()                 // 关键：回来第一帧 dt 归零，避免"瞬移"
  loop.start()
  app.emit('app_show')
})
wx.onMemoryWarning(() => {
  // 内存告警：清空所有离屏层 + 未用缓存，粒子池缩容
  renderer.purgeLayers()
  assets.evictUnused()
  fx.particles.shrinkTo(40)
})
```

> **坑位记录**：
> 1. `canvas.requestAnimationFrame` 在切后台**自动停止**，回前台自动恢复。显式 `stop()/start()` 是为了防"自动恢复时机早于我们的状态恢复"。若在 `onShow` 里只 `resetBase()` 不 `start()`，在部分机型上会出现永久黑屏。
> 2. WebAudio 的 `AudioContext` 在 iOS 上被系统挂起后，回来时处于 `suspended` 状态。必须在 `onShow` 里调 `audio.resume()`，否则切后台再回来**没有声音**（这是最高频的"用户投诉无声音"根因）。且首次 `resume()` 必须在一次用户触摸中调用（`game.js` 收到第一个 touchstart 时立即 resume 并打标记）。
> 3. `wx.getWindowInfo()` 在部分低端机不返回 `safeArea`，必须写兜底（见 §11.4）。

---

## 4. 场景状态机

### 4.1 场景层状态图

```ascii
                        ┌──────────────────────────────┐
                        │          BOOT                │
                        │  资源加载 / 进度条 / 预热音频 │
                        │  ★ 读存档 → 检查隐私同意版本  │
                        └──────────────┬───────────────┘
                                       │ 资源就绪
                        ┌──────────────┴───────────────┐
              未同意    │                             │  已同意
          （首次启动）  ▼                             │  或已撤回后再同意
              ┌────────────────────┐                  │
              │ CONSENT  同意弹层  │                  │  ★ 红线：无倒计时、
              │ （模态，不可跳过）  │                  │    无自动跳转、无挡板
              │ 暂不开启 │ 确认并开始│                 │
              └────┬───────────┬───┘                  │
                   │           │「暂不开启」也放行      │
                   └─────┬─────┘                      │
                         ▼                            ▼
                        ┌──────────────────────────────┐
          ┌─────────────▶│          HOME                │◀─────────────┐
          │              │ 货币条/头像称号/Logo/年级卡   │              │
          │              │ 熟练度条/难度微调/CTA/角色行  │              │
          │              │ 错题本气泡/家长入口          │              │
          │              └───┬───────────┬──────────┬───┘              │
          │                  │           │          │                  │
          │      tap 开始     │ 错题本气泡 │  齿轮    │  排行榜(结果页)  │
          │                  ▼           ▼          ▼                  │
          │      ┌──────────────┐ ┌──────────┐ ┌──────────┐        │
          │      │     GAME     │ │ REVIEW   │ │ SETTINGS │        │
          │      │ (7 态子状态机)│ │★独立视觉 │ │ A/B/C 分组│       │
          │      └──┬────────┬──┘ └────┬─────┘ └────┬─────┘        │
          │         │暂停     │结算     │复习组结束  │               │
          │         ▼        ▼         ▼            │               │
          │      ┌──────┐ ┌────────┐ ┌──────────┐  │               │
          │      │ PAUSE│ │ RESULT │ │REVIEW_END│  │               │
          │      │(覆盖)│ │        │ └────┬─────┘  │               │
          │      └──┬───┘ └───┬────┘      │再一组    │               │
          │         │         │回主页     └──────────┘               │
          │         └─────────┴───────────────────────►HOME──────────┘
          │
          └─ 结算页「练一练」入口（wrong>=3 时置顶，见 §14.7）→ REVIEW

  转场规则（v1.1 修订）：
  · BOOT→CONSENT      fade-in 240ms，模态层，scrim 0.72
  · CONSENT→HOME      fade 200ms（两个按钮视觉权重对等，不做"同意"更亮）
  · BOOT→HOME         fade-in 300ms（已同意路径，跳过弹层）
  · HOME→GAME         上滑推入 380ms（easeOutCubic），键盘跟随上移
  · HOME→REVIEW       淡入 260ms + **背景立即切换为纯色平涂**（无渐变转场）
  · GAME→RESULT       白闪 + scale 收缩 420ms（慢动作 0.3x 同步）
  · RESULT→REVIEW     淡入 260ms（从结算页"练一练"卡片进入）
  · RESULT→HOME       横向滑动 300ms
  · →SETTINGS         从右侧滑入 280ms；A→B 时**先过家长门**（模态，不入栈）
  · PAUSE             只是 game 场景上的一个 overlay flag，不入场景栈
  · CONSENT           同样是 overlay flag（在 home 之上），不进栈，保证"返回"不回到弹层

  ★ v1.1 关键决策：CONSENT / PARENT_GATE 都是 **overlay 而非独立场景**。
    理由：① 弹层是"打断当前流程做一次性确认"，语义上是覆盖；② 放进场景栈会导致
    「返回」键回到弹层，形成"退不出弹层"的死锁；③ 家长门必须在**进入 B 组之前**校验，
    作为页面路由的前置守卫比作为场景更自然。
```

**HOME 场景的 v1.1 布局要点**（坐标见 UI_SPEC §18.1，此处只记结构与状态）：

```pseudo
// home 的可交互元素注册表（命中区按 §8.2 规则注册，z 序从上到下）
// 顺序即 UI_SPEC §18.1 的 y 序，避免"层级穿插"
function layoutHome(save, ctx) {
    registerHit(currencyBar)              // y20—76   星星/金币余额（只读，不可点）
    registerHit(muteBtn)                  // (498,20,56,56)  静音开关 x上限554 < 胶囊578 ✓
    registerHit(avatarArea)               // 头像+昵称+称号（可点 → 称号墙 v2 占位）
    registerHit(gradeCards[6])            // 3×2，未解锁年级 disabled 且不响应
    registerHit(masteryBar)               // 熟练度条（只读）
    registerHit(difficultyTuner)          // 难度微调器（§14.2）
    registerHit(promptBubble)             // 「最高 DL 引导上抬」气泡，可选出现，7天1次
    registerHit(startCTA)                 // (96,880,480,110) 主 CTA
    registerHit(characterRow[4])          // 角色选择 4 只
    registerHit(mistakeBubble)            // 错题本气泡，数量 0 时**不显示数字 0**（UI_SPEC §15.5）
    registerHit(parentEntry)              // 「家长设置」+ 锁图标 → 触发家长门
    registerHit(leaderboardEntry)         // 从结算页进入
    registerHit(settingsEntry)            // 齿轮 → SETTINGS
}
```

### 4.2 游戏内子状态图（核心）

```ascii
                        ┌─────────────┐
        进入 GAME ──────▶│   INTRO     │ 关卡横幅「EX N」斜切彩带入场
                        │  0.9s       │ 角色跳跃 + BGM 起
                        └──┬───────┬──┘
                     0.9s │       │ 点击/超时跳过
                           ▼       │
                    ┌──────────────┴──┐
      ┌────────────▶│      ASK        │  出题（generator 生成）
      │             │  0.35s 入场动画  │  角色 → answer 姿态
      │             │  题目卡滑入     │  记录 questionStartRealTime
      │             └────────┬───────┘
      │                      │ 动画完成
      │                      ▼
      │             ┌─────────────────┐
      │             │      INPUT      │  等待玩家逐位输入
      │      ┌─────▶│                 │  · 按键 tick 音 + 键帽下沉
      │      │      │ 输入缓冲 inputBuf│  · 角色循环待机
      │      │      │ ⌫ 退格          │  · 单题软限时压迫（timer.js）
      │      │      └────┬───────┬────┘
      │      │           │       │
      │      │  判定:对   │       │  判定:错 / 软限时×1.8 超时
      │      │           ▼       ▼
      │      │    ┌────────────┐ ┌──────────────────┐
      │      │    │   JUDGE    │ │      WRONG       │
      │      │    │ 0.45s      │ │  0.7s            │
      │      │    │ 角色跳跃   │ │  失误+1          │
      │      │    │ 星星迸射   │ │  红闪 + 低鸣音   │
      │      │    │ 分数跳动   │ │  combo 归零      │
      │      │    │ 环状冲击波 │ │  DL 降档检查     │
      │      │    └─────┬──────┘ └────────┬─────────┘
      │      │          │                │
      │      │  本关正解数+1              │
      │      │          │                │
      │      │     ┌────┴─────┐          │
      │      │     │ 关卡判定  │◀─────────┘
      │      │     └────┬─────┘
      │      │          │
      │      │   ┌──────┴───────┬────────────────┐
      │      │   │ 正解<10      │ 正解==10         │ 倒计时<=0
      │      │   │ 继续下一题    │ 过关             │ 任意时刻
      │      │   │ 回到 ASK     ▼                  ▼
      │      │   └──────────▶┌─────────────┐  ┌──────────────┐
      │      │               │  LEVEL_UP   │  │   TIME_UP    │
      │      │               │  0.8s      │  │  0.15s 冻结  │
      │      │               │ EX N+1 横幅 │  │ timeScale .12│
      │      │               │ 彩带飘落   │  │ 倒计时 →0    │
      │      │               │ 时间结转   │  │ 角色 timeup  │
      │      │               └──────┬──────┘  └──────┬───────┘
      │      │                      │                │
      │      └──────────────────────┘         ═══════╪════ 一次运行内
      │                                                │   最多经过一次
      ▼                                                ▼
 ┌─────────────┐                              ┌──────────────┐
 │  GAME_OVER  │──────────────────────────────▶│  RESULT      │
 │ 白闪定格    │                              │  结算场景     │
 └─────────────┘                              └──────────────┘
```

### 4.3 状态钩子定义与进入/退出动作

统一由 `shared/fsm.js` 驱动。每个状态可注册 5 个钩子：

| 钩子 | 签名 | 说明 |
|---|---|---|
| `onEnter` | `(from, payload) => void` | 只在进入时跑一次。**副作用全部放这里** |
| `onExit` | `(to) => void` | 清理本状态独占资源、定时器、tween |
| `onUpdate` | `(dtReal, dtGame) => void` | 固定步长更新 |
| `onRender` | `(ctx, alpha) => void` | 绘制 |
| `onTouch` | `(evt, ctxObj) => boolean` | 返回 true 表示消费 |

**各状态 enter/exit 动作清单**：

| 状态 | onEnter | onExit |
|---|---|---|
| `INTRO` | 显示 `banner`（EX N）；角色 `jump` 姿态；`audio.bgm.play('level')`；`timer.armLevel(level)` | 隐藏 banner；角色回 `answer`；停止彩带 emitter |
| `ASK` | `question = generator.next(grade, dl, rng)`；`inputBuf.reset(question.answer)`；题目卡从下方 40px 滑入 + 透明度 0→1；`timer.startSoftLimit(question.softLimit)` | 题目卡滑出（如需） |
| `INPUT` | 角色 `answer` 姿态；`questionStartRealTime = timer.now()`；`combo.startGrace()` | 清除软限时压迫标记 |
| `JUDGE` | 正确：`scoring.award()` → 得分数值；`fx.starBurst(answerPos)`；`fx.shockwave(answerPos, combo)`；`fx.floatText(score)`；`fx.shake(combo)`；`combo.incr()`；`character.play('star')`；`audio.sfx('up', comboTier)`；`timer.addTime(timeBonus)`；`inputBuf.lock()` <br> 正确后若本关正解达 10 → `fsm.go('LEVEL_UP')` | `fx` 特效交由各自生命周期自管，不需清理；`character.play('idle')` |
| `WRONG` | `scoring.miss()`；`fx.flash('red')`；`fx.shake(low)`；`audio.sfx('miss')`；`combo.break()`；`difficulty.onWrong()`（连续 2 错降档）；`inputBuf.lock()` | HUD 失误数数字跳动动画复位 |
| `LEVEL_UP` | `level++`；`banner.show('EX ' + level)`；`fx.confetti.burst()`；`audio.sfx('levelUp')`；`timer.carryOver()`；`difficulty.rebase()`；`combo.keepOnLevelUp()` | 清 banner |
| `TIME_UP` | `loop.timeTween(0.12, 900)`；角色 `sleep`（timeup）；`timer.freeze()`；`audio.sfx('timeUp')`；`audio.bgm.fadeOut(900)` | 恢复 `timeScale = 1` |
| `GAME_OVER` | `gameover` 标记；`renderer.renderFinalFrame()` 定格当前画面到静态层 | —（由场景转场处理） |

**转场守卫**（防状态抖动，用一个"转场锁 + 延迟跳转"队列）：

```pseudo
// 防止 "JUDGE 里正解刚好到 10" 和 "倒计时同一帧归零" 同时触发导致跳两次
fsm.go(target, { delayMs })          // delayMs > 0 → 排入 pendingGo 队列
fsm.update(dtReal):
    if (transitionLock > 0) transitionLock -= dtReal * 1000
    if (pendingGo && transitionLock <= 0) { doGo(pendingGo); pendingGo = null; transitionLock = 120 }
```

> **强制规则**：`inputBuf.lock()` 之后（即判定完成前 450ms 内）**所有按键输入被丢弃**，只保留特效播放。这既防连点导致跳题，也天然形成了视频里那种"答完有 0.45s 反馈窗口再进下一题"的节奏。

---

## 5. 模块划分与依赖关系

### 5.1 依赖图（箭头 = 允许的 `require` 方向）

```ascii
                                     ┌─────────────────────────┐
    L6  入口                          │ miniprogram/game.js     │
                                     │ web/boot.js             │
                                     └───────────┬─────────────┘
                                                 │ 装配
                                                 ▼
    L5  场景    ┌────────────────────────────────────────────────┐
                │  scenes/boot  scenes/home  scenes/game          │
                │  scenes/result  scenes/pause                    │
                └───┬──────────────┬──────────────┬──────────────┘
                    │              │              │
                    ▼              ▼              ▼
    L4  UI     ┌────────────┐  ┌──────────┐  ┌──────────────┐
               │ ui/*       │  │ fx/*     │  │ core/loop    │
               │ 11 个组件  │  │ 7 个特效  │  │ core/ticker  │
               └──┬─────────┘  └────┬─────┘  │ core/input   │
                  │                 │        │ core/assets  │
                  │                 │        │ core/sceneStack
                  │                 │        └──────┬───────┘
                  ▼                 ▼               │
    L3  渲染  ┌────────────────────────────────────┴──────┐
              │ render/renderer  layer  drawList          │
              │ render/textCache shapeCache dpr           │
              └────────────────────┬─────────────────────┘
                                   │
                                   ▼
    L2  平台  ┌────────────────────────────────────────────┐
              │ platform/wx.js   platform/audio.js          │
              │ platform/storage.js                        │
              │ web/platform/dom.js  web/platform/audio.js  │
              └────────────────────┬───────────────────────┘
                                   │  (注入 Platform 接口)
                                   ▼
    L1  共享纯逻辑  ┌───────────────────────────────────────┐
                   │ shared/config      shared/fsm          │
                   │ shared/events     shared/scoring       │
                   │ shared/difficulty shared/combo         │
                   │ shared/timer      shared/question/*    │
                   │ shared/util/*                          │
                   └───────────────────────────────────────┘
```

### 5.2 无循环依赖的五条铁律

| # | 规则 | 违反后果 | 检查方式 |
|---|---|---|---|
| R1 | **只能向下依赖**：`scenes → ui/fx/core → render → platform → shared`。任何 `core/*` 不得 `require` 任何 `ui/*`、`fx/*`、`scenes/*` | 循环 require 导致模块部分初始化为 `undefined` | Grep 检查 |
| R2 | **同层横向禁止直接 require**。`ui/hud.js` 需要 `ui/questionCard.js` 的样式时，**不得** require，应通过 `ui/theme.js`（同层唯一被允许的"公共叶节点"）取值 | 横向环（a→b→a） | 构图检查 |
| R3 | **反向通信只用事件**。`fx` 不知道 `scenes` 存在；`fx` 发出 `fx:burst` → `scenes/game.js`（唯一订阅者）决定要不要转场。`shared/events.js` 集中定义事件名 | 隐式循环依赖 | 架构评审 |
| R4 | **`shared/` 零平台 API**。只接受纯数据入参、返回纯数据/布尔 | 跨端复用失败 | `tools/check-purity.js` CI |
| R5 | **平台能力一律注入**。`core/*` 不 `require('platform/wx')`，而是从 `app.js` 构造时传入的 `this.platform` 取。`web` 与 `miniprogram` 各自注入自己的实现 | 换壳成本飙升 | Grep `wx.` 只允许出现在 `platform/wx.js` |

### 5.3 模块清单：纯逻辑 vs 依赖平台

**A 类 — 纯逻辑（零平台 API，零 Canvas API，可单元测试、可跨端复用）**

| 模块 | 职责 | 单测要点 |
|---|---|---|
| `shared/config.js` | 全部可调参数 | — |
| `shared/util/num.js` | 定点整数解析/格式化/比较 | 边界：`0`、`0.00`、`1000000`、`1.10` vs `1.1` |
| `shared/util/rng.js` | 可复现随机 | 同 seed 同序列 |
| `shared/util/easing.js` | 缓动 | 端点值 f(0)=0 f(1)=1 |
| `shared/fsm.js` | 状态机 | enter/exit 各调一次、跳转锁 |
| `shared/events.js` | 事件名 | — |
| `shared/question/opTable.js` | DL→题型映射（纯数据） | 每个 DL 的题型都可达 |
| `shared/question/generator.js` | 题目生成 | **不变量：答案非负、有限小数、心算友好、无连续重复** |
| `shared/question/validator.js` | 输入判定 | 穷举对拍 |
| `shared/combo.js` | 连击/倍率/护盾 | 档位边界 4/5/9/10/19/20/30/50 |
| `shared/scoring.js` | 计分 | 倍率与速度奖励叠加顺序 |
| `shared/difficulty.js` | DL 推进/迟滞 | ★ v1.1：三项来源 base+manual+global，钳制在 recompute 内 |
| `shared/timer.js` | 倒计时/软限时 | 加时结转不超上限 |

**B 类 — 纯逻辑 + Canvas API（跨端通用，H5 与小游戏都可跑）**

`core/loop.js`（`raf/caf` 注入）、`core/ticker.js`、`core/sceneStack.js`（转场只产出 `{progress}` 数据，绘制交给 render）、`render/*`（除 `dpr.js` 需注入 windowInfo）、`ui/*`、`fx/*`（除 `platform/vibrate` 调用需注入）。

**C 类 — 强平台依赖（只在 `platform/` 与入口）**

`platform/wx.js`（`wx.*` 全部）、`platform/audio.js`（`wx.createWebAudioContext`）、`platform/storage.js`（`wx.setStorageSync`）、`web/platform/dom.js`、`web/platform/audio.js`、`game.js`、`web/boot.js`。

**D 类 — 存档层（v1.1 新增，跨 platform 但有写入节流）**

`data/saveManager.js`、`data/progressModel.js`、`data/mistakeBook.js`、`data/collection.js`、`data/cloud.js`。
这五个文件**不直接调 `wx.*`**，而是通过 `app.platform.storage` 读写（满足 R5 铁律）。
唯一的例外是 `saveManager.commit()` 需要在 `wx.onHide` 时**强制同步落盘**——此时通过
`platform.storage.setSync()`（在 Platform 接口里额外提供的同步方法）实现，H5 端映射为直接写 localStorage。

**依赖方向补充（v1.1）**：

```ascii
   scenes/*  ──require──▶  data/saveManager  ──require──▶  （注入的 platform.storage）
   scenes/*  ──require──▶  fx/index.js       （★ 只从 index 进，不直接碰 shockwave/shake 等实现文件）
   data/*    ──require──▶  shared/*          （纯逻辑，无平台 API）
   ★ 禁止：data/* 反向 require scenes/* 或 ui/*（否则存档写入会触发 UI 重绘，形成环）
   ★ 禁止：ui/* 直接 require data/*（UI 只读渲染，读的状态由场景层传入参数）
     —— 理由：UI 组件要能被 H5 预览版单独复用，且避免"存档变了 UI 自己重绘"的隐式耦合
     正确姿势：scene 读 save → 传给 ui 组件的 render(params)
```

### 5.4 事件总线契约

```pseudo
// shared/events.js —— 全量事件名（禁止在业务代码里出现字符串字面量）
EVT = {
  // 玩法 → 表现
  ANSWER_CORRECT:   'answer:correct',   // {question, gained, combo, tier, answerPos, grade}
  ANSWER_WRONG:     'answer:wrong',     // {question, inputStr, wrongPos}
  COMBO_TIER_UP:    'combo:tierUp',     // {fromTier, toTier, multiplier}
  COMBO_BREAK:      'combo:break',      // {lostCombo, byShield}
  DL_CHANGED:       'dl:changed',       // {from, to, reason}
  LEVEL_UP:         'level:up',         // {level}
  TIME_ADDED:       'time:added',       // {amount, nowLeft}
  TIME_LOW:         'time:low',         // {left, level}   // 剩余<10s
  TIME_OUT:         'time:out',         // { }
  GAME_OVER:        'game:over',        // {summary}
  // 输入
  KEY_DOWN:         'key:down',         // {key, rect}
  KEY_UP:           'key:up',           // {key, rect}
  KEY_REJECT:       'key:reject',       // {key, reason}    // 非法输入（防误触提示）
  // 表现 → 玩法（仅 fx 层的视觉完成回调）
  FX_DONE:          'fx:done',          // {fxId}
  // 系统
  APP_HIDE:         'app:hide',
  APP_SHOW:         'app:show',
  MEMORY_WARN:      'mem:warn',
  QUALITY_DOWNGRADE:'quality:down',     // {level}
  // ★ v1.1 存档 / 设置 / 隐私
  SAVE_COMMIT:     'save:commit',       // {dirtyKeys}      —— data → ui（间接，由 scene 转发）
  SETTINGS_CHANGED:'settings:changed',  // {key, value}     —— ui → 需要重排的模块
  MASTERY_UP:      'mastery:up',        // {grade, from, to}
  CONSENT_CHANGED: 'consent:changed',   // {item, granted}  —— 同意/撤回，立即停止或恢复上传
  // ★ v1.1 复习
  REVIEW_ITEM_DONE:'review:itemDone',   // {correct, item}
  REVIEW_GROUP_END:'review:groupEnd',    // {total, correct}
}

// 总线实现（core/ticker.js 内置，precompute 避免 Map 遍历分配）
bus = {
  on(evt, fn), off(evt, fn), emit(evt, payload)
  // 约束：单个事件的订阅者上限 8；on 相同 (evt,fn) 幂等
}
```

**订阅关系表**（防止"没人监听"或"重复监听"）：

| 事件 | 订阅者 | 动作 |
|---|---|---|
| `ANSWER_CORRECT` | `scenes/game` | 切 `JUDGE`；`fx` 播放；`audio` 播放 |
| `ANSWER_CORRECT` | `ui/databar` | combo 数字跳动 + 倍率徽章 |
| `ANSWER_CORRECT` | `ui/hud` | 分数滚动 |
| `COMBO_TIER_UP` | `fx` | 冲击波加强 + 白闪 + 升调音 |
| `DL_CHANGED` | `ui/keypad` | 重新计算"连击彩色高亮"配色 |
| `TIME_LOW` | `ui/hud` + `audio` | 倒计时变红、心跳音 |
| `GAME_OVER` | `scenes/game` | 切 `GAME_OVER` → 转 `RESULT` |
| `QUALITY_DOWNGRADE` | `fx` + `render` | 降粒子数、关阴影、关高光扫过 |
| ★ `SETTINGS_CHANGED`（leftHanded） | `core/input` + `render` | 重注册命中区 + 标记静态层 dirty |
| ★ `SETTINGS_CHANGED`（fontScale） | `ui/questionCard` + `ui/keypad` | 字号重算（走 `eqFontFor()` 唯一入口） |
| ★ `SETTINGS_CHANGED`（reduceMotion） | `fx/index` | 更新 `MODE.reduceMotion` |
| ★ `SETTINGS_CHANGED`（showTimerBar） | `ui/keypad` + `ui/softBar` | 键盘整体上移 22px + 软条区域重算 |
| ★ `CONSENT_CHANGED` | `data/cloud` | ★ **立即停止/恢复上传**（合规要求，非可选） |
| ★ `MASTERY_UP` | `ui/masteryStars` + `scenes/result` | 升级星星动画 + `熟练度 +1` 飘字 |
| ★ `REVIEW_GROUP_END` | `scenes/review` | 切 `REVIEW_END`；存档写 mistakes 掌握状态 |

---

## 6. 关键算法伪代码

> **本章是实现核心。所有伪代码可直接翻译为 JS。**

### 6.1 定点数约定（先于一切算法）

浮点数在速算场景必然翻车：`0.1 + 0.2 !== 0.3`，`19.1 - 4.6` 得 `14.499999999999998`。
**全项目约定：所有数值以"定点整数 + 标度"表示。**

```pseudo
// shared/util/num.js

// 数值在系统内的表示：{ v: 整数, s: 标度 }  实际值 = v / 10^s
// 例：3.25 → { v: 325, s: 2 }；  14.5 → { v: 145, s: 1 }

function mkNum(v, s) { return { v: v, s: s } }          // 内部构造，禁止业务直接调
function scaleOf(dp) { return Math.pow(10, dp) }         // dp = 小数位数

// 字符串 → 定点数（容错：前导零、尾随小数点、缺整数位）
// 合法： "7" "0.5" ".5"→"0.5" "12."→"12" "0003" "1.10"
function parseScaled(str) -> {v, s} | null
    t = trim(str)
    if t == '' return null
    parts = split(t, '.')
    if parts.length > 2 return null                    // 两个小数点 → 非法
    ip = parts[0] or '0'
    fp = parts.length == 2 ? parts[1] : ''
    if ip == '' or !isAllDigits(ip) return null
    if fp != '' and !isAllDigits(fp) return null
    s = fp.length
    v = parseInt(ip, 10) * scaleOf(s) + (fp == '' ? 0 : parseInt(fp, 10))
    return { v: v, s: s }

// 定点数 → 规范化字符串（判定与显示都用它）
// {v:145,s:1} → "14.5"   {v:5,s:0} → "5"   {v:1010,s:2} → "10.10"
// normalizeScaled 会去掉多余尾随零，用于**比较**；formatScaled 保留，用于**显示**
function formatScaled(num)  -> str   // 保位数：{v:1010,s:2} → "10.10"
function normalizeScaled(num) -> str // 去尾零：{v:1010,s:2} → "10.1"
function digitCount(num) -> n        // 有效位数：{v:145,s:1} → 3；{v:5,s:0} → 1
    d = formatScaled(num); return d == '0' ? 1 : len(d)

// 定点数比较：先对齐标度再比整数（s 差不超过 4，超过说明题目异常，直接判不等）
function cmpScaled(a, b) -> -1|0|1
    s = max(a.s, b.s)
    if s - min(a.s,b.s) > 4 return (a.v > b.v ? 1 : -1)   // 防御
    av = a.v * scaleOf(s - a.s)
    bv = b.v * scaleOf(s - b.s)
    return av == bv ? 0 : (av > bv ? 1 : -1)

// 标度对齐相加（保证输入都是 {v,s}）
function addScaled(a, b) -> num
    s = max(a.s, b.s)
    return { v: a.v*scaleOf(s-a.s) + b.v*scaleOf(s-b.s), s: s }
function subScaled(a, b) -> num   // 允许负（生成器负责不产生负答案）
function mulScaled(a, b) -> num   // 标度相加
    return { v: a.v * b.v, s: a.s + b.s }
function divScaledExact(a, b, maxDp) -> num | null    // **整除检查**，见 6.2
```

### 6.2 题目生成器（answer-first 反向构造法）

**核心思路：不随机生成算式再算答案（那样无法保证整除、无法保证范围、无法保证心算友好），而是先决定答案，再反推算式。**

```pseudo
// shared/question/generator.js
// 依赖：shared/util/num.js, shared/util/rng.js, shared/question/opTable.js

// ──────────────────────────────────────────────────────────────
// 对外主入口
// ──────────────────────────────────────────────────────────────
function nextQuestion(grade, dl, rng, history) -> Question
    spec = opTable.forDL(dl)          // { maxV, dpMax, ops[], friendliness }
    Q    = null

    for attempt in 1..MAX_TRY(=24):                       // 有限次重试，失败则降级
        op    = pickWeighted(spec.ops, rng)               // 按权重随机运算类型
        Q     = buildByOp(op, spec, grade, dl, rng)

        if Q == null: continue                            // 不满足约束，换一个
        if not isHeartFriendly(Q, spec.friendliness): continue   // 心算友好度不达标
        if history.recentlySeen(Q.fingerprint, 12): continue     // 最近 12 题内不重复
        break

    if Q == null:                                        // 兜底：一年级 10 以内加法，绝不会失败
        Q = fallbackQuestion(rng)
    Q.fingerprint = fingerprintOf(Q)                     // 供去重与错题本使用
    return Q

// Question 结构
// {
//   opCode: 'add'|'sub'|'mul'|'div'|'mix',
//   label:  '小数のひきざん'  ← UI 显示的题型标签（中文，1:1 复刻视频样式）
//   display: [ {t:'19.1'}, {t:'−'}, {t:'4.6'} ]          // 竖排/横排渲染数据
//   answer: {v:145, s:1}                                 // 定点数
//   answerStr: '14.5'                                    // 规范化字符串
//   answerSlots: [ {placeholder:'答', maxLen:4} ]        // 支持商余双槽
//   softLimitMs: 9800                                    // 本题软限时
//   meta: { operands:[...], exact:true, isQuoRem:false }
// }

// ──────────────────────────────────────────────────────────────
// 按运算类型反向构造
// ──────────────────────────────────────────────────────────────
function buildByOp(op, spec, grade, dl, rng)

  if op == 'add':
      a = randNum(spec.maxV, spec.dpMax, rng)
      b = randNum(spec.maxV, spec.dpMax, rng)
      sum = addScaled(a, b)
      if sum.v > toInt(spec.maxV, sum.s): return null      // 和超范围 → 重试
      return mkQ('add', [ {n:a}, {sym:'+'}, {n:b} ], sum, spec)

  if op == 'sub':
      // 关键：**先决定答案，再造被减数** → 天然保证非负
      ans = randNum(spec.maxV, spec.dpMax, rng)
      b   = randNum(spec.maxV, spec.dpMax, rng)
      a   = addScaled(ans, b)                               // a = ans + b，a 恒 ≥ b
      if a.v > toInt(spec.maxV, a.s): return null
      return mkQ('sub', [ {n:a}, {sym:'−'}, {n:b} ], ans, spec)

  if op == 'mul':
      // 表内乘法用固定因子表；多位数乘法用"易分解因子"（接近整十/百）
      pair = pickMulFactors(spec, grade, dl, rng)
      a = pair[0]; b = pair[1]
      p = mulScaled(a, b)
      if p.v > toInt(spec.maxV, p.s): return null
      return mkQ('mul', [ {n:a}, {sym:'×'}, {n:b} ], p, spec)

  if op == 'div':
      // **先定商 q 和除数 b，再反推被除数 a = q × b** → 天然整除，且 b≠0 自动成立
      b = randNonZero(spec.maxV, spec.dpMax, rng)          // 0.5~9.5 之间或整十，保证口算友好
      q = randNum(spec.maxV, spec.dpMax, rng)
      a = mulScaled(q, b)
      if a.v > toInt(spec.maxV, a.s): return null
      return mkQ('div', [ {n:a}, {sym:'÷'}, {n:b} ], q, spec)

  if op == 'quoRem':                                      // 有余除法（三年级+）
      b = pickDivisor(grade, dl, rng)                      // 2~9 的整数
      q = randInt(2, floor(spec.maxV / b), rng)
      r = randInt(0, b - 1, rng)                           // 余数 < 除数
      a = b * q + r
      if a > spec.maxV: return null
      if r == 0: return buildByOp('div', ...)              // 余 0 就退化成整除，别浪费"有余"标签
      // 双槽答案：商 与 余数
      return { opCode:'quoRem', label:'有余のわり算',
               display:[ {n:mkNumInt(a)}, {sym:'÷'}, {n:mkNumInt(b)} ],
               answer: mkNumInt(q),
               answerStr: String(q),
               answerSlots:[ {placeholder:'商', maxLen: len(String(q))},
                             {placeholder:'余', maxLen: 1} ],   // 余数必为 1 位
               meta:{ isQuoRem:true, remainder:r } }

  if op == 'mix':                                          // 混合运算（五年级+，DL≥7）
      return buildMix(spec, grade, dl, rng)

  if op == 'paren':                                        // 带括号（DL≥8）
      return buildParen(spec, grade, dl, rng)

// ──────────────────────────────────────────────────────────────
// 混合运算 a op1 b op2 c（左结合）
// ──────────────────────────────────────────────────────────────
function buildMix(spec, grade, dl, rng)
    dp = min(spec.dpMax, 1)                                // 混合运算限制 1 位小数，降心算负担
    a = randNum(min(spec.maxV, 9999), dp, rng)
    b = randNum(min(spec.maxV, 999),  0, rng)              // 第二个数刻意小
    c = randNum(min(spec.maxV, 999),  0, rng)
    o1 = pick(['+','−'], rng); o2 = pick(['+','−','×'], rng)
    if o2 == '×' and c.v > 20: return null                 // 小数×小数留给 mul，别在 mix 里堆
    t1 = applyOp(a, o1, b)                                 // a o1 b 一定是整数结果
    r  = applyOp(t1, o2, c)
    if r.v < 0: return null                                 // 混合运算也不出负数
    if r.v > toInt(spec.maxV, r.s): return null
    return mkQ('mix', [ {n:a},{sym:o1},{n:b},{sym:o2},{n:c} ], r, spec,
               label:'混合計算')

// ──────────────────────────────────────────────────────────────
// 带括号 (a op1 b) op2 c
// ──────────────────────────────────────────────────────────────
function buildParen(spec, grade, dl, rng)
    a = randNum(99, 0, rng); b = randNum(99, 0, rng); c = randNum(99, 0, rng)
    o1 = pick(['+','−'], rng); o2 = pick(['+','−','×','÷'], rng)
    inner = applyOp(a, o1, b)
    if inner.v < 0: return null
    if o2 == '÷':
        if c.v == 0: return null
        r = divScaledExact(inner, c, 2)                    // 整除检查：除不尽就 return null
        if r == null: return null
    else:
        r = applyOp(inner, o2, c)
        if r.v < 0: return null
    if r.v > toInt(spec.maxV, r.s): return null
    return mkQ('paren', [ {n:a},{sym:o1},{n:b},{open:true}, {sym:o2}, {n:c},{close:true} ],
               r, spec, label:'括弧計算')

// ──────────────────────────────────────────────────────────────
// 整除：只接受有限小数（最多 maxDp 位），除不尽返回 null 让上层重试
// ──────────────────────────────────────────────────────────────
function divScaledExact(a, b, maxDp)
    if b.v == 0: return null
    s0 = max(a.s, b.s)
    av = a.v * scaleOf(s0 - a.s)
    bv = b.v * scaleOf(s0 - b.s)
    num = av * scaleOf(maxDp)
    if num % bv != 0: return null                            // 除不尽 → 拒绝（保证有限小数）
    return { v: num / bv, s: maxDp }

// ──────────────────────────────────────────────────────────────
// 乘法因子选取：**心算友好度的核心**
// ──────────────────────────────────────────────────────────────
function pickMulFactors(spec, grade, dl, rng) -> [a, b]
    TABLE9 = [1,2,3,4,5,6,7,8,9]                            // 表内乘法
    if grade <= 2 or dl <= 3:
        return [ pickInt(TABLE9, rng), pickInt(TABLE9, rng) ]        // 只考表内

    if dl <= 5:
        // 三位×一位：第二个数取 [2,3,4,5] 或 整十（12,15,20,25）→ 心算友好
        b = rng() < 0.6 ? pickInt([2,3,4,5], rng) : pickInt([10,12,15,20,25,30,50], rng)
        a = randNum(mulMaxFor(dl, b), 0, rng)
        return [a, mkNumInt(b)]

    if dl <= 8:
        // 两位×两位：十位对齐 + 优先整十/整百因子
        b = rng() < 0.5 ? pickInt([10,12,15,20,25,40,50], rng)
                         : pickInt([11,13,14,16,18,22,24], rng)
        a = randNum(mulMaxFor(dl, b), 0, rng)
        return [a, mkNumInt(b)]

    // dl ≥ 9：允许 3 位 × 2 位，b 仍偏整十
    b = pickInt([10,12,15,20,25,50,120,125], rng)
    a = randNum(mulMaxFor(dl, b), rng() < 0.5 ? 0 : 1, rng)
    return [a, mkNumInt(b)]

function mulMaxFor(dl, b) -> 上界（避免乘积爆范围）
    CAP = [0, 20, 100, 1000, 10000, 100000, 100000, 1000000, 1000000, 1000000, 1000000]
    return floor(CAP[dl] / max(1, b.v))

// ──────────────────────────────────────────────────────────────
// **心算友好度评分**（0~100，< spec.friendliness 阈值则重试）
// 逐项加减分，任一项不达标直接判 0
// ──────────────────────────────────────────────────────────────
function isHeartFriendly(Q, threshold) -> bool
    if threshold <= 0: return true
    score = 100

    // 1) 负数、无限小数：直接淘汰（生成器理论上不会产生，双保险）
    if Q.answer.v < 0: return false
    if Q.answer.s > 2: return false

    // 2) 逐位加减的"进位/退位次数"—— 低年级最核心的可心算指标
    if Q.opCode in ['add','sub'] and Q.answer.s == 0:
        carries = countCarryEvents(Q)
        LIMIT = {1:0, 2:1, 3:2, 4:3, 5:99, 6:99}    // 1-2年级几乎不进位
        if carries > LIMIT[gradeOf(Q)]: score -= 40

    // 3) 乘法：两个因子的"非零有效位"数（25 × 4 好算， 37 × 46 不好算）
    if Q.opCode == 'mul':
        d = max(nonzeroDigits(Q.meta.operands[0]), nonzeroDigits(Q.meta.operands[1]))
        if d > mulDigitCap(Q.dl) : score -= 30        // dl≤5 → 1位; ≤8 → 2位; else 3位

    // 4) 除法：除数越"整"越好（8/16/25/50 好口算）
    if Q.opCode == 'div':
        b = Q.meta.operands[1]
        if b.v % 10 != 0 and b.v % 5 != 0 and b.v not in TABLE9: score -= 15

    // 5) 小数位数：dp 越大越难
    score -= Q.answer.s * 12

    // 6) 干扰项：DL 越高，刻意引入"近似干扰数"（如 4.6 vs 4.65）
    //    这里不做惩罚，只做标记
    return score >= threshold

// 特殊加分项：答案为整数且是"整十/整百/平方数" → 记为 favorite（结算页可展示"漂亮答案 N 次"）
function isPrettyAnswer(ans) -> bool
    n = normalizeScaled(ans)
    return n == '' or n % 10 == 0 or isPerfectSquare(n)
```

### 6.3 输入校验与判定（三态判定 + 迟滞宽限）

**难点**：没有"确定"键（1:1 复刻视频，键盘只有 `7 8 9 / 4 5 6 / 1 2 3 / ⌫ 0`），所以必须**自动判定**。自动判定的核心是回答：**什么时候可以确定玩家已经写错了？**

```pseudo
// shared/question/validator.js
// 输入缓冲状态
// {
//   slots: [ { tokens: [...], fixedLen: 3 }, ... ]   // 支持商余双槽
//   activeSlot: 0,
//   locked: false,        // 判定后锁定
//   pendingJudge: null,   // 迟滞宽限中的判定
// }

// token: 0-9 的数字，或 'dot'（小数点）

// ──────────────────────────────────────────────────────────────
// 1. 数字键
// ──────────────────────────────────────────────────────────────
function inputDigit(buf, d)
    if buf.locked: emit(KEY_REJECT, {reason:'locked'}); return
    slot = buf.slots[buf.activeSlot]
    if len(slot.tokens) >= slot.fixedLen:
        return rejectAndAutoAdvance(buf)      // 当前槽满 → 尝试跳下一槽
    if d == 0 and len(slot.tokens) == 0 and slot.fixedLen == 1:
        slot.tokens.push(0)                   // 允许单个 0
    else:
        slot.tokens.push(d)
    judge(buf)

// ──────────────────────────────────────────────────────────────
// 2. ⌫ 退格
// ──────────────────────────────────────────────────────────────
function backspace(buf)
    if buf.locked: reject()
    slot = buf.slots[buf.activeSlot]
    if len(slot.tokens) > 0:
        slot.tokens.pop()
        cancelPendingJudge(buf)                // 宽限期内改答案 → 撤销判定
    else if buf.activeSlot > 0:
        buf.activeSlot--                       // 当前槽空 → 退到上一槽
    // 整串清空：连续退格直到第一个槽空，再按 ⌫ → 退到 activeSlot=0 且不发判定
    judge(buf)

// ──────────────────────────────────────────────────────────────
// 3. 判定逻辑（**三态**：PREFIX 继续等 / CORRECT 对 / WRONG 错）
// ──────────────────────────────────────────────────────────────
function judge(buf)
    if buf.locked: return
    Q = buf.question
    cur = slotInputString(buf)                  // 当前槽拼成字符串，如 "14." 或 "4"

    // ── 3.1 长度硬上限：输入位数已超过答案位数 → 必错，立即判定
    if len(visibleTokens(cur)) > Q.answerTokensLen:
        return settle(buf, WRONG, {reason:'overflow'})

    // ── 3.2 商余双槽：当前槽未满不判，先看能否自动跳槽
    if Q.meta.isQuoRem:
        if len(buf.slots[0].tokens) == len(String(Q.answer.v)) and
           cmpStrNum(buf.slots[0], String(Q.answer.v)) != 0:
            return settle(buf, WRONG, {reason:'quotient'})   // 商已定且错
        if len(buf.slots[0].tokens) < len(String(Q.answer.v)):
            return                                  // 商还没输完 → 继续等
        // 商输完且对 → 自动跳到余数槽
        if buf.activeSlot == 0 and len(buf.slots[0].tokens) == len(String(Q.answer.v)):
            buf.activeSlot = 1
            emit(SLOT_CHANGED, {index:1})
            return
        if buf.activeSlot == 1:
            if len(buf.slots[1].tokens) == 0: return
            if buf.slots[1].tokens[0] == Q.meta.remainder: return settle(buf, CORRECT)
            return settle(buf, WRONG, {reason:'remainder'})

    // ── 3.3 数值相等 → 对（用定点数比较，不用 parseFloat）
    if cur != '' and cur != '.' and not endsWithDot(cur):
        if cmpScaled(parseScaled(cur), Q.answer) == 0:
            return settle(buf, CORRECT, {})
        // 3.4 **前缀冲突判定** —— 自动判定的关键
        //     规则：把当前输入串当作答案串的前缀来比较。
        //     若长度已到答案长度且不等 → 必错
        //     若未到答案长度，但**在已有长度内已出现不同数字** → 必错
        //       （例：答案 "14.5"，输入 "2" → 首位就冲突，绝不可能对）
        //     若当前串是答案串的前缀 → 继续等
        if isPrefixConflict(cur, Q.answerStr):
            return settle(buf, WRONG, {reason:'mismatch'})
        // 3.5 长度刚好等于答案长度且不相等 → 必错
        if visibleLen(cur) == Q.answerTokensLen:
            return settle(buf, WRONG, {reason:'mismatch'})

    // ── 3.6 其他情况（空串、小数点结尾、仍是合法前缀）→ 继续等玩家输入
    return

// 前缀冲突判定
function isPrefixConflict(input, answerStr)
    ai = normalizeScaled(answer)                  // "14.5"
    for i in 0 .. len(input)-1:
        if input[i] != ai[i]: return true          // 某一位已不同 → 冲突
    return false                                  // input 完全是 answer 的前缀 → 无冲突

// ──────────────────────────────────────────────────────────────
// 4. 结算判定：**带迟滞宽限（grace）**，防打击小学生
// ──────────────────────────────────────────────────────────────
GRACE_MS = 260            // 判定不是立即锁死，给玩家 260ms 反悔窗口

function settle(buf, result, info)
    if result == WRONG and buf.lastWrongAt == 0: buf.lastWrongAt = now()
    // 不立即 lock，先进入 pendingJudge
    buf.pendingJudge = { result: result, info: info, at: now() }

    fsm.scheduleAfter(GRACE_MS, function judge_finalize() {
        if buf.pendingJudge == null: return               // 已被退格撤销
        if buf.pendingJudge.at != judgeToken: return      // 已被新判定覆盖
        buf.locked = true
        if buf.pendingJudge.result == CORRECT:
            emit(ANSWER_CORRECT, {...})
        else:
            buf.locked = false
            answerMsg = 'close' if stillPrefix(cur) else 'open'   // 允许改
            emit(ANSWER_WRONG, {...})                    // 失误+1、连击断、红闪
    })
    // 视觉先行：判定瞬间就播 tick 停止音 + 答案位变红（不给"等一下才知道对错"的空窗）

function cancelPendingJudge(buf)   // 退格时调用
    if buf.pendingJudge and not buf.locked:
        buf.pendingJudge = null                    // 撤销，还没锁定就作废
```

**答案位数比正确答案长 / 短的处理汇总表**：

| 玩家输入 | 答案 `14.5` | 处理 |
|---|---|---|
| `1` | `14.5` | 合法前缀 → 继续等 |
| `14` | `14.5` | 合法前缀 → 继续等 |
| `14.` | `14.5` | 合法前缀（小数点位置一致）→ 继续等 |
| `14.5` | `14.5` | ✅ CORRECT |
| `2` | `14.5` | 首位冲突 → WRONG（宽限 260ms 内可退格） |
| `1x` / `15.5` | `14.5` | 第二位冲突 → WRONG |
| `145` | `14.5` | 位数溢出（3 ≤ 3 但无小数点）→ 归一化后 `145 ≠ 14.5` → WRONG |
| `14.55` | `14.5` | 位数溢出 → WRONG |
| `145.` | `14.5` | 归一化 `145 ≠ 14.5` → WRONG |
| `0.3` | `0.30` | 归一化后都是 `0.3` → ✅ CORRECT（尾随零等价） |
| `7` | `0.7` | 首位冲突 → WRONG（必须输 `0.7`；UI 会预置引导：首次出现 1 位小数答案时自动填首位 `0`） |

> **引导优化（体验补丁）**：当 `answerStr` 含小数点且整数部分长度为 1 时，`ASK` 状态自动向槽内预置引导 token `0`（灰色 placeholder 样式，不计入输入）。避免低年级学生因为不写 `0.` 而被判错。

### 6.4 连击与倍率

```pseudo
// shared/combo.js  +  shared/scoring.js
// 配置在 shared/config.js
COMBO_TIERS = [
  { min: 0,  mult: 1.00 },
  { min: 5,  mult: 1.25 },     // PRD 要求
  { min: 10, mult: 1.50 },     // PRD 要求
  { min: 20, mult: 2.00 },     // PRD 要求
  { min: 30, mult: 2.50 },     // 增强：让高分段仍有爬升空间
  { min: 50, mult: 3.00 }      // 封顶
]
GRACE_MS       = 3000          // 连击保护窗口：断连后 3s 内答对可恢复
BASE_SCORE     = 100
SPEED_BONUS_MAX= 0.5           // 速度奖励上限 +50%
SPEED_FAST_RATIO = 0.35        // 用掉 35% 软限时即拿满速度奖励
HUNDRED_BONUS  = 60            // 答对恰好整百额外奖励
PRETTY_BONUS   = 40            // 答案为整十/整百/平方数

// ── 连击状态 ────────────────────────────────────────────────
// { combo, best, tier, multiplier, graceUntil, shielded }

function comboIncr(state, nowMs)
    state.combo += 1
    state.best  = max(state.best, state.combo)

    prevTier = tierOf(state.combo - 1)
    tier     = tierOf(state.combo)
    if tier > prevTier:
        emit(COMBO_TIER_UP, {fromTier:prevTier, toTier:tier, multiplier:tier.mult})
        state.shielded = true                  // 升档后给一次护盾（视觉上画护盾环）

    state.graceUntil = 0
    return tier

function comboBreak(state, nowMs)          // 答错
    lost = state.combo
    state.graceUntil = nowMs + GRACE_MS     // 开启保护窗口
    state.combo = 0
    state.tier  = 0
    state.multiplier = 1.0
    state.shielded = false
    emit(COMBO_BREAK, {lostCombo: lost, byShield:false})
    return lost

// 护盾恢复：答对时若在 grace 窗口内，**恢复断连前的 combo 数**（不减分，只给机会）
function comboTryRestore(state, savedBreakCombo, nowMs)
    if state.graceUntil > nowMs and savedBreakCombo > 0:
        state.combo = savedBreakCombo
        state.tier  = tierOf(state.combo)
        state.multiplier = tierMult(state.combo)
        state.graceUntil = 0
        emit(COMBO_BREAK, {lostCombo:0, byShield:true})    // byShield=true → 播"护盾生效"金色特效
        return true
    return false

function tierOf(combo)    -> tier 档位
function tierMult(combo)  -> 倍率

// ── 计分 ────────────────────────────────────────────────────
function award(question, correctStreakRatio, tier, now, targetScore, level) -> {gained, total, breakdown}
    base = BASE_SCORE
    // 1) 速度奖励：用掉时间越少奖励越高
    usedRatio = clamp01(question.elapsedMs / question.softLimitMs)
    speed = SPEED_BONUS_MAX * (1 - smoothstep(SPEED_FAST_RATIO, 1, usedRatio))
    // 2) 倍率
    m = tierMult(tier)
    // 3) 高分不惩罚：只加分
    scoreTier = 1 + min(0.5, floor(targetScore / 20000) * 0.1)   // 2万分后每 2 万 +10%，封顶 +50%
    // 4) 关卡加成
    lvBonus = 1 + min(0.3, (level - 1) * 0.03)
    // 5) DL 加成：难度越高，单题分越高（让高分必须靠高 DL）
    dlBonus = 1 + (currentDL - 1) * 0.06

    raw = base * (1 + speed) * m * scoreTier * lvBonus * dlBonus
    bonus = 0
    if floor((targetScore + raw) / 100) > floor(targetScore / 100): bonus += HUNDRED_BONUS   // 跨整百
    if isPrettyAnswer(question.answer): bonus += PRETTY_BONUS

    gained = round(raw) + bonus
    return { gained, total: targetScore + gained,
             breakdown:{ base, speed:round(speed*100), mult:m, dlBonus, bonus } }

// ── 分数显示插值（避免"跳数"廉价感）──────────────────────────
// 真实分 score 立即变；显示分 displayScore 每帧追赶（ease-out），再由 textCache 做逐位滚动
function stepDisplay(display, real, dt)
    if display == 0: return real                       // 首帧直接对齐
    diff = real - display
    return display + diff * (1 - Math.exp(-12 * dt))   // 指数追赶，12/s ≈ 80ms 追上
```

**"连击彩色高亮"（1:1 复刻视频第 3 点）的实现**：`keypad.js` 的每个键帽颜色由 `tier.mult` 决定：
`×1.00` 纯白 → `×1.25` 淡蓝 → `×1.50` 淡黄 → `×2.00` 淡橙 → `×2.50` 淡粉 → `×3.00` 金。**换色在离屏层做一次重绘**，不是每帧。

### 6.5 难度推进（DL）

```pseudo
// shared/difficulty.js
// PRD：连击每跨 5 → DL+1；连续答错 2 题 → DL-1（保底不劝退）；分数越高 DL 基线越高

// DL 组成：DL = clamp(round(基准 + 连击项 + 分数项 + 降档项), 1, 10)
// 年级基准 baseDL（PRD 3.2 表）
GRADE_BASE = {1:1, 2:2, 3:3.5, 4:5, 5:6.5, 6:8}
// 年级上限（防止低年级刷到高 DL 超出认知）
GRADE_CAP  = {1:3, 2:4, 3:6, 4:7, 5:9, 6:10}

function initDL(grade, saveGrade, settings)   // v1.1：三项来源
    state.base   = GRADE_BASE[grade]
    state.cap    = GRADE_CAP[grade]
    state.manual = clamp(saveGrade.difficultyOffset, -3, 3)    // 主页微调器（持久化）
    state.global = clamp(settings.globalDifficultyOffset or 0, -3, 3)   // 全局难度（设置项）
    state.comboDrift = 0
    state.scoreDrift = 0
    state.wrongStreak = 0
    state.dl = clamp(round(state.base + state.manual + state.global), 1, state.cap)   // ★ 钳制在 recompute 内
    return state

function onCorrect(state, combo, totalScore)
    // ① 连击升档：每跨 5 → +1（PRD 明确）
    tier = floor(combo / 5)
    state.comboDrift = tier
    // ② 分数项：只升不降，防止高分掉档
    state.scoreDrift = min(1.5, floor(totalScore / 20000) * 0.3)
    // ③ 答对后清零连错
    state.wrongStreak = 0
    recompute(state)

function onWrong(state)
    state.wrongStreak += 1
    if state.wrongStreak >= 2:            // 连续答错 2 题 → 降 1（PRD 明确）
        state.comboDrift = max(0, state.comboDrift - 1)   // 注意只降连击项，不动 scoreDrift
        state.wrongStreak = 0
        return recompute(state, 'wrongStreak')
    return null

function onLevelUp(state, level)
    // 过关时**只清连击漂移，不清分数漂移** → 难度回落是渐进的
    state.comboDrift = 0
    return recompute(state, 'levelUp')

function recompute(state, reason) -> {from,to} | null
    old = state.dl
    raw = state.base + state.manual + state.global + state.comboDrift + state.scoreDrift
    // 迟滞：降档比升档更"迟钝"——升 1 档要 +1.0 原始分，降 1 档要 -1.5
    if raw < old and abs(raw - old) < 0.75: return null
    // ★ v1.1：钳制在 recompute 内完成，UI 显示值与生成器实际用的 dl 永远是同一个
    //   六年级 8 + manual(+3) + global(+3) = 14 → 钳到 10（不是显示 14）
    newDl = clamp(round(raw), 1, state.cap)
    if newDl == old: return null
    state.dl = newDl
    emit(DL_CHANGED, {from:old, to:newDl, reason: reason || 'drift'})
    return {from:old, to:newDl}

// 实际生成题目用的整数 DL（题目表用整数，浮点基准向下取整更安全）
function dlInt(state) { return clamp(floor(state.dl), 1, 10) }

// ★ v1.1：UI 读 DL 的唯一入口。禁止任何地方自己 round(base+manual+global)
//   否则会出现"题目按 DL 10 出、界面写 DL 14"的不一致
function displayDL(state) { return state.dl }
```

**连击漂移的"手感曲线"调优说明**：`comboDrift = floor(combo/5)` 意味着 20 连击 → +4 DL。配合分数漂移，一局后期 DL 会逼近上限。这是**故意的**——PRD §3.2 就是要"停不下来"。若实测 5-6 年级在 DL 9-10 崩溃过快，把 `comboDrift` 系数改为 `floor(combo/7)`，并把 `GRADE_CAP[6]` 从 10 降到 9。此参数在 `config.js` 一处可调。

### 6.6 时间压力

```pseudo
// shared/timer.js
// 关卡倒计时：每关基础时间（随年级），答对加时
LEVEL_BASE_MS  = {1: 90000, 2: 80000, 3: 70000, 4: 65000, 5: 60000, 6: 60000}   // PRD: 如 60s
LEVEL_MAX_MS   = 120000        // 上限：防止无限续命
CARRY_RATIO    = 0.35          // 过关时剩余时间结转到下一关的比例
CARRY_CAP_MS   = 20000
TIME_ADD_BASE  = 1500          // PRD: 基础 +1.5s
TIME_ADD_PER_DL= 200           // PRD: DL 每级 +0.2s
SOFT_LIMIT_BASE= {1:12000, 2:11000, 3:10000, 4:9000, 5:8000, 6:7000}   // PRD 表
SOFT_LIMIT_DL_STEP = 0.04     // DL 每级软限时再压缩 4%
SOFT_LIMIT_MIN_MS = 3500
HARD_FACTOR    = 1.8           // 软限时 ×1.8 = 硬超时（判错）

// 关卡倒计时状态
// { leftMs, level, running, frozen, lowFired }

function armLevel(state, level)
    base = LEVEL_BASE_MS[grade] or LEVEL_BASE_MS[1]
    // 关卡越长越宽裕：每 3 关 +5s
    bonus = floor((level-1)/3) * 5000
    state.leftMs  = min(LEVEL_MAX_MS, base + bonus)
    state.level   = level
    state.running = true
    state.frozen  = false
    state.lowFired = false
    // **开局倒计时不惩罚** —— 不"抢跑"
    return state

function tickLevel(state, dtRealMs)        // 用**未缩放**的 dt
    if not state.running or state.frozen: return
    state.leftMs -= dtRealMs
    if state.leftMs <= 0:
        state.leftMs = 0; state.running = false
        emit(TIME_OUT, {})
    else if state.leftMs < 10000 and not state.lowFired:
        state.lowFired = true
        emit(TIME_LOW, {left: state.leftMs, level: state.level})

function addTime(state, dl)
    if state.leftMs <= 0: return 0
    // 已答对这题消耗的软限时也要扣回，避免"慢答也加满时间"
    add = TIME_ADD_BASE + max(0, floor(dl - GRADE_BASE[grade])) * TIME_ADD_PER_DL
    before = state.leftMs
    state.leftMs = min(LEVEL_MAX_MS, state.leftMs + add)
    gained = state.leftMs - before
    emit(TIME_ADDED, {amount: gained, nowLeft: state.leftMs})
    return gained

function carryOver(state)      // 过关结转
    carry = min(CARRY_CAP_MS, floor(state.leftMs * CARRY_RATIO))
    return carry      // 新关卡 armLevel 时加上 carry

// ── 单题软限时（压迫感，不惩罚）──────────────────────────────
function softLimitFor(dl, grade)
    base = SOFT_LIMIT_BASE[grade]
    v = base * (1 - SOFT_LIMIT_DL_STEP * (dl - GRADE_BASE[grade]))
    return max(SOFT_LIMIT_MIN_MS, v)

function tickSoft(state, question, dtRealMs)
    elapsed = now() - question.startRealTime
    r = elapsed / question.softLimitMs
    if r < 0.62: return STAGE_NORMAL            // 前 62% 无压迫
    if r < 1.0:  return STAGE_TIGHT             // 软限内 → 压迫（UI 呼吸/心跳/角色焦虑）
    if r < HARD_FACTOR: return STAGE_OVERDUE     // 超过软限 → 强化压迫（红边/更强心跳）
    return STAGE_HARD                            // 硬超时 → 判错

// 压迫阶段的表现（不是改难度，是改"感知"）
// STAGE_TIGHT:   角色切换 anxious 姿态；心跳音 90bpm；题卡描边变黄；倒计时环开始收窄
// STAGE_OVERDUE: 题卡描边变红并轻微抖动；心跳音 130bpm；屏幕四边暗角脉冲（频率 2Hz）
// STAGE_HARD:    判 WRONG（走 6.3 判定流程的 hard-timeout 分支）
```

**关键设计取舍**：`STAGE_TIGHT` 阶段**不改变题目、不扣额外分**。只改变视觉/听觉。这既满足 PRD 的"软倒计时条压迫"，又避免了"孩子被逼到崩溃"的体验事故（PRD 3.4 目标用户是小学生）。

### 6.7 商余双槽（有余除法）的判定顺序

已在 6.3 给出。为完整性，单列时序：

```pseudo
// 题目 "47 ÷ 6"  答案 商7 余5   → answerStr='7'（商槽 fixedLen=1），余槽 fixedLen=1
// 输入 '4' → 槽0 长度 1，'4' vs '7' 冲突 → WRONG(quotient)
// 输入 '7' → 槽0 满且相等 → activeSlot=1，emit SLOT_CHANGED
// 输入 '5' → 槽1[0]=='5'==remainder → CORRECT
// 输入 '7','7' → 槽0 满但 '77' vs '7' 溢出 → rejectAndAutoAdvance → 槽1 空 → 停在槽1 等输入
```

---

## 7. 性能优化清单

### 7.1 目标与预算

| 指标 | 目标 | 硬上限 |
|---|---|---|
| 帧率 | 60 fps（iPhone 6s / 骁龙 660 稳定） | 30 fps 兜底（自动降级） |
| 单帧 JS 耗时 | < 8 ms | < 12 ms（超则触发降级） |
| 粒子存活数 | 常态 ≤ 120，峰值 ≤ 300 | 硬上限 400（`config.PARTICLE_MAX`） |
| 每帧 `drawImage` 调用 | < 180 | < 260 |
| 每帧 `fillText` 调用 | < 6（其余走数字图集） | < 20 |
| 每帧 JS 对象分配 | 0（全部池化/预分配） | < 5 个小对象 |
| 主包体积 | ≤ 1.5 MB | 4 MB（微信红线） |
| 峰值内存 | < 120 MB | < 180 MB（`wx.onMemoryWarning` 阈值） |

### 7.2 粒子对象池

```pseudo
// miniprogram/fx/pool.js
// **关键：不用 splice、不用 new、alive 用游标压缩（swap-remove）**

function Pool(capacity, factory)          // factory 只在初始化调一次
    items = new Array(capacity)
    for i in 0..capacity-1: items[i] = factory()   // 预分配
    alive   = 0                             // [0, alive) 是活跃区
    // 结构化字段直接平铺，避免每个粒子是一个对象（对象池也有，但平铺更快）

function spawn(pool)
    if pool.alive >= pool.capacity: return null     // 满了就**丢弃**，不扩容（保护帧率）
    p = pool.items[pool.alive]
    pool.alive += 1
    return p

function despawnAt(pool, i)                // swap-remove：O(1)，无数组搬移
    pool.alive -= 1
    tmp = pool.items[i]; pool.items[i] = pool.items[pool.alive]; pool.items[pool.alive] = tmp

function forEachAlive(pool, fn)
    for i in 0 .. pool.alive-1: fn(pool.items[i])
    // 注意：fn 内若 despawnAt，要用 `i--` 补偿

// 粒子结构（平铺字段，不用 class）
// { alive, x, y, vx, vy, ax, ay, life, maxLife, size, rot, vrot, r, g, b, a0, kind, texId }
// kind: 0=星 1=彩带 2=金币 3=灰烬 4=冲击波
```

`particles.js` 在此之上做发射器：

```pseudo
function burstStars(answerPos, combo, budget)
    n = min(6 + combo*2, 26, budget)      // 连击越高粒子越多，但有上限
    for i in 0..n-1:
        p = spawn(starPool); if p == null: break
        ang = rand() * TAU
        spd = 0.18 + rand() * 0.42
        p.x = answerPos.x; p.y = answerPos.y
        p.vx = cos(ang)*spd; p.vy = sin(ang)*spd - 0.12
        p.ax = 0; p.ay = 0.0016                    // 轻微重力
        p.life = p.maxLife = 520 + rand()*360
        p.size = 6 + rand()*10
        p.rot = rand()*TAU; p.vrot = (rand()-0.5)*0.02
        p.r,p.g,p.b = pick(STAR_COLORS)
```

### 7.3 离屏画布缓存（4 层渲染）

```pseudo
// miniprogram/render/layer.js
// 微信小游戏关键事实：**第一次 wx.createCanvas() 返回上屏 canvas，之后的调用返回离屏 canvas**
// 且 wx.createOffscreenCanvas({type:'2d',w,h}) 从基础库 2.16.1 起可用。
// 兼容策略：优先 wx.createOffscreenCanvas({type:'2d'})；不可用则退化为"第二次 wx.createCanvas()"

function makeLayer(w, h)
    if wx.canIUse('createOffscreenCanvas') or baseLib >= 2.16.1:
        c = wx.createOffscreenCanvas({ type:'2d', width:w, height:h })
        isOffscreenAPI = true
    else:
        c = wx.createCanvas(); c.width = w; c.height = h    // 小游戏特有：第二起即离屏
        isOffscreenAPI = false
    return { canvas:c, ctx:c.getContext('2d'), w, h, dirty:true }

// ── 四层设计 ────────────────────────────────────────────────
// L_BG    背景层  : 渐变底 + 静态纹理 + 边框装饰。仅 resize / 换肤时重绘。 1 张
// L_STATIC静态层  : 角色台 + 彩带挂钩 + HUD 底座 + 键盘底（静态部分）。DL 变色/换关时脏
// L_DYN   动态层  : 角色、题目卡内容、键帽（动态部分）、飘字、粒子。**每帧重绘**
// L_UI    UI 覆盖层: HUD 文本、倒计时、数据条、倍率徽章、暂停/结算。每帧重绘
//
// 合成：ctx.drawImage(L_BG) → drawImage(L_STATIC) → L_DYN 直接画 → L_UI 直接画

// 脏标记：静态层不是每帧重绘，这是最大的一笔性能收益
function renderFrame(loopAlpha)
    if L_BG.dirty:    redrawBG(L_BG.ctx);    L_BG.dirty = false
    if L_STATIC.dirty: redrawStatic(L_STATIC.ctx); L_STATIC.dirty = false
    sctx.drawImage(L_BG.canvas, 0, 0, VW, VH)          // 缩放 blit，注意 9 参裁剪
    sctx.drawImage(L_STATIC.canvas, 0, 0, VW, VH)
    drawDynamic(sctx)      // 角色/题目/键帽动态部分/粒子（< 260 次 drawImage）
    drawOverlay(sctx)      // HUD 文本/倒计时/倍率
```

**drawImage 裁剪（关键优化）**：

```pseudo
// 屏幕上只画可见区域。角色/粒子出屏即跳过
function drawSpriteClipped(ctx, tex, sx, sy, sw, sh, dx, dy, dw, dh, view)
    if dx + dw < view.left or dx > view.right or dy + dh < view.top or dy > view.bottom:
        return                                          // 视口剔除，1 次比较省 1 次 drawImage
    ctx.drawImage(tex, sx, sy, sw, sh, dx, dy, dw, dh)  // 9 参形式：源裁剪 + 目标缩放

// 角色图源裁剪：一张 1024×1536 的 PNG 在屏上只显示 ~180×270，
// 用 9 参 drawImage 只取需要的子区域，减少 GPU 采样
```

### 7.4 文本测量缓存 + 数字图集

```pseudo
// miniprogram/render/textCache.js

// ① 测量缓存：LRU 512
MEASURE_CACHE = new Map()          // Map 有插入序，天然 LRU
function measureText(ctx, str, font)
    key = font + '|' + str
    v = MEASURE_CACHE.get(key)
    if v != null: 
        MEASURE_CACHE.delete(key); MEASURE_CACHE.set(key, v)    // 提升为最新
        return v
    w = ctx.measureText(str).width
    MEASURE_CACHE.set(key, w)
    if MEASURE_CACHE.size > 512: MEASURE_CACHE.delete(MEASURE_CACHE.keys().next().value)
    return w

// ② 数字图集：**分数/倒计时/连击数用位图而非 fillText**
// 理由：fillText 每次都要走字体光栅化 + hinting，在低端机上单次 0.1~0.4ms，
//       一帧 20 次就是 2~8ms。数字图集是一次 drawImage，约 0.01ms。
function buildDigitAtlas()        // 启动时执行一次，写入 L_STATIC
    chars = '0123456789+-.:!?×' + '第问正解失误连击秒倍分'   // 高频中文也进图集
    布局：单行，字号 = dpr * 40
    for ch in chars:
        measure → 分配格位 → 离屏 ctx.fillText(ch, x, y)  → 记 {sx,sy,sw,sh,advance}
    写 ui/number-atlas.json（由 tools/gen-atlas.js 预生成则跳过运行时构建）

function drawChar(ctx, atlas, ch, dx, dy, scale, alpha)
    g = atlas[ch]; if g == null: return
    ctx.globalAlpha = alpha
    ctx.drawImage(atlas.canvas, g.sx, g.sy, g.sw, g.sh, dx, dy, g.sw*scale, g.sh*scale)
    ctx.globalAlpha = 1

// ③ 分数滚动：逐位滚动 = 每位画两次（上一位 + 下一位），带 y 偏移
function drawRollingNumber(ctx, atlas, value, dx, dy, fromValue, progress)
    sFrom = String(fromValue); sTo = String(value)
    // 对齐右补 0，逐位插值 y
    for i in 0..max(len(sFrom), len(sTo))-1:
        a = digitAt(sFrom, i); b = digitAt(sTo, i)
        y = dy + (a == b ? 0 : (1 - progress) * atlas.cellH)
        drawChar(ctx, atlas, b, dx + i*advance, y, 1, 1)
        if a != b and progress < 1: drawChar(ctx, atlas, a, dx + i*advance, dy - progress*atlas.cellH, 1, 1-progress)
```

### 7.5 避免每帧重建数组 / 其他 GC 陷阱

| 陷阱 | 修法 |
|---|---|
| `arr.map/filter/forEach` 每帧产生新数组 | 改 `for (i=0;i<n;i++)` 索引循环 |
| `arr.push` 到模块级数组后 `splice(0, k)` 清空 | 游标 `head` 标记，只在游标满时整体搬移一次（摊还 O(1)） |
| `[...a, ...b]` 展开 | 预分配双倍容量，手动 `arr[n++]=` |
| 每帧 `new Array(n)` 初始化网格 | 初始化一次，之后原地写 |
| 字符串拼接生成 `font` | 用图集；必须用文本时把 font 字符串缓存成常量 |
| `ctx.createLinearGradient` 每帧创建 | 渐变对象缓存，只在 resize 时重建 |
| `ctx.beginPath()` + 大量 `arc` 画圆角矩形 | `shapeCache` 预渲染成位图，只在尺寸变化时重画 |
| 闭包在循环里创建（`forEach` 内 `()=>{}`） | 提取为方法，或用具名函数引用 |
| `try/catch` 包住高频代码 | 移出循环 |
| `JSON.parse(JSON.stringify())` 做深拷贝 | 手工浅拷贝目标字段 |

### 7.6 低端机 60fps 保障：分级降质

```pseudo
// core/loop.js 每秒采样一次 avgFps
QUALITY = [
  { name:'high',   particleMax: 300, shadow: true,  glow: true,  confetti: true,  digitAtlas: true  },
  { name:'medium', particleMax: 180, shadow: false, glow: true,  confetti: true,  digitAtlas: true  },
  { name:'low',    particleMax: 100, shadow: false, glow: false, confetti: false, digitAtlas: true  },
  { name:'potato', particleMax: 48,  shadow: false, glow: false, confetti: false, digitAtlas: false, fpsCap: 30 }
]

// 降级规则（滞回，防抖）
if avgFps < 45 for 2 consecutive seconds and quality < 3:
    quality += 1
    fx.setBudget(QUALITY[quality])
    renderer.rebuildLayers()               // 关闭阴影/光晕后静态层要重绘
    emit(QUALITY_DOWNGRADE, {level: quality})
    wx.setPreferredFramesPerSecond(30)     // potato 档锁 30fps 保续航
if avgFps > 55 for 5 consecutive seconds and quality > 0:
    quality -= 1
    fx.setBudget(QUALITY[quality])

// 阴影是 Canvas 2D 最大的性能杀手：shadowBlur > 0 时部分机型直接走 CPU 光栅化
// 规则：**默认全局零阴影**。视觉上的"发光"用 shapeCache 预渲染的光晕位图替代
//      （一次 drawImage 代替每帧 shadowBlur）
```

### 7.7 其他平台级优化

| 项 | 做法 |
|---|---|
| 位图内存 | 角色源图 1024×1536 RGBA = 6.0MB/张，7 张 42MB → **必须在加载前用 `tools/optimize-assets.sh` 缩到 384×576**（0.88MB/张，7 张 6.2MB），再按 dpr 上限 2.5 二次缩放 |
| 图片解码 | `wx.createImage()` 后立即 `img.width/height` 读一次触发解码；解码完成再进池（避免首帧解码卡顿） |
| 透明图按需 | 首屏只加载 `char_bunny_star`（默认主角）+ `ui/*`；其余 6 张角色图在**玩家选中时**或**结算页**懒加载 |
| 纹理过滤 | 位图缩放统一用 `ctx.imageSmoothingQuality = 'low'`（部分机型 high 会走双线性+额外内存） |
| 避免 `ctx.save/restore` 深嵌套 | 深度 ≤ 3 |
| `globalCompositeOperation` | 慎用 `lighter`（部分机型走离屏合成）；冲击波用普通 `source-over` + 亮色位图 |
| 内存告警 | `wx.onMemoryWarning` → 清空 `textCache`、`shapeCache`、所有离屏层（保留 `digitAtlas`） |
| 首帧预算 | `boot` 场景的同步逻辑 < 30ms，加载在 rAF 空隙中做（分帧加载，每帧最多解 4 张图） |

---

## 8. 触摸输入处理

### 8.1 坐标系与映射

```pseudo
// core/viewport.js —— 先把设备坐标归一到"设计坐标"
DESIGN_W = 750          // 设计基准宽（对应 750rpx）
DESIGN_H = 1334         // 设计基准高（9:16）

function recalcViewport(winInfo)   // winInfo = wx.getWindowInfo()
    dpr = min(winInfo.pixelRatio || 2, 2.5)          // 封顶，防 3x 机型内存爆
    VW  = winInfo.windowWidth                        // 逻辑宽（CSS px）
    VH  = winInfo.windowHeight
    // 上屏 canvas 物理像素
    screenCanvas.width  = round(VW * dpr)
    screenCanvas.height = round(VH * dpr)
    sctx.scale(dpr, dpr)                             // 之后所有绘制用 VW/VH 逻辑坐标

    // 设计坐标 → 逻辑坐标：等比 cover（保证 UI 不被拉伸变形）
    SCALE = max(VW / DESIGN_W, VH / DESIGN_H)        // cover：短边贴满，长边可能溢出
    OFF_X = (VW - DESIGN_W  * SCALE) / 2
    OFF_Y = (VH - DESIGN_H * SCALE) / 2

    // 安全区内缩（刘海屏/底部小黑条）
    sa = winInfo.safeArea or fallbackSafeArea(winInfo)
    SAFE_TOP    = max(0, (sa.top - winInfo.screenTop)) * (VH / winInfo.screenHeight)
    SAFE_BOTTOM = max(0, (VH - sa.bottom)) * (VH / winInfo.screenHeight)
    // 无 safeArea 字段的机型：顶部按 statusBarHeight 推
    if not winInfo.safeArea: SAFE_TOP = (winInfo.statusBarHeight || 20) * (VH / winInfo.screenHeight)

// 触摸坐标：逻辑 → 设计
function toDesign(x, y) -> {x, y}
    return { x: (x - OFF_X) / SCALE, y: (y - OFF_Y) / SCALE }
```

> **必须做映射**。不做映射在 iPhone 上会整体偏移（这是社区最高频的踩坑之一）。触摸事件的 `x/y` 是**逻辑像素**（已按 dpr 归一），与上屏 canvas 的 CSS 尺寸同坐标系，所以只需处理 `SCALE / OFF` 这一层。

### 8.2 命中区域计算

```pseudo
// core/input.js
// 布局阶段（每次 resize / 关卡切换）由各 ui 组件把自己的可点击矩形注册进来
HIT = []                       // 命中区列表，按注册顺序；**后注册的优先（在上层）**
                            // 每项：{ id, x, y, w, h, layer, r?, onPress, onRelease, holdMs? }

function registerHit(rectDef)     // {id,x,y,w,h,layer,shape:'rect'|'circle'|'roundRect', round?, onPress, onRelease}
    // **命中扩展（SLOP）**：视觉与判定解耦，按钮视觉 88 高，判定 96 高
    rectDef.hit = inflate(rectDef, KEY_HIT_SLOP)     // KEY_HIT_SLOP = 设计坐标 6
    HIT.push(rectDef)

function hitTest(px, py) -> hitDef | null
    for i from HIT.length-1 downto 0:                 // 倒序：上层优先
        h = HIT[i]
        if hitShape(h, px, py): return h
    return null

function hitShape(h, px, py)
    if h.shape == 'circle':                           // 音乐按钮、暂停按钮
        cx = h.x + h.w/2; cy = h.y + h.h/2; r = h.w/2 + KEY_HIT_SLOP
        return (px-cx)^2 + (py-cy)^2 <= r*r
    // 圆角矩形：先 AABB 粗筛，再 4 角圆心精确判
    if px < h.hit.x or px > h.hit.x + h.hit.w or py < h.hit.y or py > h.hit.y + h.hit.h:
        return false
    if h.shape != 'roundRect': return true
    r = h.round or 16
    // 四角：若落在角的外接方块内，则要求在圆内
    for c in CORNERS(h.hit, r):
        if inBox(px, py, c.box) and (px-c.cx)^2 + (py-c.cy)^2 > r*r: return false
    return true

function inflate(r, d) -> {x:r.x-d, y:r.y-d, w:r.w+2*d, h:r.h+2*d}
const KEY_HIT_SLOP = 6            // 设计坐标（750 宽）→ 约 8~10 逻辑 px，符合 44pt 最小可点区
```

**键盘 12 键的几何定义**（1:1 复刻视频布局 `7 8 9 / 4 5 6 / 1 2 3 / ⌫ 0`，`0` 跨两列）：

```pseudo
// ui/keypad.js 布局常量（设计坐标）
KEYPAD = { x: 20, y: 900, w: 710, rowH: 96, gapX: 10, gapY: 12 }
KEY_W_3COL = (KEYPAD.w - 2*KEYPAD.gapX) / 3       // ≈ 230
KEY_W_2COL = 2*KEY_W_3COL + KEYPAD.gapX           // 0 键跨 2 列 ≈ 470
LAYOUT = [
  {id:'7', cx:0, span:1, col:0}, {id:'8', cx:0, span:1, col:1}, {id:'9', cx:0, span:1, col:2},
  {id:'4', cx:0, span:1, col:0}, {id:'5', cx:0, span:1, col:1}, {id:'6', cx:0, span:1, col:2},
  {id:'1', cx:0, span:1, col:0}, {id:'2', cx:0, span:1, col:1}, {id:'3', cx:0, span:1, col:2},
  {id:'bs',cx:0, span:1, col:0}, {id:'0', cx:0, span:2, col:1}
]
// cx > 0 表示"往上跨行"，用于结果页/暂停页的重排（例如把 ✓ 放到 cx:2 跨两行）
function keyRect(item) -> {x,y,w,h}
    r = item.row * (KEYPAD.rowH + KEYPAD.gapY) + KEYPAD.y
    x = KEYPAD.x + item.col * (KEY_W_3COL + KEYPAD.gapX)
    w = item.span == 2 ? KEY_W_2COL : KEY_W_3COL
    return { x, y: r, w, h: KEYPAD.rowH }
```

### 8.3 多点触控 + 按下/抬起 + 滑动误触防护

```pseudo
// core/input.js
SLOP_DIST   = 18          // 设计坐标；手指在按下到抬起期间移动超过它 → 判为"滑动"，取消本次按压
SLOP_TIME   = 400         // ms；超过这个时长还没抬起 → 判为"长按停留"，也算取消（防手掌/口袋误触）
MULTI_MAX   = 5           // 最多同时追踪 5 根手指，超出忽略

TOUCH = {
  pointers: new Map(),    // id -> {id, downX, downY, downT, hitId, state, movedOut, cancelled}
  pool:   []              // 预分配的 pointer 对象，10 个，Map 里存引用
}

// ── wx.onTouchStart ─────────────────────────────────────────
function onTouchStart(e)
    for t in e.touches:
        if pointers.size >= MULTI_MAX: continue
        d = toDesign(t.clientX, t.clientY)
        h = hitTest(d.x, d.y)
        p = acquirePointer()
        p.downX = d.x; p.downY = d.y; p.downT = nowMs
        p.hitId = h ? h.id : null
        p.state = 'down'; p.cancelled = false
        pointers.set(t.identifier, p)
        if h and h.onPress:
            h.onPress(h)                        // **按下即给视觉+音效反馈**（不等抬起）
            audio.resumeOnFirstTouch()          // 首个触摸解锁 AudioContext

// ── wx.onTouchMove ──────────────────────────────────────────
function onTouchMove(e)
    for t in e.touches:
        p = pointers.get(t.identifier); if p == null: continue
        d = toDesign(t.clientX, t.clientY)
        if dist(d.x, d.y, p.downX, p.downY) > SLOP_DIST:
            p.cancelled = true                    // 判定为滑动误触
            cancelPress(p)                        // 撤销按压视觉（键帽弹回）
            p.state = 'sliding'                   // sliding 状态下的 move 不再做命中切换
        // 注意：**滑动中不重新命中**。手指按住 8 滑到 5 上，不应该触发 5。
        // 这是防误触的关键决策：一次按压只绑定一个键。

// ── wx.onTouchEnd ───────────────────────────────────────────
function onTouchEnd(e)
    endedIds = collectIdentifiers(e.changedTouches)
    for t in e.changedTouches:
        p = pointers.get(t.identifier); if p == null: continue
        d = toDesign(t.clientX, t.clientY)
        dt = nowMs - p.downT
        if p.state == 'down' and not p.cancelled and dt < SLOP_TIME:
            // 抬起时仍需在同一个键的判定区内（允许 SLOP 范围内小幅移动）
            h = hitTest(d.x, d.y)
            if h and h.id == p.hitId and h.onRelease:
                h.onRelease(h, {dwellMs: dt})     // 触发逻辑
            else:
                releasePress(p)                   // 抬起时已滑出 → 视为取消
        else:
            releasePress(p)
        pointers.delete(t.identifier)
        recyclePointer(p)
    // onTouchCancel 走同一条路径

// ── 长按连发（可选项，关闭）────────────────────────────────
// 题目卡长按 → 显示提示；结算页长按分数 → 显示明细。二者都用 SLOP_TIME 兜底，不会误触发
```

**键盘（H5 / 桌面）输入映射**（`web/platform/dom.js`，同时让小游戏可在 PC 端开发者工具里调试）：

```pseudo
KEYMAP = {
  '0'..'9':   -> inputDigit
  'Backspace':-> backspace
  'Enter':    -> confirmOrSkip       // 无确定键时用于跳过 intro
  'Escape':   -> togglePause
  ' '         -> togglePause
  'm':        -> toggleMute
}
function onKeyDown(e)
    if e.repeat: return                  // 屏蔽长按自动 repeat
    if e.key in KEYMAP: KEYMAP[e.key](); e.preventDefault()
```

### 8.4 响应延迟优化清单

| 手段 | 效果 |
|---|---|
| 按下即播音效 + 键帽下沉（不等抬起） | 听觉反馈提前 ~80ms |
| 视觉反馈在 touchstart 完成，`onTouchStart` 处理器里不做任何 `new`/measureText | 减少主线程占用 |
| 音效用预创建的 OscillatorNode + 复用 GainNode，不每次 `createOscillator` | 省 ~1ms/次 |
| 命中检测在按下时一次算完并缓存到 pointer，按下期间不再 hitTest | 每帧省 12 次矩形判定 |
| `HIT` 列表在布局期按 y 排序，`hitTest` 用二分（12 键可暴力，但结算页 40+ 命中区时必须二分） | 40 区时省 ~5× |
| 输入处理与逻辑更新解耦：touch 只改 `inputBuf`，判定在下一个固定步统一做 | 避免同一帧内多次切状态 |
| 关闭 `wx.setPreferredFramesPerSecond` 的重复调用 | 反复设置会触发引擎重初始化 |

---

## 9. 素材加载与资源管理

### 9.1 manifest 与并行加载

```pseudo
// core/assets.js
MANIFEST = {
  critical: [                              // 首屏必需（阻塞启动）
    'characters/char_bunny_star.png',
    'ui/keycap_white.png', 'ui/keycap_color.png', 'ui/card_white.png',
    'ui/dot_on.png', 'ui/dot_off.png', 'ui/badge_mult.png', 'ui/bg_ribbon.png',
    'ui/bg_gradient.png'
  ],
  preGame: [                                // 进游戏前加载（并行走）
    'characters/char_bunny_jump.png', 'characters/char_bunny_sleep.png',
    'ui/number-atlas.png', 'ui/star.png', 'ui/coin.png', 'ui/confetti.png'
  ],
  lazy: {                                   // 懒加载：进结算页时并行拉取
    result: ['characters/char_rabbit.png','characters/char_cat.png',
             'characters/char_bear.png','characters/char_chick.png'],
    picked: null                            // 玩家选中的非默认角色，选主页时单张加载
  }
}

PARALLEL = 4        // 并发上限：太高会内存峰值过高，太低启动慢

function loadGroup(keys, onProgress, onAll) -> Promise
    total = len(keys); done = 0; failed = []
    idx = 0
    next = function () {
        if idx >= total: onAll(failed); return
        k = keys[idx++]
        loadOne(k, function (ok) {
            done += 1
            onProgress(done / total, k, ok)
            if done % 2 == 0: yieldFrame()        // 每完成 2 张让出一帧，避免首屏卡
            next()
        })
    }
    next()

function loadOne(key, cb)
    img = wx.createImage()
    img.onload = function () {
        TEX[key] = { img, w: img.width, h: img.height, ok: true }
        // **立刻读一次 width 强制解码完成**，避免首次 drawImage 时才解码造成卡顿
        img.width; img.height
        cb(true)
    }
    img.onerror = function () {
        TEX[key] = makePlaceholder(key)          // 占位图，见 9.3
        cb(false)
    }
    img.src = key                              // 小游戏内相对路径直接可加载包内资源
```

**加载进度条**：`progress.js` 在 `boot` 场景绘制，绘制本身**不要每帧重绘整条**，用 `L_STATIC` 缓存底 + 只画前景填充矩形（1 次 `fillRect`）。进度百分比用数字图集画（1 次 drawImage）。

### 9.2 分帧加载（防白屏卡死）

```pseudo
// boot 场景
function boot()
    showLogo()
    yieldFrame()                                     // 先让 logo 画出来
    await loadGroup(critical, drawProgress, finishCritical)
    // 关键：critical 完成后**先进入 home 场景**（首屏可交互），preGame 在 home 期间后台加载
    switchTo('home')
    loadGroup(preGame, null, function(){ assets.preGameReady = true })
```

**首屏时序目标**：critical（9 张，其中 8 张是 ui 小图共 < 200KB + 1 张角色 ~90KB）→ 1.2s 内完成。

### 9.3 失败兜底：占位绘制

```pseudo
function makePlaceholder(key)
    // 按 key 的语义给出可辨识的占位，而不是一块灰
    if key contains 'characters/':
        return { kind:'char', draw: drawCharPlaceholder }     // 画一个带表情的圆形小人
    if key contains 'ui/':
        return { kind:'ui',   draw: drawUiPlaceholder  }     // 画一个描边圆角矩形
    return { kind:'icon', draw: drawIconPlaceholder }

function drawCharPlaceholder(ctx, x, y, w, h, key)
    // 画一个"简笔兔耳小人"，保证游戏仍可玩（不崩、能继续）
    cx = x + w/2; cy = y + h*0.62; r = min(w,h)*0.28
    ctx.fillStyle = '#FFD9E8'; circle(cx, cy, r); fill
    ctx.fillStyle = '#B0E4FF'; circle(cx-r*0.7, cy-r*1.5, r*0.3); fill   // 左耳
                     circle(cx+r*0.7, cy-r*1.5, r*0.3); fill            // 右耳
    ctx.fillStyle = '#3A3A5C'; circle(cx-r*0.3, cy-r*0.1, r*0.09); fill // 眼
                     circle(cx+r*0.3, cy-r*0.1, r*0.09); fill
    // 调试用：把 key 写到 canvas 之外（wx.onError 日志），不上屏（避免误导玩家）

// 兜底的兜底：如果连 ctx 都有问题（极端情况），assets 层暴露 healthy=false，
// app 走"极简模式"：只画纯色背景 + 文本告知资源加载失败 + 继续按钮（不崩，可退出）
```

### 9.4 包体实测（✅ v1.3 已达标，R2 解除）

> **v1.3 重要更正**：此前误把**源文件体积**（`build/assets/` 5.31MB）当成**打包体积**。
> 我已独立复算确认（Node `fs.statSync` 逐文件累加），数据如下：

| 口径 | 实测值 | 说明 |
|---|---|---|
| `build/assets/`（源文件） | 5.31 MB | **不打包**，仅美术留档 |
| **`miniprogram/assets/characters/`（主包真实占用）** | **918,581 B = 0.876 MB** | ✅ 压缩率 −79.2% |
| 最大单张 | 188,792 B = **184.4 KB** | `rabbit.png`（源 1230×1278） |
| 平均单张 | 128.2 KB | — |
| `char_styleguide.png` | **未进包** ✅ | 已确认 |
| `miniprogram` 目录总体积 | **1.1 MB** | 距 4MB 上限余 **2.9 MB** |

**结论：7 只角色全部放主包，保留"4 只可选主角"这个卖点。**

**三条作废的旧建议**（v1.1 曾据此让 3 只进分包 —— 会白白牺牲卖点）：

| v1.1 建议 | v1.3 实情 | 结论 |
|---|---|---|
| 转 WebP q82 | 已是 PNG，0.876MB | ❌ **不必转**。只能再省 ~0.2MB，但引入 Android 兼容风险，不值得 |
| 3 只兔子合成雪碧图 | 未做 | ❌ **不必做**。合图破坏"按角色单独加载"与失败兜底粒度 |
| 单图 ≤80KB 硬指标 | 实测最大 184.4KB | ❌ **放宽到单张 ≤200KB**（余量充足，别为达标而牺牲画质） |

**新增验收断言**：`G8 代码内无 loadSubpackage 调用` —— 分包逻辑本就不该有，有残留就删。

**保持有效的**：`tools/check-size.js` CI 卡口（主包 ≤4MB，超限即失败）**继续保留**。
理由：包体现在达标不代表以后达标——后续加角色、加 UI 位图仍可能突破。**这是一条防回归的护栏，不是当前的问题。**

```bash
# tools/optimize-assets.sh（v1.3 修订：用黑名单而非白名单）
set -e
DST=../miniprogram/assets/characters
mkdir -p "$DST"
# ★ 黑名单：设计参考图绝不能进包（783KB，误进直接超限）
EXCLUDE="char_styleguide"
for src in ../analyze/char_*.png ../build/assets/char_*.png; do
  [ -e "$src" ] || continue
  f=$(basename "$src" .png)
  case " $EXCLUDE " in *" $f "*) echo "skip $f (blacklist)"; continue ;; esac
  magick "$src" -resize 384x576 -background none -alpha on -strip /tmp/$f.png
  pngquant --quality=70-92 --speed 1 --force --output "$DST/${f}.png" /tmp/$f.png
done
node ../tools/check-size.js ../miniprogram 4.0     # 护栏：超 4MB 失败退出
node ../tools/check-assets-blacklist.sh            # 护栏：确认 styleguide 未进包
```

### 9.5 内存预算与释放（★ v1.3 修订：7 只常驻 ≈ 11MB）

```pseudo
// 位图内存 = w × h × 4 字节（RGBA，**解码后**）
// 角色 384×576 ≈ 0.84MB/张 → 7 只全常驻 ≈ 5.9MB
// ⚠️ UI_SPEC §8.2 实测口径：**单张解码 ≈ 1.6MB**（含 mipmap/对齐开销）
//    → 7 只全常驻 ≈ 11MB。低端机（内存 <2GB）必须分级缓存。

// ★ v1.3 分级缓存策略（低端机必需）
const MEM_TIER = deviceMemoryGB >= 4 ? 'high' : (deviceMemoryGB >= 3 ? 'mid' : 'low')
// high/mid：7 只全部预载（保持"随时切角色"体验）
// low     ：只常驻「当前主角 3 态」，其余在**进入结算页前**预载，用完立即 evict

// 结算页伙伴的按需预载（low 档）
function preloadResultPartners(onDone)
    if MEM_TIER != 'low': return                     // high/mid 已全部预载
    need = ['char_rabbit','char_cat','char_bear','char_chick'] minus 当前主角
    loadGroup(need, null, function () { evictOthers(); onDone() })

// ★ evict 时机：结算页展示完毕 + 停留 ≥1.5s 后（避免孩子快速切页反复加载）
function evictOthers()
    keep = [当前主角 3 态] + [结算页伙伴 4 只（若刚用过）]
    for key in TEX:
        if key is character and key not in keep:
            TEX[key] = null                          // 显式置 null，交 GC
    // 保留：digitAtlas（重建成本高）、L_BG、L_STATIC、全部 ui 位图
```

**总内存预算（high 档）**：

| 项 | 大小 |
|---|---|
| 7 只角色解码 | ≈ 11 MB |
| 离屏层 L_BG + L_STATIC（750×1334@2） | ≈ 15 MB |
| digitAtlas（1024×512@2） | ≈ 4 MB |
| 上屏 canvas（750×1334@2.5） | ≈ 10 MB |
| UI 位图（图集） | ≈ 3 MB |
| **合计** | **≈ 43 MB** + 引擎开销 |

> iPhone 6s（1GB）可接受；<2GB 机型走 `low` 档（只常驻当前角色），降到 ≈ 25MB。
> `wx.onMemoryWarning`（§11.4 #9）作为兜底：告警时清 `textCache`/`shapeCache` + 全部离屏层（保留 `digitAtlas`）。

---

## 10. 跨端共享层设计

### 10.1 Platform 接口（唯一适配点）

```pseudo
// shared/platform-interface.js —— 接口契约（纯注释 + 类型说明，零实现）
// 任何平台只需实现这一个对象，即可让 L1/L2/L3/L4 全部代码原样运行

Platform = {
  // ── 时钟与循环 ──────────────────────────────────
  now()            -> number   // 毫秒，单调递增（用 performance.now 语义，不要用 Date.now 精度不够）
  raf(cb)          -> id
  caf(id)          -> void

  // ── 屏幕 ────────────────────────────────────────
  getWindowInfo()  -> {windowWidth, windowHeight, screenWidth, screenHeight,
                        pixelRatio, statusBarHeight, safeArea?{top,bottom,left,right}}
  makeCanvas(w,h,onScreen) -> Canvas   // 小游戏: 第一次 true 返回上屏，之后离屏
                                            // H5: onScreen 用已挂载的 DOM canvas，否则 document.createElement
  getCanvas2d(canvas) -> ctx

  // ── 资源 ────────────────────────────────────────
  loadImage(key)   -> { promise, img }   // 相对 key；失败 reject
  // 说明：小游戏用 wx.createImage；H5 用 new Image + relative path

  // ── 存储 ────────────────────────────────────────
  storage: {
    get(key, def)   -> any      // 小游戏 wx.getStorageSync；H5 localStorage
    set(key, val)   -> void
    remove(key)     -> void
  },

  // ── 反馈 ────────────────────────────────────────
  vibrate(type)    -> void      // 'light'|'medium'|'heavy'；H5 端 no-op 或用 navigator.vibrate
  keepScreenOn(b)  -> void      // wx.setKeepScreenOn；H5 no-op

  // ── 音频 ────────────────────────────────────────
  audio: {
    unlock()        -> void      // 在首个用户手势里调一次
    resume()        -> void      // onShow 后调
    suspend()       -> void
    setMuted(b)     -> void
    // 以下为"合成器接口"——音效用代码合成，无音频文件
    tone(spec)      -> void      // {freq, dur, type, gain, attack, decay, detune, slideTo, pan}
    noise(spec)     -> void      // {dur, gain, filterFreq, sweepTo}
    bgm(name)       -> void      // 'menu'|'level'|'game'  循环乐段
    bgmStop(fadeMs) -> void
  },

  // ── 生命周期 ────────────────────────────────────
  onHide(cb) / onShow(cb) / onMemoryWarning(cb) / onResize(cb),

  // ── 平台增值（两端都可为空实现）──────────────────
  share(opts, cb)      -> void     // 微信: wx.shareAppMessage；H5: navigator.share 或复制链接
  ad: {
    isRewardedReady()  -> bool
    showRewarded(cb)   -> void     // cb({completed})；H5 返回 {completed:false}
    showBanner(id, cb) -> void
  },
  reportEvent(name, data) -> void   // 埋点；H5 打到 console
  getLaunchParams()    -> object    // 启动参数（分享进入的 query）
}
```

### 10.2 注入与使用

```pseudo
// miniprogram/game.js
const platform = require('./platform/wx')
const { createApp } = require('./core/app')
createApp(platform).start()

// web/boot.js
const platform = require('./platform/dom')
const { createApp } = require('../miniprogram/core/app')
createApp(platform).start()

// core/app.js
function createApp(platform) {
    const app = {
        platform: platform,                       // **全应用唯一的平台入口**
        loop: new Loop({ raf: platform.raf, caf: platform.caf, onStep, onRender }),
        viewport: new Viewport(platform),
        assets: new Assets(platform),
        audio: new AudioEngine(platform.audio),
        bus: new Bus(),
        ...
    }
    return app
}
```

**落地验证方式**：`core/*`、`render/*`、`ui/*`、`fx/*`、`scenes/*` 全部文件里，`grep -n "wx\.\|document\.\|window\."` 结果必须为 0（`view/port` 有一处 `window` 用于 resize 兜底，需通过 `platform.onResize` 消除）。

### 10.3 两端的已知差异（写进 `web/README.md`）

| 能力 | 微信小游戏 | H5 | 处理 |
|---|---|---|---|
| 震动 | `wx.vibrateShort/Long` | iOS Safari 不支持 | H5 `vibrate` 为 no-op，`audio` 用视觉替代 |
| 分享 | `wx.shareAppMessage` | `navigator.share`（Android Chrome 有） | H5 降级为"复制链接"toast |
| 激励视频 | `wx.createRewardedVideoAd` | 无 | H5 按钮置灰 + 提示"请在微信中体验复活" |
| 存储 | `wx.setStorageSync` 10MB | `localStorage` 5MB | H5 存压缩版（只存最高分/设置/主角） |
| 音频首次播放 | 需用户手势 | 需用户手势 | 两端都在首个 touchstart 解锁 |
| 帧率 | 可 `wx.setPreferredFramesPerSecond(30)` | 无法限帧 | 降级策略在 H5 少一档 |
| dpr | ≤ 3 | ≤ 3 | 同样封顶 2.5 |

---

## 11. 微信小游戏工程配置

### 11.1 `game.json`

```json
{
  "deviceOrientation": "portrait",
  "showStatusBar": false,
  "networkTimeout": {
    "request": 10000,
    "connectSocket": 10000,
    "uploadFile": 10000,
    "downloadFile": 10000
  },
  "subpackages": [
    { "name": "partners", "root": "subpackages/partners/" }
  ],
  "permission": {
    "scope.userLocation": { "desc": "" }
  },
  "navigateToMiniProgramAppIdList": [],
  "workers": "",
  "openDataContext": "",
  "resizable": false
}
```

| 字段 | 值 | 理由 |
|---|---|---|
| `deviceOrientation` | `"portrait"` | **PRD 核心是竖屏 9:16**。这一条不加，真机会横屏 |
| `showStatusBar` | `false` | 沉浸式全屏；状态栏由我们的 HUD 自绘（避开刘海） |
| `subpackages` | `partners` | 预留：结算页的 4 张伙伴立绘 + 后续可能的大图，走 `wx.loadSubpackage` 懒加载（主包+分包 ≤ 30MB，此处远未触及） |
| `openDataContext` | `""` | 首版不做好友排行。若后续做，**必须**独立分包，否则开放数据域代码会打进主包 |
| `navigateToMiniProgramAppIdList` | `[]` | **审核红线**：不允许跳转其他小程序，必须为空 |
| `networkTimeout` | 10000 | 广告/云开发/排行榜的统一超时 |
| `resizable` | `false` | 竖屏游戏不需要分屏 |
| `permission` | 空 desc | 首版不申请任何权限。**不申请就不需要在隐私指引里声明**，减审风险 |

### 11.2 `project.config.json`

```json
{
  "description": "星算速算家 - 小学算术速算闯关小游戏",
  "projectname": "star-math-studio",
  "appid": "wx<你的小游戏AppID>",
  "compileType": "game",
  "libVersion": "3.5.5",
  "setting": {
    "es6": true,
    "enhance": false,
    "postcss": false,
    "minified": true,
    "minifyWXSS": false,
    "showShadowRootInWxmlPanel": false,
    "packNpmManually": false,
    "packNpmRelationList": [],
    "babelSetting": {
      "ignore": [],
      "disablePlugins": [],
      "outputPath": ""
    },
    "urlCheck": false,
    "coverView": false,
    "lazyloadPlaceholderEnable": false,
    "useStaticServer": true,
    "checkInvalidKey": true,
    "disableUseStrict": false,
    "condition": false
  },
  "packOptions": {
    "ignore": [
      { "type": "folder", "value": "web" },
      { "type": "folder", "value": "tools" },
      { "type": "folder", "value": "shared/__test__" },
      { "type": "folder", "value": "docs" },
      { "type": "file", "value": "package.json" },
      { "type": "file", "value": "README.md" }
    ],
    "include": []
  },
  "condition": {
    "game": {
      "list": [
        { "name": "默认启动", "pathName": "" },
        { "name": "直接进游戏(三年级)", "query": "quickstart=1&grade=3" }
      ]
    }
  }
}
```

**要点说明**：

| 字段 | 说明 |
|---|---|
| `"minified": true` | 上传时压缩 JS，180KB → 约 90KB。**本地开发时建议关掉**（否则 stack trace 无效），用 `project.private.config.json` 覆盖 |
| `"packOptions.ignore"` | **必须排除 `web/`**，否则 H5 代码白占包体；也排除 `tools/`、`docs/`、`__test__/` |
| `"checkInvalidKey": true` | 帮我们发现 `wx.xxx` 拼写错误，避免运行时静默失败 |
| `"useStaticServer": true` | 本地静态资源走开发服务器，图片热改即时生效 |
| `"urlCheck": false` | 开发期关闭域名校验（真机预览时仍会拦，需在后台配白名单） |
| `"condition.game.list"` | 定义自定义编译模式，便于 QA 直接跳到指定年级验证 |
| `appid` | **必须是"小游戏"类目下的 AppID**，小程序的 AppID 不能上传为小游戏 |

### 11.3 `project.private.config.json`（不入库）

```json
{
  "setting": {
    "minified": false,
    "urlCheck": false,
    "compileHotReLoad": true
  }
}
```

### 11.4 真机调试注意事项（**血泪清单**）

| # | 事项 | 说明 / 修法 |
|---|---|---|
| 1 | **必测低端机** | iPhone 6s / 华为nova 3 / 小米8 是三档基准。模拟器 fps 好看不代表真机行 |
| 2 | **`wx.getWindowInfo()` 可能不返回 `safeArea`** | 写兜底：`safeArea = {top: statusBarHeight, bottom: screenHeight}` |
| 3 | **`canvas.requestAnimationFrame` 切后台自动停** | 必须 `wx.onShow` 里 `loop.resetBase()`，否则回来第一帧 dt 巨大 → 动画瞬移 / 一次扣掉大量时间 |
| 4 | **iOS 切后台回来没声音** | `wx.onShow` 里 `audio.resume()`。这是最高频的差评来源 |
| 5 | **首次播放无声** | WebAudio 必须 `resume()` 于用户手势。在第一个 `touchstart` 里调 `audio.unlock()` |
| 6 | **触摸坐标偏移** | 必须做 `toDesign()` 映射（§8.1）。不做在 iPhone 全面屏上会整体上移几十 px |
| 7 | **`onHide` 里只能同步操作** | `onHide` 有时间预算（iOS 约 1s），只能 `setStorageSync` 同步存，禁止网络请求 |
| 8 | **`onHide` 后 `onShow` 未成对** | 极端情况下（被系统杀掉）只会走 `onHide` 不走 `onShow`。存档必须在 `onHide` 就写完 |
| 9 | **`wx.onMemoryWarning` 要接** | iOS 低内存时会被杀。接上后清缓存可显著降低被杀概率 |
| 10 | **`ctx.scale(dpr,dpr)` 只需调一次** | 每次 resize 重复 scale 会累积。resize 时先 `setTransform(1,0,0,1,0,0)` 再 scale |
| 11 | **字体** | Canvas 2D 只支持系统字体；`wx.loadFontFace` 在小游戏可用但**加载有异步延迟**，字体未就绪时会用兜底字体导致排版跳变。方案：字体表在 `boot` 阶段 `await` 完成后再进 home；或干脆用系统字体 + 数字图集（推荐后者） |
| 12 | **图片格式** | 真机验证 WebP；个别低版本 Android 基础库可能失败 → 保留 PNG 分支 |
| 13 | **`console.log` 真机不可用** | 用 `wx.onError` + 内部日志环形缓冲（写文件/上报），不要在 vConsole 里 dump 循环引用对象（会崩 vConsole） |
| 14 | **`drawImage` 传 0 宽高会报错** | 离屏层 resize 前若尺寸为 0，跳过该帧绘制 |
| 15 | **`ctx.clip()` 未配对 restore** | 每次 `clip()` 都要有对应 `restore()`，否则污染后续绘制。规范：每个绘制函数自己 `save()/restore()` 成对，深度 ≤ 3 |
| 16 | **分包 Android 已知问题** | 分包内的字体文件在部分 Android 上加载失败（本项目不用字体分包，影响可控） |
| 17 | **审核：类目** | 必须选"教育-在线教育"或"工具"，**不能**选游戏（涉及版号），且版本描述要写清"无广告无内购" |
| 18 | **审核：不得诱导分享** | 分享只能作为"分享成绩"的可选入口，**不得**出现"分享得金币""分享继续游戏" |
| 19 | **审核：广告** | 首版**不接任何广告**（PRD 明确"无广告无内购"）。激励视频留 M4 再接，接的时候要在结算页显著标注 |
| 20 | **体验版/审核版差异** | `urlCheck` 在体验版和正式版会拦截未配置域名；云开发需在后台开通并配置环境 |

### 11.5 启动方式（交付要求，PRD §3.5）

| 入口 | 步骤 |
|---|---|
| 微信开发者工具 | 导入目录 `miniprogram/` → 填小游戏 AppID → 编译 → 预览（真机扫码） |
| H5 预览 | 直接双击 `web/index.html`（Chrome/Edge/Safari 均可，无需服务器） |
| 纯 Node 自测 | `node shared/__test__/run.js`（不依赖任何运行时） |

---

## 12. 后端接口契约（交给 `backend-cloud-dev`）

> 首版**完全离线**（`wx.setStorageSync`），本节是为 M2 之后的排行榜/错题本预留的契约。**前端已按此契约写好适配层占位**（`platform.reportEvent` + `core/sync.js` 空实现），后端可以后置。

### 12.1 提交一次对局成绩

```
POST https://<cloud-fn-base>/game/session/submit
Header: { "X-Token": "<wx.cloud.callFunction 拿到的 openid 派生 token>" }

Request:
{
  "clientVersion": "1.0.0",
  "grade": 3,                    // 1-6
  "manualDifficulty": 0,         // -3..3
  "characterId": "bunny",
  "score": 12480,                // 整数
  "maxCombo": 37,
  "correctCount": 42,
  "wrongCount": 6,
  "levelsCleared": 4,
  "durationMs": 182000,          // 真实耗时，用于校验
  "finalDL": 7,
  "fingerprintSeed": 88213,      // 由前端 rng seed 提供，后端可据此复盘题库
  "occurredAt": 1767000000000
}

Response:
{
  "ok": true,
  "data": {
    "sessionId": "5f3a...",
    "rank": 128,                  // 好友榜排名；未上榜返回 null
    "percentile": 0.83,           // 超过 83% 的同日同年级玩家
    "bestScore": 15200,           // 新的个人最佳（未破纪录返回旧值）
    "newRecord": true
  }
}
```

**校验规则（后端必须做，防刷）**：
- `score ≤ 200 * (correctCount + wrongCount) * 3`（单题满分上限）
- `durationMs ≥ (correctCount + wrongCount) * 800`（单题最短 0.8s）
- `finalDL` 必须在 `[GRADE_BASE[grade]-1, GRADE_CAP[grade]+1]` 内

### 12.2 拉取排行榜

```
GET https://<cloud-fn-base>/game/leaderboard?grade=3&scope=friend&limit=50

Response:
{ "ok": true, "data": { "list": [
    { "openidHash":"a1b2", "nickname":"小明", "avatarUrl":"cloud://...", "score":15200, "grade":3, "at":1767000000000 }
] } }
```

### 12.3 错题本同步

```
POST https://<cloud-fn-base>/game/mistakes/sync
Request: { "items": [
    { "opCode":"sub", "display":"19.1−4.6", "answer":"14.5", "grade":4, "dl":6, "wrongCount":3, "lastAt":1767000000000 }
] }
Response: { "ok": true, "data": { "synced": 12, "serverTotal": 48 } }
```

### 12.4 埋点（前端已实现的 `platform.reportEvent` 消费）

```
POST https://<cloud-fn-base>/game/track
{ "events": [ { "n":"boot", "t":1200, "p":{} }, { "n":"question_correct", "t":3400, "p":{"dl":5,"combo":12} } ] }
```
事件名清单（前端已固定，请勿改动）：`boot / home_show / game_start / question_correct / question_wrong / level_up / game_over / restart / pause / ad_request`。

---

## 13. 风险登记与验收清单

### 13.1 风险

| ID | 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|---|
| R1 | **小游戏主体/类目审核不合规**（K12 教育内容 + 无版号） | 中 | 高，无法上线 | 提前与主理人确认主体资质；**同时准备 §1.3 的小程序降级壳**（架构已为此预留，1 人日可切） |
| R2 | ~~素材超包体~~ **已解除（v1.3 实测确认）** | ~~确定发生~~ **已发生** | ~~高~~ **无** | ✅ 实测：角色目录 918,581 B = **0.876MB**，最大单张 184.4KB，`miniprogram` 总 1.1MB，距 4MB 余 2.9MB（**我已独立复算，与 UI 设计师数据一致**）。`char_styleguide.png` 确认未进包。**7 只角色全部在主包，保留"4 只可选主角"卖点** |
| R3 | 低端机掉帧 < 30fps | 中 | 中，差评 | 四层渲染 + 粒子池 + 数字图集 + 分级降质（§7） |
| R4 | 自动判定"太聪明"导致误判挫败 | **高**（新机制固有风险） | 中，差评/流失 | ① 260ms 迟滞宽限（§6.3）② 连击保护 3s（§6.4）③ 答案整数部分 1 位时自动预置引导 `0`（§6.3）④ 软限时**不惩罚**只压迫（§6.6） |
| R5 | 难度曲线失控（3-4 年级玩 10 分钟就崩） | 中 | 中 | DL 参数全在 `config.js` 一处；`GRADE_CAP` 限制；建议 A/B 观察 `level_up` 前平均 DL 与 `question_wrong` 率 |
| R6 | iOS 切后台回来无声 | **高** | 中 | `onShow` 强制 `audio.resume()` + 首个手势 `unlock()`（§11.4 #4 #5） |
| R7 | 真机触摸偏移 | 中 | 中 | `toDesign()` 映射 + 三档真机回归（§8.1） |
| R8 | WebP 在低端 Android 不显示 | 低 | 中 | PNG 兜底分支，代价 +200KB（§9.4） |
| R9 | 分享被判"诱导分享" | 低 | 高（拒审） | 分享仅"可选的成绩分享"，无任何分享奖励（§11.4 #18） |
| R10 | 循环依赖在赶工时被破坏 | **高** | 中 | R1~R5 规则写进 code review checklist；`tools/check-purity.js` 查 shared 纯净性 |
| **R11** | **v1.1 新增**：`leftHanded` 切换时布局重建漏步（残影 / 命中区错位 / 内存泄漏） | 中 | 中 | 切换必须走统一的 `onLeftHandedChanged()`：重排 Layout + 标脏 L_STATIC + **重注册 HIT** 三步不可省（§14.2） |
| **R12** | **v1.1 新增**：家长同意弹层漏发（`privacyNoticeVersion` 检查漏写） | **低（技术）/ 高（合规）** | **高，不可上架** | ① `boot.js` 首分支强制调用 `checkPrivacyConsent()` ② code review checklist 显式列一条 ③ 提审前用全新微信账号首启截图验证 |
| **R13** | **v1.1 新增**：`reduceMotion` 收口被绕过（新加特效忘拦截） | **高（赶工时必然发生）** | 中（可用性事故） | `tools/check-reduce-motion.js` CI 卡口：`fx/` 下除 `index.js`/`characterAnim.js`/`mode.js` 外不得直接读 `MODE.reduceMotion`，违反退出码 1（§14.1） |
| **R14** | **v1.1 新增**：`fontScale` 钳制被绕过（某处自己乘了 fontScale） | 中 | 中（高年级字变小） | `eqFontFor()` 唯一入口 + `fontClamp.test.js` 断言"最终字号 ≥ gradeCfg.eqFont × 0.92"（§14.1） |
| **R15** | **v1.3 新增**：左手模式「第 N 问」(596—630) 与算式区 (560—786) **纵向重叠 190px** | **确定发生**（已被 `layout-assert.test.js` G8b 拦截） | 中（左手模式用户看到文字叠字） | ★ **待 ui-designer 给新落点**。我的建议见 §14.2 的方案 b（移到卡底 meta 行 y 786—830）。修复前**左手模式不可上线** |
| **R16** | **v1.3 新增**：`fontBoost` 引入后 `shrinkFloor` 基准用错（用 `base` 而非 `base+boost`） | 中 | 中（低年级 fontScale 失效） | `applyBoostAndScale()` 统一处理；`fontClamp.test.js` 加断言覆盖（§14.1 ②） |
| **R17** | **v1.3 新增**：7 只角色全部常驻内存 ≈ 11MB，低端机（<2GB）内存紧张 | 中 | 中（低端机 OOM / 被系统杀） | 分级缓存策略（见 §9.5 v1.3 修订）：只常驻当前角色 + 结算页伙伴，进结算页前预载并 `evict` 其余（§11.4 #9 已接 `onMemoryWarning`） |
| **R18** | **v1.3 新增**：`feedLeft`（0.85s） < 正确答案 6 阶段时长（2440ms），正确答案展示被截断 | **确定发生**（时序算术必然） | 中（孩子看不到正确答案，等于白做） | ★ **待 team-lead 拍板**：建议方案 A（答错 `feedLeft` 拉长至 2440ms）+ 1—2 年级不限时（§14.1 ④） |

### 13.2 验收清单（Definition of Done）

**架构类**
- [ ] `shared/` 目录 `grep -rn "wx\.\|document\.\|window\."` 结果为 0
- [ ] `wx.` 只出现在 `miniprogram/platform/wx.js` 和 `miniprogram/game.js`
- [ ] 依赖图无环（人工 review 一次 + 一次性脚本验证）
- [ ] `web/index.html` 双击可运行，全部玩法可达

**算法类**
- [ ] `node shared/__test__/run.js` 全绿
- [ ] 10 万次随机生成，100% 满足：答案非负、答案小数位 ≤ 2、div/quoRem 全部整除、范围不超 opTable、mix/paren 不出负数
- [ ] 10 万次随机生成，最近 12 题内完全重复为 0
- [ ] 一年级 DL1-3 生成的题，**进位/退位次数**经抽样人工确认 ≤ 2
- [ ] validator 三态判定穷举对拍：`isPrefixConflict` 逻辑 100% 正确
- [ ] 商余双槽：商输完自动跳槽、余数输完自动判定
- [ ] ★ v1.1 `fontClamp.test.js`：六年级 + fontScale=2 + 超长算式 → 最终字号 ≥ 51.5 且**不小于不开时的 56**
- [ ] ★ v1.1 DL 钳制：六年级 + difficultyOffset(+3) + global(+3) → `displayDL()` 返回 10，且 `dlInt()` 也是 10（两者必须相同）

**手感类**
- [ ] iPhone 6s 连续 10 分钟：帧率 ≥ 55fps，`droppedMs` 累计 < 500ms
- [ ] 切后台 30s 再回：无瞬移、倒计时不跳变、声音恢复
- [ ] 按键到音效延迟主观 < 80ms（主观评审 3 人）
- [ ] 60fps 下粒子峰值 260 drawImage 不掉帧
- [ ] ★ v1.1 排行榜 1.5s 降级用**真实时间**（`dtReal`）计时，慢动作演出中不延长

**包体类**
- [ ] `node tools/check-size.js miniprogram 4.0` 通过
- [ ] `check-size.js` 报告主包 ≤ 1.5MB
- [ ] 真机冷启动到可交互 ≤ 1.5s（iPhone 6s / nova 3）

**复刻类（对照 PRD §2 逐条）**
- [ ] L1 顶部 HUD：关卡进度点阵 + 倒计时 + 总分 ✓
- [ ] L2 数据条：正解 N/10 + 失误 N + 连击 N + 倍率徽章 ×1.25 ✓
- [ ] L3 关卡横幅：EX N 斜切彩带 ✓
- [ ] L4 角色台：公仔待机（呼吸动画）✓
- [ ] L5 题目白卡：题型标签 + 第 N 问 + 竖排算式 + 右侧红圈答题位 ✓
- [ ] L6 数字键盘：`7 8 9 / 4 5 6 / 1 2 3 / ⌫ 0`（0 跨两列）✓
- [ ] 题型标签有文字（中文）✓
- [ ] 仅底部键盘输入，支持退格 ✓
- [ ] 输入实时显示在右侧红圈 ✓
- [ ] 连击升高时键盘数字彩色高亮 ✓
- [ ] 答对：角色跳跃 + 星星迸射 + 彩带飘落 ✓
- [ ] 答错：失误 +1 + 短暂红闪 ✓
- [ ] 关卡制 EX 1…EX N，过关切横幅 ✓
- [ ] 关卡内倒计时，答对加时间 ✓
- [ ] 掉落物收集加分（金币）✓

**增强类（对照 PRD §3）**
- [ ] 4 只可选主角 + 角色 6 态状态机 ✓
- [ ] DL 1-10 三层难度叠加 ✓
- [ ] BGM（WebAudio 合成）+ 6 种音效 + 静音/震动开关 ✓
- [ ] 全中文、口语化提示语 ✓
- [ ] 配色天蓝+亮黄+粉桃+薄荷绿，按钮 ≥ 88rpx ✓
- [ ] 按年级分组 + 难度手动 1-10 档 ✓
- [ ] 键盘/触屏/鼠标三端输入 ✓
- [ ] 角色素材替换位置明确标注（`shared/characters.js` 映射表 + §9.4 表）✓

**v1.1 UI_SPEC 附录 A 咬合类**（详见 §14.9 验收点）
- [ ] fontScale 三条钳制全部生效（§14.1）：最坏情况五年级 72.8 → 缩放 0.72 → 仍 ≥ 56
- [ ] DL 叠加钳制生效，UI 显示钳制后的值（§14.1）
- [ ] reduceMotion 16 项逐条覆盖（§14.1），且"答对/答错在关掉动效后仍可区分"专项通过
- [ ] leftHanded 逐元素镜像，无镜像文字（§14.2）
- [ ] ReviewScene 为独立场景，1-2 年级走复习时**键盘区被替换为 3 选 1**（§14.3）
- [ ] 排行榜 loading 超 1.5s 强制降级，任何时刻无空白页/无限转圈（§14.5）
- [ ] 家长同意弹层：默认全不勾选、两按钮视觉权重对等、无倒计时无挡板（§14.6）
- [ ] 家长门在**进入 B 组之前**校验（不是先进去再拦）（§14.4）

---

## 14. UI_SPEC 附录 A 咬合实现方案（v1.1）

> 本章回答"UI_SPEC 附录 A 的新增界面与钳制规则，前端怎么落地"。
> 坐标一律以 UI_SPEC 的 **672×1280** 基准为准，**不用**本文 §2/§8 的 750×1334 基准。
> 两套基准的换算关系：`designX = uiX × 750 / 672 = uiX × 1.1160`
> **实现约定**：所有布局常量直接照抄 UI_SPEC 坐标（672 基准），在 `viewport.js` 里
> `toDesign()` 之后再做一次 `672/750` 的比例映射，保证 UI_SPEC 坐标是唯一事实源。

### 14.1 三条强制钳制规则（不写会出线上事故）

#### ① `fontScale` × 年级字号的叠加钳制（UI_SPEC §19.4）

**问题本质**：`fontScale` 放大字号 → 算式变长 → 自动缩放系数变小 → **高年级用户开"特大字号"后看到的字反而比不开更小**。这是逻辑上闭环的 bug，不加钳制必然发生。

```pseudo
// ui/theme.js —— 唯一的字号计算入口，所有 draw 算式处必须调它，禁止自己乘 fontScale
const FONT_SCALE = [1.0, 1.15, 1.3]        // 对应 settings.fontScale = 0 / 1 / 2
const EQ_FONT_MAX = 88
const SHRINK_FLOOR_RATIO = 0.92

function eqFontFor(gradeCfg, settings)
    fs = FONT_SCALE[settings.fontScale] or 1.0
    f  = gradeCfg.eqFont * fs
    f  = max(f, gradeCfg.eqFont)                       // 钳1：永不缩小到基准以下
    shrinkFloor = gradeCfg.eqFont * SHRINK_FLOOR_RATIO
    f  = min(f, EQ_FONT_MAX)                           // 钳3：上限 88
    return { font: f, shrinkFloor: shrinkFloor }       // shrinkFloor 供自动缩放时钳制

// 自动缩放（算式超出卡片宽度时）也必须受 shrinkFloor 约束
function fitEquationFont(gradeCfg, settings, measureFn, boxW)
    r = eqFontFor(gradeCfg, settings)
    f = r.font
    if measureFn('0', f) * expectedMaxGlyphs > boxW:
        f = f * (boxW / (measureFn('0', f) * expectedMaxGlyphs))   // 等比缩小
        f = max(f, r.shrinkFloor)                       // 钳2：缩小也有下限
    return f

// 验证（必须写成单测，见 shared/__test__/fontClamp.test.js）：
//   grade6: eqFont=56, fontScale=2 → 56*1.3=72.8 → min(72.8,88)=72.8
//   假设算式需缩放 0.72 → 72.8*0.72 = 52.4 < shrinkFloor 51.5?
//   56*0.92 = 51.5 → 52.4 ≥ 51.5 通过；但若缩放系数 0.70 → 50.96 < 51.5 → 钳到 51.5
//   ★ 关键断言：最终字号**永远 ≥ gradeCfg.eqFont × 0.92**，即"开特大字号不亏"
```

**联动缩放表**（UI_SPEC §19.4 下半表，原样实现）：

| 元素 | 缩放规则 | 实现 |
|---|---|---|
| 算式 `eqFont` | 见上（三钳） | `eqFontFor()` |
| 键盘数字 `fs-key` | `× (1 + (fs-1) × 0.7)` | `keyFontFor(gradeCfg, settings)` |
| 「第 N 问」 | `× fs` | `qIndexFontFor()` |
| 题型标签文字 | `× fs`，但**标签高度固定 46 不变** | 用 `textBaseline='middle'` 居中，不加高容器 |
| HUD / 数据条 | **不缩放** | 直接用 `gradeCfg` 原值 |
| 结算页大分数 | `× fs`，上限 128 | `min(128, scoreFont * fs)` |

#### ② `fontBoost`：年级基准 + 低年级加成（UI_SPEC §7.3 v1.3）

v1.3 把 1—2 年级字号整体 +2（算式 72→74、键帽 52→54、标签 26→28、提示 20→22）。
**关键设计：加成走配置字段，不在各处硬编码 `+2`。**

```pseudo
// shared/config.js（v1.3 修订）
GRADE_CFG = {
  1: { eqFont:72, keyFont:52, tagFont:26, hintFont:20, fontBoost:2, ... },
  2: { eqFont:72, keyFont:52, tagFont:26, hintFont:20, fontBoost:2, ... },
  3: { eqFont:64, keyFont:46, tagFont:26, hintFont:20, fontBoost:0, ... },
  ...
}

// ui/theme.js（v1.3 修订）—— **所有字号取值都必须走这三个函数**，禁止直接读 gradeCfg.eqFont
function eqFontFor(g, settings)   { return applyBoostAndScale(g.eqFont,  g.fontBoost,  settings) }
function keyFontFor(g, settings)  { return applyBoostAndScale(g.keyFont, g.fontBoost, settings) }
function tagFontFor(g, settings)  { return applyBoostAndScale(g.tagFont, g.fontBoost, settings) }

// ★ 顺序很重要：**先加年级 boost，再乘用户 fontScale，最后过三道钳制**
//   顺序反了会出现「低年级 boost 被 fontScale 吃掉」或「高年级反被放大」
function applyBoostAndScale(base, boost, settings)
    b = base + boost                        // ① 年级加成（低年级更大）
    fs = FONT_SCALE[settings.fontScale] or 1.0
    f = b * fs                              // ② 用户缩放
    f = max(f, b)                           // 钳1：永不缩到「含boost 的基准」以下
    shrinkFloor = b * SHRINK_FLOOR_RATIO     // 钳2：自动缩放下限也基于含 boost 的值
    f = min(f, EQ_FONT_MAX)                 // 钳3：上限 88
    return { font: f, shrinkFloor: shrinkFloor, base: b }
```

> **为什么 shrinkFloor 也要用 `b` 而不是 `base`**：若用原始 `base`（72）算下限，
> 而实际基准是 `b`（74），那 fontScale=1 时就可能出现 72 < 74 的矛盾。
> 这是 v1.3 引入 fontBoost 后新增的一个坑，已在 `fontClamp.test.js` 中加断言覆盖。

**已验算**（UI_SPEC §7.3）：74px 缩放后不溢出白卡、缩放下限 68.1px 远高于可读底线、
54px 在 204px 键内留白充足、28px 在 46px 胶囊内不溢出。

#### ③ 「1—2 年级隐藏最高分」（UI_SPEC §7.4 v1.3）

```pseudo
// scenes/home.js —— 年级卡右下角
// ★ 判定用 bestScore === 0，不要用「有无游玩记录」
//   理由：玩了但全错也是 0 分 —— 那正是最需要鼓励的场景，
//   此时该显示「⭐ 第一个记录」而不是冷冰冰的「0」
function showBestScoreLabel(grade, gp)
    if grade <= 2 and gp.bestScore === 0:
        return { text: '⭐ 第一个记录', color: 'ink-300', decorative: true }   // 空态，不显示 0
    return { text: fmt(gp.bestScore), color: 'ink-500', decorative: false }

// ★ 埋点仍记录真实值，不受 UI 空态影响
track('home_view', { grade, bestScore: gp.bestScore, shown: showBestScoreLabel(...).text })
```

#### ④ 答错显示正确答案（UI_SPEC §3.4.1 v1.3）的 6 阶段时序

```pseudo
// ui/questionCard.js —— 答题位红圈的状态机
// ⚠️ 与 feedLeft 的时序关系：**正确答案停留 1200ms > feedLeft 答错 0.85s**
//    → 会被自动进题截断。这是真实的时序冲突，解决方案见下。

WRONG_SEQUENCE = [
  { t: 320,  name:'shake',      desc:'抖动' },
  { t: 160,  name:'wrongExit',  desc:'错误值左移 24px 淡出' },
  { t: 200,  name:'answerIn',   desc:'正确答案 scale 0.7→1.0' },
  { t: 360,  name:'goldFlash',  desc:'金色描边闪 2 次' },
  { t:1200,  name:'answerHold', desc:'停留' },
  { t: 200,  name:'fadeOut',    desc:'淡出' }
]
// 总时长 2440ms

// ★ 圈色 / 字色对照（UI_SPEC §3.4.1）
//   输入中          圈 error-600   字 error-600
//   答错瞬间        圈 error-400   字 —
//   显示正确答案    圈 accent-gold-deep   字 **brand-700**
// ⚠️ 金描边 + 深紫字，**不要金色填充文字**（金色填充是"答对奖励"的视觉语言，
//    会让孩子误以为答对了）；也**不要红框**（红框是"你错了"）
function slotStyle(phase)
    switch phase:
      'input'  : return { ring: C.error600,  text: C.error600 }
      'wrong'  : return { ring: C.error400,  text: null }
      'answer' : return { ring: C.goldDeep,  text: C.brand700 }    // ★ 描边金色，文字深紫

// ★ 标签冲突已规避：「正确答案」小标签在 (556,750)，与「下一题」按钮 (738—810) 重叠
//   → autoNextDelayMs === 0（1—2 年级）时**不显示该标签**
//   正确答案文字本身在答题位圆心，不依赖标签 → 功能完整
function showAnswerTag(autoNextDelayMs)
    return autoNextDelayMs > 0          // 仅自动进题的年级显示标签
```

**★ 时序冲突的解决方案（需 team-lead 拍板，我给建议）**：

`WRONG_SEQUENCE` 总时长 2440ms，但我的 `feedLeft`（答错自动进题间隔）是 0.85s → 2440 > 850，
**正确答案的"停留 1200ms"阶段会被截断约 0.7s**，孩子只看到"正确答案闪一下就没了"。

| 方案 | 做法 | 代价 |
|---|---|---|
| **A. 拉长 feedLeft（推荐）** | 答错时 `feedLeft = 2440ms`，即"看到正确答案再进下一题" | 答错后要等 2.4s。但**这正是我们想要的**——错题本的价值就在于看正确答案。且复习页已用 2000ms 停留（§14.3），两者一致 |
| B. 缩短停留 | `answerHold` 从 1200 压到 300ms | 违反 UI_SPEC §3.4.1，且孩子来不及看清答案 |
| C. 停留阶段冻结进题 | `answerHold` 期间禁止自动进题，只能手点「下一题」 | 1—2 年级友好，但 3—6 年级会觉得"卡住" |

**我的建议：方案 A + C 的组合**——
- 3—6 年级（`autoNextDelayMs > 0`）：`feedLeft` 自动设为 2440ms，走完整 6 阶段
- 1—2 年级（`= 0`）：本来就是手动，按钮常驻，**停留时长不限**（想看多久看多久）

这样两个年级都不用做妥协，且复习页与闯关页的"错题停留"语义统一。

> ⚠️ **给 team-lead 的排期影响**：`feedLeft` 答错 0.85s → 2.44s，会让单局时长增加
> （40 题全错的极端情况多 64s）。但**全错的局本身是异常场景**，正常局错 2—3 题，
> 增加约 5s，可接受。

#### ③ DL 叠加钳制（UI_SPEC §19.2 相关 + §12.3）

```pseudo
// shared/difficulty.js —— initDL 的 v1.1 版本
// DL 三项来源：年级基准 + 年级内微调（持久化）+ 全局难度（设置项）
function initDL(grade, saveGrade, settings)
    state.base   = GRADE_BASE[grade]                    // 1/2/3.5/5/6.5/8
    state.cap    = GRADE_CAP[grade]                     // 3/4/6/7/9/10
    state.manual = clamp(saveGrade.difficultyOffset, -3, 3)      // 主页微调器，持久化
    state.global = clamp(settings.globalDifficultyOffset or 0, -3, 3)
    state.comboDrift = 0; state.scoreDrift = 0; state.wrongStreak = 0
    recompute(state, 'init')

function recompute(state, reason)
    old = state.dl
    raw = state.base + state.manual + state.global + state.comboDrift + state.scoreDrift
    newDl = clamp(round(raw), 1, state.cap)            // ★ 钳制在此，不是显示层
    ...
    if newDl != old: emit(DL_CHANGED, {from:old, to:newDl, reason})

// ★ UI 必须显示 state.dl（已钳制），**不能显示 round(base+manual+global)**
// 六年级 8 + manual(+3) + global(+3) = 14 → 钳到 10
// 首页难度微调器显示 "高手级 · DL 10"（不是 14）
function displayDL(state) { return state.dl }          // 唯一读法，禁止另算
```

> **钳制位置很重要**：放在 `recompute()` 里而不是 UI 层。这样 `generator`（用 `dlInt(state)`）
> 和 UI 显示的永远是同一个值，不会出现"题目按 DL 10 出、界面写 DL 14"的不一致。

#### ③ `reduceMotion` 在 fx 层统一拦截（UI_SPEC §19.3）

**设计原则复述**：低刺激模式**只能关闭"运动"，不能关闭"反馈"本身**。孩子必须仍然能一眼看出答对还是答错。

```pseudo
// miniprogram/fx/index.js —— ★ 所有特效对外的唯一出口
// 好处：对外签名不变，漏了也不会出错；改开关只改这一处
const MODE = { reduceMotion: false }        // 由 app 启动时从 settings 注入，只读

function setReduceMotion(b) { MODE.reduceMotion = !!b }

const Fx = {
  // ── ① 环形冲击波：低刺激 → 固定 ⌀180 不扩散，300ms 淡出
  shockwave(x, y, combo, opt) {
      if (MODE.reduceMotion) return shockwaveStatic(x, y, 180, 6, 0.8, 300)
      return shockwaveGrow(x, y, 40, 220, 420, opt)
  },

  // ── ② 屏幕震动：低刺激 → 位移强制 0
  shake(level) {
      if (MODE.reduceMotion) { Shake.amplitude = 0; return }   // 位移 0，但不改状态
      Shake.trigger(clampByGradeCap(level, SaveManager.state.profile.grade))
  },

  // ── ③ 高光扫过：低刺激 → 完全不执行
  sheenSweep(rect) { if (MODE.reduceMotion) return; SheenSweep.run(rect, 500) },

  // ── ④ 粒子：低刺激 → 数量 ×0.4，取消旋转，重力减半
  burstStars(x, y, combo) {
      const m = MODE.reduceMotion
      particles.burst(x, y, combo, { scale: m ? 0.4 : 1, spin: !m, gravity: m ? 0.5 : 1 })
  },

  // ── ⑤ 彩带：低刺激 → 0 条，关卡切换改横幅下移 80px 复位
  confetti() {
      if (MODE.reduceMotion) { Banner.dropAndReset(80, 260); return }
      confettiSystem.burst(60)
  },

  // ── ⑥ 角色动作：位移式 → 原地缩放式（详见 §14.1 附表）
  characterAnim(stateName) { CharacterAnim.play(stateName, MODE.reduceMotion) },

  // ── ⑦ 暗角：低刺激 → 不执行（但 timeup 去饱和**保留**）
  vignette(level) { if (MODE.reduceMotion) return; Vignette.draw(level) },
  desaturate(b)   { Desaturate.draw(b) },        // ★ 无条件执行，这是状态反馈不是运动

  // ── ⑧ 分数跳动 / 进度变色 / 连击换色 / 角色状态切换：**不做拦截，原样执行**
  //    理由：这四项是"反馈"不是"运动"。关掉就变成答对答错一个样 = 可用性事故

  // ── ⑨ 软倒计时条：保留，去掉脉冲改匀速收缩
  softBar(ratio) { SoftBar.draw(ratio, { pulse: !MODE.reduceMotion }) },

  // ── ⑩ 触觉：低刺激 → 不调用 wx.vibrateShort
  vibrate(type) { if (MODE.reduceMotion) return; platform.vibrate(type) },
}

// 附：UI_SPEC §19.3 完整 16 项覆盖对照（实现时逐条打勾）
//  保留：冲击波(改静态环) / 角色状态切换 / 分数跳动 / 进度条变色 / 连击换色 /
//        答对答错音效 / 错题本静态内容 / 软倒计时条(去脉冲) / timeup去饱和
//  关闭：屏幕震动位移 / 高光扫过 / 粒子(减量) / 彩带 / correct跳跃位移 /
//        combo跳跃位移+残影 / wrong摇头 / 暗角
```

**自动化验证方式**（防止以后有人往特效里加新动画时忘了拦截）：

```pseudo
// tools/check-reduce-motion.js —— CI 检查
// 规则：miniprogram/fx/ 下除 index.js / characterAnim.js / mode.js 外，
//      **任何文件不得直接读取 MODE.reduceMotion**；所有判断必须在 index.js 收口。
// 违反 → 退出码 1。
```

### 14.2 `leftHanded` 左手模式的镜像实现

**核心约束（UI_SPEC §19.1）**：**禁止 `ctx.scale(-1,1)` 整体镜像**（文字会变镜像字），必须逐元素改 x。

```pseudo
// ui/theme.js —— 布局层的镜像函数，所有需要镜像的组件统一走它
function makeMirror(settings, W) {
    return function mx(x, w) { return settings.leftHanded ? (W - x - w) : x }
}

// 逐元素镜像表（★ v1.2 修正：按「拇指操作区 vs 纯信息」分类，不是"全部元素都镜像"）
function applyLeftHanded(layout, settings)
    W = 672
    mx = makeMirror(settings, W)
    if !settings.leftHanded: return layout        // 右手模式零开销

    L = cloneLayout(layout)                        // ★ 不改原对象（可随时切回）

    // ── 类别 A：拇指操作区 → ✅ 镜像（手要够得到的东西）
    L.keypad.colX[0] = mx(16, 204)                 // col1 (7 4 1 ⌫) → 452
    L.keypad.colX[1] = 234                         // col2 (8 5 2 0) 居中，不变
    L.keypad.colX[2] = mx(452, 204)                // col3 (9 6 3) → 16
    L.keypad.backspaceCol = 2                      // 退格键移到 col3（拇指在后两列更顺手）
    L.card.slot.cx = 116                           // 答题位 (556,672) → (116,672)
    L.card.eq.right = 242                          // 算式右边缘 430 → 242
    L.card.eq.x = 60                               // 起点不变，自动收窄（左手模式 v1.2 修订）
    L.card.eq.y = 560                              // ★ v1.2：算式区上移一行 574→560

    // ── 类别 B：纯信息 → ❌ 位置固定（不因设置切换而重排）
    //   UI_SPEC §19.1 修订的设计原则：**只有"手要够得到的东西"才该镜像**
    //   → 题型标签固定 (44,502)、「第 N 问」固定 (44,596)
    //   → 孩子形成「左上=考什么、左下=第几题」的稳定空间记忆
    //   → ★ 设计原则：**设置项不该让界面重新洗牌**
    L.card.tag.x = 44                               // 固定
    L.card.qIndex.x = 44
    L.card.qIndex.y = 596                          // ★ v1.2：44,504 与标签重叠 → 左下 596
    return L

// ⚠️⚠️ ★ v1.3 新发现的第 4 处冲突（R15，待 ui-designer 给新落点）
//   左手模式下「算式区」与「第 N 问」**纵向重叠**：
//     算式区     y 560—786（因上移 574→560，高度 226）
//     「第 N 问」 y 596—630
//     → 纵向重叠 596—786 共 190px，横向也重叠（44—204 vs 60—242）
//   即：**v1.2 把「第 N 问」放到 (44,596) 是为了避开题型标签，但撞上了算式区。**
//   这与 v1.2 的第 2 处 bug 是同一类错误的第二次发生 —— 找到第一个空位就放，
//   没算那个位置原本有没有别的东西。
//
//   候选解（需 ui-designer 拍板，我不单方面定坐标）：
//     a) 「第 N 问」移到**白卡外**（卡底 830 之上、键盘 848 之下无空间）→ 不可行
//     b) 「第 N 问」移到**算式区下方**（y 786—830 之间，h 需 ≤44）→ 可行，
//        但要确认这个高度够放 fs-qindex(28)
//     c) 算式区再上移 + 「第 N 问」留在 596 → 算式区 y 改成 500—726 → 与题型标签
//        (502—548) 又撞上，不可行
//     d) 左手模式下「第 N 问」改为**右上角**（放弃"固定位置"原则）→ 与右手模式一致，
//        但违反 v1.2 确立的"纯信息不镜像"原则
//   ★ 我的建议：b 方案。把「第 N 问」当白卡底部的一个 meta 行，
//     与「正确答案」小标签（556,750）分居两侧，不抢视觉重心。
//
// ⚠️ 左手模式算式区收窄 51%（370→182px）会触发更多自动缩放
//   已验证：答题位右缘 178 ≥ 算式区左缘 60，**不重叠** ✓（G8 断言通过）
//   但算式区 y 上移到 560 后，仍须走 fitEquationFont() 的 shrinkFloor 钳制（§14.1）

// 切换时的重建成本（三步不可省，见风险 R11）
function onLeftHandedChanged()
    Layout.rebuild()               // ① 重排布局常量
    renderer.markStaticDirty()     // ② L_STATIC 重建（键盘列序变了）
    input.rebuildHitList()         // ③ HIT 全量重注册（命中区 x 全变）—— 最容易漏的一步
    // 缺任何一步都会导致：残影 / 命中区与视觉错位（按 A 键实际点到 B 键）
```

**关于手写描红**（v1.1 我提出、v1.2 UI 设计师确认）：
复习页手写描红**仍从左到右**，不随 `leftHanded` 镜像。理由：那是"正确答案书写"
而非"答题位"，孩子看到的应该是从左往右写，符合自然书���直觉。**已确认为最终决策，不再需要确认。**

### 14.3 复习页：`ReviewScene` 独立场景（★ 采纳 UI 设计师强建议）

**为什么不能复用 `GameScene` + `if (isReview)`**：
1-2 年级走「练一练」时要把 §2.7 整个键盘区（y848—1220，高 372px）**替换**成 3 选 1 大按钮区。
这是布局级差异，不是换文案能解决的。强行合并会产生大量 `if (isReview)`，且视觉上必然串味
——复习页长得像闯关页，孩子就有考试压力，而复习本该是零压力。

```ascii
                    ReviewScene（独立视觉体系）
   ┌──────────────────────────────────────────────────┐
   │ 背景：纯色 bg-top 平涂，无渐变无装饰（与 GameScene 完全不同）  │
   │ 倒计时：★ 完全没有（不 arm level 倒计时）           │
   │ 顶部：reviewBar（返回 / 标题 / 组内 5 点 / 已拿下 / 跳过）│
   │ 角色台：保留角色（情绪锚点），台面改平涂 n-50           │
   │ 白卡：描边 3px brand-300（比 GameScene 的 5px ink-900 更轻）│
   │ 答题区：按 mode 三选一（见下）                          │
   │ 错误反馈：★ 不抖不变红，算式停留 2s + 手写描红 600ms    │
   │ 正确反馈：跳跃 + 6 颗粒子（★ 减半，不铺张）              │
   │ 跳过：常驻可见                                          │
   └──────────────────────────────────────────────────┘

   子状态机（比 GameScene 简单得多，只有 4 态）
   ┌─────────┐   出题     ┌────────┐
   │  ASK    │───────────▶│ PRESENT│ 展示题目（认一认模式在此等点击）
   └────┬────┘            └────┬───┘
        │                        │
        │ 认一认：等点击          │ 练一练：等选 3 选 1
        │ 练一练：等选             │ 考一考：等键盘输入
        ▼                        ▼
   ┌──────────────────────────────┐
   │         FEEDBACK             │ 正确 1.4s / 错误 2.0s（不可跳过）
   │  正确：跳跃+6粒子+进下一题    │ 错误：★ 停留 2s → 描红 600ms → 进下一题
   └──────────────┬───────────────┘
                  │ 组内最后一题
                  ▼
          ┌──────────────┐
          │ REVIEW_END   │ 「太棒了！拿下 4 道」+ 星级 + 熟练度变化
          └──────┬───────┘ 再来一组 / 回主页

   ★ FEEDBACK 时长差异（2.0s vs GameScene 的 0.7s）是刻意的：
     复习页零压力，错题要多停留时间让家长/孩子一起看。
```

```pseudo
// scenes/review.js
const REVIEW_MODES = {
  learn:    { id:'learn',    key: UI_SPEC §15.2 认一认 },
  practice: { id:'practice', key: UI_SPEC §15.2 练一练 },
  quiz:     { id:'quiz',     key: UI_SPEC §15.2 考一考 }
}

// 年级自适应（后端 §6.6）
function modesForGrade(grade, mastery)
    if grade <= 2: return [learn, practice]          // ★ 完全不出现键盘
    if grade >= 3: return [practice, quiz]
    // 3-6 年级：mastery 0-1 时仍从 learn 起
    if mastery <= 1: return [learn, practice, quiz]
    return [practice, quiz]

// 答题区切换：**布局级替换，不是显示开关**
function layoutReviewAnswerArea(mode, settings)
    if mode == 'learn':
        renderTwoBigButtons(96, 700, 180, 180)       // 👍记住了 / 👎再看看，⌀180
        disableKeypadRegion(y848, 1220)              // 键盘区完全不绘制、不注册命中
    if mode == 'practice':
        renderThreeChoices(40, 690, 184, 200, distractors)   // x 40/244/448
        disableKeypadRegion(y848, 1220)
    if mode == 'quiz':
        renderKeypad(UI_SPEC §2.7)                   // 完整键盘，但★无软倒计时条
        // showTimerBar 在复习页一律无效（不 arm timer）

// 干扰项来源（★ UI_SPEC §15.2 关键设计：干扰项 = 孩子上次答错的数）
function buildPracticeOptions(correct, item)
    // 从后端 mistakeBook 的 lastWrongAnswer 取 2 个干扰项
    // 干扰项不足时用 nearMiss(correct) 补：±1 / ±10 / 小数移位
    opts = shuffle([correct, item.lastWrongAnswer, nearMiss(correct)])
    return opts

// 错误处理：★ 不抖不变红
function onReviewWrong(item)
    fsm.go('FEEDBACK', {reason:'wrong'})
    // FEEDBACK 停留 2000ms（不可跳过）→ handwritingTrace.run(item.answer, 600)
    // 角色只缩小 0.94 + 1 颗汗滴，不摇头不变色
    // Toast「再看看这道题」(336,620) fs-body ink-500，★ 无红底
    // ★ 不扣分、不掉星（UI_SPEC §15.4）
```

**手写描红实现**（UI_SPEC §15.3 指定的技术方案）：

```pseudo
// ui/handwritingTrace.js —— lineDashOffset 递减，单次遍历
function run(answerStr, durationMs, style)
    w  = measureText(answerStr, style.font)
    x0 = 60; y0 = 620
    tracePath = buildGlyphPaths(answerStr, x0, y0, style)   // 每个字一个 path 描述
    totalLen = sumOfPathLengths(tracePath)

    // 用 setLineDash + lineDashOffset 做"逐段显现"，无需逐点采样
    return tween(durationMs, function (p) {
        ctx.setLineDash([totalLen, totalLen])
        ctx.lineDashOffset = totalLen * (1 - p)
        ctx.lineWidth = 6; ctx.lineCap = 'round'
        ctx.strokeStyle = UI_SPEC §15.3 error-400
        for each path in tracePath: ctx.stroke(path)
    })
// 注：字形用 fillText 描红会失去"手写感"，用路径描边才有笔触感。
//     若字形路径构建成本过高，退化方案：直接 fillText 但加逐字 alpha 淡入（视觉略差，可接受）
```

### 14.4 家长门与设置页

```ascii
   SETTINGS 场景（三分组，A/B 物理隔离）
   ┌────────────────────────────────────────────┐
   │ A. 孩子的设置   （白底）                    │  ← 无门槛，直接进
   │   音效开关 / BGM 开关                       │
   │   震动开关 / 震动强度(3段)                  │
   │   字体大小(3段) / 左手模式                  │
   │   显示单题限时条 / 自动下一题延迟(3段)        │
   ├════════ 2px brand-300 分隔线 + 24px 间距 ════┤
   │ B. 家长设置   （★ n-50 灰底）               │  ← ★ 进门之前过家长门
   │   难度微调 / 排行榜开关 / 匿名统计开关        │
   │   错题云同步开关 / 清除数据 / 卸载重置        │
   ├════════════════════════════════════════════┤
   │ C. 家长同意记录   （B 组内）                 │  ← 二次家长门
   │   已同意项列表 + 每项独立关闭开关（无挽留）   │
   └────────────────────────────────────────────┘

   ★ B 组入口拦截流程（UI_SPEC §14.1 重要约定："必须在弹窗出现之前校验"）
   tap(家长设置)
     └─▶ overlayParentGate()          // 模态，不入场景栈
            ├─ 有 parentPinHash → PIN 模式（4 个圆点，不显示明文）
            └─ 无              → 算术题模式（★ 每次重新生成，避免孩子背答案）
                                  键盘上移至 y640—1012（比游戏内更紧凑：行高 78，4 行）
                                  「确认」按钮答对前 disabled
            答错 3 次 → 「请家长用其他方式验证」+「忘记密码」入口
```

```pseudo
// ui/parentGate.js
function overlayParentGate(opts, onSuccess)
    save = SaveManager.state
    mode = save.settings.parentPinHash ? 'pin' : 'math'
    g = generateMathGate()      // ★ 每次调用都重新生成，不复用
    // 算术题默认 100 × 3 = ?，但 parentHint 可自定义（后端字段）
    // PIN 模式：4 个 ⌀20 圆点，间距 28，输入时 1px 长 → ⌀20 实心圆（★ 不显示明文）
    // 错误：整行左右抖 ±8px / 3 次 + 变 error-400

// ★ 三条不可违反的（UI_SPEC §17.4 的同源要求，在家长门同样适用）
//   1. 家长门必须在校验通过后才展示 B 组内容
//   2. 不做倒计时、不做"输错 3 次就锁死"
//   3. 「返回」永远可用（不能把孩子困在弹窗里）
```

**分段控件 `SegmentedControl` 的实现要点**（UI_SPEC §14.3）：

```pseudo
// ui/segmentedControl.js —— 用于 vibrateIntensity(0/1/2) / fontScale(0/1/2) / autoNextDelay(0/450/250)
function SegmentedControl(rect, items, value, onChange)
    // 滑块指示条：高 48，宽=(容器宽-8)/3，r24，面 brand-600
    //           200ms easeOutQuad 平移（★ 不给弹性，避免误以为可拖）
    // 段文字：选中 on-dark / 未选中 ink-500
    // 触摸分区：每段 ≥79px（满足 88rpx 最小可点区）
    // 震动强度三段文案：关闭 / 轻微 / 明显（★ 不写数字），并有附加说明行
    //   0 → 关闭, n-300, 「画面不会有晃动」
    //   1 → 轻微, success-600,「轻微的动效提示」
    //   2 → 明显, error-600,「更强的动效提示」
    // ★ 设置页在低年级 + 强度2 时显示灰字「低年级已自动降低晃动强度」（§19.2）
```

### 14.5 排行榜页：三级状态机（硬约束：任何时刻不允许空白页）

```ascii
              进入排行榜
                   │
                   ▼
            ┌─────────────┐
            │  LOADING    │  骨架屏 5 行占位块，呼吸动画 0.5↔0.8 / 900ms
            │             │  ★ 用 onRealStep 计时（不受 timeScale 影响）
            └──────┬──────┘
                   │
      ┌────────────┼────────────┐
      │ ≤1.5s      │ >1.5s ★强制降级（阈值必须 < 后端 3s 超时）
      ▼            ▼            ▼
  ┌────────┐  ┌─────────┐  ┌────────┐
  │ cloud  │  │ cached  │  │ local  │
  │云端榜单 │  │影子缓存 │  │本机10局│
  └────────┘  └─────────┘  └────────┘
                 顶部32px     顶部说明卡
                 琥珀条       (48,200,576,88)
                             「云端榜单还没开好，先看看自己」
                             「成绩只存在这台设备上」
                             ★ 语气中性，不制造缺失感
                             ★ 不用"无法加载"/"暂未开放"

  v1 现实：Cloud.getLeaderboard() 恒 return null
  → ★ v1.2 结论：v1 排行榜是**零等待界面**（首帧即最终态，无转圈无闪烁）
  → 三级状态机仍要完整实现：① v2 接云端时不用重写 ② 骨架屏只在真有网络请求时才有意义
```

```pseudo
// scenes/leaderboard.js  ★ v1.2 重写：先判数据可用性，再决定要不要骨架屏
const LOADING_TIMEOUT = 1500     // ★ 必须短于后端云函数 3s 超时

function enterLeaderboard()
    // ★★ 关键约束（UI_SPEC v1.2）：判断顺序必须是「先判数据可用性，再决定要不要骨架屏」
    //   不能先播骨架屏再判断 —— 否则 v1 每次进榜都要白等 1.5s，观感像"加载了一下"
    //   这一条同时满足 UI_SPEC §9 G6 验收「首屏 <1.5s」
    snap = Cloud.getLeaderboard()          // v1 同步返回 null；v2 改为返回 promise 或快照
    if snap === null:
        fsm.go('LOCAL', localTop10())      // ★ 直接进，不播骨架屏
        return                              // ★ 此分支禁止调用 showSkeleton()
    else:
        fsm.go('LOADING'); timer = 0
        // v2 形态：promise 竞速 + 独立 setTimeout(1500) 兜底 → LOCAL
        //   snap.then(x => fsm.go(x ? 'CLOUD' : 'LOCAL', x)).catch(() => fsm.go('LOCAL'))

function update(dtReal)
    if state == 'LOADING':
        timer += dtReal * 1000
        if cloudResult != null:      fsm.go('CLOUD', cloudResult)
        else if timer >= 1500:       fsm.go('LOCAL', localTop10())    // ★ 强制
    // ★ 用 dtReal 而非 dt：即使在慢动作演出中，1.5s 也必须是真实的 1.5s

// verified 徽章（UI_SPEC §16.2）
function renderRow(row, stateKind)
    if stateKind == 'cloud' and row.verified == true:
        drawVerifiedBadge(row)       // 头像右上角 ⌀20 ✓ 圆章
    // ★ verified == false 不显示任何标记（不加"未验证"标签，
    //   那会暗示排名不可信，反而伤害体验）
    if stateKind == 'local':
        // ★ 行内容不同：显示日期「10-03 15:20」+ 分数 + 「本地」灰字
        //   ★ 不含头像、不含昵称（本地记录没有其他人）
```

### 14.6 首次启动家长同意弹层（★ 合规红线，文案照抄 UI_SPEC §17）

```pseudo
// ui/consentModal.js + scenes/boot.js 集成
function checkPrivacyConsent()
    save = SaveManager.state
    savedVer  = save.privacyNoticeVersion or 0
    currentVer = CONSENT_VERSION             // 常量，随文案变更递增
    if savedVer >= currentVer: return false  // 已同意，直接进 home
    return true                              // 需弹层

// ★ 三个状态（不是开关的 on/off，而是三态：未同意/已同意/已撤回）
CONSENT_STATE = { UNDECIDED: 0, GRANTED: 1, REVOKED: 2 }
// UNDECIDED 弹层；GRANTED 全部开启；REVOKED 全部关闭。
// ★ 撤回后**再次进入设置不重复弹层**（REVOKED 也是终态，不视为 UNDECIDED）

function renderConsent()
    // ★ 三个不可违反（UI_SPEC §17.4）：
    //  1. 两个复选框默认全部不勾选（《个保法》第29条：单独同意）
    //  2. 「暂不开启」与「确认并开始」视觉权重完全对等
    //     同尺寸 264×96、同圆角 r48、同字号，只是填充色不同（描边 vs 实心）
    //     ★ 不得把「暂不开启」做成灰色小字链接或弱化按钮
    //     理由：撤回不得比同意更难。做成弱化按钮 = 变相阻碍撤回 = 不合规
    //  3. 不做倒计时、不做自动跳转、不做"不开启就玩不了"的挡板
    //
    // 「确认并开始」仅在至少勾选一项时启用为实心；两项都没勾时点击 → 轻提示
    //   「可以先不开启，随时在家长设置里改」而不是禁用态（不制造阻断感）
```

**撤回流程**（UI_SPEC §17.5，无挽留）：

```pseudo
function revokeConsent(item)      // item = 'leaderboard' | 'analytics'
    // 1. 立即停止上传
    Cloud.disable(item)
    // 2. ★ 不清除已有本地数据
    // 3. ★ 不弹任何"你确定要关闭吗"挽留弹窗
    //    （挽留 = 变相阻碍撤回 = 不合规）
    // 4. 关闭动画 200ms，该行文字转 ink-300 + 加删除线 200ms
    save.consent[item] = false
    save.privacyNoticeVersion = CONSENT_VERSION
    SaveManager.commit()
```

### 14.7 结算页与错题本入口

```pseudo
// scenes/result.js —— 错题本 4 个入口（UI_SPEC §15.5）
function layoutResult(summary, save)
    // 本局获得金币 (336,660) 标签 + (336,700) 数值
    // 「看视频翻倍」(216,736) 240×64 —— ★ 5 条合规约束（见下）
    // 熟练度分区 y720—820（与金币行重叠则下移至 850）
    // ★★ 即时巩固卡片 (48,900,576,120)：触发条件 wrong >= 3
    //    ★★ 必须放在「再玩一局」之上 —— 这是转化率最高的时刻，不该被主 CTA 挤下去
    // 新纪录横幅 (136,480) 400×72：仅 newBestScore==true

// 「看视频翻倍」合规约束（UI_SPEC §18.2，★ 5 条红线）
//  1. 文案必须说明代价与收益（"看一段视频" + "金币 ×2"），不得省略"视频"二字
//  2. 不得使用"点击领取"/"免费领"/"不看就亏了"等诱导话术
//  3. 按钮不置于主 CTA 位置（再玩一局才是主 CTA），视觉权重明显更低
//  4. 本次会话内已用过 → 变为 n-50 面 + ink-300 字「明天再来」，★ 不可点击
//  5. 儿童主动点击时若未达 parentGateOpen 记录，弹一次轻提示：
//     「这一项会打开一段视频广告」
```

### 14.8 `autoNextDelayMs` 与「下一题」按钮（★ v1.2 重大修正）

> **v1.1 的方案是错的，只解决了一半问题。** 记录在此避免后人重蹈：
>
> ```
> 卡片底 830 ──── 键盘顶 848
>         ↑ 只有 18px
> ```
>
> 我 v1.1 建议「按钮下移到 y=846」—— 避开了软条（826~836），
> 但按钮高 80，`846 + 80 = 926`，而**键盘 row1 顶边是 848**，
> 于是按钮横跨键盘第 1、2 行的整个宽度。**避软条 → 撞键盘**。
>
> **根因不是排布优化，是硬约束**：卡外只有 18px，放不下 72—80px 的按钮。
> **v1.2 修正：两个元素全部收进白卡内部。**

```pseudo
// ★ v1.2 常量（无分支！坐标见 UI_SPEC §2.7.1）
const NEXT_BTN = { x:216, y:738, w:240, h:72, r:36 }    // 白卡内浮层，判定后浮现
const SOFT_BAR = { x:44,  y:818, w:584, h:6,  r:3  }    // 白卡内底部进度槽

// 白卡内布局时序（卡 20,480,632,350 → 底 830）
//   y 480  卡片顶
//   y 502  题型标签胶囊 (44,502)              ┐ 顶栏
//   y 504  「第 N 问」(468,504)               ┘
//   y 574  算式区顶（左手模式下上移到 560）
//   y 672  答题位红圈中心（⌀124，底 734）
//   y 738  ┌─「下一题 ›」(216,738,240,72) ─┐ 判定后浮现
//   y 786  卡内底部提示 (44,786,160,26)      │ x 不重叠（204 < 216）
//   y 818  软条 (44,818,584,6)               ┘ 卡片底 830
//   y 848  键盘 row1 顶（不动）
//
// ★ 几何自检（实现时必须写成断言）：
//   答题位底 734  <  按钮顶 738        → 间隙 4px  ✓ 不遮挡
//   提示右缘 204 <  按钮左 216        → 间隙 12px ✓ 不重叠
//   软条底 824   <  卡片底 830        → 间隙 6px  ✓ 在卡内
//   按钮底 810   <  软条顶 818        → 间隙 8px  ✓ 不重叠
//   键盘顶 848   >  卡片底 830        → 间隙 18px ✓ 卡外无任何元素

// shared/config.js —— 按年级默认值（UI_SPEC §18.3）
const AUTO_NEXT_BY_GRADE = { 1: 0, 2: 0, 3: 600, 4: 600, 5: 450, 6: 450 }
// 1-2 年级默认 0（手动）：给反应时间，避免"还没看清就跳了"
// 3-4 年级 600：略慢于标准
// 5-6 年级 450：保持爽快感
// 首次进入该年级时写入 GradeProgress.settings.autoNextDelayMs，家长可改

// scenes/game.js —— 按钮出现/消失时序（UI_SPEC §2.7.1）
//   ASK        → 隐藏
//   判定瞬间    → scale 0.6→1.0（180ms easeOutBack）
//   动画播完    → 保持可见
//   进入下一题  → 180ms 淡出
//   软条        → 判定瞬间**定格**，不再收缩
function afterJudgeAnimation()
    d = SaveManager.state.grades[grade].settings.autoNextDelayMs
    if d > 0:
        showNextButton()                 // ★ 同时显示「下一题 ›」，不要让孩子干等
        scheduleGo('ASK', d)             // 定时自动切
    else:
        showNextButton(true)             // 0 = 手动，按钮常驻
    onNextButtonTap: cancelGo(); go('ASK')
```

**★ 两条 v1.1 规则作废（v1.2 修订）**：

| v1.1 规则 | v1.2 状态 | 说明 |
|---|---|---|
| 「二者互斥、软条缩到 6px、按钮下移到 y850」 | **❌ 全部作废** | 按钮与软条**不再互斥，可同时显示**。软条是"当前题进度"、按钮是"下一步操作"，**语义不同，共存无障碍** |
| 「`showTimerBar=false` 时键盘上移 22px（848→826）」 | **❌ 作废** | **键盘位置固定不变**。`showTimerBar` 只控制"画不画那条进度槽"，不影响任何其他元素位置 |

**`showTimerBar` 的正交性（v1.2 修订）**：

```pseudo
// ★ showTimerBar 控制"是否绘制进度槽"，年级 softBar 配置控制"淡入阈值" —— 两个正交维度
// ★ v1.2：关闭时**不再移动键盘**，只是不画那条 6px 槽
function softBarVisible(gradeCfg, settings, usedRatio)
    if !settings.showTimerBar: return false
    if gradeCfg.softBar == 'always': return true      // grade1：始终显示
    threshold = gradeCfg.softBar == 'lt50' ? 0.5 : 0.3
    return usedRatio >= threshold                     // grade3: 50% / grade5: 30%

// ★ 因为键盘不移动了，keypad 布局不再需要读 showTimerBar
//   → v1.1 的 nextButtonRect(showTimerBar) 分支已删除，改为常量
```

### 14.9 本章验收点（QA 直接用）

**钳制类**
- [ ] 六年级 + fontScale=特大 + 超长算式 → 最终算式字号 **≥ 56 × 0.92 = 51.5**，且**不小于不开 fontScale 时的 56**（若出现更小即为 bug）
- [ ] 六年级 + 难度微调 +3 + 全局 +3 → 界面显示 **DL 10**（不是 14），且生成器实际用的也是 10（`displayDL()` 与 `dlInt()` 必须相等）
- [ ] 开低刺激模式 → 逐项核对 §14.1 ⑩ 覆盖表的 16 项，**特别确认"答对与答错在关掉动效后仍可区分"**
- [ ] 打开低刺激模式后，静音开关、设置开关等**非动效交互完全不受影响**

**「下一题」按钮与软条（★ v1.2 新增）**
- [ ] 判定后按「下一题」，按钮**不得遮挡答题位**（圆心 672，⌀124，底 734）—— 按钮顶边 738，应留 **4px 间隙**
- [ ] 按钮与软条**同时可见**（不再互斥），且不重叠（按钮底 810 < 软条顶 818）
- [ ] 卡内底部提示右缘 204 < 按钮左 216，不重叠
- [ ] 关闭 `showTimerBar` → 软条消失，**但键盘仍在 y848（不移动）**
- [ ] 1-2 年级（`autoNextDelayMs=0`）→ 按钮常驻可见，答对后不自动切换
- [ ] 5-6 年级（450ms）→ 按钮可见 + 450ms 后自动切下一题
- [ ] 左手模式 → 按钮与软条位置**不变**（它们是纯信息，不是拇指操作区，见 §14.2）

**复习页类**
- [ ] 1-2 年级走复习 → **屏幕上看不到任何数字键盘**
- [ ] 练一练 3 个选项中包含"该题上次答错的数"
- [ ] 答错 → 算式静止 2s（不抖不变红）+ 描红 600ms + Toast「再看看这道题」**无红底**
- [ ] 复习页 0 道拿下 → 结束页文案是「完成啦，明天再来～」，**不出现"全错"**
- [ ] 复习全过程不扣分、不掉星

**排行榜类**
- [ ] v1 断网进入 → **首帧即 local 态**（无骨架屏、无 1.5s 等待、无转圈闪烁）
- [ ] v2 联网进入 → 骨架屏最多 1.5s，到点强制降级
- [ ] 任何时刻（0ms / 1.4s / 1.6s / 5s）截图，**均无空白页、无无限转圈**
- [ ] `verified==false` 的行**没有任何额外标记**
- [ ] ★ `snap === null` 分支的代码里**没有** `showSkeleton()` 调用（CI 卡口，见 §14.1 工具链）

**左手模式类（★ v1.2 修订）**
- [ ] 键盘两列互换、退格在 col3、答题位 (116,672)、算式右边缘 242、算式区 y 上移到 560
- [ ] 题型标签 (44,502) 与「第 N 问」(**44,596**) **都在左侧且垂直分离 46px，不重叠**
- [ ] 「第 N 问」与题型标签**位置固定不随设置变化**（纯信息不镜像）
- [ ] 答题位左边缘 54 与算式区右边缘 242 之间有 26px 间隙，**不重叠**
- [ ] 左手模式下算式收窄 51% → 触发 `fitEquationFont()` 缩放，**结果仍 ≥ shrinkFloor**
- [ ] 全程无镜像文字（逐屏检查：标题/算式/昵称/按钮/Toast）
- [ ] 左右手来回切换 3 次 → 无残影、**命中区与视觉一致**（按 col1 的 7 实际命中 7）

**合规类**
- [ ] 首次启动弹层两复选框**默认都不勾选**
- [ ] 「暂不开启」按钮与「确认并开始」尺寸/圆角/字号完全一致（截图对比）
- [ ] 设置页 B 组入口**先弹家长门**，通过后才显示 B 组内容
- [ ] 家长门算术题**每次重新生成**（连续两次进入答案不同）
- [ ] 撤回某项后**不弹任何挽留确认**，且本地数据未被清除
- [ ] 关闭广告/云同步后，**立即停止上传**（抓包验证）

---

## 附录 A：角色替换入口（PRD §3.5 要求"替换位置明确标注"）

```pseudo
// shared/characters.js —— 唯一映射入口
CHARACTERS = {
  bunny:  { name:'兔耳小人', default: true,
            states: { idle:'char_bunny_sleep.png',    // 闭眼
                      answer:'char_bunny_star.png',   // 举星星
                      correct:'char_bunny_star.png',
                      combo:'char_bunny_jump.png',    // 跳跃
                      wrong:'char_bunny_sleep.png',
                      timeup:'char_bunny_sleep.png' } },
  rabbit: { name:'白色小兔', states:{ idle:'char_rabbit.png', answer:'char_rabbit.png',
                      correct:'char_rabbit.png', combo:'char_rabbit.png',
                      wrong:'char_rabbit.png', timeup:'char_rabbit.png' } },
  cat:    { name:'白色小猫', states:{ /* 全部 char_cat.png */ } },
  bear:   { name:'蓝色小熊', states:{ /* 全部 char_bear.png */ } },
  chick:  { name:'黄色小鸡', states:{ /* 全部 char_chick.png */ } },
}
// 结算页伙伴顺序：['rabbit','cat','bear','chick']（除当前主角外）
// 替换素材 = 覆盖 miniprogram/assets/characters/ 下的同名文件（保持 384×576）
//                + 若换文件名，改本表 + 重跑 tools/optimize-assets.sh

// ★ v1.1：avatarId 与角色 id 共用同一套枚举（主页头像 = collection.avatarId → 角色素材圆形裁切）
AVATAR_IDS = ['bunny', 'rabbit', 'cat', 'bear', 'chick']
// 昵称本地生成规则（后端 §16.2）：「星算者-XXXX」后 4 位为数值派生
function localNickname(seed) { return '星算者-' + String(seed % 10000).padStart(4, '0') }
```

**★ v1.1 补充分级加载策略**（因首页新增头像/角色行/熟练度星/货币条，包体压力上升）：

```pseudo
// 加载优先级调整（相对 §9.1）
critical:  bunny 主角 3 态 + ui 基础 9 图 + 数字图集
           （★ 不再需要 char_styleguide.png —— 本来就不进包）
preGame:    其余 3 只主角（选中了才加载 → 改为 lazy）
lazy.picked: 玩家选中的那只角色（单张，主页点选时加载，未选不加载）
lazy.result: 结算页伙伴立绘（进结算页时并行）
★ 头像复用：主页头像用主角 idle 图圆形裁切绘制，不额外占包体
```

---

## 附录 B：全局配置速查（`shared/config.js` 关键项）

| 配置项 | 默认 | PRD 出处 |
|---|---|---|
| `GRADE_BASE` | `{1:1,2:2,3:3.5,4:5,5:6.5,6:8}` | §3.2 年级难度基线表 |
| `GRADE_CAP` | `{1:3,2:4,3:6,4:7,5:9,6:10}` | 补充（防低年级超纲） |
| `COMBO_TIERS` | `0/5/10/20/30/50 → ×1.0/1.25/1.5/2.0/2.5/3.0` | §3.2 + team-lead 指定 |
| `TIME_ADD_BASE` / `_PER_DL` | `1500ms` / `200ms` | §3.2 B |
| `LEVEL_BASE_MS` | `{1:90s … 6:60s}` | §3.2 B（"如 60s"） |
| `SOFT_LIMIT_BASE` | `{1:12s … 6:7s}` | §3.2 年级表 |
| `GRACE_MS` | `260ms`（判定）/ `3000ms`（连击） | 体验增强（PRD §1 差异点） |
| `COLORS` | 天蓝 `#5AC8FA` / 亮黄 `#FFD93B` / 粉桃 `#FF9EB5` / 薄荷绿 `#7BE0AD` / 墨蓝 `#2B2D5C` | §3.4 |
| `MIN_BUTTON_H` | `88`（设计坐标） | §3.4 |
| `PARTICLE_MAX` | `300` | 性能 |
| `DESIGN_W × H` | `750 × 1334` | §3 竖屏 9:16 |

### B.2 v1.1 新增配置项（对齐 UI_SPEC 附录 A + 后端 STORAGE_SPEC）

| 配置项 | 默认 | 出处 | 备注 |
|---|---|---|---|
| `CONSENT_VERSION` | `1` | 后端 §8.1.3 | 隐私说明版本号，文案变更必须递增 |
| `CONSENT_STATE` | `UNDECIDED:0` / `GRANTED:1` / `REVOKED:2` | §14.6 | ★ **三态不是开关**；REVOKED 是终态不重复弹层 |
| `FONT_SCALE` | `[1.0, 1.15, 1.3]` | UI §19.4 | 索引 = `settings.fontScale` |
| `EQ_FONT_MAX` | `88` | UI §19.4 | 算式字号上限（钳3） |
| `SHRINK_FLOOR_RATIO` | `0.92` | UI §19.4 | 自动缩放下限（钳2） |
| `REVIEW_LOADING_TIMEOUT` | `1500ms` | UI §16.1 | ★ 必须短于后端云函数 3s 超时 |
| `REVIEW_MODES` | `learn / practice / quiz` | UI §15.2 | 认一认 / 练一练 / 考一考 |
| `REVIEW_GRADE_SPLIT` | `≤G2: [learn,practice]` / `≥G3: [practice,quiz]` | 后端 §6.6 | ★ 1-2 年级复习**完全不出现键盘** |
| `REVIEW_WRONG_DWELL` | `2000ms`（不可跳过） | UI §15.3 | 零压力，停留时间长于闯关 |
| `REVIEW_TRACE_MS` | `600ms` | UI §15.3 | 手写描红 |
| `AUTO_NEXT_BY_GRADE` | `{1:0, 2:0, 3:600, 4:600, 5:450, 6:450}` | UI §18.3 | 1-2 年级默认手动 |
| `NEXT_BTN_RECT` | ★ v1.2 改常量 `{x:216, y:738, w:240, h:72, r:36}` | UI §2.7.1 | ★ **白卡内浮层，无分支**；作废 v1.1 的 `y:806/850` |
| `SOFT_BAR_RECT` | ★ v1.2 新增 `{x:44, y:818, w:584, h:6, r:3}` | UI §2.7.1 | ★ **白卡内底部槽**，与按钮不互斥、可共存 |
| `CARD_GAP_ABOVE_KEYPAD` | `18px`（卡底 830 → 键盘顶 848） | 推导 | ★ 硬约束根源：放不下 72—80px 的按钮 → 元素必须收进卡内 |
| `GRADE_SHAKE_CAP` | `{G1_2:2, G3_4:5, G5_6:3}` | UI §19.2 | ★ 震动上限（L 值，px） |
| `VIBRATE_INTENSITY` | `0/1/2` → 关闭/轻微/明显 | UI §14.3 | ★ 不写数字 |
| `PROMPT_COOLDOWN` | `7` 天 | UI §12.4 | 最高 DL 引导上抬的弹窗冷却 |
| `MISTAKE_BUBBLE_HIDE_ZERO` | `true` | UI §15.5 | ★ 待复习数为 0 时**不显示数字 0** |
| `UI_COORD_BASE` | `{w:672, h:1280}` | UI_SPEC 全文 | ★ **UI_SPEC 坐标是唯一事实源** |
| `RATIO_672_TO_750` | `750 / 672 = 1.1160` | 推导 | `toDesign()` 后再乘一次 |

### B.2.1 ★ v1.3 新增配置项

| 配置项 | 默认 | 出处 | 备注 |
|---|---|---|---|
| `GRADE_CFG[g].fontBoost` | `{1:2, 2:2, 3:0, 4:0, 5:0, 6:0}` | UI §7.3 | 1—2 年级字号 +2。**走配置不在各处硬编码** |
| `showBestThreshold` | `grade <= 2` | UI §7.4 | 1—2 年级隐藏最高分；判定用 `bestScore === 0` |
| `WRONG_SEQUENCE` | 6 阶段共 **2440ms** | UI §3.4.1 | 抖320→退160→入200→金闪360→停1200→淡出200 |
| `SLOT_RING_COLORS` | `input:error600 / wrong:error400 / answer:goldDeep` | UI §3.4.1 | ★ 正确答案**金色描边 + `brand-700` 字**，禁金色填充 |
| `showAnswerTagCondition` | `autoNextDelayMs > 0` | UI §3.4.1 | 标签(556,750) 与按钮(738—810) 冲突 → 手动模式不显示 |
| `MEM_TIER_THRESHOLD` | `{high:4GB, mid:3GB}` | UI §8.2 | low 档只常驻当前角色；进结算页前预载伙伴 |
| `SINGLE_CHAR_DECODE_MB` | `1.6 MB` | UI §8.2 实测 | 单张解码（含 mipmap/对齐），非理论值 0.84MB |
| `G27_INK300_FORBIDDEN` | `true` | UI §9 C2 | `ink-300` 禁承载题目/分数，仅禁用态 |

### B.3 后端字段 → 前端消费点对照（v1.1 新增，零遗漏检查）

| 后端字段 | 前端读取处 | 消费时机 |
|---|---|---|
| `SaveManager.state.profile.grade` | `home.js` 年级卡 / `game.js` 全部难度参数 | 进主页 + 进游戏 |
| `grades[g].difficultyOffset` | `difficultyTuner.js` 选中段 | 主页渲染 + 存档 |
| `grades[g].mastery` | `masteryStars.js`（主页卡内 + 熟练度条 + 结算页） | 主页 / 结算 |
| `grades[g].bestDl` | 引导气泡触发条件（`>=7`） | 主页 |
| `grades[g].bestScore` | 年级卡右下「最高分」 | 主页 |
| `grades[g].playCount` | 引导气泡触发（`>=3` 局） | 主页 |
| `grades[g].settings.autoNextDelayMs` | `game.js` 下一题计时 | 进游戏 |
| `settings.reduceMotion` | `fx/index.js` `MODE.reduceMotion`（★ **仅此处**） | 全局 |
| `settings.fontScale` | `theme.js` `eqFontFor()` | 全局 |
| `settings.leftHanded` | `theme.js` `applyLeftHanded()` | 布局重建 |
| `settings.vibrateIntensity` | `fx.shake()` 振幅 × `fx.vibrate()` 类型 | 答题反馈 |
| `settings.showTimerBar` | `softBarVisible()`（★ v1.2：只控绘制，**不再影响键盘位置**） | 布局 |
| `settings.parentGateOpen` | 「看视频翻倍」提示判定 | 结算页 |
| `settings.parentPinHash` | `parentGate.js` 模式选择（有→PIN / 无→算术） | 设置页 |
| `collection.stars` / `.coins` | `coinBar.js` 货币条 + 结算页金币行 | 主页 / 结算 |
| `collection.title` / `.nickname` / `.avatarId` | 主页头像昵称称号 | 主页 |
| `privacyNoticeVersion` | `boot.js` `checkPrivacyConsent()` | ★ 启动首分支 |
| `MistakeBook.getDueItems(grade, limit)` | `review.js` 出题组 | 进复习页 |
| `Cloud.getLeaderboard()` | `leaderboard.js`（v1 恒 null → 走 local） | 进排行榜页 |

---

## 附录 C：v1.1 变更记录与三方字段对照

### C.1 变更摘要

**v1.3（对齐 UI_SPEC v1.3：包体解除 + 3 项 UI 决策 + 落地布局断言）**

| 位置 | 变更 |
|---|---|
| 文档头 | 升 v1.3；列出 5 项变更摘要 |
| **§1.4** | **包体红线改为「v1.3 实测已达标」**：主包 1.1MB（实测）、角色 0.876MB、余量 2.9MB |
| §2.2 | CI 清单更新：**`layout-assert.test.js` 已落地**（38 条断言）；`check-geometry.js` 并入；新增 `loadSubpackage` grep |
| **§9.4** | **重写**：包体实测表（我独立复算）+ 三条作废建议 + 黑名单脚本 + 保留 `check-size.js` 作护栏 |
| §9.5 | 内存策略按「单张解码 1.6MB、7 只 ≈11MB」重写，新增**分级缓存**（low 档只常驻当前角色） |
| §14.1 ② | **新增 `fontBoost`**：`applyBoostAndScale()` 明确「先加 boost → 再乘 fontScale → 最后三钳」，并指出 shrinkFloor 基准也须用含 boost 的值（R16） |
| §14.1 ③ | **新增「1—2 年级隐藏最高分」**：判定用 `bestScore === 0` 而非「有无记录」 |
| §14.1 ④ | **新增「答错显示正确答案」6 阶段时序** + ★ 发现与 `feedLeft` 的时序冲突（R18），给 3 个方案 |
| §14.2 | **★ R15**：左手模式「第 N 问」(596—630) 与算式区 (560—786) 纵向重叠 190px，被 `layout-assert.test.js` G8b 拦截 |
| §13.1 | 风险表：**R2 关闭**（已复算确认）；新增 R15—R18 |
| **新增文件** | `shared/__test__/layout-assert.test.js`（G1—G27，38 条断言，已跑通 37 PASS / 1 FAIL） |

**v1.2（对齐 UI_SPEC v1.2，修 3 处坐标重叠 bug）**

| 位置 | 变更 |
|---|---|
| 文档头 | 对应 UI 升 v1.2；新增「对应流程: UI_FLOW.md v0.1」 |
| §0 | 新增**三份文档分工表**（UI_SPEC / UI_FLOW / FRONTEND_SPEC / STORAGE_SPEC 四方），确立坐标冲突裁决规则 |
| §2.1 | 新增第 4 条硬规则（fx 目录 reduceMotion 收口） |
| §2.2 | **新增** CI 卡口脚本清单（7 个脚本，含新增的 `check-geometry.js` / `check-assets-blacklist.sh`） |
| §14.2 | 左手模式改为**「拇指操作区 vs 纯信息」分类原则**；「第 N 问」落点 (44,596)；算式区 y 上移 574→560；补充 v1.1 bug 记录 |
| §14.5 | 排行榜改为**先判数据可用性再决定骨架屏**；v1 = 零等待界面 |
| §14.8 | **重大修正**：删除 `nextButtonRect(showTimerBar)` 分支，改常量；两条 v1.1 规则作废；**新增几何自检断言块** |
| §14.9 | 新增「下一题按钮与软条」7 条 + 「左手模式」7 条验收点；删除重复的旧镜像类段落 |
| 附录 B.2 | `NEXT_BTN_RECT` 改常量、新增 `SOFT_BAR_RECT` / `CARD_GAP_ABOVE_KEYPAD`；`showTimerBar` 消费点更新 |
| 附录 B.3 | `settings.showTimerBar` 消费点改为「只控绘制，不再影响键盘位置」 |
| 风险 | R11 补明「重注册 HIT 是最容易漏的一步」；R2 现状更新为 5.31MB |

**v1.1（对齐 UI_SPEC v1.1，新增 5 个界面 + 3 条钳制）**

| 位置 | 变更 |
|---|---|
| 文档头 | 版本升 v1.1，增加「对应 UI: UI_SPEC v1.1」，声明坐标基准 |
| §0 | 新增 §14 章节入口与附录 C 入口 |
| §2 目录 | 新增 `miniprogram/data/`（5 文件）、`ui/` 11 个 v1.1 组件、`scenes/` 3 个新场景、`fx/index.js`、`fx/characterAnim.js` |
| §4.1 状态图 | 重绘：新增 CONSENT / REVIEW / LEADERBOARD / SETTINGS 四场景；CONSENT 与 PARENT_GATE 定为 **overlay 不入栈**（防"返回"死锁） |
| §4.1 | 新增 HOME 布局要点与命中区注册顺序 |
| §14（新增章） | UI 咬合实现方案：三条钳制 / 左手镜像 / ReviewScene 独立设计 / 家长门 / 排行榜三级状态 / 同意弹层 / 结算入口 / autoNext / 验收点 |
| §6.5 难度推进 | `initDL` 增加 `globalDifficultyOffset` 第三项来源，钳制位置前移到 `recompute()` |
| §7 性能 | `fx` 目录结构调整（新增 index.js 收口层），粒子数量受 reduceMotion ×0.4 影响 |
| §9.1 加载 | 分级策略调整：其余 3 只主角改为懒加载，头像复用主角图 |
| 附录 A | 新增 `AVATAR_IDS` 与本地昵称生成规则 + v1.1 加载策略 |
| 附录 B | 新增 B.2（22 项 v1.1 配置）+ B.3（后端字段消费点对照表，18 行） |
| §13.2 验收 | 新增「v1.1 UI_SPEC 附录 A 咬合类」9 条 |

### C.1.1 ★ 三处坐标重叠问题的完整记录（防止重蹈）

这三处都是**实现方案评审阶段发现并已修复**的，记录在此供后人追溯。
**共同教训**：单看一个元素的坐标没问题，**必须做元素两两的几何自检**。

| # | 问题 | 我 v1.1 的方案 | 为什么错 | v1.2 修正 |
|---|---|---|---|---|
| 1 | 「下一题」按钮 vs 软条 vs 键盘（三方混战） | 按钮下移到 y=846「避开软条」 | 按钮高 80，`846+80=926` > 键盘顶 **848** → 避软条却撞键盘。**根因：卡底 830 到键盘顶 848 只有 18px，放不下 72—80px 的按钮** | 两者**全部收进白卡**：按钮 (216,738,240,72) 浮层 + 软条 (44,818,584,6) 卡内底部槽。★ 顺带作废「二者互斥」与「软条缩到 6px」两条规则 |
| 2 | 左手模式「题型标签」与「第 N 问」重叠 | 标签固定左上不镜像 + 「第 N 问」镜像到左上 (44,504) | 两者**同 x、差 2px**，完全重叠 | 「第 N 问」落点 **(44,596)**（算式区下方），与标签垂直分离 46px。并确立**拇指操作区镜像 / 纯信息不镜像**原则 |
| 3 | 排行榜 v1 每次白播 1.5s 骨架屏 | 无条件先 `fsm.go('LOADING')` | `getLeaderboard()` 恒 null → 骨架屏每次播满才切 local，观感像"加载了一下" | **先判数据可用性再决定要不要骨架屏**；`snap===null` 直接判 LOCAL |

**新增的机械保障**：`tools/check-geometry.js` —— 把几何约束写成断言，而不是靠人眼看。
**这三条如果只靠 review，下次改坐标还会再犯。**

### C.2 四方文档的职责边界（v1.2 确立）

| 文档 | 归属 | 只写什么 | 不写什么 |
|---|---|---|---|
| `PRD.md` | 产品 | 做什么、为什么、变现路径 | 怎么画、怎么实现 |
| `UI_SPEC.md` | ui-designer | **坐标、色值、字号、文案定稿、组件规格** | 代码怎么写、跳转关系 |
| `UI_FLOW.md` | frontend-dev | **界面跳转关系、进入退出条件、状态机、数据依赖、验收点** | **任何具体坐标数值** |
| `FRONTEND_SPEC.md`（本文） | frontend-dev | **架构、算法伪代码、模块依赖、性能预算、钳制实现** | 具体色值坐标（引用 UI_SPEC） |
| `STORAGE_SPEC.md` | backend-cloud-dev | 存档 schema、接口契约、防刷规则 | UI 布局 |

> **单一事实源约定**：
> - 坐标 / 色值 / 字号 / **文案定稿** → `UI_SPEC.md`
> - 界面跳转 / 状态机拆并 → `UI_FLOW.md`
> - 难度参数 / 算法 / 性能 / 钳制 → `FRONTEND_SPEC.md`
> - 字段定义 / 接口 → `STORAGE_SPEC.md`
>
> **冲突裁决**：任何坐标冲突以 `UI_SPEC.md` 为准。`UI_FLOW.md` 出现具体数值即为笔误。
> 改任何一项必须检查另外三份是否需要同步——**这条本身要写进 code review checklist**。


### C.3 `UI_FLOW.md` —— 已落地（v0.1 骨架稿）

### C.3 `UI_FLOW.md` —— 已落地（v0.1 骨架稿）

**状态：已交付**，`docs/UI_FLOW.md`（583 行，13 章）。格式按上文建议调整：**不含任何坐标数值**，
所有坐标引用统一写「见 UI_SPEC §x」。

| 章节 | 内容 |
|---|---|
| §0 | 定位与边界 + 与其他三方文档的分工 |
| §1 | 全局跳转关系总图 + **表格化跳转条件**（实现以表为准，不看图） |
| §2—§8 | 逐场景：BOOT / HOME / GAME / REVIEW / RESULT / SETTINGS / LEADERBOARD |
| §9 | 三个 Overlay：CONSENT / PARENT_GATE / PAUSE |
| §10 | **设置项 → 影响面映射**（联调期排查清单） |
| §11 | 跨界面数据流 + **禁止的三种耦合** |
| §12 | 全局验收点（跨界面） |
| §13 | 文档维护约定 + **骨架稿的已知缺口清单** |

**§1 里我加了一样 UI_SPEC 没有的东西**：全局跳转总图之外，还有一张**表格化跳转条件**
（从 / 到 / 触发条件 / 转场，17 行）。理由：实现时查表比看 ASCII 图准，也不会漏掉边界路径。

**§10 是我额外加的**：把 9 个设置项各自的影响模块与「是否需要重建」列成表。
联调时改一个设置项不知道会连带改哪里，这张表能省很多时间。

**§13 已登记 4 项待补**（骨架稿的已知缺口，需 ui-designer 补）：
界面内状态转移细节 / 首页 11 个可交互区的 z 序仲裁表 / QA 验收脚本逐屏对齐（UI_SPEC §10.3 目前只覆盖游戏主屏）/
空态边界态（无错题可复习、排行榜无记录、存档损坏、首次选定年级）。

### C.4 实现优先级（对齐你给的建议 + 我的补充）

| 优先级 | 内容 | 理由 |
|---|---|---|
| P0 | 游戏主屏 L1—L6 + 角色 + 特效 | 变现和留存主路径 |
| P0 | 资产压缩流水线（`optimize-assets.sh` + `check-size.js`） | ★ **包体红线未解除，是联调首日的前置阻塞项** |
| P1 | 结算页（含货币行 / 熟练度分区 / 错题本入口卡片） | 主路径第二段 |
| P1 | 三条钳制（fontScale / DL / reduceMotion） | ★ 都是"不写就出线上事故"，且越晚写改动面越大 |
| P2 | 难度微调器 + 复习页（ReviewScene） | 长尾，但需在 P1 稳定后做（复用同一套题型/判定逻辑） |
| P2 | 设置页 + 家长门 | 合规相关，但首次启动即可不展示（默认档可用） |
| P3 | 排行榜 + 家长同意弹层 | 合规相关。★ 注意：**家长同意弹层虽 P3 但不可删**——它是《个保法》单独同意要求，属首发必备 |

> **对优先级的一处修正**：`家长同意弹层` 我标 P3 是指"工作量小（一个 overlay + 两个复选框）"，
> 但从**合规必要性**它是首发必备（无单独同意 = 上不了架）。所以实际排期建议：
> P3 的**工作量**可以在 P2 之后，但**上线前必须完成**。请在排期表上把它标为
> "首发必备，可后置开发，不可后置上线"。


---

