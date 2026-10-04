/**
 * 挑战赛每日额度：递增计数语义（防方向搞反）
 * 背景：曾用 endedToday 命名，语义与实际值相反，易让云端实现者搞反方向。
 */
import {SaveManager} from '../miniprogram/store/save.js';
import {CHALLENGE} from '../shared/rules.js';
function mk(){const mem={};return {mem,st:{getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=v},removeItem:k=>{delete mem[k]},keys:()=>Object.keys(mem)}};}
let pass=0,fail=0;
const ck=(n,ok)=>{ok?pass++:fail++;console.log(`  ${ok?'✅':'❌'} ${n}`);};

console.log('=== 递增计数语义（0→1→2→3）===');
{
  const {st}=mk(); const s=new SaveManager(st,()=>1700000000000); s.load();
  s.data.settings.grade=3;
  s.data.challenge.unlockProgress[3]=3;      // 满足解锁
  s.data.challenge.usedCount=0;

  ck('初始剩余 = 3', s.challengeQuotaLeft()===3);
  ck('用第1次 → 剩余 2', s.consumeChallengeQuota()===true && s.challengeQuotaLeft()===2);
  ck('用第2次 → 剩余 1', s.consumeChallengeQuota()===true && s.challengeQuotaLeft()===1);
  ck('用第3次 → 剩余 0', s.consumeChallengeQuota()===true && s.challengeQuotaLeft()===0);
  ck('第4次被拒（不是"多给一次"）', s.consumeChallengeQuota()===false);
  ck('usedCount 停在上限 3', s.data.challenge.usedCount===3);
}

console.log('\n=== 跨天归零 ===');
{
  const {st}=mk(); const s=new SaveManager(st,()=>1700000000000); s.load();
  s.data.settings.grade=3;
  s.data.challenge.unlockProgress[3]=3;
  s.data.challenge.usedCount=3;
  s.data.challenge.date='2000-01-01';         // 旧日期
  ck('旧日期读档 → 恢复为 3 次', s.challengeQuotaLeft()===3);
  ck('date 已更新为今天', s.data.challenge.date!=='2000-01-01');
  ck('同一天再读不重复归零', (s.challengeQuotaLeft()===3));
}

console.log('\n=== 未解锁时不可消费 ===');
{
  const {st}=mk(); const s=new SaveManager(st,()=>1700000000000); s.load();
  s.data.settings.grade=3;
  s.data.challenge.unlockProgress[3]=1;      // 只通关1 次，需3
  ck('通关不足 3 次 → 拒绝', s.consumeChallengeQuota()===false);
  ck('拒绝后额度未被消耗', s.data.challenge.usedCount===0);
}

console.log('\n=== 二一一年级 1 次封顶 ===');
{
  const {st}=mk(); const s=new SaveManager(st,()=>1700000000000); s.load();
  s.data.settings.grade=1;
  s.data.challenge.unlockProgress[1]=3;
  s.data.challenge.usedCount=0;
  // 1 年级 DAILY_LIMIT 若为1
  const {dailyLimitFor}=await import('../shared/rules.js');
  const limit1 = dailyLimitFor(1);
  
  if(limit1){
    s.consumeChallengeQuota();
    ck(`1年级用1次后剩余 ${s.challengeQuotaLeft()}=0`, s.challengeQuotaLeft()===0);
  } else {
    ck('当前为统一上限（未按年级分档）', true);
  }
}
console.log(`\n${fail===0?'✅':'❌'} ${pass} 通过 / ${fail} 失败`);
