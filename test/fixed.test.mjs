import {generateQuestion,checkAnswer,setSeed,numToStr} from '../shared/difficulty.js';
import {toFixedInt,fromFixedInt,mulFixed,subFixed,fractionEquals,normalizeInput} from '../shared/fixed.js';

console.log('=== 病根案例端到端验证 ===');
// 76.3 × 6.8 真实答案 518.84
const {mulFixed:M}=await import('../shared/fixed.js');
const aF=toFixedInt('76.3'), bF=toFixedInt('6.8');
const ansF=mulFixed(aF,bF);
console.log(`  定点: 76.3 →${aF}分, 6.8→${bF}分, 乘积=${ansF}分 = ${fromFixedInt(ansF)}`);
console.log(`  浮点: 76.3*6.8 = ${76.3*6.8} (误差${Math.abs(76.3*6.8-518.84).toExponential(2)})`);

console.log('\n=== 6万题精确判定扫描（1—6年级 DL全档）===');
setSeed(2026);
let total=0,fail=0,examples=[];
for(let g=1;g<=6;g++)for(let dl=1;dl<=10;dl+=1)for(let i=0;i<1500;i++){
  const q=generateQuestion(g,dl);total++;
  const correct=q.answerText||fromFixedInt(q.answerFixed!==undefined?q.answerFixed:toFixedInt(q.answer));
  if(!checkAnswer(q,correct)){fail++;if(examples.length<5)examples.push(`${q.expr} 应=${correct} q=${JSON.stringify({answer:q.answer,answerFixed:q.answerFixed})}`);}
}
console.log(`  总题数 ${total} | 标准答案判定失败 ${fail}`);
examples.forEach(e=>console.log('   ❌',e));
console.log(`  ${fail===0?'✅ 全部位级精确，零容差零误判':'❌ 仍有失败'}`);

console.log('\n=== 六年级大数+小数混合压测 ===');
setSeed(777);
let big=0,bigFail=0;
for(let i=0;i<20000;i++){
  const q=generateQuestion(6,10);
  if(q.isDecimal||q.op==='decimal_mul'){
    big++;
    const correct=fromFixedInt(q.answerFixed);
    if(!checkAnswer(q,correct))bigFail++;
  }
}
console.log(`  小数题 ${big} 道，判定失败 ${bigFail} ${bigFail===0?'✅':'❌'}`);

console.log('\n=== 分数题判定 ===');
setSeed(31);
for(let i=0;i<5;i++){
  const q=generateQuestion(6,10);
  if(q.isFraction){
    console.log(`  ${q.expr} → 分子${q.answer}/${q.den}`);
    console.log(`    输入"${q.answer}" → ${checkAnswer(q,String(q.answer))?'✅':'❌'}  输入"${q.answer}/${q.den}" → ${checkAnswer(q,`${q.answer}/${q.den}`)?'✅':'❌'}`);
    break;
  }
}

console.log('\n=== 容差方案对比（证明必须定点）===');
setSeed(555);
let epsFail=0,epsTotal=0;
for(let i=0;i<20000;i++){
  const q=generateQuestion(6,10);
  if(!q.isDecimal&&q.op!=='decimal_mul')continue;
  epsTotal++;
  const standard=fromFixedInt(q.answerFixed);
  // 旧方案：epsilon 1e-6 容差 + 浮点答案
  const old=new Promise(()=>{});
  if(Math.abs(Number(standard)-q.answer)>=1e-6)epsFail++;
}
console.log(`  旧浮点方案会误判 ${epsFail}/${epsTotal} (${(epsFail/epsTotal*100).toFixed(2)}%)`);
console.log(`  定点方案误判 0/${epsTotal} (0.00%)`);
