import {AnswerBuffer} from '../miniprogram/core/answer-buffer.js';
import {fromFixedInt} from '../shared/fixed.js';
function type(buf,str){buf.clear();for(const c of str)buf.push(c);return buf;}

console.log('=== 颜如绘举的反例：必须全部通过 ===');
const cases=[
 {desc:'10 ÷ 2 = 5',q:{op:'div',a:10,b:2,answer:5,expr:'10 ÷ 2'},in:'5'},
 {desc:'4 ÷ 1 = 4',  q:{op:'div',a:4,b:1,answer:4,expr:'4 ÷ 1'},in:'4'},
 {desc:'2.50 = 2.5 尾零',q:{op:'decimal_addsub',a:5,b:2.5,answer:2.5,expr:'5 - 2.5',isDecimal:true},in:'2.50'},
 {desc:'2.5 输入2.5',q:{op:'decimal_addsub',a:5,b:2.5,answer:2.5,expr:'5 - 2.5',isDecimal:true},in:'2.5'},
 {desc:'7.00 = 7',    q:{op:'decimal_addsub',a:9.5,b:2.5,answer:7,expr:'9.5 - 2.5',isDecimal:true},in:'7.00'},
 {desc:'518.84 定点小数',q:{op:'decimal_mul',a:76.3,b:6.8,answer:518.84,answerFixed:51884,expr:'76.3 × 6.8',isDecimal:true},in:'518.84'},
 {desc:'10.00 = 10',  q:{op:'add',a:4,b:6,answer:10,expr:'4 + 6'},in:'10.00'},
 {desc:'0.5 = 0.50',  q:{op:'decimal_addsub',a:1,b:0.5,answer:0.5,expr:'1 - 0.5',isDecimal:true},in:'0.50'},
];
let pass=0;
for(const c of cases){
  const b=type(new AnswerBuffer(c.q),c.in);
  const ok=b.isLocked&&b.result===true;
  if(ok)pass++;
  console.log(`  ${ok?'✅':'❌'} ${c.desc.padEnd(20)} 输入"${c.in}" → ${b.isLocked?(b.result?'判定正确':'判错'):'未锁定'}`);
}
console.log(`  ${pass}/${cases.length} 通过`);

console.log('\n=== 早判仍然生效（不能无限输入）===');
const q={op:'add',a:23,b:45,answer:68,expr:'23 + 45'};
const b=type(new AnswerBuffer(q),'99');
console.log(`  答案68 输入"99" → 锁定=${b.isLocked} 结果=${b.result} ${b.isLocked&&!b.result?'✅立即判错':'❌应判错'}`);
const b2=type(new AnswerBuffer(q),'999');
console.log(`  答案68 输入"999" → 锁定=${b2.isLocked} ${b2.isLocked&&!b2.result?'✅':'❌'}`);

console.log('\n=== 可修正性：打错还能改 ===');
const q2={op:'sub',a:12,b:5,answer:7,expr:'12 - 5'};
const b3=new AnswerBuffer(q2);
b3.push('1');
console.log(`  答案7 输入"1" → 阶段=${b3.phase} 锁定=${b3.isLocked} ${!b3.isLocked?'✅可继续':'❌被锁死'}`);
b3.pop();
b3.push('7');
console.log(`  退格改输"7" → 锁定=${b3.isLocked} 结果=${b3.result} ${b3.result?'✅':'❌'}`);

console.log('\n=== 分数题 ===');
const qf={op:'fraction',a:2,b:3,den:8,answer:5,answerFixed:500,expr:'2/8 + 3/8',isFraction:true,answerText:'5/8'};
const bf=type(new AnswerBuffer(qf),'5');
console.log(`  2/8+3/8 输入"5" → ${bf.isLocked&&bf.result?'✅判定正确':'结果='+bf.result}`);
const bf2=type(new AnswerBuffer(qf),'5/8');
console.log(`  输入"5/8" → ${bf2.isLocked&&bf2.result?'✅判定正确':'❌'}`);
const bf3=type(new AnswerBuffer(qf),'6');
console.log(`  输入"6"(错) → ${bf3.isLocked? (bf3.result?'❌误判对':'✅正确判错'):'未锁定'}`);

console.log('\n=== 宽限窗口真的给到了吗 ===');
const q3={op:'add',a:23,b:45,answer:680,answerFixed:68000,expr:'23 + 45'};
const b4=type(new AnswerBuffer(q3),'67');
console.log(`  答案68 输入"67"(差一位) → 阶段=${b4.phase} 锁定=${b4.isLocked}`);
console.log(`  ${b4.phase==='grace'?'✅进入宽限，可继续补8':'❌'}`);
b4.push('8');
console.log(`  补"8" → ${b4.result?'✅判定正确':'❌'}`);
