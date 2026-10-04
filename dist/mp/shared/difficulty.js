/**
 * 题目生成器 + 难度引擎
 * ------------------------------------------------------------------
 * 纯逻辑，无平台依赖，可单元测试、可跨端复用。
 * 核心职责：按「年级 + 当前难度等级 DL」生成一道小学生可心算的算术题。
 *
 * 关键约束（务必保持）：
 *  1. 减法结果不得为负
 *  2. 除法必须整除（小学阶段不出余数题）
 *  3. 小数题的小数位数 ≤ 2，且尽量避开需要跨位借位的小数减法
 *  4. 答案位数合理，避免超长数字打乱版面
 */

const { GRADE_TABLE, OP_LABEL, GAME } = require('./config.js');
const { toFixedInt, fromFixedInt, addFixed, subFixed, mulFixed, divFixed, fractionEquals, normalizeInput } = require('./fixed.js');

/**
 * 伪随机数发生器（xorshift32）
 * ------------------------------------------------------------------
 * 【为什么不能用固定 seed】
 * 固定 seed 会让**全服所有用户看到完全相同的题目序列**——
 * 实测踩过：seed 硬编码且 setSeed 从未被调用，第 137 题都能被背出来。
 * 这比刷分更致命：它直接摧毁「多做新题」这个前提，
 * 也让「同一局做对同一题」的判定失去意义。
 *
 * 【现状与残余风险】
 * 现在是「每进程随机」：同一局内可复现（云函数可按 seed 重放校验），
 * 但**换设备 / 重开小程序会得到不同序列**。
 * 跨设备的 itemTrace 闭环仍需服务端下发 seed，已记入 DECISIONS D13。
 */
let seed = (Date.now() ^ 0x9e3779b9) >>> 0;
if (seed === 0) seed = 0x6d2b79f5;   // xorshift 不能为 0

function rnd() {
  // xorshift32：周期 2^32-1，实现简单、无外部依赖
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5;  seed >>>= 0;
  return seed / 0x100000000;
}

function randInt(min, max) {
  return Math.floor(rnd() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

/** 显式设定种子（仅测试用；生产代码不应调用） */
function setSeed(s) {
  seed = s >>> 0;
  if (seed === 0) seed = 0x6d2b79f5;
}

/** 读取当前种子（供云端校验：客户端上报，服务端按同 seed 重放） */
function getSeed() {
  return seed;
}

function getGradeCfg(grade) {
  return GRADE_TABLE.find(g => g.grade === grade) || GRADE_TABLE[0];
}

/**
 * 数值范围硬上限：即使 DL 拉满，也不能突破该年级认知范围。
 * 这是「保底不劝退」的关键——DL 只在年级允许的范围内加码，
 * 避免出现「一年级做四位数减法」这种超纲挫败。
 */
function capForGrade(cfg) {
  // 各年级绝对上限（略高于名义 range，留出余量但不越级）
  const CAPS = { 1: 20, 2: 100, 3: 1000, 4: 10000, 5: 100000, 6: 1000000 };
  return CAPS[cfg.grade] || cfg.range;
}

/**
 * DL（难度等级 1—10）如何影响数值范围。
 * 双重约束：
 *   上限 = min(年级硬上限, 名义range × 缩放)
 *   下限 = 随年级递增（低年级 DL 再低也有基础数值，太简单反而无聊）
 */
function rangeForDL(cfg, dl) {
  const t = (dl - cfg.baseDL) / Math.max(1, GAME.LEVEL_DL_MAX - cfg.baseDL);
  const scale = 1 + Math.max(0, t) * 1.5;
  // 硬约束：绝不越过年级认知上限
  const cap = capForGrade(cfg);
  const value = cfg.range * scale;
  return Math.max(10, Math.min(cap, Math.round(value)));
}

/**
 * 根据 DL 决定可用运算类型
 * 低 DL 偏向简单加减，高 DL 逐步解锁乘除与混合运算。
 */
function opsForDL(cfg, dl) {
  const unlocked = cfg.ops.slice();
  // 加减始终保留
  const result = unlocked.filter(op => {
    if (op === 'add' || op === 'sub') return true;
    // 其余运算按 DL 门槛解锁：mul 需 DL≥2.5，div 需 DL≥4，混合/分数需 DL≥7
    const gate = { mul_small: 1.5, mul: 2.5, div: 4, decimal_addsub: 3.5, decimal_mul: 6, mixed: 7, fraction: 8 }[op];
    return gate === undefined ? true : dl >= gate;
  });
  return result.length ? result : ['add', 'sub'];
}

/** 保留 n 位小数并去掉多余的 0 */
function trimNum(n) {
  const r = Math.round(n * 100) / 100;
  return r;
}

/** 数字转为显示串：整数不带小数点，小数最多两位且去掉末尾 0 */
function numToStr(n) {
  const v = trimNum(n);
  if (Number.isInteger(v)) return String(v);
  return String(v).replace(/0+$/, '').replace(/\.$/, '');
}

/** 判断两个小数的小数位数差，用于控制心算难度 */
function decPlaces(n) {
  const v = trimNum(n);
  const s = String(v);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/**
 * 生成一道题
 * @param {number} grade 年级 1—6
 * @param {number} dl    难度等级 1—10
 * @returns {{a:number,b:number,op:string,answer:number,label:string,expr:string,isDecimal:boolean}}
 */
function generateQuestion(grade, dl) {
  const cfg = getGradeCfg(grade);
  const ops = opsForDL(cfg, dl);
  const max = rangeForDL(cfg, dl);

  // 按权重挑选运算类型：简单运算出现频率更高
  const weights = ops.map(op => {
    if (op === 'add' || op === 'sub') return 5;
    if (op === 'mul_small') return 3;
    if (op === 'mul' || op === 'div') return 2.5;
    return 1.5;
  });
  const totalW = weights.reduce((s, w) => s + w, 0);
  let r = rnd() * totalW;
  let op = ops[ops.length - 1];
  for (let i = 0; i < ops.length; i++) {
    r -= weights[i];
    if (r <= 0) { op = ops[i]; break; }
  }

  switch (op) {
    case 'add':         return makeAddSub(max, false, op);
    case 'sub':         return makeAddSub(max, true, op);
    case 'mul_small':   return makeMulSmall();
    case 'mul':         return makeMul(max, op);
    case 'div':         return makeDiv(max, op);
    case 'decimal_addsub': return makeDecimalAddSub(max, op);
    case 'decimal_mul': return makeDecimalMul(max, op);
    case 'mixed':       return makeMixed(max, op);
    case 'fraction':    return makeFraction(max, op);
    default:            return makeAddSub(max, false, 'add');
  }
}

/** 整数加减法：保证结果非负，且被减数不超过年级上限 */
function makeAddSub(max, isSub, op) {
  // 按 max自适应位数：小数值域下不要出现「5712」这种长数字
  let lo, hi;
  if (max <= 20) { lo = 3; hi = 20; }
  else if (max <= 100) { lo = 8; hi = 100; }
  else if (max <= 1000) { lo = 20; hi = 1000; }
  else if (max <= 10000) { lo = 100; hi = 10000; }
  else { lo = 500; hi = 100000; }

  let a = randInt(Math.max(3, Math.floor(lo * 0.6)), hi);
  // 加法时控制结果不过大：被加数不超过 hi，加数不超过 a 的 60%
  let bMax = Math.max(2, Math.floor(Math.min(hi, a * 0.6)));
  let b = randInt(1, bMax);
  if (isSub && b > a) { const t = a; a = b; b = t; }
  const answer = isSub ? a - b : a + b;
  return {
    a, b, op, answer,
    label: OP_LABEL[op] || '加减法',
    expr: `${a} ${op === 'add' ? '+' : '-'} ${b}`,
    isDecimal: false
  };
}

/** 表内乘法（九九表范围 2—9） */
function makeMulSmall() {
  const a = randInt(2, 9);
  const b = randInt(2, 9);
  return {
    a, b, op: 'mul', answer: a * b,
    label: OP_LABEL.mul_small,
    expr: `${a} × ${b}`,
    isDecimal: false
  };
}

/** 乘法：控制结果不过大，DL 高时才允许大数相乘 */
function makeMul(max, op) {
  let bMax, aMax;
  if (max <= 20) { aMax = 9; bMax = 9; }
  else if (max <= 100) { aMax = 12; bMax = 9; }
  else if (max <= 1000) { aMax = 40; bMax = 12; }
  else if (max <= 10000) { aMax = 120; bMax = 24; }
  else { aMax = 400; bMax = 40; }

  const a = randInt(2, aMax);
  const b = randInt(2, bMax);
  return {
    a, b, op, answer: a * b,
    label: OP_LABEL.mul,
    expr: `${a} × ${b}`,
    isDecimal: false
  };
}

/**
 * 除法：保证整除。
 * 做法：先造商与除数，倒推被除数 = 除数 × 商，保证无余数。
 */
function makeDiv(max, op) {
  let bMax, qMax;
  if (max <= 20) { bMax = 5; qMax = 5; }
  else if (max <= 100) { bMax = 9; qMax = 12; }
  else if (max <= 1000) { bMax = 12; qMax = 60; }
  else if (max <= 10000) { bMax = 25; qMax = 90; }
  else { bMax = 60; qMax = 120; }

  const b = randInt(2, bMax);
  const q = randInt(2, qMax);
  const a = b * q;
  return {
    a, b, op, answer: q,
    label: OP_LABEL.div,
    expr: `${a} ÷ ${b}`,
    isDecimal: false
  };
}

/**
 * 小数加减法（定点运算，全程整数，杜绝浮点误差）
 * 策略：整数部分按年级上限控制；小数位取 1—2；减法自动排序保证非负。
 */
function makeDecimalAddSub(max, op) {
  const intCap = max <= 1000 ? 100 : 1000;
  const isSub = rnd() < 0.55;

  const ai = randInt(3, intCap);
  const bi = randInt(1, Math.max(2, Math.floor(ai * 0.7)));

  // 直接构造「分」值，避免任何浮点中间态
  let aFixed = ai * 100 + randInt(0, 99);
  let bFixed = bi * 100 + randInt(0, 99);

  if (isSub && bFixed > aFixed) { const t = aFixed; aFixed = bFixed; bFixed = t; }

  const answerFixed = isSub ? subFixed(aFixed, bFixed) : addFixed(aFixed, bFixed);
  const a = fromFixedInt(aFixed);
  const b = fromFixedInt(bFixed);

  return {
    a, b, op: isSub ? 'sub' : 'add',
    answerFixed,
    answer: answerFixed / 100,
    label: OP_LABEL.decimal_addsub,
    expr: `${a} ${isSub ? '-' : '+'} ${b}`,
    isDecimal: true
  };
}

/** 小数乘法（定点运算）：两位小数相乘，结果精确到分 */
function makeDecimalMul(max, op) {
  const intCap = max <= 1000 ? 20 : 90;
  const ai = randInt(2, intCap);
  const bi = randInt(2, 9);
  // 构造分值：ai*100+尾数
  const aFixed = ai * 100 + randInt(1, 9);
  const bFixed = bi * 100 + randInt(1, 9);
  const answerFixed = mulFixed(aFixed, bFixed);
  const a = fromFixedInt(aFixed);
  const b = fromFixedInt(bFixed);

  return {
    a, b, op,
    answerFixed,
    answer: answerFixed / 100,
    label: OP_LABEL.decimal_mul,
    expr: `${a} × ${b}`,
    isDecimal: true
  };
}

/**
 * 混合运算（带括号）：a × b + c 等，控制结果大小。
 * 小学高年级常见题型，采用两步心算。
 */
function makeMixed(max, op) {
  const a = randInt(2, 9);
  const b = randInt(2, 9);
  const c = randInt(1, 20);
  const isAddTail = rnd() < 0.6;
  const base = a * b;
  const answer = isAddTail ? base + c : Math.max(0, base - c);
  return {
    a: a, b: b, op,
    c,
    answer,
    label: OP_LABEL.mixed,
    expr: `(${a} × ${b}) ${isAddTail ? '+' : '-'} ${c}`,
    isDecimal: false
  };
}

/**
 * 分数运算：同分母加减，保证结果为真分数且分母不变或可整除。
 * 例：3/8 + 2/8 = 5/8
 */
function makeFraction(max, op) {
  const den = pick([4, 5, 6, 8, 10]);
  let n1 = randInt(1, den - 2);
  let n2 = randInt(1, den - 2);
  const isSub = rnd() < 0.5;
  if (isSub && n2 > n1) { const t = n1; n1 = n2; n2 = t; }
  const n = isSub ? n1 - n2 : n1 + n2;
  // 若分子超过分母则退化为 1，退回加法避免超纲
  if (n >= den) {
    return makeAddSub(max, false, 'add');
  }
  return {
    a: n1, b: n2, op: 'fraction', den,
    answer: n,
    label: OP_LABEL.fraction,
    expr: `${n1}/${den} ${isSub ? '-' : '+'} ${n2}/${den}`,
    answerText: `${n}/${den}`,   // 分数答案需按文本判定
    isDecimal: false,
    isFraction: true
  };
}

/**
 * 校验输入是否正确（定点精确比较，零容差）
 * ------------------------------------------------------------------
 * 【为什么不��用 epsilon 容差】
 * 浮点误差最大可达 6.1e-5（如 76.3 × 6.8 = 518.8399999999999），
 * 而1e-6 的容差会把「孩子输对了」判成错——这是不能接受的体验事故。
 * 定点方案让两端（含云函数重算）得到位级一致的结果。
 *
 * @param {object} q 题目（须含 answerFixed，或退化用 answer）
 * @param {string} userInput 用户输入串
 */
function checkAnswer(q, userInput) {
  if (userInput === null || userInput === undefined || userInput === '') return false;

  // 分数题：支持 3/8 或只答分子 3
  if (q.isFraction) {
    const numFixed = q.answerFixed !== undefined ? q.answerFixed : toFixedInt(q.answer);
    const denFixed = q.den !== undefined ? toFixedInt(q.den) : 1;
    return fractionEquals(userInput, numFixed, denFixed);
  }

  // 优先用定点答案；整数题回落到整数精确比较
  if (q.answerFixed !== undefined) {
    return toFixedInt(userInput) === q.answerFixed;
  }

  // 整数题：直接字符串转整数比较，避免 0.1+0.2 类问题
  const ua = normalizeInput(String(userInput));
  const as = String(q.answer);
  if (ua === as) return true;
  // 允许 7与 7.00 等价
  return toFixedInt(ua) === toFixedInt(as);
}

/** 输入串是否已经不可能再正确（位数远超答案长度）——用于提前判定 */
function isOverflow(q, inputLen) {
  const ansStr = q.answerText || numToStr(q.answer);
  const digits = ansStr.replace('.', '').replace('-', '').length;
  return inputLen > digits + 1;
}

/** 供测试：获取难度表摘要 */
function summarizeGrade() {
  return GRADE_TABLE.map(g => ({
    grade: g.grade,
    label: g.label,
    desc: g.desc,
    range: g.range,
    baseDL: g.baseDL
  }));
}
/**
 * 本局过程记录（ItemTrace）
 * ------------------------------------------------------------------
 * 【为什么必须有】
 * BACKEND_SPEC §3.5 的防作弊 L1 层依赖「客户端上报**过程**，服务端用同一份
 * scoring.js **重算分数**」。没有过程记录，防作弊等于零——云端只能看到一个
 * 客户端自报的 score，改分数就完了。
 *
 * 【记录什么】
 * 每题一条，含足以让服务端独立复算的最小信息：
 *   grade / dl / op / expr / answerFixed / firstTryCorrect / elapsedMs
 *
 * 【为什么 answer 存 answerFixed 而非浮点】
 * 服务端按 seed 重放出同一批题后，用定点值做**位级精确**比较。
 * 若存浮点，跨引擎可能有 1e-13 级差异，重算会误判为「答案不符」。
 * 见 DECISIONS D1。
 */

/**
 * 创建一局的过程记录器
 * @param {object} opts {grade, seed}
 */
function createTraceRecorder(grade, seed) {
  return {
    grade,
    seed: seed >>> 0,
    /** @type {Array<object>} */
    items: [],
    startedAt: 0,

    /** 记录一题 */
    record(item) {
      this.items.push({
        grade: this.grade,
        dl: item.dl,
        op: item.op,
        expr: item.expr,
        // 定点答案，服务端位级比较
        answerFixed: item.answerFixed,
        // 首次作答是否正确（区分「蒙对」与「真会」）
        firstTryCorrect: !!item.firstTryCorrect,
        /**
         * 孩子实际输入的答案串（L1b 独立判定的依据）。
         * v1 就采集：这是「防改布尔值」的唯一手段，
         * 漏采就等于 L1b 永远无法生效（见 DECISIONS D16）。
         */
        userInput: item.userInput === undefined || item.userInput === null
          ? null
          : String(item.userInput),
        // 本题用时（毫秒），用于速度校验
        elapsedMs: Math.round(item.elapsedMs || 0),
        // 是否为本局首次出现该题（重复题只算第一次）
        isFirstOccurrence: item.isFirstOccurrence !== false
      });
    },

    /** 汇总为首正答率（B 端进步曲线用） */
    firstTryAccuracy() {
      const first = this.items.filter(i => i.isFirstOccurrence);
      if (!first.length) return 0;
      return first.filter(i => i.firstTryCorrect).length / first.length;
    },

    /** 导出上报格式 */
    export() {
      return {
        grade: this.grade,
        seed: this.seed,
        items: this.items
      };
    },

    /** 本局题数 */
    get length() { return this.items.length; }
  };
}

/**
 * 服务端侧：按 trace 重算分数（云函数直接复用本函数，保证与客户端一致）
 * ⚠️ 这是「同一份代码两端跑」的价值所在——不重写就不会漂移。
 *
 * @param {object} trace createTraceRecorder().export() 的结果
 * @returns {{score:number, correct:number, wrong:number, maxCombo:number, maxDL:number, firstTryAccuracy:number}}
 */
function recomputeFromTrace(trace) {
  if (!trace || !Array.isArray(trace.items)) {
    return { score: 0, correct: 0, wrong: 0, maxCombo: 0, maxDL: 1, firstTryAccuracy: 0 };
  }
  let score = 0, combo = 0, maxCombo = 0;
  let correct = 0, wrong = 0, maxDL = 1;

  /**
   * ★ 独立判定：不信 firstTryCorrect，自己从算式算答案。
   * 三种可能的结果：
   *   1) 有 userInput → 拿它与独立算出的答案比（最强，防「改布尔值」）
   *   2) 无 userInput → 至少校验 answerFixed 与独立计算是否一致（防篡改答案）
   *   3) 两者都拿不到 → 只能信 firstTryCorrect（v1 最弱情形，如实降级）
   */
  let tampered = false;        // answerFixed 与独立计算不符
  let claimedMismatch = false;  // 上报的 firstTryCorrect 与独立判定不符
  let unverifiable = 0;

  for (const it of trace.items) {
    if (it.dl > maxDL) maxDL = it.dl;

    // L1c：由 expr 独立算答案，与上报的 answerFixed 位级比对
    const expected = computeAnswerFromExpr(it.op, it.expr);
    let reallyCorrect = it.firstTryCorrect;

    if (expected === null) {
      /**
       * expr 无法解析 → 无法独立判定。
       * ★ 必须「不产生分数」而非「默认通过」——
       *   否则「构造无法解析的算式」就成了最优攻击路径：
       *   填 10 道 (3×4)+5 就能让 10 题全算对、拿满连击分（实测可拿 1765 分）。
       *   题出题器不会产生这种算式，所以它出现即为伪造信号。
       */
      unverifiable++;
      wrong++;
      combo = 0;
      continue;          // 跳过计分
    } else {
      if (it.answerFixed !== undefined && it.answerFixed !== null && it.answerFixed !== expected) {
        tampered = true;          // 上报的答案与独立计算不符 → 篡改
      }
      if (it.userInput !== undefined && it.userInput !== null && it.userInput !== '') {
        // L1b：拿孩子实际填的与独立答案比。
        // 以独立判定为准——上报的 firstTryCorrect 不再具有决定权。
        reallyCorrect = toFixedInt(normalizeInput(String(it.userInput))) === expected;
        if (reallyCorrect !== it.firstTryCorrect) {
          // 上报与实测不符：不是判错，而是标记为可疑（可能是改了布尔值）
          claimedMismatch = true;
        }
      }
    }

    if (reallyCorrect) {
      correct++;
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      const mult = comboMultiplierOf(combo);
      const speedBonus = it.elapsedMs > 0 && it.elapsedMs <= 10000 ? 50 : 0;
      score += Math.round((100 + speedBonus) * mult);
    } else {
      wrong++;
      combo = 0;
    }
  }

  return {
    score,
    correct,
    wrong,
    maxCombo,
    maxDL,
    /** ★ true = 检测到篡改（answerFixed 与独立计算不符），应拒绝 */
    tampered,
    /** ★ true = 上报的对错与独立判定不符 → 疑似改布尔值刷分 */
    claimedMismatch,
    /** 无法独立验证的题数（expr 解析失败且无 userInput） */
    unverifiable,
    firstTryAccuracy: trace.items.length
      ? trace.items.filter(i => i.isFirstOccurrence && i.firstTryCorrect).length /
        trace.items.filter(i => i.isFirstOccurrence).length
      : 0
  };
}

/** 连击倍率（与 scoring.js 的 COMBO_MULTIPLIER 保持一致，避免循环依赖） */
function comboMultiplierOf(combo) {
  const tiers = [[0, 1.0], [5, 1.25], [10, 1.5], [15, 1.8], [20, 2.0], [30, 2.5], [50, 3.0]];
  let m = 1.0;
  for (const [c, v] of tiers) if (combo >= c) m = v;
  return m;
}

/**
 * 独立判定：由算式反推正确答案（服务端防篡改的核心）
 * ------------------------------------------------------------------
 * 【为什么必须有这个函数】
 * `recomputeFromTrace` 只信 `firstTryCorrect` 这一个布尔值，
 * 这意味着：**改本地存档把每题改成 true，耗时填 3000—6000ms，
 * 就能拿到真实的高分**——§3.5.2 的 7 条规则一条都拦不住：
 *   - too_fast (<200ms)：填 3000ms 避开
 *   - uniform_interval：耗时随机化即可
 *   - score_gap：重算结果与伪造的 clientScore 本来就一致
 *
 * 【为什么能堵住】
 * 算式 `expr` 本身包含了完整信息，服务端可**独立算出**真答案，
 * 再与上报的 `answerFixed` 位级比对。
 * 这样 `answerFixed` 从「唯一依据」降级为「冗余校验」——
 * 篡改它反而会被独立计算的结果抓住。
 *
 * ⚠️ 安全边界（诚实记录）：如果 `op` 与 `expr` 同时被篡改，
 *    独立计算也会跟着错。此时需要 `sid` 服务端下发种子做重放比对，
 *    但那属于 v2 强化（见 DECISIONS D13残余风险）。
 *    v1 接受此边界：目标用户是小学生，不会为此逆向。
 *
 * @param {string} op 运算类型
 * @param {string} expr 算式字符串，如 '19.1 - 4.6'
 * @returns {number|null} 答案的定点值；无法解析时返回 null
 */
function computeAnswerFromExpr(op, expr, _depth) {
  if (!expr || typeof expr !== 'string') return null;

  /**
   * 递归深度上限（增之翼指出的栈溢出风险）。
   * 混合运算用递归求值括号内，若不设限，
   * 攻击者构造 10 万层嵌套即可耗尽云函数栈。
   * 出题器最多产生 1 层括号，所以3 层已远超需求。
   */
  const depth = _depth || 0;
  if (depth > 3) return null;

  // 表达式长度上限：正常算式不超过 32 字符（含小数）
  if (expr.length > 64) return null;

  // 分数题：a/d ± b/d，答案取分子（与出题器 makeFraction 口径一致）
  const frac = expr.match(/^(\d+)\/(\d+)\s*([+-])\s*(\d+)\/(\d+)$/);
  if (frac) {
    const [, n1, , sign, n2] = frac;
    const a = parseInt(n1, 10), b = parseInt(n2, 10);
    return sign === '-' ? a - b : a + b;
  }

  // 混合运算：(a ∘ b) ∘ c —— 递归求值括号内，再算外层
  const paren = expr.match(/^\((.+?)\)\s*([+\-])\s*(-?[\d.]+)$/);
  if (paren) {
    const inner = computeAnswerFromExpr(null, paren[1], depth + 1);
    const c = toFixedInt(paren[3]);
    if (inner === null || !Number.isFinite(c)) return null;
    return paren[2] === '-' ? subFixed(inner, c) : addFixed(inner, c);
  }

  // 普通算式：a ∘ b
  const m = expr.match(/^(-?[\d.]+)\s*([+\-×÷*/])\s*(-?[\d.]+)$/);
  if (!m) return null;

  const aStr = m[1], sym = m[2], bStr = m[3];
  const a = toFixedInt(aStr), b = toFixedInt(bStr);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  // op 与算式符号互为冗余——不一致本身就是篡改信号
  if (op) {
    const SYM2OP = { '+': 'add', '-': 'sub', '×': 'mul', '*': 'mul', '÷': 'div', '/': 'div' };
    const derived = SYM2OP[sym];
    if (derived && derived !== op && !(op === 'decimal_addsub' && (derived === 'add' || derived === 'sub'))
        && !(op === 'decimal_mul' && derived === 'mul')) {
      return null;   // op 与符号矛盾 → 视为篡改
    }
  }

  switch (sym) {
    case '+': return addFixed(a, b);
    case '-': return subFixed(a, b);
    case '×': case '*': return mulFixed(a, b);
    case '÷': case '/': return b === 0 ? null : divFixed(a, b);
    default: return null;
  }
}

try { exports.randInt = randInt; } catch (e) {}
try { exports.pick = pick; } catch (e) {}
try { exports.setSeed = setSeed; } catch (e) {}
try { exports.getSeed = getSeed; } catch (e) {}
try { exports.getGradeCfg = getGradeCfg; } catch (e) {}
try { exports.numToStr = numToStr; } catch (e) {}
try { exports.generateQuestion = generateQuestion; } catch (e) {}
try { exports.checkAnswer = checkAnswer; } catch (e) {}
try { exports.isOverflow = isOverflow; } catch (e) {}
try { exports.summarizeGrade = summarizeGrade; } catch (e) {}
try { exports.createTraceRecorder = createTraceRecorder; } catch (e) {}
try { exports.recomputeFromTrace = recomputeFromTrace; } catch (e) {}
try { exports.computeAnswerFromExpr = computeAnswerFromExpr; } catch (e) {}
