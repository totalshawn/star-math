import {SaveManager,createStorage,defaultSave,checksum,mistakeKey} from '../miniprogram/store/save.js';

// 内存存储
const mem={};
const storage={getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=v},removeItem:k=>{delete mem[k]},keys:()=>Object.keys(mem)};

console.log('=== 1. 全新存档 ===');
let sm=new SaveManager(storage,()=>1700000000000);
let d=sm.load();
console.log('  年级',d.settings.grade,'主角',d.profile.character,'已解锁角色数',d.collection.unlocked.length);
console.log('  六年级档位齐全:',Object.keys(d.gradeProgress).join(','));

console.log('\n=== 2. 正常写入并重新加载 ===');
sm.submitRun({score:5200,maxCombo:25,correct:30,wrong:5,dl:7.5,level:4,stars:4});
const before=sm.data.global.bestScore;
const sm2=new SaveManager(storage,()=>1700000001000);
const d2=sm2.load();
console.log('  最高分写入',before,'| 重载后',d2.global.bestScore,'| 一致:',before===d2.global.bestScore);
console.log('  最高连击',d2.global.bestCombo,'| 闯关数',d2.gradeProgress[1].levelsCleared);

console.log('\n=== 3. 存档损坏 → 应修补而非清空 ===');
const good=mem['sx_save'];
mem['sx_save']=good.replace(/"bestScore":5200/,'"bestScore":5200').replace(/"maxCombo":25/,'"maxCombo":"CORRUPT"');
const sm3=new SaveManager(storage,()=>1700000002000);
const d3=sm3.load();
console.log('  最高分仍为',d3.global.bestScore,'(未被清空)','| maxCombo自动修复为',d3.global.bestCombo);
console.log('  loadError标记:',sm3.loadError);

console.log('\n=== 4. 主档彻底损坏 → 备份兜底 ===');
mem['sx_save']='{{{完全损坏的JSON';
const sm4=new SaveManager(storage,()=>1700000003000);
const d4=sm4.load();
console.log('  从备份恢复，最高分:',d4.global.bestScore);

console.log('\n=== 5. 主档+备份全坏 → 全新档案（唯一重置分支）===');
mem['sx_save']='broken'; mem['sx_save_bak']='also-broken';
const sm5=new SaveManager(storage,()=>1700000004000);
const d5=sm5.load();
console.log('  全新档案最高分:',d5.global.bestScore,'(应为0)','结构完整:',!!d5.gradeProgress[6]);

console.log('\n=== 6. 缺字段的半残存档 → 补齐 ===');
mem['sx_save']=JSON.stringify({meta:{schema:1},settings:{grade:99},profile:{character:'未解锁角色'}});
const sm6=new SaveManager(storage,()=>1700000005000);
const d6=sm6.load();
console.log('  非法年级99→修复为',d6.settings.grade);
console.log('  未解锁角色→修复为',d6.profile.character);
console.log('  缺失字段已补齐:',!!d6.global&&!!d6.mistakeBook&&!!d6.daily);

console.log('\n=== 7. 跨字段一致性修复 ===');
mem['sx_save']=JSON.stringify((()=>{const t=defaultSave();t.settings.grade=2;t.global.totalCorrect=999;t.global.totalAnswered=5;t.global.bestScore=1;t.settings.dlOffset=88;t.gradeProgress[1].maxDL=999;return t;})());
const d7=new SaveManager(storage,()=>1700000006000).load();
console.log('  正确数999>答题数5 → 修正为',d7.global.totalCorrect,'(应≤5)');
console.log('  全局最高分1 < 单年级0 → 修正为',d7.global.bestScore);
console.log('  DL偏移88 → 收敛为',d7.settings.dlOffset);
console.log('  难度等级999 → 收敛为',d7.gradeProgress[1].maxDL);

console.log('\n=== 8. 错题本去重（交换律归一）===');
console.log('  3+8 →',mistakeKey({op:'add',a:3,b:8}));
console.log('  8+3 →',mistakeKey({op:'add',a:8,b:3}),'(应与上条相同)');
console.log('  3×8 →',mistakeKey({op:'mul',a:3,b:8}));

const sm8=new SaveManager(storage,()=>1700000007000); sm8.load();
sm8.recordMistake({op:'add',a:3,b:8,expr:'3 + 8',answer:11});
sm8.recordMistake({op:'add',a:8,b:3,expr:'8 + 3',answer:11});
sm8.recordMistake({op:'sub',a:9,b:4,expr:'9 - 4',answer:5});
console.log('  记录3题(其中2题等价) → 错题本条目数:',sm8.data.mistakeBook.items.length,'(应为2)');

console.log('\n=== 9. 写盘延迟合并 ===');
let writes=0; const st2={getItem:k=>null,setItem:()=>{writes++},removeItem:()=>{},keys:()=>[]};
const sm9=new SaveManager(st2,()=>1); sm9.load();
writes=0;
for(let i=0;i<20;i++) sm9.setSetting('sound',true);
console.log('  20次修改 → 实际写盘次数:',writes,'(应为1，延迟合并生效)');
sm9.flush();
console.log('  flush后:',writes);

console.log('\n=== 10. 写入失败降级抢救 ===');
let allowBig=true;
const st3={getItem:()=>null,setItem:(k,v)=>{if(v.length>1500&&allowBig){throw new Error('QuotaExceeded');}mem[k]=v;},removeItem:()=>{},keys:()=>[]};
const sm10=new SaveManager(st3,()=>1); sm10.load();
for(let i=0;i<80;i++) sm10.recordMistake({op:'add',a:i,b:3,expr:`${i} + 3`,answer:i+3});
console.log('  塞入大量错题后写入…');
allowBig=false;  // 之后开始拒绝大包
sm10.data.mistakeBook.items=[];
const ok=sm10._writeNow();
console.log('  裁剪错题本后写入:',ok?'成功':'失败');
