import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createAdminSessionClient,createLoginWaiter} from '../lib/admin-session-client.ts';
import {adminCookie,createAdminSession,hasAdminSession,SESSION_TTL_SECONDS} from '../app/admin-session.ts';

test('signed sessions and browser cookies both last 30 days; expired/tampered tokens fail',async()=>{
  const previous=process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET='isolated-session-test-secret';
  try {
    const before=Math.floor(Date.now()/1000),token=await createAdminSession();
    assert.equal(SESSION_TTL_SECONDS,2592000);
    assert.ok(Number(token.split('.')[0])-before>=2592000);
    assert.equal(await hasAdminSession(token),true);
    assert.match(adminCookie(token),/Max-Age=2592000/);
    assert.match(adminCookie('',0),/Max-Age=0/);
    const expired=`${before-1}.abcdefghijklmnopqrstuvwx`;
    const signature=createHmac('sha256',process.env.ADMIN_SESSION_SECRET).update(expired).digest('base64url');
    assert.equal(await hasAdminSession(`${expired}.${signature}`),false);
    assert.equal(await hasAdminSession(token.slice(0,-2)+'xx'),false);
  } finally {if(previous===undefined)delete process.env.ADMIN_SESSION_SECRET;else process.env.ADMIN_SESSION_SECRET=previous;}
});

test('expired session pauses an upload and preserves the original file until verification',async()=>{
  const waiter=createLoginWaiter(),statuses=[];let writes=0,loginStarted;
  const ready=new Promise(resolve=>{loginStarted=resolve});
  const body=new Blob(['file-content'],{type:'image/png'});
  const client=createAdminSessionClient({
    onStatus:value=>statuses.push(value),
    requireLogin:()=>{loginStarted();return waiter.wait();},
    fetcher:async(url,options)=>{
      if(url==='/api/admin/session')return Response.json({authenticated:false});
      writes++;assert.equal(options.body,body);return Response.json({asset:{key:'image'}});
    },
  });
  const upload=client.request('/api/media',{method:'POST',body});
  await ready;assert.equal(writes,0);client.verified();waiter.resolve();
  assert.equal((await upload).status,200);assert.equal(writes,1);assert.deepEqual(statuses,[false,true]);
});

test('expiry between check and upload retries once after reauthentication, not on server failure',async()=>{
  for(const failure of [401,500]){
    let writes=0,logins=0;
    const client=createAdminSessionClient({onStatus:()=>{},requireLogin:async()=>{logins++;},fetcher:async url=>{
      if(url==='/api/admin/session')return Response.json({authenticated:true});
      writes++;return new Response('',{status:writes===1?failure:200});
    }});
    const response=await client.request('/api/content',{method:'POST',body:'draft'});
    assert.equal(writes,failure===401?2:1);assert.equal(logins,failure===401?1:0);assert.equal(response.status,failure===401?200:500);
  }
});

test('late expired checks cannot override a successful login',async()=>{
  const statuses=[];let finish;
  const client=createAdminSessionClient({onStatus:value=>statuses.push(value),requireLogin:async()=>{},fetcher:()=>new Promise(resolve=>{finish=resolve})});
  const checking=client.check();client.verified();finish(Response.json({authenticated:false}));
  assert.equal(await checking,true);assert.deepEqual(statuses,[true]);
});

test('permission failures do not ask for a password or replay writes when session is valid',async()=>{
  let logins=0,writes=0;
  const client=createAdminSessionClient({onStatus:()=>{},requireLogin:async()=>{logins++;},fetcher:async url=>{
    if(url==='/api/admin/session')return Response.json({authenticated:true});
    writes++;return new Response('',{status:403});
  }});
  assert.equal((await client.request('/api/media',{method:'POST'})).status,403);assert.equal(logins,0);assert.equal(writes,1);
});

test('late failed or malformed checks cannot override a freshly verified login',async()=>{
  for(const outcome of ['network','server','invalid']) {
    let resolve,reject;
    const statuses=[];
    const client=createAdminSessionClient({onStatus:value=>statuses.push(value),requireLogin:async()=>{},fetcher:()=>new Promise((yes,no)=>{resolve=yes;reject=no;})});
    const checking=client.check();client.verified();
    if(outcome==='network')reject(new Error('offline'));
    else resolve(outcome==='server'?new Response('',{status:503}):Response.json(null));
    assert.equal(await checking,true);assert.deepEqual(statuses,[true]);
  }
});

test('cancel while waiting for login settles immediately and cannot upload after later login',async()=>{
  const waiter=createLoginWaiter();let loginStarted,writes=0;
  const ready=new Promise(resolve=>loginStarted=resolve);
  const client=createAdminSessionClient({onStatus:()=>{},requireLogin:()=>{loginStarted();return waiter.wait();},fetcher:async()=>Response.json({authenticated:false})});
  const controller=new AbortController();
  const upload=client.withSession(async()=>{writes++;return {status:200};},controller.signal);
  const rejected=assert.rejects(upload,{name:'AbortError'});
  await ready;controller.abort();await rejected;
  client.verified();waiter.resolve();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(writes,0);
});

test('cancel while checking session does not wait for the network or invoke login',async()=>{
  let finish,logins=0;
  const client=createAdminSessionClient({onStatus:()=>{},requireLogin:async()=>{logins++;},fetcher:()=>new Promise(resolve=>finish=resolve)});
  const controller=new AbortController();
  const request=client.request('/api/content',{method:'POST',signal:controller.signal});
  const rejected=assert.rejects(request,{name:'AbortError'});controller.abort();await rejected;
  finish(Response.json({authenticated:false}));await new Promise(resolve=>setImmediate(resolve));assert.equal(logins,0);
});

test('a delayed unauthorized response cannot expire a newer login or prompt for the password again',async()=>{
  let finishLate,logins=0;
  const statuses=[],writes=new Map();
  const client=createAdminSessionClient({
    onStatus:value=>statuses.push(value),
    requireLogin:async()=>{logins++;client.verified();},
    fetcher:async url=>{
      if(url==='/api/admin/session')return Response.json({authenticated:true});
      const count=(writes.get(url)??0)+1;writes.set(url,count);
      if(count>1)return new Response('',{status:200});
      if(url==='/late-upload')return new Promise(resolve=>{finishLate=resolve});
      return new Response('',{status:401});
    },
  });
  const late=client.request('/late-upload',{method:'POST'});
  while(!finishLate)await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await client.request('/first-save',{method:'POST'})).status,200);
  assert.equal(logins,1);
  const afterLogin=statuses.length;
  finishLate(new Response('',{status:401}));
  assert.equal((await late).status,200);
  assert.equal(logins,1,'the fresh session should retry the rejected request without another password prompt');
  assert.equal(statuses.slice(afterLogin).includes(false),false);
  assert.equal(writes.get('/late-upload'),2);
});
