import {generateQuestion,setSeed,getSeed,randInt} from '../shared/difficulty.js';

console.log('=== 修复：全服序列不再相同 ===');
console.log('  本进程 seed:', getSeed(), '(应由时间派生，非固定值)');
console.log('  固定值20261003?', getSeed()===20261003 ? '❌ 仍是固定' : '✅ 已随机化');

console.log('\n=== 同 seed 可复现（云端重放校验的前提）===');
setSeed(12345);
const a=[];for(let i=0;i<6;i++)a.push(generateQuestion(3,3.5).expr);
setSeed(12345);
const b=[];for(let i=0;i<6;i++)b.push(generateQuestion(3,3.5).expr);
console.log('  第一次:',a.join(' | '));
console.log('  第二次:',b.join(' | '));
console.log('  可复现:',JSON.stringify(a)===JSON.stringify(b)?'✅ 云端能重放校验':'❌');

console.log('\n=== 不同 seed → 不同序列 ===');
setSeed(1); const c=[];for(let i=0;i<4;i++)c.push(generateQuestion(3,3.5).expr);
setSeed(2); const d=[];for(let i=0;i<4;i++)d.push(generateQuestion(3,3.5).expr);
console.log('  seed=1:',c.join(' | '));
console.log('  seed=2:',d.join(' | '));
console.log('  差异:',JSON.stringify(c)!==JSON.stringify(d)?'✅':'❌');

console.log('\n=== 分布均匀性（20 万次）===');
setSeed(777);
const buckets=new Array(10).fill(0);
for(let i=0;i<200000;i++) buckets[randInt(0,9)]++;
console.log(' ',buckets.map(x=>(x/20000*100).toFixed(2)+'%').join(' '));
const exp=20000, dev=Math.max(...buckets.map(x=>Math.abs(x-exp)))/exp*100;
console.log('  最大偏离:',dev.toFixed(2)+'%',dev<3?'✅ 均匀':'⚠️ 偏差大');

console.log('\n=== 出题不变量仍成立（回归）===');
setSeed(42);
let bad=0,tot=0,over=0;
for(let g=1;g<=6;g++)for(let dl=1;dl<=10;dl+=1)for(let i=0;i<500;i++){
  const q=generateQuestion(g,dl);tot++;
  if(q.answer<0)bad++;
  if((g===1||g===2)&&(q.isDecimal||q.isFraction))over++;
}
console.log(`  ${tot} 题 | 负数 ${bad} | 低年级超纲 ${over}`,(bad===0&&over===0)?'✅':'❌');
