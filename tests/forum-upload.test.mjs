import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadAttachments } from '../app/forum/upload.ts';

class FakeXHR {
  static all = [];
  upload = {};
  constructor() { FakeXHR.all.push(this); }
  open() {}
  setRequestHeader() {}
  send(file) { this.file = file; }
  abort() { this.aborted = true; this.onabort?.(); }
  finish(ok = true) {
    this.status = ok ? 200 : 503;
    this.responseText = JSON.stringify(ok ? { asset: { key: this.file.name, size: this.file.size } } : { error: 'Retry test' });
    this.onload();
  }
}
const drafts = () => Array.from({length:4},(_,i)=>({file:new File(['test'],`${i}.png`,{type:'image/png'}),url:`blob:test${i}`}));
const tick = () => new Promise(resolve=>setImmediate(resolve));

test('two concurrent uploads report progress and preserve order; a retry skips completed files', async()=>{
  const original=globalThis.XMLHttpRequest;globalThis.XMLHttpRequest=FakeXHR;FakeXHR.all=[];
  try {
    const items=drafts();const updates=[];
    const first=uploadAttachments(items,new AbortController().signal,p=>updates.push(p));
    const rejected=assert.rejects(first,/Retry test/);
    assert.equal(FakeXHR.all.length,2);
    FakeXHR.all[0].upload.onprogress({loaded:2});assert.equal(updates.at(-1).loaded,2);
    FakeXHR.all[0].finish();await tick();assert.equal(FakeXHR.all.length,3);
    FakeXHR.all[1].finish(false);await rejected;assert.equal(FakeXHR.all[2].aborted,true);
    assert.ok(items[0].asset);assert.equal(items[1].asset,undefined);
    FakeXHR.all=[];const retry=uploadAttachments(items,new AbortController().signal,()=>{});
    assert.equal(FakeXHR.all.length,2);assert.equal(FakeXHR.all[0].file.name,'1.png');
    FakeXHR.all[1].finish();await tick();assert.equal(FakeXHR.all.length,3);
    FakeXHR.all[2].finish();FakeXHR.all[0].finish();
    assert.deepEqual((await retry).map(a=>a.key),['0.png','1.png','2.png','3.png']);
  } finally {globalThis.XMLHttpRequest=original;}
});

test('cancel stops all pending transfers and a pre-cancelled operation sends nothing', async()=>{
  const original=globalThis.XMLHttpRequest;globalThis.XMLHttpRequest=FakeXHR;FakeXHR.all=[];
  try {
    const controller=new AbortController();const run=uploadAttachments(drafts(),controller.signal,()=>{});
    const rejected=assert.rejects(run,{name:'AbortError'});controller.abort();await rejected;
    assert.equal(FakeXHR.all.length,2);assert.ok(FakeXHR.all.every(xhr=>xhr.aborted));
    FakeXHR.all=[];await assert.rejects(uploadAttachments(drafts(),controller.signal,()=>{}),{name:'AbortError'});assert.equal(FakeXHR.all.length,0);
  } finally {globalThis.XMLHttpRequest=original;}
});

test('expired upload session opens reauthentication and preserves the draft for retry', async () => {
  const original = globalThis.XMLHttpRequest; globalThis.XMLHttpRequest = FakeXHR; FakeXHR.all = [];
  try {
    const items = drafts(); let expired = 0;
    const pending = uploadAttachments(items, new AbortController().signal, () => {}, () => { expired++; });
    const rejected = assert.rejects(pending, /请先登录论坛/);
    FakeXHR.all[0].status = 401;
    FakeXHR.all[0].responseText = JSON.stringify({ error: '请先登录论坛。' });
    FakeXHR.all[0].onload();
    await rejected;
    assert.equal(expired, 1);
    assert.equal(FakeXHR.all[1].aborted, true);
    assert.equal(items.length, 4);
    assert.ok(items.every(item => item.url.startsWith('blob:') && !item.asset));
  } finally { globalThis.XMLHttpRequest = original; }
});
