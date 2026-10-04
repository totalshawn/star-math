/**
 * computeAnswerFromExpr 健壮性测试（负样本为主）
 * 它是防篡改的第一道判据——它崩了整条链就崩了
 */
import {computeAnswerFromExpr} from '../shared/difficulty.js';
let pass=0,fail=0;
const ck=(n,ok)=>{ok?pass++:fail++;console.log(`  ${ok?'✅':'❌'} ${n}`);};

console.log('=== 正样本（必须算出正确答案）===');
const good=[
  ['add','23 + 45',6800],
  ['sub','59 - 14',4500],
  ['mul','7 × 8',5600],
  ['div','144 ÷ 12',1200],
  ['decimal_addsub','19.1 - 4.6',1450],
  ['decimal_mul','76.3 × 6.8',51884],
  ['fraction','2/8 + 3/8',5],
  ['mixed','(3 × 4) + 5',1700],
  ['mixed','(5 × 5) - 9',1600],
  [null,'23 + 45',6800],        // 无 op 也应能算
];
for(const [op,expr,want] of good){
  const got=computeAnswerFromExpr(op,expr);
  ck(`${String(op).padEnd(16)} "${expr}" → ${got} (期望 ${want})`, got===want);
}

console.log('\n=== 负样本：畸形输入必须返回 null（不得崩、不得算错）===');
const bad=[
  ['', '空串'],
  [null,'null'],
  [undefined,'undefined'],
  ['abc','纯字母'],
  ['??? + ???','问号'],
  ['1 / 0','除零(分数)'],
  ['5 ÷ 0','整数除以零'],
  ['1..2 + 3','双小数点'],
  ['1 +','缺右操作数'],
  ['+ 1','缺左操作数'],
  ['--5','双负号'],
  ['1 + 2 + 3','三项算式'],
  ['((1 + 2)) + 3','双层括号'],
  ['1e5 + 1','科学计数'],
  ['０+１','全角数字'],
  ['   ','纯空格'],
  ['1 + 2; DROP TABLE','注入尝试'],
  ['<script>','标签注入'],
];
for(const [expr,desc] of bad){
  let got,crashed=false;
  try{ got=computeAnswerFromExpr('add',expr); }catch(e){ crashed=true; }
  ck(`${desc.padEnd(14)} "${String(expr).slice(0,16)}" → ${crashed?'抛异常❌':String(got)}`, !crashed && got===null);
}

console.log('\n=== 超长输入不崩（DoS 防护）===');
{
  const huge='1 + 1'.repeat(5000);
  let crashed=false,r=null;
  const t0=Date.now();
  try{ r=computeAnswerFromExpr('add',huge); }catch(e){ crashed=true; }
  const ms=Date.now()-t0;
  ck(`15000 字符输入不抛异常`, !crashed);
  ck(`耗时 ${ms}ms (<100ms)`, ms<100);
  ck('返回 null（不是错误答案）', r===null);
}

console.log('\n=== op 与符号矛盾必须拒绝 ===');
const contradictions=[
  ['add','59 - 14'],
  ['sub','23 + 45'],
  ['mul','12 ÷ 5'],
  ['div','7 × 8'],
];
for(const [op,expr] of contradictions){
  ck(`${op.padEnd(5)} vs "${expr}"`, computeAnswerFromExpr(op,expr)===null);
}

console.log(`\n${fail===0?'✅':'❌'} ${pass} 通过 / ${fail} 失败`);
process.exit(fail?1:0);
