/**
 * 验证器一致性：出题器产出的每一种算式形态，验证器必须 100% 能独立解析
 * ---------------------------------------------------------------------------
 * 【为什么需要这条断言】
 *
 * 云端防刷的 L1 层依赖 `computeAnswerFromExpr(expr)` 独立算出真答案，
 * 再与上报的 answerFixed 位级比对。若出题器新增了一种表达式形态、
 * 而验证器没跟上（返回 null），则该形态的题目**完全无法被验证**：
 *   - 无法判定答案对错（退化为信任 firstTryCorrect）
 *   - 无法检测答案篡改
 * 这类漏洞靠人review 发现不了，且「构造无法解析的算式」会直接成为
 * 最优攻击路径 —— 所以必须用自动化断言把它变成 CI 必然失败。
 *
 * 本断言的价值是【报警】而非【拦截】：v1 预期恒为 0 失败。
 * 一旦失败，说明出题器与验证器不一致，需同步更新验证器。
 *
 *【历史】曾有一次误报：有人报告 mixed 形态 `"(3 × 4) + 5"` 无法解析，
 * 实际验证器第 611 行早已有括号递归分支。该误报促成了本断言。
 *
 * 运行：node test/verifier-consistency.test.mjs
 */
import {
  generateQuestion,
  computeAnswerFromExpr,
  recomputeFromTrace,
} from '../shared/difficulty.js';

let pass = 0, fail = 0;
const ck = (n, ok, extra = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '✅' : '❌'} ${n}${extra ? ' — ' + extra : ''}`);
};

const GRADES = [1, 2, 3, 4, 5, 6];
const DLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** 每档采样次数：覆盖出题器的随机性（分数/混合运算出现率较低） */
const SAMPLES = 40;

console.log('=== 1. 全组合可解析性（核心断言）===');
{
  const unparsed = [];
  const opCount = {};
  let total = 0;

  for (const grade of GRADES) {
    for (const dl of DLS) {
      for (let k = 0; k < SAMPLES; k++) {
        let q;
        try {
          q = generateQuestion(grade, dl);
        } catch (e) {
          unparsed.push({ grade, dl, reason: 'generateQuestion 抛错: ' + e.message });
          continue;
        }
        total++;
        opCount[q.op] = (opCount[q.op] || 0) + 1;

        const parsed = computeAnswerFromExpr(q.op, q.expr);
        if (parsed === null) {
          unparsed.push({ grade, dl, op: q.op, expr: q.expr });
        }
      }
    }
  }

  console.log(`  采样 ${total} 题（6 年级 × 10 DL × ${SAMPLES} 次）`);
  console.log(`  题型分布: ${JSON.stringify(opCount)}`);

  ck(
    '出题器产出的所有算式，验证器 100% 可解析',
    unparsed.length === 0,
    unparsed.length === 0
      ? `覆盖 ${Object.keys(opCount).length} 种题型`
      : `${unparsed.length} 题无法解析`
  );

  if (unparsed.length) {
    console.log('\n  ❌ 无法解析的样本（出题器与验证器不一致，必须修验证器）:');
    for (const u of unparsed.slice(0, 10)) {
      console.log(`     grade=${u.grade} dl=${u.dl} op=${u.op} expr="${u.expr}" ${u.reason || ''}`);
    }
    console.log('\n  修法：在 computeAnswerFromExpr 中补对应形态的解析分支，');
    console.log('        并在本文件里加一条针对该形态的定向用例（见第 3 节）。');
  }

  // 覆盖度提示：某些低概率题型可能没被采到
  const rare = Object.entries(opCount).filter(([, n]) => n < 5);
  if (rare.length) {
    console.log(`\n  ℹ️ 采样偏少的题型: ${rare.map(([o, n]) => `${o}(${n})`).join(', ')}`);
    console.log('     若新增这些题型，请提高 SAMPLES 或在第 3 节补定向用例。');
  }
}

console.log('\n=== 2. 关键表达式形态的定向回归 ===');
{
  // 每一类必须显式覆盖，不能只靠随机采样
  const cases = [
    ['add', '12 + 34', 4600],
    ['sub', '56 - 23', 3300],
    ['mul', '12 × 7', 8400],
    ['div', '56 ÷ 8', 700],
    ['decimal_mul', '0.8 × 0.7', 56],
    ['fraction', '3/8 + 2/8', 5],          // 分数：答案取分子
    ['mixed', '(3 × 4) + 5', 1700],        // ★ 括号递归（曾被误报为不支持）
    ['mixed', '(9 × 9) + 20', 10100],
  ];

  for (const [op, expr, expect] of cases) {
    const got = computeAnswerFromExpr(op, expr);
    ck(
      `${op.padEnd(12)} "${expr}" => ${expect}`,
      got === expect,
      got === expect ? '' : `实际 ${got}`
    );
  }
}

console.log('\n=== 2b. 恶意输入必须被拒（防资源耗尽）===');
{
  // ★ 本节的教训（团队方法论，见 DECISIONS.md D18）
  //
  // 【曾经的错误】我曾断言`depth > 3` 是死代码，依据是"移除它测试仍全绿"。
  //   那个结论是**错的**——错在**测试输入没能触达被测分支**。
  //   我用的输入是 4000 层嵌套，长度远超 64，被 `length > 64` 先拦了，
  //   所以移除 depth 自然测不出差异。
  //
  // 【正确的验证方法】单变量 + 触达性双重确认：
  //   ① 单变量：只移除被测的那一道，保留其他
  //   ② 触达性：构造「长度合规（<=64）但深度超限」的输入，
  //      并对照验证「深度恰好 <=3 时能算出答案」——证明该分支真的可达
  //
  // 触达实测（2026-10-03，team-lead 纠正）：
  //   '((1+2)+3)+4'         深度 2  → 1000   ← 有值，证明递归通路正常
  //   '(((1+2)+3)+4)+5'     深度 3  → 1500   ← 有值，仍 <=3
  //   '((((1+2)+3)+4)+5)+6' 深度 4  → null   ← ★ 被 depth > 3 拦下
  //   长度仅 25 字符（远低于 64），故拦它的只能是 depth，不是 length。
  //
  //   ⇒ `depth > 3` 真实生效，是「长度合规但深度超限」这一类的唯一防线。
  //
  //【机制澄清】非贪婪 `.+?` 会从最外层 '(' 逐层向内剥离，递归确实被调用
  //   （trace 实测：d0→d1→d2→d3→d4）。前两版说法（"递归不被调用"）都是错的。

  const attacks = [
    ['深层嵌套 11 层', '('.repeat(11) + '1 + 2' + ')'.repeat(11) + ' + 3', null],
    ['深层嵌套 50 层', '('.repeat(50) + '1+2' + ')'.repeat(50) + '+3', null],
    ['超长表达式', '1+1'.repeat(100), null],
    ['畸形数字 1.2.3', '1.2.3 + 1', null],
    ['畸形数字 1..2', '1..2 + 1', null],
    ['纯括号', '()', null],
    ['空表达式', '', null],
    ['非字符串', null, null],
    ['单操作数', '5 +', null],
    ['仅运算符', '× 5', null],
    //★ 触达性用例：长度仅25 字符，只能被 depth 拦
    ['深度 4（长度合规）', '((((1+2)+3)+4)+5)+6', null],
  ];

  for (const [name, expr] of attacks) {
    const got = computeAnswerFromExpr('mixed', expr);
    ck(
      `${name.padEnd(18)} 被拒`,
      got === null,
      got === null ? '' : `★ 未被拒，返回 ${got} —— 资源耗尽或数据伪造风险`
    );
  }

  // ★ 对照组：证明 depth 分支真的可达（深度 <=3 时必须有值）
  //   若这三行返回 null，说明递归通路坏了，而不是"被防御拦住"——
  //   这是区分「防御生效」与「功能损坏」的关键判据。
  ck('深度 2 递归通路正常（对照组）', computeAnswerFromExpr('mixed', '((1+2)+3)+4') === 1000);
  ck('深度 3 递归通路正常（对照组）', computeAnswerFromExpr('mixed', '(((1+2)+3)+4)+5') === 1500);

  // 边界：出题器实际产出的形态绝不能被误伤
  ck('出题器 1 层 mixed 不受影响', computeAnswerFromExpr('mixed', '(3 × 4) + 5') === 1700);
  ck('出题器 2 层 mixed 不受影响', computeAnswerFromExpr('mixed', '((3 × 4) + 5) + 1') === 1800);
  ck('出题器实际最长的 mixed 形态可解析',
     computeAnswerFromExpr('mixed', '(9 × 9) + 20') === 10100);
}

console.log('\n=== 3. 端到端：可解析形态不得触发 unverifiable ===');
{
  // 用一个真实可解析的 mixed 轨迹，验证整条 L1 链路不产生 unverifiable
  const items = [];
  for (let i = 0; i < 10; i++) {
    items.push({
      op: 'mixed', expr: '(3 × 4) + 5', answerFixed: 1700,
      firstTryCorrect: true, dl: 7, ms: 400,
    });
  }
  const r = recomputeFromTrace({ items });
  ck('可解析轨迹 unverifiable === 0', r.unverifiable === 0, `实际 ${r.unverifiable}`);
  ck('可解析轨迹 tampered === false', r.tampered === false);

  // 篡改答案必须被抓
  const bad = items.map((x) => ({ ...x, answerFixed: 99999 }));
  const r2 = recomputeFromTrace({ items: bad });
  ck('篡改 answerFixed 被抓（tampered === true）', r2.tampered === true);
}

console.log('\n=== 4. 不可解析形态必须不产生分数（安全侧）===');
{
  // 构造一个验证器无法解析的算式（未来新增形态时用）
  const items = [{
    op: 'mixed', expr: '((3 × 4) + 5) × 2', answerFixed: 1,
    firstTryCorrect: true, dl: 7, ms: 400,
  }];
  const r = recomputeFromTrace({ items });
  ck('无法解析 → unverifiable === 1', r.unverifiable === 1, `实际 ${r.unverifiable}`);
  ck('无法解析 → 不得分（score === 0）', r.score === 0, `实际 ${r.score}`);
  ck('无法解析 → 计为答错', r.wrong === 1);
  ck('无法解析 → 连击清零', r.maxCombo === 0);
  console.log('  ℹ️ 若此断言失败，说明验证器已能解析该形态 → 请补进第 2 节定向用例');
}

console.log(`\n${'='.repeat(46)}`);
console.log(`${fail === 0 ? '✅' : '❌'} ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
