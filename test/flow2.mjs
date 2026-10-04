const noop=()=>{};
function stubCtx(){return new Proxy({canvas:{width:672,height:1280},
  createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop}),
  measureText:t=>({width:(t||'').length*12}),save:noop,restore:noop,beginPath:noop,closePath:noop,
  moveTo:noop,lineTo:noop,arc:noop,ellipse:noop,quadraticCurveTo:noop,fill:noop,stroke:noop,clip:noop,
  fillRect:noop,strokeRect:noop,clearRect:noop,fillText:noop,strokeText:noop,drawImage:noop,
  translate:noop,rotate:noop,scale:noop,setTransform:noop,setLineDash:noop,getLineDash:()=>[],
  fillStyle:'',strokeStyle:'',lineWidth:1,font:'',textAlign:'',textBaseline:'',lineCap:'',lineJoin:'',
  globalAlpha:1,globalCompositeOperation:'source-over'},{get:(t,k)=>k in t?t[k]:noop,set:(t,k,v)=>{t[k]=v;return true}});}
const {GameScene}=await import('../miniprogram/scenes/game-scene.js');
const {SaveManager}=await import('../miniprogram/store/save.js');
const {Viewport}=await import('../miniprogram/core/platform.js');
const mem={};const storage={getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{mem[k]=v},removeItem:k=>{delete mem[k]},keys:()=>Object.keys(mem)};
const save=new SaveManager(storage,()=>Date.now());save.load();save.data.settings.grade=3;
let over=null;
const app={save,platform:{isWX:false,loadImage:()=>({width:295,height:469}),vibrate:()=>true,assetPath:p=>p,raf:cb=>setTimeout(()=>cb(Date.now()),16),getSystemInfoSync:()=>({windowWidth:430,windowHeight:860,pixelRatio:2}),onVisibility:()=>{},bindTouch:()=>{}},audio:null,startGame(){},goHome(){},onGameOver:(g,s)=>{over=s;},checkChallengeUnlock:()=>false,challengeQuotaLeft:()=>0,challengeNeedMore:()=>3,recordChallengeRun(){}};
const ctx=stubCtx();
const vp=new Viewport({width:430,height:860,dpr:2,designW:672,designH:1280,safeTop:24,safeBottom:24});
const g=new GameScene(app);
g.enter({});
console.log('enter 后: phase='+g.phase+' bannerPhase='+g.bannerPhase+' question='+(g.question?'有':'无'));
// 按真实流程推进：intro(0.28) → stay(0.9) → out(0.24) → newQuestion
let steps=0;
while(g.phase==='intro' && steps<200){ g.update(1/60); steps++; }
console.log('intro 推进 '+steps+' 帧后: phase='+g.phase+' bannerPhase='+g.bannerPhase+' question='+(g.question?'有':'无'));
// 完整跑一局：每帧该答就答
let answered=0, frames=0;
while(!over && frames<60*120){
  g.update(1/60); g.draw(ctx,vp); frames++;
  if(g.phase==='question' && g.buffer && !g.buffer.isLocked){
    const ans=g.question.answerText||String(g.question.answer);
    for(const ch of ans){ if(ch==='/')continue; g.onKey(ch); }
    answered++;
  }
}
console.log(`\n跑了 ${(frames/60).toFixed(0)} 秒，输入 ${answered} 次`);
console.log(`  答对 ${g.gs.correct} 答错 ${g.gs.wrong} | 关卡 ${g.gs.level} | 分数 ${g.gs.score} | 最高连击 ${g.gs.maxCombo} | DL ${g.gs.dl}`);
console.log(`  结算: ${over?('分数'+over.score+' 星级'+over.stars+' 「'+over.comment[0]+'」'):'未触发'}`);
