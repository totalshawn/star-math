# 《星算速算家》存储设计（STORAGE_SPEC）

版本 v1.0 ｜ 负责人：云栖梧（后端/云开发）｜ 日期：2026-10-03
关联：`PRD.md`（玩法/难度曲线/变现路径）

> **一句话结论**：这个游戏的后端工作量在 v1 是 **0**。全部核心状态放`wx.setStorageSync` 本地存档，云端只做「锦上添花的排行榜」，且任何云端故障都必须静默降级、绝不影响一局游戏的开始与结束。

---

## 📌 本文档的定位（2026-10-03）

**它描述「存储」，不描述「云端」。**

原名 `BACKEND_SPEC` 容易被误读为「后端 = 云开发方案」，但实际上：

| 内容 | 消费方 | 状态 |
|---|---|---|
| **§1 架构总览、§2 本地存档设计** | **v1 实际实现** | ✅ 已落地于`miniprogram/store/save.js` |
| §3—§9 云端设计 | M4 | ⬜ **v1 代码中不存在对应实现** |

**证据**：v1 中`wx.cloud` / `callFunction` 调用为 **0 命中**，且无 `miniprogram/cloudfunctions/` 目录。
即 **v1 是纯本地离线游戏，云端不在 v1 交付范围内**。

> **注**：原 §3—§9 曾因一次文档事故丢失（约 1800 行）。经评估它们全部属M4 范围，
> 不影响 v1 交付，故**不重建**——M4 启动时会新建 `CLOUD_SPEC.md` 承载，
> 届时本文档回归「纯存储设计」定位。事故记录见 `docs/DECISIONS.md` D17。

**字段的权威定义在 `miniprogram/store/save.js` 的 `defaultSave()`**，
本文档只描述设计意图与关键约束，不重复抄写完整 interface——
避免造一份会与代码漂移的副本。**需要核对字段时直接读代码，不要以本文档为准。**

**M4 交接约定**：`CLOUD_SPEC.md` 编写时，权威字段来源为 `save.js` 的 `defaultSave()` 运行时导出，
**不重新逐字段抄写**——一条命令即可拿到准确结构：
```bash
node -e "import('./miniprogram/store/save.js').then(m=>console.log(JSON.stringify(m.defaultSave(),null,2)))"
```
`docs/_damaged/` 里的存档 JSON 样例保留为字段快照，可作交叉校验。

**防篡改验证器的自检契约**：`test/verifier-consistency.test.mjs` 是出题器与验证器的
一致性契约。**任何改动 `difficulty.js` 题型产出逻辑后必须运行它**——
它保证「出题器产出的每种 `expr` 都能被 `computeAnswerFromExpr` 独立解析」，
这是本地判定可信的基础（勋章、错题本、首正答率都建立在此）。

---

## 目录

### 本文档现有内容（v1 交付范围）

| § | 章节 | 状态 | 说明 |
|---|---|---|---|
| 0 | 本文档的定位 | ✅ | 改名原因、v1/M4 边界、字段权威来源 |
| 1 | 架构总览与取舍 | ✅ | local-first 原则、为何存档放本地 |
| 2 | 本地存档设计（核心交付） | ✅ | 完整字段定义、自愈机制、写入时机 |

### 以下章节属 M4，当前**不存在正文**

原文档的 §3—§9 因一次事故丢失（约 1800 行），经评估**全部属 M4 范围，不影响 v1 交付**
（v1 中 `wx.cloud` / `callFunction` 调用为 0 命中，无 `cloudfunctions/` 目录）。

M4 启动时将新建 `CLOUD_SPEC.md` 承载以下内容，届时本表同步更新：

| 原§ | 章节 | 归属 |
|---|---|---|
| 3 | 云开发（可选）设计 | M4 → `CLOUD_SPEC.md` |
| 4 | 排行榜设计 | M4 |
| 5 | 成长与留存数据埋点 | M4 |
| 6 | 错题本云同步 | M4 |
| 6A | 「再来 90 秒」存储隔离与 G11 护栏 | M4（**本地侧已在 `save.js` 落地**） |
| 6B | 能力纪念章（纯展示） | M4（**本地侧已在 `save.js` 落地**） |
| 7 | 渐进式落地路径 | M4 |
| 8 | 风险与合规 | M4 |
| 9 | 给前端的接入清单 | M4 |

> 事故记录与重建纪律见 `docs/DECISIONS.md` D17。
> 损坏文件留证：`docs/_damaged/STORAGE_SPEC.damaged-1060lines.md`

---

## 1. 架构总览与取舍

### 1.1 第一原则：Local-First

| 原则 | 落地要求 |
|---|---|
| **离线可玩** | 断网、飞行模式、云环境欠费停服、SDK 崩了 → 游戏全部功能可用，只是看不到榜单 |
| **本地权威** | 最高分、闯关进度、错题本、解锁、设置 **只以本地存档为准**，云端永远是副本 |
| **云端只读体验** | 云端唯一不可替代的价值是「和别人比一比」。看不到 = 少一份社交乐趣，不影响游戏本身 |
| **零阻塞** | 任何云调用 `wx.cloud.callFunction` 必须包`try-catch` + 超时（≤3s）+ 静默失败，绝不允许 `await` 到游戏状态机上 |
| **零新增包体依赖** | 不引入微信开放数据域（`openDataContext`）以外的任何 SDK，避免主包 4MB 风险 |

### 1.2 为什么不把存档放云端

| 维度 | 本地存档 | 云端存档 |
|---|---|---|
| 读取延迟 | 同步 API，0ms | 200—800ms 首启 / 弱网 3s+ |
| 可用性 | 100%（只要设备能用） | 依赖网络与环境是否欠费 |
| 成本 | ¥0 | 按调用次数计费，DAU 越大越贵 |
| 儿童合规 | **零个人信息**，最干净 | 需处理 openid 等个人信息 |
| 审核友好 | 无网络请求，审核最易过 | 需声明域名与收集信息 |
| 防作弊 | 弱（可改本地文件） | 强 |
| 多设备 | 不支持 | 支持 |

**结论**：存档本地，校验云端。这是把「防作弊」的成本从"用户可感知的加载延迟"里挪到"用户不可感知的异步上报"里。

### 1.3 分层架构图

```
┌──────────────────────────────────────────────────────────────┐
│  L6  变现层（未来）激励视频 / 会员 / 家长端B端                     │
│      ↑ 广告与支付回调必须云端可信，金额不可本地判定                │
├──────────────────────────────────────────────────────────────┤
│  L5  可选云端增强层（★ v1 不实现，接口已预留）★                │
│  ┌────────────────────────────────────────────────────┐      │
│  │ CloudBase                                         │      │
│  │  云函数：authLogin / submitRun / getLeaderboard     │      │
│  │  集合：users / user_stats / runs / rank_daily       │      │
│  │  数据源：仅 submitRun 的重算校验 + 聚合写入          │      │
│  └────────────────────────────────────────────────────┘      │
│      交互契约：入参出参固定 3 秒超时 try-catch 静默降级         │
│      失败影响：仅"排行榜显示上次同步结果"                     │
├──────────────────────────────────────────────────────────────┤
│  L4  埋点层（v1.5 上）                                        │
│  本地环形缓冲 500 条 → 批量上报 → runs_events / 自建看板        │
│  v1 阶段：只写本地，不上报（隐私 + 无云环境）                    │
├──────────────────────────────────────────────────────────────┤
│  L5' 本地业务层（纯 JS，shared/，跨端可跑 H5 预览）            │
│  SaveManager  存档读写 / 校验 / 迁移 / 自愈                     │
│  MistakeBook  错题本CRUD + 掌握度 + 复习排程                    │
│  Leaderboard 榜单状态机（云端榜 / 本地榜 / 离线榜 三态切换）      │
│  Analytics    事件总线 + 环形缓冲                              │
├──────────────────────────────────────────────────────────────┤
│  L2  平台适配层（仅此层碰平台 API）                            │
│  storage.js  → wx.setStorageSync / localStorage（H5）           │
│  cloud.js    → wx.cloud 存在性探测 + 降级开关                   │
│  haptics.js  → wx.vibrateShort                                │
├──────────────────────────────────────────────────────────────┤
│  L1  游戏逻辑层（纯逻辑，零平台依赖，零构建）                   │
│  difficulty.js / scoring.js / characters.js / config.js        │
├──────────────────────────────────────────────────────────────┤
│  L0  渲染层  Canvas 2D 逐帧（不受任何网络影响）                 │
└──────────────────────────────────────────────────────────────┘
```

### 1.4 存储 Key 规划

| Key | 类型 | 内容 | 生命周期 | 大小预估 |
|---|---|---|---|---|
| `sx_save` | 主存档 | 完整 `SaveData` + checksum | 常驻 | 22—38 KB |
| `sx_save_bak` | 备份 | 上一次成功写入的完整 `SaveData` | 常驻 | 22—38 KB |
| `sx_corrupt` | 损坏现场 | 解析失败时的原文 + 时间戳 | 最多留 1 份，1KB 上限 | ≤ 1 KB |
| `sx_shadow` | 云端影子 | 上次成功的云端数据缓存（榜单/统计） | v1 启用 | 5—15 KB |
| `sx_syncq` | 上传队列 | 待提交的成绩批次（防丢） | v1 启用，≤ 20 条 | ≤ 4 KB |
| `sx_privacy` | 合规状态 | 家长同意版本、同意时间、撤回时间 | 常驻 | < 0.5 KB |
| `sx_profile_export` | 存档导出 | 家长/内测导出用（G11 断言的数据来源之一） | 按需 | 瞬时 |

> 微信`wx.setStorageSync` 单 key 上限 1MB、总量 10MB。本方案峰值 < 100KB，**永不触碰上限**。每个 key 独立读写，某个 key 损坏不会连坐。
>
> v1.1 相比 v1.0 增加的体积：双赛道结构 +6KB、首次正答率序列（60×80B）≈ +5KB、家长设置 <1KB。**总计 +12KB，相对 1MB 上限可忽略。**

---

## 2. 本地存档设计（核心交付）

### 2.1 存储 Schema（TypeScript，可直接照抄）

```ts
/* ============================================================
 * SaveData —《星算速算家》主存档
 * 约定：
 *   - 所有"时间"字段统一为 Unix 毫秒时间戳 number
 *   - 所有"日期"字段统一为 'YYYY-MM-DD' 字符串（本地时区，不用 toISOString，避免时区偏移）
 *   - 所有可选字段一律"可缺失"处理，读取时用 DEFAULT_* 兜底，绝不假设一定存在
 *   - 新增字段一律可选 + 带默认值 → 保证向前兼容（老存档读到新字段时为 undefined，走默认值）
 * ============================================================ */

const SAVE_SCHEMA_VERSION = 4;          // 当前结构版本（v4 = 赛道隔离 + B端前置字段）
const STORAGE_KEY_SAVE = 'sx_save';
const STORAGE_KEY_BACKUP = 'sx_save_bak';
const STORAGE_KEY_CORRUPT = 'sx_corrupt';

/** 年级键：'G1'—'G6'，用字符串保证对象键顺序与 JSON 稳定 */
type GradeKey = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6';
const ALL_GRADES: GradeKey[] = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'];

/** 角色 ID（与PRD 3.1 素材映射） */
type CharacterId = 'bunny_star' | 'rabbit' | 'cat' | 'bear' | 'chick';
/** 皮肤 ID（后续扩展，v1 预留） */
type SkinId = string;
/** 运算类型 */
type MathOp = 'add' | 'sub' | 'mul' | 'div' | 'mix';   // mix = 混合运算/括号

/* ---------- 2.1.1 元信息（自愈用，业务代码勿读） ---------- */
interface SaveMeta {
  /** 结构版本号，用于迁移链路由 */
  schema: number;                     // 3
  /** 本次写入的 Unix 毫秒时间戳 */
  savedAt: number;                    // 1757000000000
  /** 首次创建时间，永不变 */
  createdAt: number;                   // 1757000000000
  /**
   * 本地随机安装 ID（16 位十六进制），仅用于云端多设备去重与冲突识别。
   * 注意：这是本地生成的随机数，不是设备指纹、不采集 IMEI/OAID/IDFA，合规安全。
   */
  installId: string;                   // 'a3f9c2e17b8d4056'
  /** 迁移历史，如 [1, 2, 3] 表示从 v1 经 v2 迁到 v3 */
  migratedFrom?: number[];             // [1, 2]
}

/* ---------- 2.1.2 玩家档案 ---------- */
interface PlayerProfile {
  /**
   * 昵称。v1 不接入微信昵称（避免 UGC 审核 + 个人信息采集），
   * 由本地生成「星算者-XXXX」，家长可在设置里改（≤8 字，做敏感词与超长截断）
   */
  nickname: string;                    // '星算者-4821'
  /** 头像 ID：本地角色 ID 复用，不存储任何图片 URL */
  avatarId: CharacterId;               // 'bunny_star'

  /** ★ 当前选择年级（全局选择，影响难度基线） */
  grade: GradeKey;                     // 'G3'

  /**
   * ★ 可用角色清单 —— **v1.2 起默认为全部 5 只**（主理人已确认"角色全解锁"）
   *
   * 为何保留这个字段而不是删掉：v2 可能引入付费角色皮肤，届时需要一套
   * "已拥有 / 未拥有"的机制。当前它承载"可用集合"语义，恒为全集。
   *
   * ★★ 重要：角色解锁**不与年级、DL、刷题量、星星任何条件挂钩**
   *   （红线 R1：不做付费墙、不做注意力付费墙）。
   *   绝不要按grade 决定本字段内容——年级可随时切换（见 §5.3 事件 5），
   *   任何"选 X 年级才解锁 Y"的设计都可被一次点击绕过，是无效防线。
   */
  unlockedCharacters: CharacterId[];   // ['bunny_star','rabbit','cat','bear','chick']
  /** 已解锁皮肤（v2 付费/活动皮肤；★ 同样不做付费墙，仅活动免费领取） */
  unlockedSkins: SkinId[];             // []
  /** 当前使用的角色（读时校验 ∈ unlockedCharacters，非法则回落 bunny_star） */
  currentCharacter: CharacterId;       // 'cat'
  /** 当前皮肤 */
  currentSkin: SkinId;                 // 'default'

  /** 首次进入是否已看过新手引导 */
  tutorialDone: boolean;               // true

  /** ★ 最后游玩时间（Unix ms）。用于「你已 N 天没来玩了」的召回文案 */
  lastPlayedAt: number;                // 1757900000000
  /** 首次游玩时间 */
  firstPlayedAt: number;               // 1757000000000
  /** 累计游玩天数（自然日去重计数） */
  playDays: number;                    // 23
  /** 累计游玩秒数（对局内时间，不含后台挂起） */
  totalPlaySeconds: number;            // 7320
  /** 累计启动次数 */
  launchCount: number;                 // 58
  /** 累计完成局数 */
  totalRuns: number;                   // 141
}

/**
 * ★ 单个年级的完整进度 = 主线 + 挑战赛（两个物理隔离的独立赛道）
 *
 * v1.1 起不再有单一的 GradeProgress。调用方必须显式指明赛道：
 *   const g = SaveManager.state.grades['G3'];
 *   g.main.bestScore          // 24860← 主榜只读这个
 *   g.challenge.bestScore     // 18400← 挑战赛只读这个
 *   g.unlocked                // 仍挂在年级上（解锁是年级维度，与赛道无关）
 */
interface GradeProgress {
  /** ★ 该年级是否已解锁（解锁是年级维度，与赛道无关） */
  unlocked: boolean;                   // true
  /**
   * ★ 主线赛道（唯一可进主榜）
   * ★ 注意：真实实现中 `challenge` **不在 grades 下**，而是 SaveData 顶层
   *   （挑战赛是全局功能，不按年级分赛道存储；`unlockProgress` 内部才带 grade key）
   */
  main: MainProgress;
}
/* ---------- 2.1.3 单个年级的进度（核心） ---------- */

/** 单关记录（主线专用，挑战赛无"关卡"概念，不产生 LevelRecord） */
interface LevelRecord {
  /** 本关获得星数 0—3（通关得基础星，全对/高分得额外星） */
  stars: number;                       // 3
  /** 本关历史最高分 */
  bestScore: number;                   // 18450
  /** 本关历史最高难度等级 */
  bestDl: number;                      // 7
  /** 本关历史最高连击 */
  bestCombo: number;                   // 42
  /** 本关历史最高正确率 0—1，保留 3 位小数 */
  bestAccuracy: number;                // 0.92
  /** 累计通关次数 */
  clearCount: number;                  // 6
}

/**
 * ★★★ 主线进度（MainProgress）—— 唯一可进入主榜的赛道
 * 「再来 90 秒」挑战赛成绩 **绝不写入本簇**（见 ChallengeProgress）
 */
interface MainProgress {
  /** ★ 该年级历史最高分 */
  bestScore: number;                   // 24860
  /** ★ 该年级历史最高难度等级 DL（1—10） */
  bestDl: number;                      // 8
  /** ★ 该年级历史最长连击 */
  bestCombo: number;                   // 63
  /** 该年级历史最高正确率 0—1 */
  bestAccuracy: number;                // 0.88
  /** 该年级累计得分（仅展示，不用于排行——见 §4.2） */
  totalScore: number;                  // 312400

  /** ★ 当前进行到第几关（EX N，1 起） */
  currentLevel: number;                // 24
  /** 已通关关卡表：key = 关卡号，缺失即未通关 */
  levels: Record<string, LevelRecord>; // { "1": {...}, "2": {...} }

  /** 累计答题数 */
  totalAnswered: number;               // 3820
  /** 累计答对数 */
  totalCorrect: number;
  /**
   * ★ 有效通关次数（正答率 ≥ 60% 的局数），**不是「做过题数」**。
   * 用途：角色解锁的唯一判据（见 DECISIONS D12）。
   * 踩过的坑：曾用 totalAnswered 做判据，导致「乱猜 5/5」也能解锁角色。
   */
  validClears: number;                // 3305
  /** 累计答错数（= totalAnswered - totalCorrect，冗余存储便于读取） */
  totalWrong: number;                  // 515

  /**
   * ★ 难度手动微调（PRD 3.4「难度手动微调 1—10 档」的落点）
   * 取值 -3—+3，叠加在年级基线 DL 上
   * 注意：这是**主线**难度微调。挑战赛入口 DL 独立计算，见 ChallengeProgress
   */
  difficultyOffset: number;            // 0

  /**
   * ★ 熟练度星级 0—5（错题掌握 + 高正确率 + 速度 三因子综合）
   * 用途：结算页"你已获得 3 星 mastery"、家长端报告
   */
  mastery: number;                     // 3

  /** 上次游玩该年级的 UTC 时间（判断"换年级回来"的召回） */
  lastPlayedAt: number;                // 1757890000000
  /** 上次一局得分（结算页"超越自己"目标值） */
  lastScore: number;                   // 15400
  /** 上次是否破纪录（用于避免连续弹"新纪录"） */
  lastWasRecord: boolean;              // false
}

/**
 * ★★★ 挑战赛独立赛道（ChallengeProgress）—— 物理隔离，不可与主线共用字段
 *
 * 存在理由（G11 护栏 / 成长侧 v1.1「再来 90 秒」防刷设计）：
 *   挑战赛每局固定 90 秒、无连击加成、DL 冻结在 entryDL。理论上单位时间得分
 *   可能高于认真打主线 —— 若与主线共用 bestScore，孩子会发现"刷时长比练更快
 *   上分"，进而失去对真实进步的感知。
 *
 * ★ 硬约束：**MainProgress 与 ChallengeProgress 不得有任何字段复用。**
 *   写入路径也必须分离（见 §6.7 writeRunResult 的 mode 分支），前端 UI 隔离
 *   只是表象，存储层 + 写入路径隔离才是真隔离。
 */
interface ChallengeProgress {
  /**
   * ★★ 本地真实结构（2026-10-03 按 `miniprogram/store/save.js` 校准）
   *   字段仅 4 个，远少于早期草案 —— 真实实现更精简。
   *   ⚠️ 早期草案里的 bestDl / bestCombo / totalRuns / dailyLimit /
   *      maxUsedInAnyDay / recentRuns **在真实实现中都不存在**。
   *   差异与补齐建议见 §3.3② 的 A5 对照表（差异 D-1 / D-2）。
   */

  /** 挑战赛独立最高分（永不与 MainProgress.bestScore 比较） */
  bestScore: number;                   // 18400

  /**
   * 解锁凭据：各年级累计「有效通关」次数（正答率 ≥ 60%）。
   * 达到 `rules.js CHALLENGE.UNLOCK_REQUIRED`（= 3）后解锁挑战赛入口。
   * ★ 判定函数：`checkChallengeUnlock()` / `challengeNeedMore()`
   * ★ 不违反 R1：解锁的是**玩法入口**，不是外观角色或资源。
   */
  unlockProgress: Record<string, number>;  // { "3": 3 }

  /**
   * ★★ 今日【已用】次数（**递增**，非剩余！跨天归零）
   * ★ 2026-10-03 已改名：原`endedToday` → `usedCount`。
   *   原因：字段名字面像「今日已结束」（=剩余），与实际值「已用次数」相反，
   *   会误导云端实现者把递增写成递减。详见 DECISIONS D15。
   *   剩余次数由 `dailyLimitFor(grade) - usedCount` **计算**得出，不单独存。
   * ★ 云端字段同名同义，两边均为递增。
   * ★ 低年级封顶：1—2 年级每天 1 次（`CHALLENGE.GRADE_DAILY_LIMIT`），其余 3 次。
   * 消费函数：`consumeChallengeQuota()` —— 先 `checkChallengeUnlock()`，
   *          再 `challengeQuotaLeft() > 0`，最后 `usedCount += 1`。
   */
  usedCount: number;                   // 1

  /**
   * ★ 计数所属自然日 `'YYYY-MM-DD'`。
   * ★★ 必须以**自然日**为 key 严禁滚动 24 小时窗口 —— 那会出现
   *   「4:00 玩了一次、23:59 又想玩却提示已用完 3 次」的错判。
   * 本地：`rolloverDaily(this.data.challenge, this.now())`（设备本地日期）
   * 云端：以**服务器时间**为准（防改设备时间绕过）
   */
  date: string;                        // '2026-10-03'
}

/** 单局挑战赛记录（仅存于 ChallengeProgress.recentRuns） */
interface ChallengeRunRecord {
  /** 该局得分（挑战赛口径） */
  score: number;                       // 18200
  /** 入口时 DL */
  entryDL: number;                     // 6
  /** 本次会话内DL 峰值（★ 校验 A3 是否被绕过，必须 ≤ entryDL） */
  maxDLInSession: number;              // 6
  /** 最长连击 */
  maxCombo: number;                    // 35
  /** 答题数 / 答对数 */
  answered: number;                    // 90
  correct: number;                     // 78
  /** 局内有效时长 ms（挑战赛固定 ~90s，含加时） */
  durationMs: number;                  // 96000
  /**
   * ★ 恒为 false。挑战赛分数**在代码上**永不写回MainProgress。
   * 这个字段存在的唯一目的是让 G11 断言① 能被自动校验——
   * 如果哪天有人加了一行 `main.bestScore = max(...)` 的 bug，断言会立刻抓到。
   */
  scoreWrittenToBest: false;           // false
  /** 时间戳 */
  at: number;                          // 1757880000000
}

/** 判定本次会话属于哪个赛道的枚举 */
type RunMode = 'main' | 'challenge90';

/* ---------- 2.1.4a B 端前置字段（B 端已推迟到 W5+，但 v1 就要开始落盘） ---------- */

/**
 * ★ 上次会话快照 —— B 端「上次表现」卡片数据源
 *
 * 为何现在就要存：B 端 W5+ 才启动，但历史数据**无法回溯补录**。
 * 唯一能做的是从 v1 开始就落盘，这样 W5 启动时才有 4 周以上的真实曲线。
 */
interface LastSessionSnapshot {
  /** 上次会话结束时间 */
  at: number;                         // 1757880000000
  /** 上次主线的年级 */
  grade: GradeKey;                    // 'G3'
  /** 上次主线打到第几关 */
  level: number;                      // 23
  /** 上次主线得分 */
  score: number;                      // 15400
  /** 上次主线最终 DL */
  dl: number;                         // 7
  /** 上次主线最长连击 */
  maxCombo: number;                   // 51
  /** 上次主线答题数 / 答对数 */
  answered: number;                   // 100
  correct: number;                    // 87
  /** 上次主线正确率 0—1 */
  accuracy: number;                   // 0.87
  /** 上次主线有效时长 ms */
  durationMs: number;                 // 142000
  /** 上次会话是否破纪录（B 端「你刷新了自己的最好成绩」文案依据） */
  isNewRecord: boolean;               // false
}

/**
 * ★ 首次正答率历史序列 —— B 端「进步曲线」的唯一数据源
 *
 * 什么是"首次正答率"：一局里**每道题第一次作答**的正确率。
 * 为什么这个指标比"局正确率"更有教育价值：
 *   - 局正确率会被"错题重做"稀释 —— 做错了再蒙对，正确率也好看
 *   - 首次正答率反映的是**真实掌握程度**，B 端家长最想看的就是这个
 *   - 有了历史序列才能画"这周比上周进步了 12 个百分点"这种曲线
 *
 * 存储策略：**每局只追加 1 条**（不是每题1 条），环形保留最近 60 局。
 * 60 局 ≈ 2—3 周，正好够画周维度曲线，且存储开销可忽略（60 × ~80B ≈ 5KB）。
 */
interface FirstTryRecord {
  /** 该局时间戳 */
  at: number;                         // 1757880000000
  /** 年级 */
  grade: GradeKey;                    // 'G3'
  /** 本局题目总数 */
  total: number;                      // 100
  /** 本局首次作答即正确的题数 */
  firstTryCorrect: number;            // 78
  /** 本局首次正答率 0—1（= firstTryCorrect / total，保留 3 位小数） */
  firstTryAccuracy: number;           // 0.78
  /** 该局平均单题耗时 ms（速度维度，家长关注"变快了没有"） */
  avgMsPerQuestion: number;           // 1420
  /** ★ 恒为 'main'。历史序列只收主线局，挑战赛不进入教育指标 */
  mode: 'main';                       // 'main'
}


/* ---------- 2.1.4 全局统计 ---------- */
/**
 * ★★ 全部字段口径 = **仅主线**。
 * 挑战赛的任何数值都不得汇入此处，这是 G11 断言③「mode=challenge90 的记录
 * 不出现在任何 WED 统计查询中」在存储层的落地点。
 * 挑战赛的独立全局口径见 ChallengeProgress（分年级）与 §6.7 的 challengeOverall。
 */
interface GlobalStats {
  /** ★ 累计答题总数（跨年级，仅主线） */
  totalAnswered: number;               // 21450
  /** ★ 累计答对总数（仅主线） */
  totalCorrect: number;                // 18602
  /** 累计答错总数（仅主线） */
  totalWrong: number;                  // 2848
  /** ★ 历史最高连击（全年级，仅主线） */
  longestCombo: number;                // 88
  /** ★ 全年级历史最高分（仅主线，主榜数据源） */
  bestScoreOverall: number;            // 31450
  /** ★ 全年级历史最高 DL（仅主线） */
  bestDlOverall: number;               // 10
  /** 全对通关次数（10题全对且未超时，仅主线） */
  perfectClears: number;               // 17
  /** 累计游玩秒数（★ 仅主线有效时长，挑战赛时长单独记） */
  totalPlaySeconds: number;            // 7320

  /* ---------- B 端前置：上次会话快照（v2 家长端周报用，v1 先落盘） ---------- */

  /**
   * ★ 上次会话快照。B 端「上次表现」卡片的数据源。
   * 即使 v1 不做家长端也要落盘 —— 补录历史数据不可能，只能从现在开始攒。
   */
  lastSession: LastSessionSnapshot;

  /**
   * ★ 首次正答率历史序列（B 端「进步曲线」的唯一数据源）
   * 设计要点见下方详细说明
   */
  firstTryHistory: FirstTryRecord[];

  /** 今日答题数（每日任务用，仅主线） */
  todayAnswered: number;               // 260
  /** 今日答对数 */
  todayCorrect: number;                // 231
  /** 今日日期 'YYYY-MM-DD'，用于跨天重置判定 */
  today: string;                       // '2026-10-03'
  /** ★ 连续活跃天数 */
  streakDays: number;                  // 9
  /** ★ 上次活跃日期，用于 streak +1 / 断签 */
  lastActiveDate: string;              // '2026-10-03'
  /** 历史最长连续活跃天数 */
  maxStreakDays: number;               // 14
}

/* ---------- 2.1.5 收集与成长 ---------- */
/**
 * ★★★ 能力纪念章（Medals）—— 纯展示，不卡任何内容
 *
 *⚠️★ 本节已按`miniprogram/store/save.js` 的**真实实现**校准（2026-10-03核对）。
 *   真实结构与本节早期草案不同，以代码为准：
 *   - 位置在**顶层** `save.medals`，不在 `collection` 下
 *   - 形状是 `{ items: Array }`，不是 `Record<MedalId, MedalRecord>`
 *   - 用 `key = id` 或 `id@level` 字符串做主键，天然支持"分关"维度
 *   - 取消 `awardedByLevel` —— `key` 机制已能表达分关维度，无需第二套防重结构
 *
 * 定位（与 growth-ops 对齐，v1.2 起）：从「星章解锁角色」重新定位为
 * 「能力纪念章」。理由：用刷题量解锁外观角色 = **注意力付费墙**，
 * 与红线 R1「不做付费墙」自相矛盾。改为纯展示后彻底消除该矛盾。
 *
 * ★★★ 三条不可违反的约束（已落进代码注释，review 重点盯）：
 *   1. **纪念章不控制任何内容的可用性**。禁止出现
 *      `if (hasMedal('precision_90')) unlockXxx()` 这类功能门禁。
 *   2. **授予纪念章不发放任何游戏内数值奖励**（星星/金币/道具一律不发）。
 *      否则玩家会为了拿全 5 枚章去刷已经会的关卡 —— 正是 R1 要消除的行为。
 *   3. 写入用**并集、只增不减**。已持有则不重复记录、不降级。
 */
type MedalId =
  | 'first_perfect_chapter'   // 某关首次 3 星        —— 常见（★ 分关）
  | 'precision_90'            // 某关首次正答率 ≥ 90% —— 稀有（★ 分关）
  | 'flawless_clear'          // 一局 10 题零失误      —— 传说（★ 全局唯一）
  | 'combo_30'                // 单局连击达 30 题      —— 史诗（★ 全局唯一）
  | 'speed_demon_60'          // 单局 60s内答对 10 题  —— 稀有（★ 全局唯一，v1.3）

/** 单个纪念章条目（真实形状，与 save.js grantMedal 写入一致） */
interface MedalItem {
  /**
   * ★ 唯一主键。分关章为 `${id}@${level}`（如 'precision_90@23'），
   *   全局章为 `${id}`（如 'combo_30'）。
   * ★★ 这个 key 机制同时解决了「分关防重」和「全局唯一」两种需求，
   *    因此不再需要独立的 awardedByLevel 结构。
   */
  key: string;                         // 'precision_90@23'
  /** 勋章 id */
  id: MedalId;                         // 'precision_90'
  /** 授予时的关卡号；全局章恒为 null（UI 据此拼文案） */
  level: number | null;                // 23
  /** 触发时的数值快照（正答率百分数 / 连击题数 / 星数） */
  value: number | null;                // 92
  /** 授予时间 */
  at: number;                          // 1757880000000
}

/**
 * ★ 维度归属（防重逻辑的依据，务必与 save.js MEDALS.perLevel 严格一致）
 *
 *   medalId                 | 维度 | key 形态| 稀缺度
 *   ------------------------|------|-------------|---------
 *   first_perfect_chapter   | 分关 | id@level     | common
 *   precision_90            | 分关 | id@level     | rare
 *   flawless_clear          | 全局 | id           | legendary
 *   combo_30                | 全局 | id| epic
 *   speed_demon_60          | 全局 | id           | rare
 *
 * 「全局」= 全游戏只授予一次；「分关」= 每个关卡各授予一次。
 * ★ 混淆维度会导致「要么全局章拿不到第二枚、要么分关章被全局标记吞掉」。
 * ★ `flawless_clear` 从分关改为全局，是主理人 v1.2 裁决：
 *   分关会让「最稀有」名不副实（刷 50 关拿 50 枚 = 通货膨胀）。
 */

/** 单个纪念章的授予记录 */
interface MedalRecord {
  /** 授予时间（用于"何时获得的"展示与排序） */
  at: number;                          // 1757880000000
  /**
   * 授予时的上下文（★ 用于结算页"因为你在第 23 关全对而获得"这类文案）
   * 分关的勋章记录 level，全局勋章（combo_30）为 null
   */
  level: number | null;                // 23
  /** 触发时的数值快照（precision_90 存 0.92、combo_30 存 31） */
  value: number;                       // 0.92
}

interface CollectionState {
  /** ★ 星星余额（关卡通关 + 里程碑获得） */
  stars: number;                       // 340
  /** 累计获得星星（只增不减，用于"收集进度 xx/500"） */
  starsEarned: number;                 // 620
  /** ★ 金币余额（局内掉落物，结算页可用激励视频翻倍） */
  coins: number;                       // 1280
  /** 累计获得金币 */
  coinsEarned: number;                 // 5240
  /** 称号：{ current: 'speed_demon', unlocked: ['speed_demon', 'combo_30'] } */
  title: { current: string; unlocked: string[] };
  /**
   * 角色熟练度：每个角色玩过的总局数。**纯展示**（"你和兔子一起玩了 88 局"）
   * ★ 不再作为任何解锁条件 —— 角色已全解锁
   * {bunny_star: 88, cat: 53}
   */
  characterRuns: Partial<Record<CharacterId, number>>;
}

/* ---------- 2.1.5a 能力纪念章（真实实现，位于 SaveData 顶层） ---------- */
/**
 * ★ 纪念章容器。★ 位于 SaveData 顶层，**不在 collection 下**
 *   （早期草案曾放在 collection.medals，已按 save.js 真实实现校准）
 */
interface MedalsState {
  /** 已获得的纪念章条目（★ 数组，非 Record —— 因为 key 含 '@level' 复合主键） */
  items: MedalItem[];
  /** 上限保护，防止异常逻辑导致无限增长（save.js 自愈时按 100 截断） */
  // capacity: number;   // 当前实现用字面量 100，不占字段
}

/**
 * ★ 为什么用「数组 + 复合 key」而不是「Record<MedalId, MedalRecord>」
 *（这是对早期草案的修正，真实代码已如此实现，理由如下）
 *
 *   1. **分关维度需要复合主键**。`precision_90` 在第 23 关和第 24 关
 *      是两枚不同的章，key 必须是 `precision_90@23` / `precision_90@24`。
 *      Record 的 key 只能是 id，无法表达。
 *   2. **一套 key 机制覆盖两种维度**，省掉了独立的 awardedByLevel：
 *      分关章 → key 带 @level；全局章 → key 就是 id。判重统一走
 *      `items.some(m => m.key === key)`，不需要两套防重逻辑。
 *   3. **天然有序**。数组保序，UI 直接按获得时间排列即可，无需再排。
 *
 *★ 早期草案里的 `awardedByLevel` + `flawlessClearGranted` 已被 key 机制
 *   完全取代，**不需要实现**（主理人 v1.2 裁决采纳全局唯一方案时，
 *   实际实现走了更简洁的key 路线）。
 */

/* ---------- 2.1.6 错题本（详见 §6） ---------- */
interface MistakeItem {
  /**
   * ★ 题面唯一签名。生成规则见 §6.2
   * 格式：`{grade}|{op}|{normA}|{normB}`，norm = 小数统一保留 2 位
   * 例：'G3|mul|12|7'、'G4|div|3.50|1.20'
   * 用签名而非随机 UUID 作为主键 → 同一题重复错只更新不新增，天然去重
   */
  id: string;                          // 'G3|mul|12|7'
  /** 所属年级 */
  grade: GradeKey;                     // 'G3'
  /** 运算类型 */
  op: MathOp;                          // 'mul'
  /** 左操作数 */
  a: number;                           // 12
  /** 右操作数 */
  b: number;                           // 7
  /** ★ 缓存的算式显示文本（避免重算，也保证历史错题原样呈现） */
  displayText: string;                 // '12 × 7'
  /** 正确答案 */
  answer: number;                      // 84
  /** ★ 最近一次错答值（用于"上次你答了 74"的针对性提示） */
  lastWrongAnswer: number;             // 74
  /** ★ 累计答错次数（越大越该优先复习） */
  wrongCount: number;                  // 3
  /** 首次答错时间 */
  firstWrongAt: number;                // 1757100000000
  /** 最近答错时间（用于 LRU 淘汰） */
  lastWrongAt: number;                 // 1757880000000
  /**
   * ★ 掌握度 0—3（艾宾浩斯式分级复习）
   *   0 = 刚错，未复习
   *   1 = 复习 1 次仍错
   *   2 = 复习 1—2 次已对（快掌握）
   *   3 = 已掌握（连续 2 次做对），不再进入日常复习，仅保留归档
   */
  mastery: number;                     // 0
  /** 连续做对次数（达到 2 升mastery 1 级） */
  correctStreak: number;               // 0
  /** 下次应复习时间（艾宾浩斯间隔，见 §6.4） */
  nextReviewAt: number;                // 1757880000000
  /** 记录时所处的难度等级（复习时降 1 级给成就感） */
  sourceDl: number;                    // 5
}

interface MistakeBook {
  /** 错题本结构版本（独立于主存档版本，单独演进） */
  version: number;                     // 1
  /** ★ 错题列表，按 lastWrongAt 倒序维护（新增时头插，淘汰时尾删） */
  items: MistakeItem[];                // 见 §6.3 示例
  /** ★ 容量上限，超出触发淘汰 */
  capacity: number;                    // 200
  /** 复习断点：上次复习到第几条（0 起），用于"继续上次复习" */
  reviewCursor: number;                // 3
  /** 上次复习时间 */
  lastReviewAt: number;                // 1757885000000
  /** 累计复习次数 */
  totalReviews: number;                // 34
}

/* ---------- 2.1.7 设置项（家长可控） ---------- */
/**
 * 两类设置，权限不同：
 *   - 上半部分：孩子可自己改（在设置页直接露出）
 *   - parentSettings：★ 家长专属，需通过家长门才能进入/修改
 */
interface Settings {
  /** ★ 音效开关（按键/答题反馈） */
  soundEnabled: boolean;               // true
  /** ★ BGM 开关 */
  bgmEnabled: boolean;                 // true
  /** ★ 震动开关（PRD 3.3家长控制） */
  vibrateEnabled: boolean;             // true
  /** 震动强度 0=关1=弱 2=强（与 vibrateEnabled 独立，vibrateEnabled 关闭时此值无效） */
  vibrateIntensity: 0 | 1 | 2;         // 1

  /**
   * ★ 全局难度微调 -3—+3（叠加在 main.difficultyOffset 之上，main 优先）
   * 注意：作用范围是**主线**。挑战赛的 DL 冻结在 entryDL，不受此影响
   */
  globalDifficultyOffset: number;      // 0

  /** 是否显示单题限时软倒计时条（关掉=无时间压迫，适合低年级） */
  showTimerBar: boolean;               // true
  /** 答对后自动进入下一题的延时 ms；0 = 需手动点"下一题" */
  autoNextDelayMs: number;             // 450
  /** 是否开启"低刺激模式"：关闭震动/彩带/闪白，仅保留数字与音效（低端机 & 敏感儿童） */
  reduceMotion: boolean;               // false
  /** 字体缩放 0=标准1=大 1.15 / 1.3 */
  fontScale: 0 | 1 | 2;                // 0
  /** 左手模式（键盘与答题位左右互换） */
  leftHanded: boolean;                 // false

  /** ★ 云端排行榜开关（默认 false，需家长同意，见 §8.2） */
  cloudLeaderboardEnabled: boolean;     // false
  /** ★ 匿名埋点上报开关（默认 false，需家长同意） */
  analyticsEnabled: boolean;           // false
  /** 是否已看过首次隐私说明 */
  privacyNoticeVersion: number;        // 0 = 未看过

  /** 家长门：4 位数字 PIN 的散列（不存明文），未设置则留空 */
  parentPinHash: string;               // '' | '8f2a...'
  /** 家长门提示问题（用于忘记 PIN 时回忆，默认「100 乘 3 等于几」） */
  parentHint: string;                  // '100 乘 3 等于几'

  /* ---------- ★ B 端前置：家长专属设置（需家长门才能改） ---------- */
  /**
   * B 端虽已推迟到 W5+（且以 D1≥30% / D7≥10% 为启动门槛），但**这组字段
   * 必须 v1 就开始落盘**。理由同§2.1.4a：家长设定一旦缺失无法回溯补录。
   * 建议 UI 上v1 就可以放出"家长设置"入口（哪怕只有开关没有报告），
   * 让家长习惯在这里操作，W5 上线报告时才不会突兀。
   */
  parentSettings: ParentSettings;
}

/** 家长专属设置（进入与修改均需家长门校验） */
interface ParentSettings {
  /** 是否已设置家长门（false 时仍可用算术题兜底） */
  pinConfigured: boolean;              // true

  /* --- 学习管控 --- */
  /** 每日答题目标（家长设定，周报对照用） */
  dailyGoal: number;                   // 300
  /** 是否开启"仅允许挑战赛模式"（禁用主线，专注限时训练） */
  challengeOnlyMode: boolean;          // false
  /** ★ 挑战赛每日次数上限（A5，低年级前端自动降为 1） */
  challengeDailyLimit: 1 | 2 | 3;      // 3
  /** 是否允许使用「再来 90 秒」（家长可完全关闭该功能） */
  challengeEnabled: boolean;           // true

  /* --- 消费与广告 --- */
  /** 是否允许观看激励视频（家长可禁用，关掉则金币翻倍不可用） */
  rewardAdEnabled: boolean;            // true
  /** 消费上限提醒（单日金币消耗超过此值时弹提醒，0=不限制） */
  dailyCoinSpendLimit: number;         // 0

  /* --- 隐私与数据 --- */
  /** 是否允许错题云同步（独立于排行榜的同意项，见 §8.1.3） */
  mistakeSyncEnabled: boolean;         // false
  /** 是否已导出过学习报告（B 端 W5+ 用） */
  reportExportedAt: number;            // 0

  /* --- 玩法辅助 --- */
  /** 是否开启"错题即时巩固"（结算页错 ≥3 题时弹复习引导） */
  instantRemediation: boolean;         // true
  /** 是否允许调高难度（关闭后低年级固定在基线，保护学习信心） */
  allowDifficultyUp: boolean;          // true
  /** 每天游戏时段限制：{ startHour, endHour }，跨夜用 endHour < startHour 表示 */
  playWindow: { startHour: number; endHour: number } | null;  // null = 不限制
}

/* ---------- 2.1.8 每日任务（留存钩子，v1 本地实现） ---------- */
interface DailyState {
  /** 任务所属日期 'YYYY-MM-DD' */
  date: string;                        // '2026-10-03'
  /** 今日答题数（与 GlobalStats.todayAnswered 同步，冗余便于读取） */
  answered: number;                    // 260
  /** 今日答对数 */
  correct: number;                     // 231
  /** 今日目标答题数 */
  goal: number;                        // 300
  /** ★ 今日已领取的奖励 ID 列表，防重复领取 */
  claimedRewardIds: string[];          // ['daily_100', 'daily_combo_20']
  /** 今日是否已完成首次游玩（用于"今天还没玩"推送判定） */
  hasPlayedToday: boolean;             // true
  /** 今日是否已完成一次"错题复习"（教育向任务的完成条件） */
  hasReviewedToday: boolean;           // false
}

/* ---------- 2.1.9 运行时状态（★ 不入存档，仅内存） ---------- */
interface RuntimeState {
  /** 本次启动生成的会话 ID（埋点用，不入存档） */
  sessionId: string;
  /** 对局内实时状态，任何时刻都可从存档重算，不需持久化 */
  run: {
    grade: GradeKey;
    level: number;
    score: number;
    combo: number;
    maxCombo: number;
    dl: number;
    answered: number;
    correct: number;
    wrong: number;
    timeLeftMs: number;
    startedAt: number;
  } | null;
  /** 存档脏标记：为 true 时表示内存态与磁盘不一致，需要 flush */
  dirty: boolean;
  /** flush 防抖计时器句柄 */
  flushTimer: any;
  /** 上次成功写盘时间，用于"最多每 N 秒写一次"硬节流 */
  lastFlushAt: number;
}

/* ---------- 2.1.10 存档根对象 ---------- */
interface SaveData {
  meta: SaveMeta;
  profile: PlayerProfile;
  /** ★ 各年级进度，key 为 'G1'—'G6'，必须 6 个 key 全部存在（读时补齐） */
  grades: Record<GradeKey, GradeProgress>;
  /**
   * ★ 挑战赛存档（★ 顶层，不在 grades 下 —— 与 save.js 一致）
   * 与主档物理隔离：`recordChallengeRun` 绝不触碰 `global.*` / `gradeProgress[g].*`
   */
  challenge: ChallengeProgress;
  stats: GlobalStats;
  collection: CollectionState;
  /** ★ 能力纪念章（★ 顶层，不在 collection 下—— 与 save.js 一致） */
  medals: MedalsState;
  mistakes: MistakeBook;
  settings: Settings;
  daily: DailyState;
}

/* ---------- 2.1.11 云端影子（v1 启用，与主存档分离） ---------- */
interface CloudShadow {
  /** 用户在云端的唯一 ID（= openid 的 HMAC，不可反推 openid） */
  cloudUid: string;                    // 'u_7f3a91c2'
  /** 影子数据最后同步的本地时间 */
  syncedAt: number;                    // 1757900000000
  /** 上次成功拉取的全国榜快照（离线时直接渲染） */
  leaderboard: LeaderboardSnapshot | null;
  /** 上次成功拉取的个人统计（自己的全国排名） */
  myRank: MyRankInfo | null;
  /** 上次同步的错误码（非 0 表示影子可能过期） */
  lastErrorCode: number;               // 0
}

interface LeaderboardSnapshot {
  /** 榜单维度：'bestScore' | 'bestDl' | 'bestCombo' */
  metric: 'bestScore' | 'bestDl' | 'bestCombo';
  /** 年级 */
  grade: GradeKey;
  /** 榜单所属日 'YYYY-MM-DD'，与本机日期不同则前端显示"昨日榜" */
  date: string;                        // '2026-10-03'
  /** Top N 条目 */
  items: RankItem[];
  /** 下一页游标（不透明串，服务端生成） */
  nextCursor: string | null;           // 'eyJzIjoxMjM0fQ' | null
}

interface RankItem {
  rank: number;                        // 3
  cloudUid: string;                    // 'u_88a1c0'  （严禁下发 openid）
  nickname: string;                    // '星算者-1042'  （已在云端过敏感词）
  grade: GradeKey;                     // 'G3'
  value: number;                       // 28450（按 metric 解释）
  avatarId: CharacterId;               // 'bear'
  /** 客户端可信标记：false = 该条未通过服务端重算，只作展示，不可作为自己的目标 */
  verified: boolean;                   // true
}

interface MyRankInfo {
  grade: GradeKey;
  metric: 'bestScore' | 'bestDl' | 'bestCombo';
  myValue: number;                     // 15400
  myRank: number | null;               // 1247；null = 未上榜
  /** 榜单总参与人数（近似，用于"你超过了 xx% 的同学"） */
  totalPlayers: number;                // 38210
  /** 超过百分比 0—100，0—100 整数 */
  percentile: number;                  // 96
}
```

### 2.2 完整示例值（可直接用作单元测试fixture）

```json
{
  "meta": {
    "schema": 4,
    "savedAt": 1757900000123,
    "createdAt": 1757000000000,
    "installId": "a3f9c2e17b8d4056"
  },
  "profile": {
    "nickname": "星算者-4821",
    "avatarId": "bunny_star",
    "grade": "G3",
    "unlockedCharacters": ["bunny_star", "rabbit", "cat", "bear", "chick"],
    "unlockedSkins": [],
    "currentCharacter": "cat",
    "currentSkin": "default",
    "tutorialDone": true,
    "lastPlayedAt": 1757900000000,
    "firstPlayedAt": 1757000000000,
    "playDays": 23,
    "totalPlaySeconds": 7320,
    "launchCount": 58,
    "totalRuns": 141
  },
  "challenge": {
    "bestScore": 18400,
    "unlockProgress": { "3": 5, "4": 2 },
    "usedCount": 1,
    "date": "2026-10-03"
  },
  "grades": {
    "G1": {
      "unlocked": true,
      "main": {
        "bestScore": 6200, "bestDl": 4, "bestCombo": 28, "bestAccuracy": 0.95,
        "totalScore": 88300, "currentLevel": 20,
        "levels": {
          "18": { "stars": 3, "bestScore": 3120, "bestDl": 4, "bestCombo": 22, "bestAccuracy": 1.0, "clearCount": 3 },
          "19": { "stars": 2, "bestScore": 2890, "bestDl": 4, "bestCombo": 19, "bestAccuracy": 0.9, "clearCount": 2 }
        },
        "totalAnswered": 3120, "totalCorrect": 2980, "totalWrong": 140,
        "difficultyOffset": 0, "mastery": 5,
        "lastPlayedAt": 1756600000000, "lastScore": 2400, "lastWasRecord": false
      }
    },
    "G2": {
      "unlocked": true,
      "main": {
        "bestScore": 12400, "bestDl": 5, "bestCombo": 40, "bestAccuracy": 0.91,
        "totalScore": 176000, "currentLevel": 22, "levels": {},
        "totalAnswered": 5240, "totalCorrect": 4760, "totalWrong": 480,
        "difficultyOffset": 0, "mastery": 4, "lastPlayedAt": 1757000000000,
        "lastScore": 9800, "lastWasRecord": true
      }
    },
    "G3": {
      "unlocked": true,
      "main": {
        "bestScore": 24860, "bestDl": 8, "bestCombo": 63, "bestAccuracy": 0.88,
        "totalScore": 312400, "currentLevel": 24,
        "levels": { "23": { "stars": 3, "bestScore": 15400, "bestDl": 7, "bestCombo": 51, "bestAccuracy": 0.9, "clearCount": 2 } },
        "totalAnswered": 3820, "totalCorrect": 3305, "totalWrong": 515,
        "difficultyOffset": 0, "mastery": 3, "lastPlayedAt": 1757890000000,
        "lastScore": 15400, "lastWasRecord": false
      }
    },
    "G4": {
      "unlocked": true,
      "main": {
        "bestScore": 18200, "bestDl": 8, "bestCombo": 55, "bestAccuracy": 0.83,
        "totalScore": 96000, "currentLevel": 12, "levels": {},
        "totalAnswered": 1560, "totalCorrect": 1295, "totalWrong": 265,
        "difficultyOffset": 1, "mastery": 2, "lastPlayedAt": 1756400000000,
        "lastScore": 11200, "lastWasRecord": false
      }
    },
    "G5": {
      "unlocked": true,
      "main": {
        "bestScore": 9600, "bestDl": 7, "bestCombo": 41, "bestAccuracy": 0.79,
        "totalScore": 24000, "currentLevel": 6, "levels": {},
        "totalAnswered": 420, "totalCorrect": 332, "totalWrong": 88,
        "difficultyOffset": 0, "mastery": 1, "lastPlayedAt": 1755000000000,
        "lastScore": 6100, "lastWasRecord": false
      }
    },
    "G6": {
      "unlocked": true,
      "main": {
        "bestScore": 4200, "bestDl": 7, "bestCombo": 30, "bestAccuracy": 0.75,
        "totalScore": 4200, "currentLevel": 2, "levels": {},
        "totalAnswered": 60, "totalCorrect": 45, "totalWrong": 15,
        "difficultyOffset": 0, "mastery": 0, "lastPlayedAt": 1754000000000,
        "lastScore": 4200, "lastWasRecord": true
      }
    }
  },
  "collection": {
    "stars": 340, "starsEarned": 620, "coins": 1280, "coinsEarned": 5240,
    "title": { "current": "combo_30", "unlocked": ["combo_30", "speed_demon"] },
    "characterRuns": { "bunny_star": 88, "cat": 53, "bear": 21 }
  },
  "medals": {
    "items": [
      { "key": "first_perfect_chapter@23", "id": "first_perfect_chapter",
        "level": 23, "value": 3, "at": 1757500000000 },
      { "key": "precision_90@23", "id": "precision_90",
        "level": 23, "value": 92, "at": 1757880000000 },
      { "key": "combo_30", "id": "combo_30",
        "level": null, "value": 31, "at": 1757300000000 },
      { "key": "flawless_clear", "id": "flawless_clear",
        "level": null, "value": 10, "at": 1757200000000 }
    ]
  },
  "stats": {
    "totalAnswered": 14220, "totalCorrect": 12717, "totalWrong": 1503,
    "longestCombo": 88, "bestScoreOverall": 31450, "bestDlOverall": 10,
    "perfectClears": 17, "totalPlaySeconds": 7320,
    "lastSession": {
      "at": 1757880000000, "grade": "G3", "level": 23, "score": 15400,
      "dl": 7, "maxCombo": 51, "answered": 100, "correct": 87,
      "accuracy": 0.87, "durationMs": 142000, "isNewRecord": false
    },
    "firstTryHistory": [
      { "at": 1757880000000, "grade": "G3", "total": 100, "firstTryCorrect": 78,
        "firstTryAccuracy": 0.78, "avgMsPerQuestion": 1420, "mode": "main" },
      { "at": 1757793000000, "grade": "G3", "total": 100, "firstTryCorrect": 74,
        "firstTryAccuracy": 0.74, "avgMsPerQuestion": 1510, "mode": "main" },
      { "at": 1757700000000, "grade": "G3", "total": 98, "firstTryCorrect": 71,
        "firstTryAccuracy": 0.724, "avgMsPerQuestion": 1580, "mode": "main" }
    ],
    "todayAnswered": 260, "todayCorrect": 231, "today": "2026-10-03",
    "streakDays": 9, "lastActiveDate": "2026-10-03", "maxStreakDays": 14
  },
  "mistakes": {
    "version": 1,
    "capacity": 200,
    "reviewCursor": 0,
    "lastReviewAt": 1757885000000,
    "totalReviews": 34,
    "items": [
      {
        "id": "G3|mul|12|7", "grade": "G3", "op": "mul", "a": 12, "b": 7,
        "displayText": "12 × 7", "answer": 84, "lastWrongAnswer": 74,
        "wrongCount": 3, "firstWrongAt": 1757100000000, "lastWrongAt": 1757880000000,
        "mastery": 0, "correctStreak": 0, "nextReviewAt": 1757880000000, "sourceDl": 5
      },
      {
        "id": "G3|div|56|8", "grade": "G3", "op": "div", "a": 56, "b": 8,
        "displayText": "56 ÷ 8", "answer": 7, "lastWrongAnswer": 8,
        "wrongCount": 1, "firstWrongAt": 1757200000000, "lastWrongAt": 1757200000000,
        "mastery": 1, "correctStreak": 0, "nextReviewAt": 1757886000000, "sourceDl": 4
      },
      {
        "id": "G4|sub|1000|1", "grade": "G4", "op": "sub", "a": 1000, "b": 1,
        "displayText": "1000 − 1", "answer": 999, "lastWrongAnswer": 990,
        "wrongCount": 2, "firstWrongAt": 1756900000000, "lastWrongAt": 1757500000000,
        "mastery": 2, "correctStreak": 1, "nextReviewAt": 1758180000000, "sourceDl": 6
      }
    ]
  },
  "settings": {
    "soundEnabled": true, "bgmEnabled": true, "vibrateEnabled": true,
    "vibrateIntensity": 1, "globalDifficultyOffset": 0,
    "showTimerBar": true, "autoNextDelayMs": 450, "reduceMotion": false,
    "fontScale": 0, "leftHanded": false,
    "cloudLeaderboardEnabled": false, "analyticsEnabled": false,
    "privacyNoticeVersion": 0, "parentPinHash": "", "parentHint": "100 乘 3 等于几",
    "parentSettings": {
      "pinConfigured": false, "dailyGoal": 300, "challengeOnlyMode": false,
      "challengeDailyLimit": 3, "challengeEnabled": true, "rewardAdEnabled": true,
      "dailyCoinSpendLimit": 0, "mistakeSyncEnabled": false, "reportExportedAt": 0,
      "instantRemediation": true, "allowDifficultyUp": true, "playWindow": null
    }
  },
  "daily": {
    "date": "2026-10-03", "answered": 260, "correct": 231, "goal": 300,
    "claimedRewardIds": ["daily_100"], "hasPlayedToday": true, "hasReviewedToday": false
  }
}
```
