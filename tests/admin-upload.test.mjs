import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAdminFiles,sendAdminFile} from '../lib/admin-upload.ts';

const file=(type='image/png',size=10)=>({name:'test',type,size});
test('CMS validates the entire batch, including empty, unsupported, oversized and excess files',()=>{
  assert.equal(validateAdminFiles([file(),file('video/mp4')],'media',0),'');
  assert.match(validateAdminFiles([file(),file('image/svg+xml')],'media',0),/支持/);
  assert.match(validateAdminFiles([file(),file('image/png',0)],'media',0),/空文件/);
  assert.match(validateAdminFiles([file('image/png',50*1024*1024+1)],'media',0),/50 MB/);
  assert.equal(validateAdminFiles([file('image/png',50*1024*1024)],'media',0),'');
  assert.match(validateAdminFiles([file('video/mp4')],'modelImages',0),/仅支持图片/);
  assert.match(validateAdminFiles([file(),file()],'titleImages',0),/只能上传一张/);
  assert.equal(validateAdminFiles([file()],'titleImages',1),'');
  assert.match(validateAdminFiles([file(),file()],'media',7),/最多添加 8/);
});

class FakeXHR {
  static all=[];upload={};headers={};
  constructor(){FakeXHR.all.push(this);}
  open(){}
  setRequestHeader(name,value){this.headers[name]=value;}
  send(file){this.file=file;}
  abort(){this.aborted=true;this.onabort?.();}
  finish(status,body){this.status=status;this.responseText=body;this.onload();}
}
test('100% transferred waits for server response; cancellation cleans up completed transfers',async()=>{
  const original=globalThis.XMLHttpRequest;globalThis.XMLHttpRequest=FakeXHR;FakeXHR.all=[];
  try {
    const controller=new AbortController();const file=new File(['abc'],'test.png',{type:'image/png'});
    let resolved=false;const progress=[];
    const upload=sendAdminFile(file,loaded=>progress.push(loaded),controller.signal).then(result=>{resolved=true;return result;});
    const xhr=FakeXHR.all[0];xhr.upload.onprogress({loaded:3});
    await Promise.resolve();assert.equal(resolved,false);assert.deepEqual(progress,[3]);
    xhr.finish(200,JSON.stringify({asset:{key:'test.png'}}));assert.equal((await upload).data.asset.key,'test.png');
    controller.abort();assert.equal(xhr.aborted,undefined);
    const next=new AbortController();const pending=sendAdminFile(file,()=>{},next.signal);const rejected=assert.rejects(pending,{name:'AbortError'});
    next.abort();await rejected;assert.equal(FakeXHR.all[1].aborted,true);
  } finally {globalThis.XMLHttpRequest=original;}
});
test('malformed upload responses do not crash the editor and timeouts reject clearly',async()=>{
  const original=globalThis.XMLHttpRequest;globalThis.XMLHttpRequest=FakeXHR;FakeXHR.all=[];
  try {
    for(const body of ['null','[]','<html>error</html>']) {
      const promise=sendAdminFile(new File(['x'],'x.png',{type:'image/png'}),()=>{},new AbortController().signal);
      FakeXHR.all.at(-1).finish(503,body);assert.deepEqual((await promise).data,{});
    }
    const promise=sendAdminFile(new File(['x'],'x.png'),()=>{},new AbortController().signal);
    const rejected=assert.rejects(promise,/上传超时/);FakeXHR.all.at(-1).ontimeout();await rejected;
  } finally {globalThis.XMLHttpRequest=original;}
});
