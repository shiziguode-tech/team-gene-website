import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAPS, OUTPUTS, PATH, STEP_SECONDS, featureMaps, fieldAt, fitFrame, initializeHeroNetwork, predictedClass, predictionAt, receptiveField, restingPoints} from '../public/redesign/hero-network.js';

test('feature maps form a valid 2×2 convolution chain with fixed activations',()=>{
  MAPS.slice(1).forEach((g,l)=>assert.equal(g,MAPS[l]-1,'each map is one unit smaller'));
  assert.deepEqual(featureMaps(),featureMaps(),'every visit draws the same maps');
  featureMaps().forEach((map,l)=>{assert.equal(map.length,MAPS[l]**2);for(const v of map)assert.ok(v>0&&v<=1);});
});

test('the receptive field walks every unit of the last map, one neighbour at a time, and stays inside each map',()=>{
  const last=MAPS.at(-1);
  assert.equal(new Set(PATH.map(String)).size,last*last);
  for(let k=1;k<PATH.length;k++)assert.equal(Math.abs(PATH[k][0]-PATH[k-1][0])+Math.abs(PATH[k][1]-PATH[k-1][1]),1);
  for(const [a,b] of PATH)MAPS.forEach((g,l)=>{
    const {i,j,size}=receptiveField(l,a,b);
    assert.ok(i>=0&&j>=0&&i+size<=g&&j+size<=g,`map ${l} patch at ${a},${b}`);
  });
  for(const at of PATH){const c=predictedClass(at);assert.ok(Number.isInteger(c)&&c>=0&&c<OUTPUTS);}
});

test('the field slides smoothly between path positions and ping-pongs without jumping',()=>{
  let prev=fieldAt(0);
  assert.deepEqual([prev.a,prev.b],PATH[0]);
  const cycle=(PATH.length-1)*2*STEP_SECONDS;
  for(let t=.02;t<=cycle*1.5;t+=.02){
    const now=fieldAt(t);
    assert.ok(Math.hypot(now.a-prev.a,now.b-prev.b)<.12,`no jump at ${t.toFixed(2)}s`);
    if(now.since>=0)assert.deepEqual([now.a,now.b],now.to,'settled on a path position');
    prev=now;
  }
});

test('no output is lit until the first forward pass reaches it; later predictions fade only while the field moves',()=>{
  const firstSettle=.4*STEP_SECONDS;
  for(let t=-2;t<firstSettle+MAPS.length*.1;t+=.01)assert.equal(predictionAt(t).glow,0,`dark at ${t.toFixed(2)}s`);
  const lit=predictionAt(firstSettle+MAPS.length*.1+.3);
  assert.ok(lit.glow>.99);assert.equal(lit.winner,predictedClass(PATH[1]));
  const moving=predictionAt(STEP_SECONDS+.1);
  assert.ok(moving.glow>0&&moving.glow<1,'the previous prediction fades out');assert.equal(moving.winner,predictedClass(PATH[1]));
  assert.equal(predictionAt(STEP_SECONDS+.5).glow,0);
});

test('the network fits beside the hero text and is never mirrored, even when the text leaves no room',()=>{
  const inside=(points,[x0,x1,y0,y1])=>points.every(p=>p.x>=x0-.5&&p.x<=x1+.5&&p.y>=y0-.5&&p.y<=y1+.5);
  // Canvas sizes of the 1024–1920 px layouts, the measured free space beside the text, and text wider than the canvas.
  for(const [w,h,left,right] of [[573,860,177,562],[717,860,205,693],[806,860,62,746],[1075,1080,230,1000],[806,860,900,746],[600,860,2000,580]]){
    const frame=fitFrame(w,h,left,right);
    assert.ok(frame.S>0&&frame.H>0&&frame.F>0,`${w}×${h} has a positive size`);
    const {maps,outputs}=restingPoints(frame);
    const all=[...maps.flat(),...outputs];
    const room=Math.max(0,Math.min(left,right-Math.min(right,240)));
    assert.ok(inside(all,[room,right,h*.18,h*.82]),`${w}×${h} stays inside its space`);
    const inputX=maps[0].reduce((sum,p)=>sum+p.x,0)/4;
    for(const o of outputs)assert.ok(o.x>inputX,'outputs stay to the right of the input map');
  }
  const narrow=fitFrame(390,800);
  assert.ok(narrow.narrow&&narrow.S>0&&narrow.H>0);
});

function harness({reduced}){
  const calls={arc:0,peach:0,frames:0,cancelled:0};
  const handlers={};
  const ctx=new Proxy({},{
    get:(target,key)=>key in target?target[key]:key==='arc'?()=>{calls.arc++;}:key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},
    set:(target,key,value)=>{ if((key==='fillStyle'||key==='strokeStyle')&&String(value).startsWith('rgba(240,170,132'))calls.peach++; target[key]=value; return true; },
  });
  const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({width:800,height:860})};
  const host={getBoundingClientRect:()=>({left:0,top:0,width:1440,height:860})};
  const cleanups=[];
  const previous=globalThis.document;
  globalThis.document={hidden:false};
  try {
    initializeHeroNetwork(canvas,host,{
      reduced,cleanups,
      listen:(target,event,callback)=>{ handlers[event]=callback; },
      observe:(type,callback)=>({observe(){ handlers[type]=callback; }}),
      requestAnimationFrame:()=>++calls.frames,
      cancelAnimationFrame:()=>{ calls.cancelled++; },
    });
    handlers.IntersectionObserver([{isIntersecting:true}]);
  } finally { globalThis.document=previous; }
  return {calls,handlers,cleanups};
}

test('reduced motion draws one still frame with the receptive field and prediction lit, and never animates',()=>{
  const {calls}=harness({reduced:true});
  const units=MAPS.reduce((sum,g)=>sum+g*g,0)+OUTPUTS;
  assert.ok(calls.arc>=units,'every unit is drawn');
  assert.ok(calls.peach>0,'the still frame shows the receptive field');
  assert.equal(calls.frames,0);
});

test('the animation runs only while the hero is on screen',()=>{
  const {calls,handlers,cleanups}=harness({reduced:false});
  assert.equal(calls.frames,1);
  globalThis.document={hidden:false};
  try { handlers.IntersectionObserver([{isIntersecting:false}]); } finally { delete globalThis.document; }
  assert.equal(calls.cancelled,1);
  cleanups.forEach(fn=>fn());
});
