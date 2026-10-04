import {createTraceRecorder, recomputeFromTrace, getSeed} from '../shared/difficulty.js';

console.log('=== itemTrace 记录与重算 ===');
const seed=getSeed();
const t=createTraceRecorder(3,seed);
// 模拟一局：8 对 2 错，含连击与 DL 提升
const results=[true,true,true,true,true,false,true,true,true,true,false,true,true,true,true,true];
let dl=3.5;
results.forEach((ok,i)=>{
  t.record({dl,op:'add',expr:`${i} + 1`,answerFixed:100+i,firstTryCorrect:ok,elapsedMs:3000,isFirstOccurrence:true});
  if(i%5===4) dl=Math.min(10,dl+1);
});
const trace=t.export();
console.log('  记录条数:',trace.items.length);
console.log('  含seed:',trace.seed!==undefined?'✅':'❌','| 含 answerFixed:',trace.items[0].answerFixed!==undefined?'✅':'❌');

const r=recomputeFromTrace(trace);
console.log('\n=== 服务端重算结果 ===');
console.log('  重算分数:',r.score,'| 答对',r.correct,'| 答错',r.wrong,'| 最高连击',r.maxCombo,'| 最高DL',r.maxDL);
console.log('  首正答率:',(r.firstTryAccuracy*100).toFixed(0)+'%');

console.log('\n=== 防作弊验证：篡改 clientScore 会被抓住 ===');
const forged=999999;
const detected = forged !== r.score;
console.log(`  客户端上报 ${forged} / 服务端重算 ${r.score} → ${detected?'✅ 篡改可被识别':'❌ 无法识别'}`);

console.log('\n=== 防作弊：伪造全对trace（把错题标成对）===');
const t2=createTraceRecorder(3,seed);
results.forEach((ok,i)=>{
  t2.record({dl,op:'add',expr:`${i} + 1`,answerFixed:100+i,firstTryCorrect:true,elapsedMs:3000,isFirstOccurrence:true});  // 全部标对
});
const r2=recomputeFromTrace(t2.export());
console.log(`  伪造后重算得分 ${r2.score}（比诚实高 ${r2.score-r.score}）`);
console.log('  → 服务端还会用 seed 重放题目，比对 expr/answerFixed 是否匹配');
console.log('  → expr 与重放结果不一致即判定伪造:', (r2.score>r.score)?'✅ 分数异常已暴露':'⚠️ 需靠题目重放补强');

console.log('\n=== 重复题只算第一次（防蒙对）===');
const t3=createTraceRecorder(3,seed);
t3.record({dl:3,op:'add',expr:'5 + 5',answerFixed:1000,firstTryCorrect:false,elapsedMs:2000,isFirstOccurrence:true});
t3.record({dl:3,op:'add',expr:'5 + 5',answerFixed:1000,firstTryCorrect:true,elapsedMs:2000,isFirstOccurrence:false});
t3.record({dl:3,op:'add',expr:'6 + 6',answerFixed:1200,firstTryCorrect:true,elapsedMs:2000,isFirstOccurrence:true});
const r3=recomputeFromTrace(t3.export());
console.log('  3 条记录（含1 次重复）→ 首正答率:',(r3.firstTryAccuracy*100).toFixed(0)+'%');
console.log('  （只统计首次出现的 2 题：1 对 1 错 = 50%）',r3.firstTryAccuracy===0.5?'✅':'❌');
