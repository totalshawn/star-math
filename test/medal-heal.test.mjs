/** 纪念章自愈与R1-b 兜底测试（每个用例独立 storage，避免相互污染） */
import {SaveManager, REWARD_LEAK_FIELDS, MEDALS} from '../miniprogram/store/save.js';

function mkStore(){
  const mem={};
  return {mem, st:{getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=v},removeItem:k=>{delete mem[k]},keys:()=>Object.keys(mem)}};
}
function S(st){const sm=new SaveManager(st,()=>1700000000000);sm.load();return sm;}
let pass=0,fail=0;
const ck=(name,ok)=>{ok?pass++:fail++;console.log(`  ${ok?'✅':'❌'} ${name}`);};

console.log('=== R1-b 泄漏兜底 ===');
{
  const {st}=mkStore(); const a=S(st);
  a.grantMedal('combo_30',{value:31});
  a.data.medals.items[0].stars=999; a.data.medals.items[0].coins=888;
  a.save(true);
  const b=new SaveManager(st,()=>1); b.load();
  const it=b.data.medals.items[0];
  ck('注入 stars 被删除', it.stars===undefined);
  ck('注入 coins 被删除', it.coins===undefined);
  ck('纪念章本身保留', b.hasMedal('combo_30'));
  ck('泄漏字段清单已定义', REWARD_LEAK_FIELDS.length>=5);
}

console.log('\n=== key 完整性（手改后重算）===');
{
  const {st}=mkStore(); const c=S(st);
  c.grantMedal('precision_90',{level:23,value:91});
  c.data.medals.items[0].key='篡改的key'; c.save(true);
  const d=new SaveManager(st,()=>1); d.load();
  ck('key 被重算为 precision_90@23', d.data.medals.items[0].key==='precision_90@23');
  ck('判重仍生效', d.grantMedal('precision_90',{level:23})===false);
}

console.log('\n=== G13-5：key 与 perLevel 维度匹配 ===');
for(const [id,lvl] of [['first_perfect_chapter',10],['precision_90',7],['combo_30',null],['flawless_clear',null]]){
  const {st}=mkStore(); const e=S(st);
  e.grantMedal(id,{level:lvl,value:1});
  const m=e.data.medals.items[0];
  const per=MEDALS[id].perLevel;
  const expect=(per && m.level!=null)?`${m.id}@${m.level}`:m.id;
  ck(`${id} (perLevel=${per}) → ${m.key}`, m.key===expect);
}

console.log('\n=== 全局唯一 vs 分关独立 ===');
{
  const {st}=mkStore(); const f=S(st);
  f.grantMedal('flawless_clear',{level:18,value:10});
  f.grantMedal('flawless_clear',{level:23,value:10});  // 应跳过
  ck('flawless_clear 跨关只一枚', f.data.medals.items.filter(x=>x.id==='flawless_clear').length===1);
  const g=S(st);
  g.grantMedal('precision_90',{level:23,value:90});
  g.grantMedal('precision_90',{level:24,value:90});
  ck('precision_90 每关各一枚', g.data.medals.items.filter(x=>x.id==='precision_90').length===2);
}

console.log('\n=== 未知 id 丢弃 ===');
{
  const {st}=mkStore(); const h=S(st);
  h.grantMedal('combo_30',{value:30});
  h.data.medals.items.push({key:'future@v1',id:'future_medal_v1',level:null,at:1});
  h.save(true);
  const i=new SaveManager(st,()=>1); i.load();
  ck('未来版本勋章被丢弃', !i.data.medals.items.some(x=>x.id==='future_medal_v1'));
  ck('正常勋章仍在', i.hasMedal('combo_30'));
}

console.log('\n=== 重复 key 去重 ===');
{
  const {st}=mkStore(); const j=S(st);
  j.grantMedal('combo_30',{value:30});
  j.data.medals.items.push({key:'combo_30',id:'combo_30',level:null,value:99,at:2});
  j.save(true);
  const k=new SaveManager(st,()=>1); k.load();
  ck(`同key 2条 → 保留 ${k.data.medals.items.length} 条`, k.data.medals.items.length===1);
}

console.log(`\n${fail===0?'✅':'❌'} ${pass} 通过 / ${fail} 失败`);
process.exit(fail?1:0);
