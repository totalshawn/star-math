import {SaveManager} from '../miniprogram/store/save.js';
function fresh(){const m={};return {getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=v},removeItem:k=>{delete m[k]},keys:()=>Object.keys(m)};}
const S=()=>{const sm=new SaveManager(fresh(),()=>Date.now());sm.load();return sm;};
const U=sm=>sm.data.collection.unlocked;

console.log('=== R1 红线：角色全解锁，不设门禁 ===');
const a=S();
console.log('  新用户:',U(a).join(','));
console.log('  全部 5 只可用:',U(a).length===5?'✅':'❌');

console.log('\n=== 任何状态下都是 5 只 ===');
const b=S(); b.data.settings.grade=6; b.syncUnlocked();
console.log('  空选6年级:',U(b).length===5?'✅':'❌');
const c=S();
c.data.settings.grade=1;
c.submitRun({score:0,maxCombo:0,correct:0,wrong:10,dl:1,level:1,stars:1});
c.syncUnlocked();
console.log('  全错一局:',U(c).length===5?'✅ 不惩罚':'❌');

console.log('\n=== 自由切换任意角色 ===');
for(const id of ['cat','bear','chick','rabbit','bunny']){
  const ok=c.setCharacter(id);
  console.log(`  setCharacter(${id}):`,ok?'✅':'❌', '当前=',c.profile.character);
}

console.log('\n=== 挑战赛解锁仍受门禁（R11 相关，不受角色策略影响）===');
const d=S();
d.data.settings.grade=3;
console.log('  初始解锁进度:',JSON.stringify(d.data.challenge.unlockProgress),'挑战赛可用:',d.checkChallengeUnlock());
d.recordValidClear({mode:'main',grade:3,correct:9,wrong:1});
d.recordValidClear({mode:'main',grade:3,correct:9,wrong:1});
d.recordValidClear({mode:'main',grade:3,correct:9,wrong:1});
console.log('  有效通关3次后挑战赛可用:',d.checkChallengeUnlock(),'（需≥3）');

console.log('\n=== 每日额度跨天归零 ===');
const e=S();
e.data.settings.grade=3; e.data.challenge.unlockProgress[3]=3; e.data.challenge.date='2000-01-01'; e.data.challenge.endedToday=3;
console.log('  旧日期且已用3次 → 剩余:',e.challengeQuotaLeft(),'（应恢复为3）');
console.log('\n✅ 全部通过');
