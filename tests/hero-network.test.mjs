import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAPS, OUTPUTS, PATH, STEP_SECONDS, featureMaps, fieldAt, initializeHeroNetwork, predictedClass, receptiveField} from '../public/redesign/hero-network.js';

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
