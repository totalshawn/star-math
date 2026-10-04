/**
 * 全局配置中心
 * ------------------------------------------------------------------
 * 【换皮入口】改这里就能换风格；【难度入口】改GRADE_TABLE 就能调整难度档位。
 * 本文件是纯逻辑，不依赖任何平台 API，微信小游戏与 H5 可直接复用。
 */

/** 设计稿基准分辨率（与参考视频一致），所有布局按此等比缩放 */
const DESIGN = {
  WIDTH: 672,
  HEIGHT: 1280,
  //安全区（刘海/底部小黑边），运行时按设备动态覆盖
  SAFE_TOP: 24,
  SAFE_BOTTOM: 24
};

/**
 * 色板 —— 严格对齐 docs/UI_SPEC.md §1 设计令牌
 * 描边统一深紫形成「贴纸」质感；文字色阶满足 WCAG AA/AAA
 */
const COLOR = {
  // 品牌薄荷绿（描边主色）
  BRAND_700: '#1C7A63',
  BRAND_600: '#2FA98A',
  BRAND_500: '#55C4A6',
  BRAND_300: '#8FDCC6',
  BRAND_100: '#D2F0E4',

  // 背景渐变（低年级粉紫；高年级由 getGradeTheme 切冷调）
  BG_TOP: '#F0FBF5',
  BG_MID: '#DFF6EC',
  BG_BOT: '#C9EEDF',

  // 表面
  CARD_BG: '#FFFFFF',
  KEY_BG: '#FFFFFF',
  KEY_ALT: '#F2FBF7',
  STAGE_BG: '#A8E6CF',
  STAGE_EDGE: '#6BC9AB',

  // 强调
  GOLD: '#FFB84D',
  GOLD_DEEP: '#D98A15',
  PEACH: '#FF8FB1',
  SKY: '#4FC3F7',
  MINT: '#6EE7C8',
  LEMON: '#FFE86B',

  // 语义
  SUCCESS: '#17804A',
  SUCCESS_LIGHT: '#2FBF71',
  SUCCESS_BG: '#D6F5E4',
  ERROR: '#E01B45',
  ERROR_LIGHT: '#FF4D6D',
  ERROR_BG: '#FFE0E6',
  WARN: '#FF9F1C',

  // 文字色阶（对比度见 UI_SPEC §1.6）
  INK: '#1E3D35',
  INK_SUB: '#3E6B5D',
  INK_AUX: '#54786D',
  INK_DISABLED: '#8FA9A0',
  ON_DARK: '#FFFFFF',

  // 中性
  N_50: '#EEF9F4',
  N_100: '#D2F0E4',
  N_300: '#9FD8C4',
  N_500: '#9C90C9',

  SCRIM: 'rgba(30,18,60,0.55)'
};

/** 字号阶梯（设计 px @672 基准，对齐 UI_SPEC §1.8） */
const FONT = {
  EQUATION: 64,
  ANSWER: 56,
  EX: 56,
  TIMER: 48,
  KEY: 46,
  SCORE: 38,
  HUD_LABEL: 24,
  TAG: 26,
  QINDEX: 28,
  BODY: 26,
  CAPTION: 20
};

/** 字体栈见文件末尾（与 CHARACTER_UNLOCK 一起，集中声明） */

/** 按年级切换视觉主题（UI_SPEC §7：低1-2 / 中3-4 / 高5-6） */
function getGradeTheme(grade) {
  /**
   * 薄荷奶油三档（B 配色）
   * 低年级偏暖奶（活泼、装饰多），高年级偏清冷（安静、专注）
   */
  if (grade <= 2) return { bgTop: '#FFF8EE', bgMid: '#E8F7EE', bgBot: '#D2EFE0', deco: true };
  if (grade <= 4) return { bgTop: '#F2FBF6', bgMid: '#E0F5EC', bgBot: '#C9EBDA', deco: true };
  return { bgTop: '#EDF9FB', bgMid: '#DDF1F5', bgBot: '#C6E6EC', deco: false };
}

/** 圆角 */
const RADIUS = {
  CARD: 28,
  KEY: 16,
  PILL: 999
};

/** 布局常量（以 672x1280 为基准，运行时整体缩放） */
const LAYOUT = {
  HUD_H: 92,
  STATBAR_H: 74,
  BANNER_H: 118,
  STAGE_TOP: 300,       // 角色台顶部
  STAGE_H: 268,         // 角色台高度
  CARD_TOP: 606,        // 题目白卡顶部
  CARD_H: 486,          // 题目白卡高度
  KEYPAD_TOP: 1118,     // 键盘顶部
  KEYPAD_H: 150,
  KEY_GAP: 10,
  PAD_X: 18
};

/**
 * 键盘布局（严格复刻参考视频）
 *参考图是 7 8 9 / 4 5 6 / 1 2 3 / ⌫ 0(宽键)
 */
const KEYPAD = {
  COLS: 3,
  ROWS: 4,
  KEYS: [
    [{ label: '7' }, { label: '8' }, { label: '9' }],
    [{ label: '4' }, { label: '5' }, { label: '6' }],
    [{ label: '1' }, { label: '2' }, { label: '3' }],
    [{ label: 'del', type: 'del' }, { label: '0', span: 2, type: 'zero' }]
  ]
};

/**
 * 角色配置
 * ------------------------------------------------------------------
 * ★★★角色素材替换位置★★★  换角色只需改这里的image 字段。
 * 图片需为透明底 PNG，建议 ≤640px 高、单文件 <120KB。
 */
const CHARACTERS = {
  bunny: {
    id: 'bunny',
    name: '兔耳小人',
    desc: '默认主角，乘风破浪',
    image: 'assets/characters/bunny_star.png',
    // 状态 -> 素材路径。缺省用image
    states: {
      idle:   'assets/characters/bunny_sleep.png',  // 待机：闭眼打盹
      answer: 'assets/characters/bunny_sleep.png',  // 答题：专注（借用待机）
      correct:'assets/characters/bunny_star.png',   // 答对：举星星
      combo:  'assets/characters/bunny_jump.png',   // 连击升级：跳跃
      wrong:  'assets/characters/bunny_sleep.png'   // 答错：垂头（借用待机）
    },
    ratio: 0.70,          // 角色台高度占比
    anchorX: 0.30         // 相对舞台中心偏移
  },
  rabbit: {
    id: 'rabbit',
    name: '白色小兔',
    desc: '温柔耐心，适合低年级',
    image: 'assets/characters/rabbit.png',
    states: {
      idle:'assets/characters/rabbit.png',
      answer:   'assets/characters/rabbit.png',
      correct:  'assets/characters/rabbit.png',
      combo:    'assets/characters/rabbit.png',
      wrong:    'assets/characters/rabbit.png'
    },
    ratio: 0.66,
    anchorX: 0
  },
  cat: {
    id: 'cat',
    name: '白色小猫',
    desc: '机灵鬼怪，反应快',
    image: 'assets/characters/cat.png',
    states: {
      idle:      'assets/characters/cat.png',
      answer:    'assets/characters/cat.png',
      correct:   'assets/characters/cat.png',
      combo:     'assets/characters/cat.png',
      wrong:     'assets/characters/cat.png'
    },
    ratio: 0.60,
    anchorX: 0
  },
  bear: {
    id: 'bear',
    name: '蓝色小熊',
    desc: '力量型选手，抗挫强',
    image: 'assets/characters/bear.png',
    states: {
      idle:   'assets/characters/bear.png',
      answer: 'assets/characters/bear.png',
      correct:'assets/characters/bear.png',
      combo:  'assets/characters/bear.png',
      wrong:  'assets/characters/bear.png'
    },
    ratio: 0.64,
    anchorX: 0
  },
  chick: {
    id: 'chick',
    name: '黄色小鸡',
    desc: '元气满满，爱欢呼',
    image: 'assets/characters/chick.png',
    states: {
      idle:   'assets/characters/chick.png',
      answer: 'assets/characters/chick.png',
      correct:'assets/characters/chick.png',
      combo:  'assets/characters/chick.png',
      wrong:  'assets/characters/chick.png'
    },
    ratio: 0.58,
    anchorX: 0
  }
};

/** 角色可选列表（主页展示顺序） */
const CHARACTER_LIST = ['bunny', 'rabbit', 'cat', 'bear', 'chick'];

/**
 * ★★★ 角色解锁策略（唯一事实源）★★★
 * ------------------------------------------------------------------
 * 【决策】全部角色恒定可用，不设任何解锁条件。
 *
 * 【为什么不是「刷题解锁」—— R1 红线】
 * 曾考虑过三种门禁：累计通关 N 次 / 年级递进 / 星章收集。
 * 三者本质相同，都会让孩子**为拿奖励去刷已经会的关卡**，
 * 这正是 R1（不做付费墙）要消除的行为。
 * 一个孩子练到 DL10 却被告知「再通关 3 次才有小熊」，
 * 会把奖励预期从「我要更聪明」扭成「我要刷次数」。
 *
 * 收集感改由**纪念章**承载（纯荣誉、不发资源、不门禁内容），
 * 角色则始终可用 —— 角色是孩子的表达方式，不该成为奖品。
 *
 * 修改本策略只需改这里。
 */
const CHARACTER_UNLOCK = {
  bunny:  { always: true },
  rabbit: { always: true },
  cat:    { always: true },
  bear:   { always: true },
  chick:  { always: true }
};

/** 字体栈（分级回退，UI_SPEC §0.2；不依赖 SF Pro Rounded） */
const FONT_STACK = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", "Helvetica Neue", Arial, sans-serif';

/**
 * ★★★难度档位定义（1—6 年级）★★★
 * 调整难度曲线改这张表即可。
 * range: 数值范围上限；ops: 该年级解锁的运算类型；baseDL: 基准难度等级；perQ: 单题限时
 */
const GRADE_TABLE = [
  {
    grade: 1, label: '一年级', range: 20, baseDL: 1, perQ: 12,
    ops: ['add', 'sub'],
    desc: '20 以内加减法'
  },
  {
    grade: 2, label: '二年级', range: 100, baseDL: 2, perQ: 11,
    ops: ['add', 'sub', 'mul_small'],
    desc: '两位数加减、表内乘法'
  },
  {
    grade: 3, label: '三年级', range: 1000, baseDL: 3.5, perQ: 10,
    ops: ['add', 'sub', 'mul', 'div'],
    desc: '多位数加减、乘除法'
  },
  {
    grade: 4, label: '四年级', range: 10000, baseDL: 5, perQ: 9,
    ops: ['add', 'sub', 'mul', 'div', 'decimal_addsub'],
    desc: '三位数乘除、小数加减'
  },
  {
    grade: 5, label: '五年级', range: 100000, baseDL: 6.5, perQ: 10,
    ops: ['mul', 'div', 'decimal_addsub', 'decimal_mul'],
    desc: '小数乘除、多位数乘除'
  },
  {
    grade: 6, label: '六年级', range: 1000000, baseDL: 8, perQ: 10,
    ops: ['mul', 'div', 'decimal_mul', 'mixed', 'fraction'],
    desc: '分数、混合运算、括号'
  }
];

/** 运算类型中文标签（题目卡顶部胶囊显示） */
const OP_LABEL = {
  add: '加法',
  sub: '减法',
  mul: '乘法',
  mul_small: '表内乘法',
  div: '除法',
  decimal_addsub: '小数加减',
  decimal_mul: '小数乘法',
  mixed: '混合运算',
  fraction: '分数运算'
};

/** 运算符号 */
const OP_SYMBOL = {
  add: '+',
  sub: '-',
  mul: '×',
  div: '÷'
};

/** 单局配置 */
const GAME = {
  LEVEL_TIME: 120,       // 每关倒计时（秒）——给孩子足够的思考余量
  QUESTIONS_PER_LEVEL: 10, // 每关题量（对应参考视频「正解 N/10」）
  COMBO_STEP: 5,         // 每多少连击升1 级难度
  LEVEL_DL_MAX: 10,      // 难度等级上限
  TIME_BONUS_BASE: 1.5,  // 答对基础加时（秒）
  TIME_BONUS_PER_DL: 0.2,// 每级难度额外加时（秒）
  WRONG_DL_DROP: 1,      // 连续答错降级数
  WRONG_TOLERANCE: 2,    // 连续答错几次触发降级（保底不劝退）
  TIME_CAP_BONUS: 15,    // 倒计时可超出基础时长的上限（防止全对时无限膨胀）
  BASE_SCORE: 100,       // 单题基础分
  PERFECT_BONUS: 50      // 快速答对额外分
};

/** 连击倍率档位（复刻参考视频 ×1.25 徽章） */
const COMBO_MULTIPLIER = [
  { combo: 0,  mult: 1.0 },
  { combo: 5,  mult: 1.25 },
  { combo: 10, mult: 1.5 },
  { combo: 15, mult: 1.8 },
  { combo: 20, mult: 2.0 },
  { combo: 30, mult: 2.5 },
  { combo: 50, mult: 3.0 }
];

/** 音效开关默认状态 */
const DEFAULT_SETTINGS = {
  sound: true,
  vibration: true,
  grade: 1,
  character: 'bunny',
  dlOffset: 0            // 难度微调 -3~+3
};

/** 激励文案（小学生友好、正向） */
const PRAISE = [
  '算得真快！',
  '太棒啦！',
  '好厉害！',
  '你真聪明！',
  '眼睛好尖！',
  '继续加油！',
  '快得飞起来啦！'
];

const ENCOURAGE = [
  '再试一次！',
  '快成功啦！',
  '别着急，慢慢来',
  '下一个一定对！'
];
try { exports.DESIGN = DESIGN; } catch (e) {}
try { exports.COLOR = COLOR; } catch (e) {}
try { exports.FONT = FONT; } catch (e) {}
try { exports.getGradeTheme = getGradeTheme; } catch (e) {}
try { exports.RADIUS = RADIUS; } catch (e) {}
try { exports.LAYOUT = LAYOUT; } catch (e) {}
try { exports.KEYPAD = KEYPAD; } catch (e) {}
try { exports.CHARACTERS = CHARACTERS; } catch (e) {}
try { exports.CHARACTER_LIST = CHARACTER_LIST; } catch (e) {}
try { exports.CHARACTER_UNLOCK = CHARACTER_UNLOCK; } catch (e) {}
try { exports.FONT_STACK = FONT_STACK; } catch (e) {}
try { exports.GRADE_TABLE = GRADE_TABLE; } catch (e) {}
try { exports.OP_LABEL = OP_LABEL; } catch (e) {}
try { exports.OP_SYMBOL = OP_SYMBOL; } catch (e) {}
try { exports.GAME = GAME; } catch (e) {}
try { exports.COMBO_MULTIPLIER = COMBO_MULTIPLIER; } catch (e) {}
try { exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS; } catch (e) {}
try { exports.PRAISE = PRAISE; } catch (e) {}
try { exports.ENCOURAGE = ENCOURAGE; } catch (e) {}
