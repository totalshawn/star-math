import {SaveManager, MEDALS} from '../miniprogram/store/save.js';
function fresh(){const m={};return {getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=v},removeItem:k=>{delete m[k]},keys:()=>Object.keys(m)};}
const S=()=>{const sm=new SaveManager(fresh(),()=>1700000000000);sm.load();return sm;};

console.log('=== 五枚纪念章定义 ===');
for(const [k,v] of Object.entries(MEDALS)){
  console.log(`  ${v.id.padEnd(22)} ${v.name.padEnd(6)} ${v.perLevel?'分关':'全局'} ${v.rarity}`);
}

console.log('\n=== R1-b 护栏：授予纪念章不得发放任何数值奖励 ===');
const s=S();
const before={stars:JSON.stringify(s.data.gradeProgress),coins:s.data.global.coins,best:s.data.global.bestScore};
const granted=s.evaluateMedals({level:3,correct:10,wrong:0,maxCombo:35,stars:4});
const after={stars:JSON.stringify(s.data.gradeProgress),coins:s.data.global.coins,best:s.data.global.bestScore};
console.log('  授予:',granted.join(', ')||'（无）');
console.log('  星星变化:',before.stars===after.stars?'✅ 未变':'❌ 被修改');
console.log('  金币变化:',before.coins===after.coins?'✅ 未变':'❌ '+before.coins+'→'+after.coins);
console.log('  最高分变化:',before.best===after.best?'✅ 未变':'❌ 被修改');

console.log('\n=== 并集、只增不减 ===');
const t=S();
console.log('  首次 3星关卡1:',t.evaluateMedals({level:1,correct:10,wrong:0,maxCombo:5,stars:3}).join(',')||'无');
console.log('  再来一次同样表现:',t.evaluateMedals({level:1,correct:10,wrong:0,maxCombo:5,stars:3}).join(',')||'（无，符合预期）');
console.log('  关卡2 同样表现:',t.evaluateMedals({level:2,correct:10,wrong:0,maxCombo:5,stars:3}).join(',')||'无');
console.log('  纪念章总数:',t.data.medals.items.length,'(分关章应按关卡各一枚)');

console.log('\n=== 全局唯一章不会重复 ===');
const u=S();
u.evaluateMedals({level:1,correct:10,wrong:0,maxCombo:35,stars:5});  // 得combo_30 + flawless
u.evaluateMedals({level:2,correct:10,wrong:0,maxCombo:40,stars:5});  // 应不得combo_30
const g=u.data.medals.items.filter(m=>m.id==='combo_30');
console.log('  combo_30 持有数:',g.length,g.length===1?'✅ 全局唯一':'❌ 重复了');
const f=u.data.medals.items.filter(m=>m.id==='flawless_clear');
console.log('  flawless_clear 持有数:',f.length,f.length===1?'✅ 全局唯一':'❌ 重复了');

console.log('\n=== 记录结构（对齐 UI_SPEC 文案拼接）===');
const v=S();
v.evaluateMedals({level:23,correct:10,wrong:1,maxCombo:12,stars:3});
v.data.medals.items.forEach(m=>{
  const def=MEDALS[m.id];
  const label=m.level!=null?`第 ${m.level} 关`:'全局';
  console.log(`  ${def.name}: ${label}${m.value!=null?' · '+m.value:''}`);
});

console.log('\n=== 老存档兼容（无medals 字段）===');
const mem={};
const st2={getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=v},removeItem:k=>{delete mem[k]},keys:()=>Object.keys(mem)};
const old=JSON.parse(JSON.stringify(S().data)); delete old.medals;
mem['sx_save']=JSON.stringify(old);
const w=new SaveManager(st2,()=>1); w.load();
console.log('  缺 medals 的旧档 → 自动补齐:',Array.isArray(w.data.medals.items)?'✅':'❌');
console.log('  可正常授予:',w.grantMedal('combo_30',{value:31})?'✅':'❌');
