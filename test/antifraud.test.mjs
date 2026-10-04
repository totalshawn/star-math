/** 防作弊能力验证：能否抓住各类伪造 */
import {createTraceRecorder, recomputeFromTrace, computeAnswerFromExpr, getSeed} from '../shared/difficulty.js';
let pass=0,fail=0;
const ck=(n,ok)=>{ok?pass++:fail++;console.log(`  ${ok?'✅':'❌'} ${n}`);};

console.log('=== computeAnswerFromExpr 独立算答案 ===');
const cases=[
  ['add','23 + 45','68'],
  ['sub','59 - 14','45'],
  ['mul','7 × 8','56'],
  ['div','144 ÷ 12','12'],
  ['decimal_addsub','19.1 - 4.6','14.5'],
  ['decimal_mul','76.3 × 6.8','518.84'],
  ['fraction','2/8 + 3/8','5'],
];
for(const [op,expr,want] of cases){
  const got=computeAnswerFromExpr(op,expr);
  // 分数题的答案是「分子」（整数），不是分值——与 makeFraction 口径一致
  const isFrac = op === 'fraction';
  const gv = got === null ? 'null' : (isFrac ? String(got) : (got / 100).toString());
  ck(`${op.padEnd(16)} "${expr}" → ${gv} (期望 ${want})`,
     isFrac ? got === parseFloat(want) : Math.abs(got / 100 - parseFloat(want)) < 1e-9);
}

console.log('\n=== 场景1：诚实上报（应通过）===');
{
  const t=createTraceRecorder(3,getSeed());
  const items=[['23 + 45','68','68',true],['59 - 14','45','45',true],['7 × 8','56','30',false]];
  for(const [expr,af,ui,ok] of items){
    t.record({dl:3.5,op:expr.includes('×')?'mul':expr.includes('+')?'add':'sub',expr,
      answerFixed:parseFloat(af)*100,userInput:ui,firstTryCorrect:ok,elapsedMs:3000,isFirstOccurrence:true});
  }
  const r=recomputeFromTrace(t.export());
  ck(`未检测篡改 (tampered=${r.tampered})`, r.tampered===false);
  ck(`无对错不符 (claimedMismatch=${r.claimedMismatch})`, r.claimedMismatch===false);
  ck(`分数按独立判定算: ${r.score}`, r.correct===2&&r.wrong===1);
}

console.log('\n=== 场景2：攻击者把错题标成对（改布尔值）===');
{
  const t=createTraceRecorder(3,getSeed());
  // 第3题孩子实际填了 30（错），但伪造成 firstTryCorrect:true
  t.record({dl:3.5,op:'mul',expr:'7 × 8',answerFixed:5600,userInput:'30',firstTryCorrect:true,elapsedMs:3500,isFirstOccurrence:true});
  const r=recomputeFromTrace(t.export());
  ck(`检出 claimedMismatch=${r.claimedMismatch}`, r.claimedMismatch===true);
  ck(`按独立判定记为错 (correct=${r.correct}, wrong=${r.wrong})`, r.correct===0&&r.wrong===1);
  ck(`不给连击分 (score=${r.score}, 满分应为150)`, r.score===0);
}

console.log('\n=== 场景3：篡改 answerFixed ===');
{
  const t=createTraceRecorder(3,getSeed());
  t.record({dl:3.5,op:'add',expr:'23 + 45',answerFixed:9999,userInput:'68',firstTryCorrect:true,elapsedMs:3000,isFirstOccurrence:true});
  const r=recomputeFromTrace(t.export());
  ck(`检出 tampered=${r.tampered}`, r.tampered===true);
}

console.log('\n=== 场景4：篡改 op（与算式符号矛盾）===');
{
  const got=computeAnswerFromExpr('add','59 - 14');   // op说加法，符号是减法
  ck('op 与符号矛盾 → 返回 null', got===null);
}

console.log('\n=== 场景5：无 userInput 时降级但不虚高 ===');
{
  const t=createTraceRecorder(3,getSeed());
  t.record({dl:3.5,op:'add',expr:'23 + 45',answerFixed:6800,userInput:null,firstTryCorrect:true,elapsedMs:3000,isFirstOccurrence:true});
  const r=recomputeFromTrace(t.export());
  ck(`answerFixed 正确 → 不算篡改 (tampered=${r.tampered})`, r.tampered===false);
  ck(`无 userInput → 记为 unverifiable=${r.unverifiable}（如实降级）`, r.unverifiable===0);
}

console.log('\n=== 场景6：批量刷分（10 题全标对，实际全错）===');
{
  const t=createTraceRecorder(3,getSeed());
  for(let i=0;i<10;i++){
    t.record({dl:3.5,op:'add',expr:`${i} + 1`,answerFixed:(i+1)*100,userInput:'999',firstTryCorrect:true,elapsedMs:3000+Math.random()*3000,isFirstOccurrence:true});
  }
  const r=recomputeFromTrace(t.export());
  ck(`claimedMismatch=${r.claimedMismatch}`, r.claimedMismatch===true);
  ck(`独立判定全错 (correct=${r.correct})`, r.correct===0);
  ck(`得分归零 (score=${r.score})`, r.score===0);
}
// ========== 增之翼发现的真实绕过：无法解析的算式 ==========
console.log('\n=== 场景7：构造无法解析的算式（原绕过路径）===');
{
  const t=createTraceRecorder(6,getSeed());
  // 攻击者用出题器不会产生的算式，让服务端 expected=null 走「默认通过」
  for(let i=0;i<10;i++){
    t.record({dl:8,op:'mixed',expr:'(3 × 4) + 5',answerFixed:999999,userInput:'17',
      firstTryCorrect:true,elapsedMs:3000+Math.random()*2000,isFirstOccurrence:true});
  }
  const r=recomputeFromTrace(t.export());
  console.log(`  修复前此路径得分 1765（10题全对）`);
  console.log(`  修复后: score=${r.score} correct=${r.correct} wrong=${r.wrong} unverifiable=${r.unverifiable} tampered=${r.tampered}`);
  ck('unverifiable>0 时不产生分数', r.unverifiable===0 || r.score===0);
  ck('篡改的 answerFixed 被检出', r.tampered===true);
}

console.log('\n=== 场景8：真正的空档（无法解析且无篡改）===');
{
  const t=createTraceRecorder(6,getSeed());
  // expr 无法解析 + answerFixed 填对（不触发 tampered）→ 必须仍不得分
  t.record({dl:8,op:'weird',expr:'??? + ???',answerFixed:100,userInput:'1',
    firstTryCorrect:true,elapsedMs:3000,isFirstOccurrence:true});
  const r=recomputeFromTrace(t.export());
  console.log(`  score=${r.score} unverifiable=${r.unverifiable} wrong=${r.wrong}`);
  ck('无法验证的题不得分（原为默认通过=漏洞）', r.score===0);
  ck('计入 unverifiable 供云端审计', r.unverifiable===1);
}

console.log('\n=== 场景9：混合运算解析正确性 ===');
{
  const m1=computeAnswerFromExpr('mixed','(3 × 4) + 5');
  const m2=computeAnswerFromExpr('mixed','(5 × 5) - 9');
  const m3=computeAnswerFromExpr('mixed','(2 × 3) + 18');
  ck(`(3×4)+5 = ${m1} (期望1700)`, m1===1700);
  ck(`(5×5)-9 = ${m2} (期望1600)`, m2===1600);
  ck(`(2×3)+18 = ${m3} (期望2400)`, m3===2400);
}
console.log(`\n最终：${fail===0?'✅':'❌'} ${pass} 通过 / ${fail} 失败`);
process.exit(fail?1:0);
