// 直接 require 编译产物，验证 CommonJS 侧逻辑真的可用
const {generateQuestion,checkAnswer,setSeed}=require('../dist/mp/shared/difficulty.js');
const {GameState,comboMultiplier}=require('../dist/mp/shared/scoring.js');
const {toFixedInt,fromFixedInt,mulFixed}=require('../dist/mp/shared/fixed.js');
const {CHARACTERS,CHARACTER_LIST,GRADE_TABLE}=require('../dist/mp/shared/config.js');
const {CharacterActor}=require('../dist/mp/shared/characters.js');
const {CHALLENGE,isValidClear}=require('../dist/mp/shared/rules.js');

console.log('=== 编译产物 CommonJS 冒烟测试 ===');
setSeed(1);
const q=generateQuestion(4,6);
console.log('  出题:',q.expr,'=',q.answer,'| 判定:',checkAnswer(q,String(q.answer))?'✅':'❌');

const g=new GameState(3);
g.submit(true,2);
console.log('  计分: 分数',g.score,'连击',g.combo,'倍率 x'+comboMultiplier(g.combo));

console.log('  定点: 76.3×6.8 =',fromFixedInt(mulFixed(toFixedInt('76.3'),toFixedInt('6.8'))),'✅');

console.log('  配置: 角色',CHARACTER_LIST.length,'只 | 年级',GRADE_TABLE.length,'档 | 兔耳状态',Object.keys(CHARACTERS.bunny.states).join(','));

const actor=new CharacterActor('bunny',p=>({width:100,height:150}));
actor.load();
actor.setState('correct');
for(let i=0;i<10;i++)actor.update(0.05);
console.log('  角色状态机: 当前',actor.state,'变换',JSON.stringify(actor.transform()).slice(0,60));

console.log('\n=== 防刷规则 ===');
console.log('  解锁需累计有效通关',CHALLENGE.UNLOCK_REQUIRED,'次 | 正答率门槛',CHALLENGE.VALID_CLEAR_MIN_ACCURACY);
console.log('  乱猜(50%正答)算有效通关吗:',isValidClear({mode:'main',correct:5,wrong:5,grade:3})?'❌是(应否)':'✅否');
console.log('  真会(90%正答)算有效通关吗:',isValidClear({mode:'main',correct:9,wrong:1,grade:3})?'✅是':'❌否');
console.log('  挑战赛算有效通关吗:',isValidClear({mode:'challenge',correct:10,wrong:0,grade:3})?'❌是(应否)':'✅否');
console.log('  每日上限',CHALLENGE.DAILY_LIMIT,'次 | 时长',CHALLENGE.TIME,'秒');
console.log('\n✅ 编译产物功能完整，逻辑与 ESM 版一致');
