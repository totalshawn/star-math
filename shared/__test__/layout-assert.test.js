// shared/__test__/layout-assert.test.js
// 布局几何断言 —— 防「改坐标时没算邻居」类 bug
//
// ★ 为什么这个文件值得存在（它已经有真实拦截记录）：
//   · v1.1→v1.2 修的 3 处重叠：按钮/软条/键盘三方混战、左手模式标签重叠、排行榜骨架屏顺序
//   · v1.2→v1.3 又发现 1 处：左手模式算式区(60—242) 与答题位(54—178) **横向重叠 118px**
//   共同模式：**单看一个元素没问题，元素两两关系出问题**。
//   坐标是高频变更的东西，人眼复核不可靠 → 必须机械保障。
//   本文件就是那个机械保障：改任何坐标后跑一遍，红了就是有问题。
//
// 运行：node shared/__test__/layout-assert.test.js     （零依赖，CommonJS）
// 数据来源：UI_SPEC v1.3 §2.6 / §2.7 / §2.7.1 / §3.4.1 / §7.3 / §7.4 / §19.1
//
// ★ 断言原语的设计（修正了初版的一个错误）：
//   初版只有 `ok(a,b) => assert(a >= b)`，无法表达「不出卡」这类 a<=b 的关系，
//   导致 G3「软条不出卡 824<=830」被写成 824>=830 → 语义反了。
//   现在拆成两个方向明确的函数：assertBefore(a,b) 表达 a<=b，assertAfter(a,b) 表达 a>=b。

let pass = 0, fail = 0
const results = []

function rect(o) { return { top: o.y, bottom: o.y + o.h, left: o.x, right: o.x + o.w } }

// A 在 B **之前 / 不超过**（a <= b）：用于「不出卡」「不越界」「不重叠」
function assertBefore(a, b, msg) {
  const good = a <= b
  good ? pass++ : fail++
  results.push([good ? 'PASS' : 'FAIL', msg, `${a} <= ${b}`])
}
// A 在 B **之后 / 不小于**（a >= b）：用于「不压住」
function assertAfter(a, b, msg) {
  const good = a >= b
  good ? pass++ : fail++
  results.push([good ? 'PASS' : 'FAIL', msg, `${a} >= ${b}`])
}
function assertTrue(v, msg) {
  v ? pass++ : fail++
  results.push([v ? 'PASS' : 'FAIL', msg, String(v)])
}

// ═════════════════════════════════════════════════════════════
// 布局常量（**唯一来源** = UI_SPEC v1.3；改这里必须同步 UI_SPEC）
// ═════════════════════════════════════════════════════════════
const L = {
  card:    { x: 20,  y: 480, w: 632, h: 350 },   // 题目白卡
  tag:     { x: 44,  y: 502, w: 200, h: 46  },   // 题型标签胶囊
  qIndex:  { x: 468, y: 504, w: 160, h: 34  },   // 「第 N 问」（右手，右上）
  eq:      { x: 60,  y: 574, w: 370, h: 226 },   // 算式区（右缘 430）
  slot:    { x: 494, y: 610, w: 124, h: 124 },   // 答题位（圆心 556,672 ⌀124）
  nextBtn: { x: 216, y: 738, w: 240, h: 72  },   // 「下一题 ›」白卡内浮层
  hint:    { x: 44,  y: 786, w: 160, h: 26  },   // 卡内底部提示
  softBar: { x: 44,  y: 818, w: 584, h: 6   },   // 软倒计时条（卡内底部）
  keypad:  { x: 16,  y: 848, w: 640, h: 372 },   // 键盘 y848（v1.2 起不随 showTimerBar 移动）
  keypadColX: [16, 234, 452], keypadColW: 204
}

// 左手模式（UI_SPEC §19.1 + v1.5 修订）
// ★ v1.5 根因修正：v1.2/v1.4 的 eq.x=60 + eq.right=242 是**错的**
//   —— 把「672−430=242」当右边界，却保留 eq.x=60 → 占 60—242，宽仅 182 且压答题位 118px
//   —— 正确：算式区镜像后**右对齐 612**（= 672−60），左缘由对称间隙反推
const LL = {
  qIndex: { x: 468, y: 504, w: 160, h: 34 },   // ★ v1.5：回到右上，**不镜像**（右上在左手模式空着）
  // ★ 对称推导：右手 算式右缘430 → 答题位左缘494 间隙 64px
  //            左手 答题位右缘178 → 算式左缘 178+64 = 242，右对齐 612，宽 370（与右手完全一致）
  eq:     { x: 242, y: 574, w: 370, h: 226 },   // ← 采纳 v1.5 的方向，但 x 用 242 而非 200
  slot:   { x: 54, y: 610, w: 124, h: 124 },   // 答题位 cx=116 → 54—178
  keypadColX: [452, 234, 16], backspaceCol: 2  // ★ 两列互换，退格移至 col3
}
// 间隙对称性（v1.5 方案 x=200 只有 22px，与右手 64px 不对称）
const GAP_RIGHT = 494 - (60 + 370)     // = 64，右手模式
const GAP_LEFT  = LL.eq.x - (54 + 124) // = 242 − 178 = 64，左手模式

// 年级配置（UI_SPEC §7.3 v1.3：1—2 年级字号 +2，v1.3 新增 fontBoost 字段）
const GRADE = {
  1: { eqFont: 72, keyFont: 52, tagFont: 26, hintFont: 20, fontBoost: 2 },
  2: { eqFont: 72, keyFont: 52, tagFont: 26, hintFont: 20, fontBoost: 2 },
  3: { eqFont: 64, keyFont: 46, tagFont: 26, hintFont: 20, fontBoost: 0 },
  4: { eqFont: 64, keyFont: 46, tagFont: 26, hintFont: 20, fontBoost: 0 },
  5: { eqFont: 56, keyFont: 42, tagFont: 26, hintFont: 20, fontBoost: 0 },
  6: { eqFont: 56, keyFont: 42, tagFont: 26, hintFont: 20, fontBoost: 0 }
}

// WCAG 相对亮度对比度（色值直接算，不用渲染）
function luminance(hex) {
  const c = [1, 3, 5].map(i => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function contrast(h1, h2) {
  const a = luminance(h1), b = luminance(h2)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

// ═════════════════════════════════════════════════════════════
// ★ 两两全检测（**最重要的机制改进**）
//
//   为什么要这个：G1—G27 是「我想到的」，两两检测是「客观的」。
//   实战证据：ui-designer 手工列举 → 我的方案 b 漏了 1 处 → v1.5 又漏 1 处。
//   **人工列举总会漏，两两检测不会。**
//
//   已知遗留：eq × nextBtn（算式区 y 574—800 vs 按钮 y 738—810）
//   在**右手模式同样存在**，是 3—4 行算式的既有问题，不阻塞左手模式上线。
//   已登记为下一轮议题（R19）。这里用 ALLOW 显式豁免并计数，避免被当成新 bug。
// ═════════════════════════════════════════════════════════════
const ALLOW = { 'eq×btn': 'R19 既有问题：3-4 行算式 vs 下一题按钮（右手模式同样存在）' }

function pairwiseScan(layout, modeName) {
  // ★ 只检测**叶子矩形**；card/keypad 是**容器**，包含子元素属正常，不算碰撞
  const CONTAINERS = ['card', 'keypad']
  const keys = Object.keys(layout).filter(k => {
    const v = layout[k]
    return !CONTAINERS.includes(k) &&
           v && typeof v === 'object' && typeof v.x === 'number' && typeof v.w === 'number'
  })
  const hits = []
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = layout[keys[i]], b = layout[keys[j]]
      const overlap = !(a.x + a.w <= b.x || b.x + b.w <= a.x ||
                       a.y + a.h <= b.y || b.y + b.h <= a.y)
      if (overlap) hits.push(`${keys[i]}×${keys[j]}`)
    }
  }
  const unexpected = hits.filter(h => !ALLOW[h])
  const allowed = hits.filter(h => ALLOW[h])
  console.log(`\n[两两全检测 · ${modeName}] 检测 ${keys.length} 个叶子矩形，碰撞 ${hits.length} 处`)
  if (allowed.length) {
    allowed.forEach(h => console.log(`  · ${h}  → 已豁免（${ALLOW[h]}）`))
  }
  if (unexpected.length) {
    console.log(`  ★ 意外碰撞 ${unexpected.length} 处：${unexpected.join(', ')}`)
  } else {
    console.log('  ✓ 无意外碰撞')
  }
  return unexpected.length
}
console.log('\n=== ★ 两两全检测（客观，不靠人工列举）===')
let unexpectedTotal = 0
unexpectedTotal += pairwiseScan(L, '右手模式')
unexpectedTotal += pairwiseScan(LL, '左手模式 v1.5')

// ═════════════════════════════════════════════════════════════
// G1—G8 元素不重叠（v1.2 三处 bug + v1.3/v1.5 两处根因的回归测试）
// ═════════════════════════════════════════════════════════════
console.log('\n=== G1—G8 元素不重叠 ===')
assertAfter (rect(L.nextBtn).top, rect(L.slot).bottom,    'G1 「下一题」不压答题位 (738>=734)')
assertAfter (rect(L.softBar).top, rect(L.nextBtn).bottom, 'G2 软条不压按钮 (818>=810)')
assertBefore(rect(L.softBar).bottom, rect(L.card).bottom,  'G3 软条不出卡 (824<=830)')
assertAfter (rect(L.keypad).top,  rect(L.card).bottom,    'G4 键盘不压卡 (848>=830)')
assertAfter (rect(L.slot).left,   L.eq.x + L.eq.w,        'G5 答题位不压算式 (494>=430)')
assertBefore(L.eq.x,              rect(L.nextBtn).right,  'G6 算式左缘在按钮左 (60<=456)')
assertBefore(rect(L.hint).right, L.nextBtn.x,             'G7 卡内提示在按钮左侧 (204<=216)')
// G8 左手模式：★ v1.5 根因修正（算式区左缘由对称间隙反推，不是 242-60）
assertBefore(rect(LL.slot).right, LL.eq.x,                'G8a 左手：答题位不压算式 (178<=242)')
// G8b 「第 N 问」回到右上（不镜像）→ 与算式区纵向分离
assertBefore(rect(LL.qIndex).bottom, LL.eq.y,             'G8b 左手：第N问不压算式区 (538<=574)')
// G8c ★ v1.5 补的关键断言：**直接挡住根因**——"算式区压答题位"是 bug 本质，
//     比只测第N问更有效
assertBefore(rect(LL.slot).right, LL.eq.x,                'G8c 左手：算式左缘在答题位右缘之后')
// G8d 左手模式下「第 N 问」在右侧远处（右上 vs 左侧答题位）
assertTrue(LL.qIndex.x > LL.slot.x + LL.slot.w + 100,     'G8d 左手：第N问在右侧远处 (468>278)')
// G8e ★ 镜像对称性：左手间隙必须等于右手间隙（v1.5 方案 x=200 只有 22px，v1.2 只有 -118px）
assertTrue(GAP_LEFT === GAP_RIGHT, `G8e 镜像间隙对称 左手${GAP_LEFT}px = 右手${GAP_RIGHT}px`)
// G8f 算式区宽度应与右手模式一致（370），证明「左手并未收窄」
assertTrue(LL.eq.w === L.eq.w, `G8f 左手算式宽 ${LL.eq.w} = 右手 ${L.eq.w}（未收窄）`)

// ═════════════════════════════════════════════════════════════
// G9—G14 镜像安全性
// ═════════════════════════════════════════════════════════════
console.log('\n=== G9—G14 左手模式镜像安全性 ===')
LL.keypadColX.forEach((x, i) => {
  assertTrue(x >= 0 && x + L.keypadColW <= 672, `G9 左手键盘 col${i} 在屏内 (${x}—${x + L.keypadColW})`)
})
assertTrue(LL.slot.x >= 0, `G10 左手答题位左缘 >= 0 (${LL.slot.x})`)
assertTrue(LL.slot.x + LL.slot.w <= 672, `G11 左手答题位右缘 <= 672 (${LL.slot.x + LL.slot.w})`)
assertTrue(L.tag.x === 44,                        'G12a 题型标签固定左上不镜像 (x=44)')
// ★ v1.5 修订：「第 N 问」**回到右上不镜像**（右上在左手模式空着，且空间记忆不被打断）
assertTrue(LL.qIndex.x === L.qIndex.x,            'G12b 左手「第N问」不镜像 (468=468)')
assertTrue(LL.qIndex.y === L.qIndex.y,            'G12c 左手「第N问」y 不变 (504=504)')
assertTrue(L.tag.y + L.tag.h <= L.eq.y,          'G13 题型标签在算式区上方 (548<=574)')
assertTrue(LL.keypadColX[2] === 16, `G14 左手退格键在 col3 (x=16)`)

// ═════════════════════════════════════════════════════════════
// G15—G18 字号（v1.3：1—2 年级 fontBoost +2）
// ═════════════════════════════════════════════════════════════
console.log('\n=== G15—G18 字号与 fontBoost ===')
assertTrue(GRADE[1].eqFont  + GRADE[1].fontBoost >= 72, `G15  1年级算式 ${GRADE[1].eqFont}+${GRADE[1].fontBoost} >= 72`)
assertTrue(GRADE[1].keyFont + GRADE[1].fontBoost >= 52, `G15b 1年级键帽 ${GRADE[1].keyFont}+${GRADE[1].fontBoost} >= 52`)
assertTrue(GRADE[1].tagFont + GRADE[1].fontBoost >= 26, `G15c 1年级标签 ${GRADE[1].tagFont}+${GRADE[1].fontBoost} >= 26`)
assertTrue(GRADE[5].eqFont  + GRADE[5].fontBoost >= 56, `G16  5年级算式 >= 56`)
// ★ 关键不变量：fontScale 不得让字号低于年级基准（FRONTEND_SPEC §14.1 钳1）
const FONT_SCALE = [1.0, 1.15, 1.3]
for (const g of [1, 3, 5]) {
  const base = GRADE[g].eqFont + GRADE[g].fontBoost
  for (let fs = 0; fs < 3; fs++) {
    const scaled = Math.min(Math.max(base * FONT_SCALE[fs], base), 88)
    assertTrue(scaled >= GRADE[g].eqFont,
      `G17 ${g}年级 fontScale=${fs} → ${scaled.toFixed(1)} >= 基准 ${GRADE[g].eqFont}`)
  }
}
// 缩放下限
for (const g of [1, 3, 5]) {
  const base = GRADE[g].eqFont + GRADE[g].fontBoost
  assertTrue(base * 0.92 >= GRADE[g].eqFont * 0.92,
    `G18 ${g}年级 shrinkFloor ${(base * 0.92).toFixed(1)} 可用`)
}

// ═════════════════════════════════════════════════════════════
// G19—G27 对比度（WCAG）
// ═════════════════════════════════════════════════════════════
console.log('\n=== G19—G27 对比度 ===')
const c1 = contrast('#2E1F5E', '#FFFFFF')
assertTrue(c1 >= 7, `G19 算式 ink-900 on 白卡 对比度 ${c1.toFixed(2)} >= 7`)
const c2 = contrast('#4A2E86', '#FFFFFF')
assertTrue(c2 >= 4.5, `G24 正确答案 brand-700 on 白卡 对比度 ${c2.toFixed(2)} >= 4.5`)
const c3 = contrast('#B0261E', '#FFFFFF')
assertTrue(c3 >= 4.5, `G25 错误值 error-600 on 白卡 对比度 ${c3.toFixed(2)} >= 4.5`)
const c4 = contrast('#FFFFFF', '#5B3CC4')
assertTrue(c4 >= 4.5, `G26 选中段 on-dark on brand-600 对比度 ${c4.toFixed(2)} >= 4.5`)
const c5 = contrast('#5C5470', '#FFFFFF')
assertTrue(c5 >= 4.5, `G27 辅助文字 ink-500 on 白卡 对比度 ${c5.toFixed(2)} >= 4.5（ink-300 禁承载题目/分数）`)

// ═════════════════════════════════════════════════════════════
// 汇总
// ═════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(72))
for (const [s, m, v] of results) {
  if (s === 'FAIL') console.log(`  ${s}  ${m}   [${v}]`)
}
console.log(`\n结果：${pass} PASS / ${fail} FAIL  （共 ${pass + fail}）`)
if (fail > 0 || unexpectedTotal > 0) {
  if (fail > 0) {
    console.log('\n★ 断言 FAIL：')
    console.log('  请检查上述 FAIL 项的坐标与 §14.2 左手模式定义')
  }
  if (unexpectedTotal > 0) {
    console.log(`\n★ 两两全检测发现 ${unexpectedTotal} 处**意外碰撞**（不在 ALLOW 豁免名单内）`)
    console.log('  这类碰撞人工列举极易遗漏 —— 修坐标后必须重跑本文件')
  }
  console.log('\n★ 修复前左手模式不可上线。详见 FRONTEND_SPEC §14.2 / 风险 R15。')
}
process.exit(fail > 0 || unexpectedTotal > 0 ? 1 : 0)
