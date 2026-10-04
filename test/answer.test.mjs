import {AnswerBuffer,QuestionTimer,GRACE_MS} from '../miniprogram/core/answer-buffer.js';

// 复刻原版视频场景：答案 14.5
const q={op:'decimal_addsub',a:19.1,b:4.6,answer:14.5,expr:'19.1 - 4.6',isDecimal:true};

console.log('=== 核心场景：孩子逐字输入 "14.5" ===');
const b=new AnswerBuffer(q);
const seq=['1','4','.','5'];
for(const ch of seq){
  const r=b.push(ch);
  const decided = b.isLocked ? (b.result?'✅判对':'❌判错') : (b.rejected?'⚠️早判拒绝':(b.phase==='grace'?'⏳宽限等待中':'…输入中'));
  console.log(`  输入"${ch}" → buf="${b.buf}" 阶段=${b.phase} ${decided}`);
  if(b.isLocked) break;
}
console.log(`  最终结果: ${b.isLocked? (b.result?'✅ 判定正确（孩子没被误判！）':'❌ 判错') : '未锁定'}`);

console.log('\n=== 关键修复验证：打到第3位"5"时不应立即锁死 ===');
const b2=new AnswerBuffer(q);
b2.push('1');b2.push('4');b2.push('.');
console.log(`  输入"14." 后: 阶段=${b2.phase} 锁定=${b2.isLocked}`);
b2.push('5');
console.log(`  输入"14.5" 后: 阶段=${b2.phase} 锁定=${b2.isLocked} 结果=${b2.result}`);
console.log(`  → ${b2.isLocked&&b2.result?'✅ 正确，孩子顺利通过':'❌ 仍被误判'}`);

console.log('\n=== 宽限机制：输入不可能答案时仍在宽限窗口内 ===');
const b3=new AnswerBuffer(q);
b3.push('9');b3.push('9');
console.log(`  输入"99" → 阶段=${b3.phase} 可救=${b3._anyPrefixSolvable('99')} 早判标记=${b3.rejected}`);
let t=0; let decided=false;
while(!decided && t<1){ decided=b3.update(0.1); t+=0.1; }
console.log(`  ${decided?'宽限结束→判定错':'仍在宽限'} (累计${(t*1000).toFixed(0)}ms，阈值${GRACE_MS}ms)`);

console.log('\n=== 宽限挽救场景：孩子先打错再改 ===');
const q2={op:'sub',a:12,b:5,answer:7,expr:'12 - 5'};
const b4=new AnswerBuffer(q2);
b4.push('1');
console.log(`  输入"1"(正确答案是7) 阶段=${b4.phase} 锁定=${b4.isLocked}`);
b4.push('7');
console.log(`  继续"7" → "${b4.buf}" 锁定=${b4.isLocked} 结果=${b4.result} ${b4.result?'✅':'❌'}`);

console.log('\n=== 退格修正 ===');
const b5=new AnswerBuffer(q);
b5.push('9');b5.push('9');b5.pop();b5.pop();
console.log(`  "99"→两次退格→ buf="${b5.buf}" 阶段=${b5.phase}`);
b5.push('1');b5.push('4');b5.push('.');b5.push('5');
console.log(`  改输"14.5" → 结果=${b5.result} ${b5.result?'✅ 退格修正成功':'❌'}`);

console.log('\n=== 整数题即时判定（无小数点干扰）===');
const q3={op:'add',a:23,b:45,answer:68,expr:'23 + 45'};
const b6=new AnswerBuffer(q3);
b6.push('6');console.log(`  "6" → ${b6.phase} 锁定=${b6.isLocked}`);
b6.push('8');console.log(`  "68" → 锁定=${b6.isLocked} 结果=${b6.result} ${b6.result?'✅即时判定':'❌'}`);

console.log('\n=== 软倒计时（不强制打断）===');
const qt=new QuestionTimer(8);
console.log(`  初始 ratio=${qt.ratio} warning=${qt.isWarning}`);
for(let i=0;i<5;i++) qt.update(1);
console.log(`  过5s ratio=${qt.ratio.toFixed(2)} warning=${qt.isWarning}`);
for(let i=0;i<4;i++) qt.update(1);
console.log(`  过9s done=${qt.done} ratio=${qt.ratio}`);
