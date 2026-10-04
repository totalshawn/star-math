/** 端到端：一整局 10 题 → 关卡切换 → 时间到 → 结算 */
const noop=()=>{};
function stubCtx(){return new Proxy({canvas:{width:672,height:1280},
  createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),
  measureText:t=>({width:(t||'').length*12}),save:noop,restore:noop,beginPath:noop,closePath:noop,
  moveTo:noop,lineTo:noop,arc:noop,ellipse:noop,quadraticCurveTo:noop,fill:noop,stroke:noop,clip:noop,
  fillRect:noop,strokeRect:noop,clearRect:noop,fillText:noop,strokeText:noop,drawImage:noop,
  translate:noop,rotate:noop,scale:noop,setTransform:noop,setLineDash:noop,getLineDash:()=>[],
  fillStyle:'',strokeStyle:'',lineWidth:1,font:'',textAlign:'',textBaseline:'',lineCap:'',lineJoin:'',
  globalAlpha:1,globalCompositeOperation:'source-over'},{get:(t,k)=>k in t?t[k]:noop,set:(t,k,v)=>{t[k]=v;return true}});}

const stubImg={width:295,height:469};
let vibrates=0;
const platform={isWX:false,loadImage:()=>stubImg,vibrate:()=>{vibrates++;return true;},
  assetPath:p=>p,raf:cb=>setTimeout(()=>cb(Date.now()),16),
  getSystemInfoSync:()=>({windowWidth:430,windowHeight:860,pixelRatio:2}),onVisibility:()=>{},bindTouch:()=>{}};
const {GameScene}=await import('../miniprogram/scenes/game-scene.js');
const {SaveManager}=await import('../miniprogram/store/save.js');
const {Viewport}=await import('../miniprogram/core/platform.js');

const mem={};
const storage={getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=v},removeItem:k=>{delete mem[k]},keys:()=>Object.keys(mem)};
const save=new SaveManager(storage,()=>Date.now()); save.load();
save.data.settings.grade=3;
let overCalled=null;
const app={save,platform,audio:null,startGame(){},goHome(){},
  onGameOver(gs,sum){overCalled=sum;},checkChallengeUnlock:()=>false,challengeQuotaLeft:()=>0,
  challengeNeedMore:()=>3,recordChallengeRun(){}};

const ctx=stubCtx();
const vp=new Viewport({width:430,height:860,dpr:2,designW:672,designH:1280,safeTop:24,safeBottom:24});
const g=new GameScene(app);
g.enter({}); g.enterIntro=()=>{}; g.newQuestion();
g.bannerPhase='none';

console.log('=== 完整一局：连续答对10 题 ===');
let answered=0;
for(let step=0;step<3000 && !overCalled;step++){
  g.update(1/60);
  g.draw(ctx,vp);
  if(g.phase==='question' && g.buffer && !g.buffer.isLocked){
    // 模拟正确输入
    const ans=g.question.answerText||String(g.question.answer);
    for(const ch of ans){ if(ch==='/')continue; g.onKey(ch); }
    answered++;
  }
}
console.log(`  答了${answered} 题 | 关卡 ${g.gs.level} | 分数 ${g.gs.score} | 连击 ${g.gs.maxCombo} | DL ${g.gs.dl}`);
console.log(`  答对 ${g.gs.correct} / 答错 ${g.gs.wrong} | 本关进度 ${g.correctThisLevel}/10`);
console.log(`  触觉反馈触发 ${vibrates} 次`);
console.log(`  结算回调: ${overCalled?('已触发 → 分数'+overCalled.score+' 星级'+overCalled.stars+' 「'+overCalled.comment[0]+'」'):'未触发（时间未耗尽，属正常）'}`);

console.log('\n=== 时间耗尽路径 ===');
const g2=new GameScene(app);
g2.enter({}); g2.newQuestion();
g2.bannerPhase='none';
overCalled=null;
// 不答题，直接把时间跑完
for(let i=0;i<60*70;i++){ g2.update(1/60); if(overCalled)break; }
console.log(`  70秒后结算回调: ${overCalled?'✅ 已触发（分数'+overCalled.score+'）':'❌ 未触发'}`);
console.log(`  游戏状态: ${g2.gs.status} (应为 gameover)`);

console.log('\n=== 关卡切换路径 ===');
const g3=new GameScene(app);
g3.enter({}); g3.newQuestion();
g3.bannerPhase='none';
g3.gs.answered=9;  g3.correctThisLevel=9;
g3.submitResult(true);
console.log(`  第10题答后: phase=${g3.phase}(应 feedback) answered=${g3.gs.answered}`);
for(let i=0;i<200;i++) g3.update(1/60);
console.log(`  推进后: phase=${g3.phase} 关卡=${g3.gs.level}(应为2)`);
