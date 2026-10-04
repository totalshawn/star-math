import {generateQuestion,checkAnswer,setSeed} from '../shared/difficulty.js';
setSeed(42);
let bad=0,tot=0,neg=0,over=0;
const gradeMax={1:20,2:100,3:1000,4:10000,5:100000,6:1000000};
for(let g=1;g<=6;g++)for(let dl=1;dl<=10;dl+=0.5)for(let i=0;i<150;i++){
  const q=generateQuestion(g,dl); tot++;
  if(q.answer<0){neg++;bad++;}
  if(!q.expr||Number.isNaN(q.answer))bad++;
  if(!checkAnswer(q,q.answerText||String(q.answer)))bad++;
  // 超纲检测：1-2年级不得出现小数或三位数以上
  if((g===1||g===2)&&(q.isDecimal||q.isFraction)){over++;bad++;}
  if(g===1&&(Math.abs(q.a)>20||Math.abs(q.b)>20)){over++;}
}
console.log('总题数',tot,'| 问题数',bad,'| 负数',neg,'| 超纲',over);
console.log('\n=== 各年级基准DL 抽样（应贴合认知）===');
setSeed(7);
for(let g=1;g<=6;g++){const s=[];for(let i=0;i<7;i++){const q=generateQuestion(g,g*1.0+1);s.push(`${q.expr}=${q.answerText||q.answer}`);}console.log(`${g}年级:`,s.join(' | '));}
console.log('\n=== 难度曲线：一年级 DL1→DL10 数值域变化 ===');
setSeed(11);
for(const dl of [1,3,5,7,9,10]){const s=[];for(let i=0;i<6;i++){const q=generateQuestion(1,dl);s.push(q.expr);}console.log(` DL${String(dl).padEnd(3)}`,s.join('  '));}
console.log('\n=== 难度曲线：六年级 DL 提升应解锁运算类型 ===');
setSeed(13);
for(const dl of [1,3,5,7,9,10]){const s=[];for(let i=0;i<6;i++){const q=generateQuestion(6,dl);s.push(`${q.label}:${q.expr}`);}console.log(` DL${String(dl).padEnd(3)}`,s.join(' '));}
