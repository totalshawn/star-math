import {Viewport} from '../miniprogram/core/platform.js';
console.log('=== Viewport 坐标换算（420x900 窗口, 2x dpr）===');
const vp=new Viewport({width:420,height:900,dpr:2,designW:672,designH:1280,safeTop:24,safeBottom:24});
console.log('  scale =',vp.scale.toFixed(4),' offX =',vp.offX.toFixed(1),' offY =',vp.offY.toFixed(1));
console.log('  设计稿 672x1280 → 实际应显示', (672*vp.scale).toFixed(0)+'x'+(1280*vp.scale).toFixed(0));
console.log('  窗口420x900 → 溢出?', (1280*vp.scale>900?'❌ 高度溢出':'✅ 高度合适'));
console.log('  toDesign(210,450) =',JSON.stringify(vp.toDesign(210,450)));
console.log('  toDesign(0,0) =',JSON.stringify(vp.toDesign(0,0)));

console.log('\n=== 各种常见机型===');
for(const [w,h,dpr,label] of [[375,667,2,'iPhone SE'],[390,844,3,'iPhone 14'],[420,900,2,'测试窗口'],[360,780,3,'安卓小屏'],[430,932,3,'iPhone Pro Max']]){
  const v=new Viewport({width:w,height:h,dpr,designW:672,designH:1280,safeTop:24,safeBottom:24});
  const visW=672*v.scale, visH=1280*v.scale;
  console.log(`  ${label.padEnd(16)} ${w}x${h}@${dpr}x → scale ${v.scale.toFixed(3)} 显示 ${visW.toFixed(0)}x${visH.toFixed(0)} ${visH>h*1.02?'⚠️超出高':'✅'}`);
}
