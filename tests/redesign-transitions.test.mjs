import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTransitionRunner} from '../public/redesign/transitions.js';

test('actions still run exactly once when transitions are unavailable or cannot start',()=>{
  for(const [document,enabled] of [[{},true],[{startViewTransition(){throw new Error('inactive document')}},true],[{startViewTransition(){throw new Error('must not start')}},false]]){
    let applied=0,finished=0;
    createTransitionRunner(document,{enabled}).run(()=>applied++,()=>finished++);
    assert.equal(applied,1);assert.equal(finished,1);
  }
});

test('skipped snapshots do not reject page actions or leak unhandled rejections',async()=>{
  let applied=0,skipped=0,finished=0;
  const document={startViewTransition(update){
    const updateCallbackDone=Promise.resolve().then(update);
    return {ready:Promise.reject(new Error('snapshot skipped')),updateCallbackDone,finished:updateCallbackDone,skipTransition(){skipped++}};
  }};
  const transitions=createTransitionRunner(document);
  transitions.run(()=>applied++);
  transitions.run(()=>applied++,()=>finished++);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(applied,2);assert.equal(skipped,1);assert.equal(finished,1);
});

test('disposed page transitions cannot apply deferred DOM changes',async()=>{
  let applied=0,skipped=0;
  const document={startViewTransition(update){
    const updateCallbackDone=Promise.resolve().then(update);
    return {ready:Promise.resolve(),updateCallbackDone,finished:updateCallbackDone,skipTransition(){skipped++}};
  }};
  const transitions=createTransitionRunner(document);
  transitions.run(()=>applied++);
  transitions.dispose();
  transitions.run(()=>applied++);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(applied,0);assert.equal(skipped,1);
});
