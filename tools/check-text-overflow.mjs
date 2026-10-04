/**
 * 文字溢出自检
 * ------------------------------------------------------------------
 * 【为什么需要】
 * 纯肉眼看截图会漏——尤其中文长文案、多行场景。
 * 把「文字实际渲染宽度 vs 可用宽度」变成可自动断言的检查。
 *
 * 判定标准（WCAG 友好）：
 *   单行文字宽 > 容器宽 → 溢出
 *   中文按 1.0 字宽，英文/数字按 0.56 字宽（经验值）
 *
 * 用法：node tools/check-text-overflow.mjs
 */

import { FONT, DESIGN, GRADE_TABLE } from '../shared/config.js';

const CHAR_W_CJK = 1.0;
const CHAR_W_LATIN = 0.56;

/** 估算文本渲染宽度（px） */
function measure(str, size) {
  let w = 0;
  for (const ch of String(str)) {
    w += /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(ch) ? CHAR_W_CJK : CHAR_W_LATIN;
  }
  return w * size;
}

const issues = [];

/** 断言：文本不溢出容器 */
function assertFit(label, str, size, containerW, lineCount = 1) {
  const w = measure(str, size);
  const cap = containerW * lineCount;
  const ok = w <= cap;
  if (!ok) {
    issues.push({ label, str, size, need: w.toFixed(0), cap: cap.toFixed(0), over: (w / cap * 100).toFixed(0) + '%' });
  }
  return ok;
}

console.log('文字溢出自检（设计稿宽度 ' + DESIGN.WIDTH + '）');
console.log('='.repeat(62));

// —— 1. 年级卡：卡内宽 184，标签区留 20 边距
console.log('\n[年级卡] 容器 184（留边距 20→164）');
for (const g of GRADE_TABLE) {
  assertFit(`${g.label} 标题`, g.label, 30, 164);
  // 描述会折成两行，故按 2 行算
  const lines = g.desc.length > 7 ? 2 : 1;
  assertFit(`${g.label} 描述(折${lines}行)`, g.desc, 20, 164, lines);
}

// —— 2. 主页（真实值：Tab 宽 294、开始按钮 400、角色卡 108）
console.log('[主页]');
assertFit('游戏标题', '星算速算家', 66, 672);
assertFit('副标题', '算得越快，星星越多！', 26, 672);
assertFit('Tab「选年级」', '选年级', 28, 294);
assertFit('Tab「选角色」', '选角色', 28, 294);
assertFit('开始按钮', '开始游戏', 44, 400);
// 角色页确认按钮（代码 600—690 区间的文案）
assertFit('角色页确认', '就选它啦！', 32, 400);

// —— 3. 游戏页 HUD
console.log('[游戏页 HUD]');
// 时间胶囊 140 / 总分胶囊 130 / 静音钮 40
assertFit('时间标签', '时间', 20, 140);
assertFit('总分标签', '总分', 22, 130);
assertFit('正确率标签', '正确 1/10', 20, 150);
assertFit('失误标签', '失误 0', 20, 120);
assertFit('连击标签', '3 连击', 20, 100);
assertFit('倍率标签', '×1.25', 20, 80);
/**
 * 题型标签：ui.js 里是自适应宽度（measure + 40），
 * 所以正确断言是「标签右边缘 < 「第N问」左边缘」，而非固定容器宽。
 */
const TAG_Y = 502, TAG_H = 46, TAG_X = 44;
const QIDX_RIGHT = 628;
const qidxLeft = QIDX_RIGHT - measure('第 10 问', 20);
for (const lb of ['小数加减法', '两位数乘除', '三位数乘除', '分数运算', '混合运算', '小数乘法', '乘法', '除法', '加法', '减法']) {
  const tw = measure(lb, 24) + 40;
  const right = TAG_X + tw;
  if (right > qidxLeft) {
    issues.push({ label: '题型「' + lb + '」与「第N问」重叠', str: lb, size: 24,
      need: right.toFixed(0), cap: qidxLeft.toFixed(0), over: (right / qidxLeft * 100).toFixed(0) + '%' });
  }
}
console.log('  题型标签 vs 第N问: ' + (issues.filter(i => i.label.includes('题型')).length === 0 ? '✅ 无重叠' : '❌ 有重叠'));
// 题型标签不能超出白卡（白卡 20—652）
for (const lb of ['小数加减法', '两位数乘除', '三位数乘除']) {
  const tw = measure(lb, 24) + 40;
  if (TAG_X + tw > 652) {
    issues.push({ label: '题型「' + lb + '」超出白卡', str: lb, size: 24, need: (TAG_X + tw).toFixed(0), cap: '652', over: '—' });
  }
}
assertFit('第N问', '第 10 问', 20, 652 - 44);

// —— 4. 键盘数字
console.log('[键盘] 键宽 184');
for (const k of ['7', '8', '9', '1', '2', '3', '4', '5', '6', '0']) {
  assertFit(`键「${k}」`, k, 52, 184 - 20);
}

// —— 5. 结算页
console.log('[结算页]');
assertFit('「计算完成」', '计算完成', 24, 156);          // 胶囊 156
assertFit('评语短版', '计算小达人！', 28, 632);
assertFit('评语加长版', '太厉害啦，下次挑战更高年级！', 20, 632);
// 四宫格宽 268
assertFit('四宫格「答对」', '答对', 20, 268);
assertFit('四宫格「失误」', '失误', 20, 268);
assertFit('四宫格「最高连击」', '最高连击', 20, 268);
assertFit('四宫格「难度等级」', '难度等级', 20, 268);
assertFit('四宫格值 28 题', '28 题', 30, 268);
assertFit('四宫格值 DL 7.5', 'DL 7.5', 30, 268);
// 主 CTA 400 宽
assertFit('主CTA', '再来 90 秒！', 40, 400);
assertFit('主CTA 副文案', '今日还剩 3 次', 20, 400);
assertFit('次CTA', '返回主页', 32, 400);
assertFit('未解锁主文案', '挑战赛未解锁', 32, 400);
assertFit('未解锁引导', '再有效通关 3 次即可解锁', 20, 400);
assertFit('用完主文案', '今日次数已用完', 32, 400);
// 纪念章提示：容器 560 上限
assertFit('纪念章提示', '获得纪念章：首次满星、精准章', 20, 560);
assertFit('纪念章提示(满)', '获得纪念章：首次满星、精准章、完美章 等5枚', 20, 560);
assertFit('挑战赛隔离标识', '挑战赛成绩（不计入闯关记录）', 20, 560);

// —— 6. 角色名
console.log('[角色卡] 容器 108');
for (const n of ['兔耳小人', '白兔', '小猫', '小熊', '小鸡']) {
  assertFit(`角色名「${n}」`, n, 20, 108 - 12);
}

// —— 7. 数值动态范围
console.log('[动态数值上限]');
assertFit('最大分数', String(999999), 96, 632 - 40);
assertFit('DL 标签', 'DL 10', 32, 268 - 20);
assertFit('连击', '50 连', 32, 268 - 20);

console.log('\n' + '='.repeat(62));
if (issues.length === 0) {
  console.log('✅ 全部通过：无文字溢出');
} else {
  console.log(`❌ 发现 ${issues.length} 处溢出风险:\n`);
  for (const i of issues) {
    console.log(`  ${i.label}`);
    console.log(`    文本「${i.str}」  需 ${i.need}px / 可用 ${i.cap}px  → 超 ${i.over}\n`);
  }
  process.exit(1);
}
