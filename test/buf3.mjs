import {AnswerBuffer} from '../miniprogram/core/answer-buffer.js';
import {generateQuestion,setSeed} from '../shared/difficulty.js';
import {toFixedInt,fromFixedInt} from '../shared/fixed.js';

// 用真实出题器验证：每个年级DL 各跑100题，模拟真实输入路径
console.log('=== 真实题目：输入"正确值"必须100%通过 ===');
setSeed(4242);
let tot=0,fail=0;
for(let g=1;g<=6;g++)for(let dl=1;dl<=10;dl+=1){
  for(let i=0;i<100;i++){
    const q=generateQuestion(g,dl);
    const correct=q.answerText||fromFixedInt(q.answerFixed!==undefined?q.answerFixed:toFixedInt(q.answer));
    const b=new AnswerBuffer(q);
    for(const c of correct){ if(c==='/')continue; b.push(c); }
    tot++;
    if(!(b.isLocked&&b.result===true)){
      fail++;
      if(fail<4)console.log(`  ❌ ${g}年级DL${dl} ${q.expr} 应输"${correct}" 阶段=${b.phase} 结果=${b.result}`);
    }
  }
}
console.log(`  ${tot} 题，失败 ${fail} ${fail===0?'✅ 全部通过':'❌'}`);

console.log('\n=== 差一位场景（v3：位数满锁输入、不判错、退格可改）===');
setSeed(888);
let ok=0,total=0;
for(let i=0;i<3000;i++){
  const q=generateQuestion(4,5);
  const ans=q.answerText||fromFixedInt(q.answerFixed!==undefined?q.answerFixed:toFixedInt(q.answer));
  if(ans.length<2||isNaN(Number(ans)))continue;
  const wrongAns=String(Number(ans)-1);
  if(wrongAns.length!==ans.length)continue;
  const b=new AnswerBuffer(q);
  for(const c of wrongAns){b.push(c); if(b.isLocked)break;}
  total++;
  // v3 语义：输完错误答案后必然「未判错」（等限时）且「退格可用」
  if(!b.isLocked && b.pop()===true) ok++;
}
console.log(`  差一位场景 ${total} 例，未判错且退格可改：${ok} (${(ok/total*100).toFixed(1)}%)`);
if(ok!==total){console.error('❌ 存在被自动判错的场景——违反 v3 模型');process.exit(1);}
console.log('  (v3：输入过程永不判错)');

console.log('\n=== 静置测试（v3：输入过程永不判错，位数满只锁定输入）===');
const q=generateQuestion(3,4);
const ans=String(q.answer);
const b=new AnswerBuffer(q);
const wrong=String(Number(ans)+99);
for(const c of wrong){b.push(c); if(b.isLocked)break;}
if(!b.isLocked){
  let t=0;while(!b.isLocked&&t<5){b.update(0.05);t+=0.05;}
  console.log(`  题"${q.expr}" 答案${ans} 输入"${wrong}" → ${b.full?'✅位数满已锁输入（不判错，等退格/限时）':'❌异常'}`);
}else{
  console.log(`  输入"${wrong}" 立即判定: ${b.result?'✅判对(答案恰好=输入)':'✅判错'}`);
}
