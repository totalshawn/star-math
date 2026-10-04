/**
 * 渲染冒烟测试：用最小 Canvas 桩验证绘制逻辑可完整执行
 * 目的：不依赖浏览器，验证「三场景 draw() 能否无异常跑完」
 */
let drawCalls=0, fillCalls=0, strokeCalls=0, textCalls=0, imageCalls=0, gradients=0;
function stubCtx(){
  const noop=()=>{};
  return new Proxy({
    canvas:{width:672,height:1280},
    createLinearGradient:()=>{gradients++;return {addColorStop:noop};},
    createRadialGradient:()=>{gradients++;return {addColorStop:noop};},
    measureText:t=>({width:(t?t.length:0)*12}),
    save:noop,restore:noop,beginPath:noop,closePath:noop,moveTo:noop,lineTo:noop,
    arc:noop,arcTo:noop,ellipse:noop,quadraticCurveTo:noop,bezierCurveTo:noop,
    fill:()=>{fillCalls++;},stroke:()=>{strokeCalls++;},clip:noop,
    fillRect:()=>{fillCalls++;},strokeRect:()=>{strokeCalls++;},clearRect:noop,
    fillText:t=>{if(t!==undefined&&t!==null)textCalls++;},
    strokeText:noop,drawImage:()=>{imageCalls++;},
    translate:noop,rotate:noop,scale:noop,setTransform:noop,
    setLineDash:noop,getLineDash:()=>[],
    globalAlpha:1,globalCompositeOperation:'source-over',
    fillStyle:'',strokeStyle:'',lineWidth:1,font:'',textAlign:'',textBaseline:'',
    lineCap:'',lineJoin:''
  },{
    get(t,k){ if(k in t) return t[k]; return noop; },
    set(t,k,v){ t[k]=v; return true; }
  });
}
const stubImg={width:295,height:469};
const stubPlatform={
  isWX:false, name:'stub',
  loadImage:()=>stubImg,
  vibrate:()=>false,
  assetPath:p=>p,
  raf:cb=>setTimeout(()=>cb(Date.now()),16),
  getSystemInfoSync:()=>({windowWidth:430,windowHeight:860,pixelRatio:2}),
  onVisibility:()=>{}, bindTouch:()=>{}
};

const {GameScene}=await import('../miniprogram/scenes/game-scene.js');
const {HomeScene}=await import('../miniprogram/scenes/home-scene.js');
const {ResultScene}=await import('../miniprogram/scenes/result-scene.js');
const {Viewport}=await import('../miniprogram/core/platform.js');
const {SaveManager}=await import('../miniprogram/store/save.js');

const mem={};
const storage={getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=v},removeItem:k=>{delete mem[k]},keys:()=>Object.keys(mem)};
const save=new SaveManager(storage,()=>Date.now()); save.load();

const ctx=stubCtx();
const vp=new Viewport({width:430,height:860,dpr:2,designW:672,designH:1280,safeTop:24,safeBottom:24});
const fakeApp={save,platform:stubPlatform,audio:null,
  startGame(){},goHome(){},onGameOver(){},
  checkChallengeUnlock:()=>save.checkChallengeUnlock(),
  challengeQuotaLeft:()=>save.challengeQuotaLeft(),
  challengeNeedMore:()=>save.challengeNeedMore(),
  recordChallengeRun:s=>save.recordChallengeRun(s)};

console.log('=== 三场景渲染冒烟测试 ===');
let ok=0, fail=0;
for(const [name,Cls,params] of [
  ['主页',HomeScene,{}],
  ['游戏',GameScene,{}],
  ['结算',ResultScene,{summary:{score:5200,maxCombo:18,correct:28,wrong:3,dl:7.5,level:4,stars:4,comment:['计算小达人！','太厉害啦，下次挑战更高年级！']}}]
]){
  try{
    const sc=new Cls(fakeApp);
    sc.enter(params);
    for(let i=0;i<30;i++) sc.update(1/60);
    sc.draw(ctx,vp);
    ok++;
    console.log(`  ✅ ${name}：enter+30帧update+draw 全部完成`);
  }catch(e){
    fail++;
    console.log(`  ❌ ${name}：${e.message}`);
    console.log(`     ${(e.stack||'').split('\n')[1]?.trim()}`);
  }
}
console.log(`\n绘制统计：fill ${fillCalls} 次 | stroke ${strokeCalls} 次 | 文字 ${textCalls} 次 | 图片 ${imageCalls} 次 | 渐变 ${gradients} 次`);
console.log(`\n${fail===0?'✅':'❌'} 渲染冒烟：${ok} 通过 / ${fail} 失败`);

// 逻辑正确性补充校验
console.log('\n=== 游戏场景逻辑校验 ===');
const g=new GameScene(fakeApp);
g.enter({});
g.enterIntro=()=>{g.phase='question';g.bannerPhase='none';};
g.newQuestion();
console.log('  题目:',g.question.expr,'=',g.question.answer);
console.log('  题型标签:',g.question.label);
const before=g.gs.score;
g.submitResult(true);
console.log('  答对 → 分数',before,'→',g.gs.score,'| 连击',g.gs.combo,'| 阶段',g.phase);
g.newQuestion();
g.submitResult(false);
console.log('  答错 → 失误',g.gs.wrong,'| 连击',g.gs.combo,'(应为0)');
process.exit(fail?1:0);
