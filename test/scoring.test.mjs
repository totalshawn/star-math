import {GameState,comboMultiplier,nextComboTier} from '../shared/scoring.js';
import {GAME} from '../shared/config.js';

console.log('=== 倍率档位 ===');
[0,3,5,9,10,14,20,29,35,50,80].forEach(c=>process.stdout.write(`${c}连击→x${comboMultiplier(c)}  `));
console.log('\n');

console.log('=== 全对玩家（模拟一局）===');
let g=new GameState(3);
console.log('起始 DL',g.dl,'限时',g.questionLimit.toFixed(1)+'s','关卡时长',g.timeLeft+'s');
for(let i=0;i<30;i++){
  const el=Math.min(g.questionLimit,3+Math.random()*3);
  const r=g.submit(true,el);
  if(i<12||r.dlUp||r.comboUp) console.log(` 第${String(i+1).padStart(2)}题 连击${String(g.combo).padStart(2)} DL${g.dl} +${String(r.gained).padStart(4)}分 加时${r.timeAdded.toFixed(1)}s 剩余${g.timeLeft.toFixed(1)}s ${r.dlUp?'⬆升难!':''}${r.comboUp?' 🔥连击里程碑':''}`);
  if(g.levelFinished){console.log('  → 第'+g.level+'关完成 (10题)');g.nextLevel();}
}
console.log(`最终: 分数${g.score} 最高连击${g.maxCombo} DL${g.dl} 星级${g.stars}\n`);

console.log('=== 差生玩家（答错率高，验证保底不劝退）===');
let s=new GameState(1);
console.log('起始 DL',s.dl,'(一年级基准1)');
for(let i=0;i<20;i++){
  const ok=Math.random()<0.35;
  s.submit(ok,5);
  if(i<8||i===19) console.log(` 第${i+1}题 ${ok?'✓':'✗'} DL=${s.dl} 连击=${s.combo} 连续错${s.wrongStreak}`);
}
console.log(`→ 一年级学生即使大量答错，DL 仍停在 ${s.dl}（不会跌破认知下限）\n`);

console.log('=== 时间压力验证 ===');
let t=new GameState(6);
console.log(`六年级 DL${t.dl} 单题限时 ${t.questionLimit.toFixed(1)}s，答对加时 ${t.timeBonus.toFixed(1)}s`);
t.submit(true,1); console.log(` DL升至${t.dl} → 单题限时缩短至 ${t.questionLimit.toFixed(1)}s，加时增至 ${t.timeBonus.toFixed(1)}s`);
t.submit(true,1); console.log(` DL升至${t.dl} → 单题限时 ${t.questionLimit.toFixed(1)}s，加时 ${t.timeBonus.toFixed(1)}s`);

console.log('\n=== 星级与评语 ===');
[[25,20,10],[15,12,8],[8,9,6],[3,10,5]].forEach(([c,w,l])=>{
  const x=new GameState(3); x.correct=c;x.wrong=w;x.maxCombo=l;x.score=c*120;
  console.log(` 答对${c}/答错${w}/最高连击${l} → ${x.stars}星 ${x.comment[0]}`);
});
