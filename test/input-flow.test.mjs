/**
 * v3 判定模型测试：输入过程永不自动判错
 * ------------------------------------------------------------------
 * 核心语义（用户定案）：
 *   1. 输入过程永不判错（位数满也只是不再收数字）
 *   2. 判错唯一来源：单题限时到期仍未答对
 *   3. 判对唯一条件：输入恰好等于答案
 */
import {AnswerBuffer, QuestionTimer} from '../miniprogram/core/answer-buffer.js';
let pass=0,fail=0;
const ck=(n,ok)=>{ok?pass++:fail++;console.log(`  ${ok?'✅':'❌'} ${n}`);};

console.log('=== A. 输入过程永不判错 ===');
{
  // 答案 12，乱按一通再慢慢改
  const q={op:'add',a:23,b:45,answer:68,expr:'23 + 45'};
  const b=new AnswerBuffer(q);
  b.push('9');                       // 9<68 位数1<2
  ck('输入 9 不判错', !b.isLocked && !b.full);
  b.push('9');                       // 99：位数满
  ck('99 位数满 → full=true 但不判错', b.full && !b.isLocked);
  let t=0; while(t<3){ b.update(0.1); t+=0.1; }
  ck('3 秒后依然不判错（v3 核心）', !b.isLocked);
  b.pop();                           // 退格
  ck('退格解锁 full', !b.full);
  b.pop();
  b.push('6'); b.push('8');
  ck('改成 68 判对', b.isLocked && b.result===true);
}
{
  // 输入中途停 10 秒也不判错（限时由 QuestionTimer 管，不在 buffer）
  const q={op:'add',a:23,b:45,answer:68,expr:'23 + 45'};
  const b=new AnswerBuffer(q);
  b.push('6');
  let t=0; while(t<10){ b.update(0.1); t+=0.1; }
  ck('输入中途停 10 秒不判错', !b.isLocked);
}

console.log('\n=== B. 位数满锁定：不再收数字，退格可用 ===');
{
  const q={op:'add',a:23,b:45,answer:68,expr:'23 + 45'};
  const b=new AnswerBuffer(q);
  b.push('1'); b.push('2');          // 12 位数满
  ck('12 位数满 full=true', b.full);
  const r=b.push('3');
  ck('位数满后按 3 被拒绝', r.changed===false && b.buf==='12');
  ck('退格可用', b.pop()===true && b.buf==='1' && !b.full);
  b.push('8');                       // 18 位数满（full）
  ck('18 位数满', b.full);
  b.pop(); b.pop();
  b.push('6'); b.push('8');
  ck('最终改对 68', b.isLocked && b.result===true);
}

console.log('\n=== C. 判对路径完好 ===');
{
  const q={op:'decimal_mul',a:76.3,b:6.8,answer:518.84,answerFixed:51884,expr:'76.3 × 6.8',isDecimal:true};
  const b=new AnswerBuffer(q);
  for(const ch of '518.84') b.push(ch);
  ck('多位小数 518.84 判对', b.isLocked && b.result===true);
}
{
  const q={op:'fraction',a:2,b:3,den:8,answer:5,answerFixed:500,expr:'2/8 + 3/8',isFraction:true,answerText:'5/8'};
  const b=new AnswerBuffer(q);
  for(const ch of '5') b.push(ch);
  ck('分数题答分子 5 判对', b.isLocked && b.result===true);
}

console.log('\n=== D. 单题限时：不输入/没答对到期判错（唯一判错来源）===');
{
  const q={op:'add',a:23,b:45,answer:68,expr:'23 + 45'};
  const b=new AnswerBuffer(q);
  const qt=new QuestionTimer(12);
  let judged=null;
  for(let i=0;i<60*13 && judged===null;i++){
    qt.update(1/60); b.update(1/60);
    if(qt.update(0)) break;          // 防重复
    if(qt.done && judged===null){ judged=false; }   // 限时到仍未答对 → 判错
  }
  ck('12 秒不输入 → 判错', judged===false);
}
{
  // 输到一半超时：也判错（没答对）
  const q={op:'add',a:23,b:45,answer:68,expr:'23 + 45'};
  const b=new AnswerBuffer(q);
  b.push('6');
  const qt=new QuestionTimer(12);
  let judged=null;
  for(let i=0;i<60*13 && judged===null;i++){
    qt.update(1/60);
    if(qt.done) judged=false;
  }
  ck('输到一半超时也判错', judged===false);
}

console.log('\n=== E. 完全按用户场景：慢慢想、犹豫、改答案 ===');
{
  const q={op:'add',a:23,b:45,answer:68,expr:'23 + 45'};
  const b=new AnswerBuffer(q);
  // 模拟孩子：按1 → 想4秒 → 退格 → 按6 → 想3秒 → 按8
  b.push('1');
  let t=0; while(t<4){ b.update(0.1); t+=0.1; }
  ck('按 1 后想 4 秒不判错', !b.isLocked);
  b.pop();
  b.push('6');
  t=0; while(t<3){ b.update(0.1); t+=0.1; }
  ck('按 6 后想 3 秒不判错', !b.isLocked);
  b.push('8');
  ck('最后按 8 → 判对（以最终输入为准）', b.isLocked && b.result===true);
}
console.log(`\n${fail===0?'✅':'❌'} ${pass} 通过 / ${fail} 失败`);
process.exit(fail?1:0);
