import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import { contentSchema } from '../lib/content-schema.ts';
import { entryMedia } from '../lib/content.ts';

const origin = 'http://127.0.0.1:3197';
const directory = await mkdtemp(join(process.env.GENE_TEST_TMP || tmpdir(), 'gene-research-test-'));
const password = randomBytes(24).toString('hex');
const avatarSecret = randomBytes(32).toString('hex');
let server, cookie, logs = '';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=', 'base64');
const record = () => ({id:randomUUID(),section:'research',title:'Test research',subtitle:'Test author',tag:'NeurIPS',date:'2026-09-26',body:'',url:'https://example.com/paper',revision:0,media:[],researchBackground:'研究背景\n第二行',researchResults:'研究成果\n验证结果',modelImages:[]});

async function request(path, method='GET', data, extra={}) {
  return fetch(origin+path, {method, headers:{Origin:origin, ...(cookie?{Cookie:cookie}:{}), ...(data!==undefined?{'Content-Type':'application/json'}:{}), ...extra}, ...(data!==undefined?{body:JSON.stringify(data)}:{})});
}
test('key results are optional, research-only and limited to four complete rows',()=>{
  const base=record(), row={value:'+4.0%',label:'平均准确率提升'};
  assert.equal(contentSchema.parse(base).researchHighlights,undefined,'older content continues to inherit presets');
  assert.deepEqual(contentSchema.parse({...base,researchHighlights:[]}).researchHighlights,[],'an explicit clear stays distinct from older content');
  assert.ok(contentSchema.safeParse({...base,researchHighlights:[row]}).success);
  assert.equal(contentSchema.parse({...base,researchHighlights:[{value:' +4.0% ',label:' 提升 '}]}).researchHighlights[0].value,'+4.0%');
  for(const bad of [Array.from({length:5},()=>row),[{value:'',label:'说明'}],[{value:'1',label:''}],[{...row,extra:true}],[{value:'1'.repeat(21),label:'a'}]])
    assert.ok(!contentSchema.safeParse({...base,researchHighlights:bad}).success,JSON.stringify(bad).slice(0,60));
  const news={...base,section:'news',researchBackground:undefined,researchResults:undefined,modelImages:undefined};
  assert.ok(contentSchema.safeParse(news).success);
  assert.ok(!contentSchema.safeParse({...news,researchHighlights:[row]}).success,'only research has key results');
});
test('key results saved in the content manager appear beside the paper and can be cleared',async()=>{
  const entry={...record(),researchHighlights:[{value:'+7%',label:'召回率提升'},{value:'2×',label:'推理速度'}]};
  const response=await request('/api/content','POST',entry);assert.equal(response.status,200);
  const saved=(await response.json()).entries.find(item=>item.id===entry.id);
  assert.deepEqual(saved.researchHighlights,entry.researchHighlights);
  const page=await (await request('/research/'+encodeURIComponent(saved.slug||saved.id))).text();
  assert.match(page,/<h2>KEY RESULTS<\/h2><div class="kpi"><strong>\+7%<\/strong><span data-ph>召回率<wbr>提升<\/span>/);
  const cleared=await request('/api/content','POST',{...saved,researchHighlights:[]});assert.equal(cleared.status,200);
  const after=(await cleared.json()).entries.find(item=>item.id===entry.id);
  assert.deepEqual(after.researchHighlights,[],'removing every row persists an explicit empty list');
  assert.match(await (await request('/research/'+encodeURIComponent(after.slug||after.id))).text(),/paper-aside--facts/);
  assert.equal((await request('/api/content','DELETE',after)).status,200);
});
test('clearing a paper with preset key results does not restore them on save or reload',async()=>{
  const entry={...record(),id:"test-research-preset",researchBackground:"Fictional research fixture.\nThis short background verifies inherited key results and explicitly clearing them.\n"};
  let response=await request('/api/content','POST',entry);assert.equal(response.status,200);
  let saved=(await response.json()).entries.find(item=>item.id===entry.id);
  const path='/research/'+encodeURIComponent(saved.slug||saved.id);
  assert.match(await (await request(path)).text(),/<h2>KEY RESULTS<\/h2>/,'legacy records still inherit matching presets');
  response=await request('/api/content','POST',{...saved,researchHighlights:[]});assert.equal(response.status,200);
  saved=(await response.json()).entries.find(item=>item.id===entry.id);
  assert.deepEqual(saved.researchHighlights,[]);
  const reloaded=(await (await request('/api/content')).json()).entries.find(item=>item.id===entry.id);
  assert.deepEqual(reloaded.researchHighlights,[]);
  const html=await (await request(path)).text();
  assert.doesNotMatch(html,/<h2>KEY RESULTS<\/h2>/);
  assert.match(html,/paper-aside--facts/);
  assert.equal((await request('/api/content','DELETE',saved)).status,200);
});
async function upload() {
  const response=await fetch(origin+'/api/media',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'image/png','X-File-Name':'model.png','X-File-Size':String(png.length)},body:png});
  assert.equal(response.status,200);
  return (await response.json()).asset;
}
before(async () => {
  server=spawn(process.execPath,['.next/standalone/server.js'],{env:{...process.env,HOSTNAME:'127.0.0.1',PORT:'3197',DATA_DIR:directory,DATABASE_PATH:join(directory,'content.sqlite'),ADMIN_PASSWORD:password,MAIL_AVATAR_BRIDGE_SECRET:avatarSecret,ADMIN_SESSION_SECRET:randomBytes(32).toString('hex'),ADMIN_LOCAL_ONLY:'0',ADMIN_ALLOWED_HOSTS:'127.0.0.1'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  server.stdout.on('data',chunk=>{logs+=chunk});server.stderr.on('data',chunk=>{logs+=chunk});
  const deadline=Date.now()+20000;
  while(Date.now()<deadline){
    try { if((await request('/api/content')).ok)break; } catch {}
    if(server.exitCode!==null)throw new Error(logs);
    await new Promise(done=>setTimeout(done,150));
  }
  const auth=await request('/api/admin/session','POST',{password});
  assert.equal(auth.status,200,logs);cookie=auth.headers.get('set-cookie').split(';')[0];
});
after(async () => {
  if(server&&server.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped;}
  assert.equal(resolve(directory).startsWith(resolve(join(process.env.GENE_TEST_TMP || tmpdir(),'gene-research-test-'))),true);
  await rm(directory,{recursive:true,force:true});
});

test('research schema accepts structured details and rejects video/oversize images and other sections',()=>{
  const entry=record();assert.equal(contentSchema.safeParse(entry).success,true);
  const image={key:randomUUID()+'.png',name:'model.png',type:'image',mime:'image/png',size:68};
  assert.equal(contentSchema.safeParse({...entry,modelImages:[image]}).success,true);
  for(const invalid of [
    {...entry,section:'members'},
    {...entry,modelImages:[{...image,key:randomUUID()+'.mp4',type:'video',mime:'video/mp4'}]},
    {...entry,modelImages:[{...image,size:50*1024*1024+1}]},
    {...entry,researchBackground:'a'.repeat(12001)},
  ])assert.equal(contentSchema.safeParse(invalid).success,false);
  const legacy={...entry,body:'旧版详细内容'};delete legacy.modelImages;delete legacy.researchBackground;delete legacy.researchResults;
  assert.equal(contentSchema.safeParse(legacy).success,true);
  assert.equal(contentSchema.safeParse({...legacy,section:'members'}).success,true);
  assert.deepEqual(entryMedia({...entry,media:[image],modelImages:[image]}).map(a=>a.key),[image.key,image.key]);
});

test('image upload and structured content survive save/reload; referenced image cannot be removed',async()=>{
  const asset=await upload();let entry={...record(),modelImages:[asset]};
  let response=await request('/api/content','POST',entry);assert.equal(response.status,200);
  entry=(await response.json()).entries.find(item=>item.id===entry.id);
  assert.equal(entry.tag,'NeurIPS');assert.equal(entry.researchBackground,'研究背景\n第二行');assert.equal(entry.researchResults,'研究成果\n验证结果');assert.deepEqual(entry.modelImages,[asset]);
  const reloaded=await (await request('/api/content')).json();assert.deepEqual(reloaded.entries.find(item=>item.id===entry.id),entry);
  assert.equal((await request('/api/media/'+asset.key)).status,200);
  assert.equal((await request('/api/media?key='+asset.key,'DELETE')).status,409);
  const shared={...record(),modelImages:[],media:[asset]};
  response=await request('/api/content','POST',shared);assert.equal(response.status,200);
  const sharedSaved=(await response.json()).entries.find(item=>item.id===shared.id);
  response=await request('/api/content','POST',{...entry,modelImages:[],researchResults:'更新后的研究成果'});assert.equal(response.status,200);
  assert.equal((await request('/api/media/'+asset.key)).status,200,'shared attachment must be retained');
  response=await request('/api/content','DELETE',sharedSaved);assert.equal(response.status,200);
  assert.equal((await request('/api/media/'+asset.key)).status,404,'unreferenced image must be cleaned');
});

test('discarding a newly uploaded image removes only the unreferenced file',async()=>{
  const asset=await upload();assert.equal((await request('/api/media?key='+asset.key,'DELETE')).status,200);assert.equal((await request('/api/media/'+asset.key)).status,404);
});

test('50 MiB image uploads and saves as title/model media; one byte above is rejected',async()=>{
  const size=50*1024*1024;
  const bytes=Buffer.alloc(size);png.copy(bytes);
  const headers={Origin:origin,Cookie:cookie,'Content-Type':'image/png','X-File-Name':'upload-limit-test.png','X-File-Size':String(size)};
  const uploaded=await fetch(origin+'/api/media',{method:'POST',headers,body:bytes});
  assert.equal(uploaded.status,200);
  const asset=(await uploaded.json()).asset;
  assert.equal(asset.size,size);
  const entry={...record(),titleImages:[asset],modelImages:[asset]};
  const saved=await request('/api/content','POST',entry);assert.equal(saved.status,200);
  const stored=(await saved.json()).entries.find(item=>item.id===entry.id);
  assert.equal(stored.titleImages[0].size,size);assert.equal(stored.modelImages[0].size,size);
  const rejected=await fetch(origin+'/api/media',{method:'POST',headers:{...headers,'X-File-Size':String(size+1)},body:png});
  assert.equal(rejected.status,413);assert.match((await rejected.json()).error,/50 MB/);
  assert.equal((await request('/api/content','DELETE',stored)).status,200);
});

test('500 MiB video streams to disk, supports byte ranges, and persists in content',async()=>{
  const size=500*1024*1024;
  const chunk=Buffer.alloc(256*1024,7);let remaining=size;
  const body=new ReadableStream({pull(controller){if(!remaining){controller.close();return;}const part=chunk.subarray(0,Math.min(chunk.length,remaining));remaining-=part.length;controller.enqueue(part);}});
  const response=await fetch(origin+'/api/media',{method:'POST',duplex:'half',headers:{Origin:origin,Cookie:cookie,'Content-Type':'video/mp4','Content-Length':String(size),'X-File-Size':String(size)},body});
  assert.equal(response.status,200,logs);const asset=(await response.json()).asset;assert.equal(asset.size,size);
  const save=await request('/api/content','POST',{...record(),media:[asset]});assert.equal(save.status,200);
  for(const range of ['bytes=0-1023','bytes=-1024']){
    const r=await request('/api/media/'+asset.key,'GET',undefined,{Range:range});assert.equal(r.status,206);assert.equal(r.headers.get('content-length'),'1024');assert.deepEqual(Buffer.from(await r.arrayBuffer()),Buffer.alloc(1024,7));
  }
  assert.equal((await request('/api/media/'+asset.key,'GET',undefined,{Range:'bytes='+size+'-'})).status,416);
  const rejected=await fetch(origin+'/api/media',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'video/mp4','X-File-Size':String(size+1)},body:png});assert.equal(rejected.status,413);
  const entry=(await save.json()).entries.find(e=>e.media?.some(a=>a.key===asset.key));
  assert.equal((await request('/api/content','DELETE',entry)).status,200);
});

test('forum shares file limits and accepts up to 1 GiB attachment metadata',async()=>{
  await request('/api/forum/posts');
  const token=randomBytes(32).toString('base64url'),email='limits-test@example.invalid';
  const db=new DatabaseSync(join(directory,'content.sqlite'));
  db.prepare('INSERT INTO forum_profiles(email,display_name,created_at) VALUES(?,?,?)').run(email,'Upload test',Date.now());
  db.prepare('INSERT INTO forum_sessions(token_hash,email,expires_at) VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),email,Date.now()+60000);
  db.close();const forumCookie='gene_forum='+token;
  const bytes=Buffer.alloc(13*1024*1024);png.copy(bytes);
  const uploaded=await fetch(origin+'/api/forum/media',{method:'POST',headers:{Origin:origin,Cookie:forumCookie,'Content-Type':'image/png'},body:bytes});assert.equal(uploaded.status,200);
  const image=(await uploaded.json()).asset;
  // Attachments must be the member's own recorded uploads; record large videos directly.
  const own=db2=>asset=>{db2.prepare('INSERT INTO forum_uploads(key,email,name,type,mime,size,created_at,complete) VALUES(?,?,?,?,?,?,?,1)').run(asset.key,email,asset.name,asset.type,asset.mime,asset.size,Date.now());return asset;};
  const ledger=new DatabaseSync(join(directory,'content.sqlite'));
  const video=size=>own(ledger)({key:randomUUID()+'.mp4',name:'video.mp4',type:'video',mime:'video/mp4',size});
  const data={body:'File limit test',media:[video(500*1024*1024),video(500*1024*1024),video(24*1024*1024)]};
  ledger.close();
  assert.equal((await request('/api/forum/posts','POST',data,{Cookie:forumCookie})).status,200);
  data.media[2].size+=1;assert.equal((await request('/api/forum/posts','POST',data,{Cookie:forumCookie})).status,400);
  assert.equal((await request('/api/forum/posts','POST',{body:'Oversize',media:[{...image,size:50*1024*1024+1}]},{Cookie:forumCookie})).status,400);
  assert.equal((await request('/api/media?key='+image.key,'DELETE')).status,200);
});

test('title screenshot is single image only and supports persistence, replacement and removal',async()=>{
  const first=await upload(), second=await upload();
  const base={...record(),subtitle:'',titleImages:[first]};
  for(const invalid of [
    {...base,titleImages:[first,second]},
    {...base,titleImages:[{...first,type:'video',mime:'video/mp4',key:randomUUID()+'.mp4'}]},
    {...base,titleImages:[{...first,size:50*1024*1024+1}]},
    {...base,section:'members',researchBackground:undefined,researchResults:undefined,modelImages:undefined},
  ])assert.equal(contentSchema.safeParse(invalid).success,false);
  let response=await request('/api/content','POST',base);assert.equal(response.status,200);
  let entry=(await response.json()).entries.find(item=>item.id===base.id);
  assert.deepEqual(entry.titleImages,[first]);
  assert.equal((await request('/api/media?key='+first.key,'DELETE')).status,409);
  response=await request('/api/content','POST',{...entry,titleImages:[second]});assert.equal(response.status,200);
  entry=(await response.json()).entries.find(item=>item.id===base.id);
  assert.deepEqual(entry.titleImages,[second]);
  assert.equal(entry.researchBackground,base.researchBackground);
  assert.equal(entry.tag,base.tag);
  assert.equal((await request('/api/media/'+first.key)).status,404);
  assert.equal((await request('/api/media/'+second.key)).status,200);
  response=await request('/api/content','POST',{...entry,titleImages:[]});assert.equal(response.status,200);
  assert.equal((await request('/api/media/'+second.key)).status,404);
});


test('comment photos/videos persist in feed and SQLite; empty/invalid/unauthenticated comments are rejected',async()=>{
  await request('/api/forum/posts');
  const token=randomBytes(32).toString('base64url'), email='comment-test@example.invalid';
  const db=new DatabaseSync(join(directory,'content.sqlite'));
  db.prepare('INSERT INTO forum_profiles VALUES(?,?,?)').run(email,'Comment test',Date.now());
  db.prepare('INSERT INTO forum_sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),email,Date.now()+60000);
  const headers={Cookie:'gene_forum='+token};
  const post=(await (await request('/api/forum/posts','POST',{body:'Media comment test'},headers)).json()).post;
  const path='/api/forum/posts/'+post.id+'/comments';
  const assets=[];
  for(const mime of ['image/png','video/mp4']){
    const upload=await fetch(origin+'/api/forum/media',{method:'POST',headers:{Origin:origin,...headers,'Content-Type':mime},body:png});
    assert.equal(upload.status,200);assets.push((await upload.json()).asset);
  }
  for(const body of ['', '带图和视频的评论']){
    const response=await request(path,'POST',{body,media:assets},headers);assert.equal(response.status,200);
    const {comment}=await response.json();assert.deepEqual(comment.media,assets);
    assert.deepEqual(JSON.parse(db.prepare('SELECT media_json FROM forum_comments WHERE id=?').get(comment.id).media_json),assets);
    const feed=await (await request('/api/forum/posts')).json();assert.deepEqual(feed.posts.find(p=>p.id===post.id).comments.find(c=>c.id===comment.id).media,assets);
  }
  assert.equal((await request('/api/media?key='+assets[0].key,'DELETE')).status,409);
  const shared={...record(),media:[assets[0]]};
  const saved=await request('/api/content','POST',shared);
  const savedEntry=(await saved.json()).entries.find(item=>item.id===shared.id);
  assert.equal((await request('/api/content','DELETE',savedEntry)).status,200);
  assert.equal((await request('/api/media/'+assets[0].key)).status,200,'forum reference protects an image removed from CMS');
  const plain=await request(path,'POST',{body:'Text only'},headers);assert.equal(plain.status,200);assert.deepEqual((await plain.json()).comment.media,[]);
  for(const data of [{body:''},{body:'x',media:Array(5).fill(assets[0])},{media:[{...assets[0],size:50*1024*1024+1}]},{media:[{...assets[0],mime:'video/mp4'}]},{media:[{...assets[0],key:'../secret.png'}]},null])assert.equal((await request(path,'POST',data,headers)).status,400);
  assert.equal((await request(path,'POST',{media:assets})).status,401);
  assert.equal((await request(path,'POST',{media:assets},{...headers,Origin:'https://other.invalid'})).status,403);
  assert.equal((await request(path,'POST',{body:'x'.repeat(24001)},headers)).status,413);
  assert.equal((await request('/api/forum/posts/'+post.id,'DELETE',undefined,headers)).status,200);
  assert.equal((await request(path,'POST',{media:assets},headers)).status,404);
  db.close();
});


async function forumMember(name){
  await request('/api/forum/posts');
  const token=randomBytes(32).toString('base64url'),email=`${name}-${randomUUID().slice(0,8)}@example.invalid`;
  const db=new DatabaseSync(join(directory,'content.sqlite'));
  db.prepare('INSERT INTO forum_profiles(email,display_name,created_at) VALUES(?,?,?)').run(email,name,Date.now());
  db.prepare('INSERT INTO forum_sessions(token_hash,email,expires_at) VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),email,Date.now()+600000);
  db.close();
  const headers={Cookie:'gene_forum='+token};
  const upload=async(name='photo.png')=>{const response=await fetch(origin+'/api/forum/media',{method:'POST',headers:{Origin:origin,...headers,'Content-Type':'image/png','X-File-Name':encodeURIComponent(name)},body:png});return {status:response.status,asset:(await response.json()).asset};};
  return {email,headers,upload};
}

test('forum attachments must be the member\'s own finished uploads, as the server recorded them',async()=>{
  const a=await forumMember('owner-a'),b=await forumMember('owner-b');
  const mine=(await a.upload('我的照片.png')).asset,theirs=(await b.upload()).asset;
  const ghost={key:randomUUID()+'.png',name:'ghost.png',type:'image',mime:'image/png',size:png.length};
  const website=await upload();
  for(const media of [[theirs],[ghost],[website],[mine,mine]]){
    const response=await request('/api/forum/posts','POST',{body:'not mine',media},a.headers);
    assert.equal(response.status,400);assert.equal((await response.json()).code,'media');
  }
  const post=await request('/api/forum/posts','POST',{body:'mine',media:[{...mine,name:'renamed-by-client.png'}]},a.headers);
  assert.equal(post.status,200);assert.deepEqual((await post.json()).post.media,[mine],'the recorded name is kept');
  const comment=await request(`/api/forum/posts/${(await (await request('/api/forum/posts')).json()).posts[0].id}/comments`,'POST',{media:[theirs]},a.headers);
  assert.equal(comment.status,400);
  assert.equal((await request('/api/media?key='+website.key,'DELETE')).status,200);
});

test('deleting a forum post removes its photos, unless website content still shows them',async()=>{
  const a=await forumMember('cleanup');
  const only=(await a.upload()).asset,shared=(await a.upload()).asset,reply=(await a.upload()).asset;
  const created=await request('/api/forum/posts','POST',{body:'to delete',media:[only,shared]},a.headers);
  const {post}=await created.json();
  assert.equal((await request(`/api/forum/posts/${post.id}/comments`,'POST',{media:[reply]},a.headers)).status,200);
  const entry={...record(),media:[shared]};
  assert.equal((await request('/api/content','POST',entry)).status,200);
  assert.equal((await request('/api/forum/posts/'+post.id,'DELETE',undefined,a.headers)).status,200);
  assert.equal((await request('/api/media/'+only.key)).status,404,'the post photo is gone');
  assert.equal((await request('/api/media/'+reply.key)).status,404,'comment photos go with the post');
  const ledger=new DatabaseSync(join(directory,'content.sqlite'));
  assert.equal(ledger.prepare('SELECT COUNT(*) AS n FROM forum_uploads WHERE email=?').get(a.email).n,3,'deleting attachments does not refund daily upload allowance');
  assert.equal(ledger.prepare('SELECT complete FROM forum_uploads WHERE key=?').get(only.key).complete,-1);
  ledger.close();
  const retry=await request('/api/forum/posts','POST',{media:[only]},a.headers);
  assert.equal(retry.status,400,'removed attachments cannot be attached again');
  assert.equal((await retry.json()).code,'media');

  assert.equal((await request('/api/media/'+shared.key)).status,200,'website content keeps its copy');
  const saved=(await (await request('/api/content')).json()).entries.find(item=>item.id===entry.id);
  assert.equal((await request('/api/content','DELETE',saved)).status,200);
  assert.equal((await request('/api/media/'+shared.key)).status,404,'removed once nothing shows it');
});

test('forum posting limits count deleted posts, and uploads have a daily allowance',async()=>{
  const a=await forumMember('limits');
  for(let i=0;i<12;i++){
    const response=await request('/api/forum/posts','POST',{body:'post '+i},a.headers);assert.equal(response.status,200);
    assert.equal((await request('/api/forum/posts/'+(await response.json()).post.id,'DELETE',undefined,a.headers)).status,200);
  }
  assert.equal((await request('/api/forum/posts','POST',{body:'one more'},a.headers)).status,429);
  const b=await forumMember('quota');
  let accepted=0,last;
  for(let i=0;i<121;i++){last=await b.upload();if(last.status===200)accepted++;}
  assert.equal(accepted,120);assert.equal(last.status,429);
});

test('avatars are validated and normalized; mailbox/forum changes share one account and cannot affect another',async()=>{
  await request('/api/forum/posts');
  const token=randomBytes(32).toString('base64url'), email='avatar-test@team-gene.com';
  const db=new DatabaseSync(join(directory,'content.sqlite'));
  db.prepare('INSERT INTO forum_profiles VALUES(?,?,?)').run(email,'Avatar test',Date.now());
  db.prepare('INSERT INTO forum_sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),email,Date.now()+60000);
  const headers={Cookie:'gene_forum='+token};
  const bridge={'X-Team-Gene-Avatar-Token':avatarSecret,'X-Team-Gene-Avatar-User':email};
  const bytes=await sharp({create:{width:900,height:600,channels:3,background:'#146052'}}).jpeg().toBuffer();
  const upload=(path,h,data=bytes,mime='image/jpeg')=>fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':mime,...h},body:data});
  assert.equal((await upload('/api/forum/avatar',{})).status,401);
  assert.equal((await upload('/api/forum/avatar',{...headers,Origin:'https://other.invalid'})).status,403);
  assert.equal((await upload('/api/forum/avatar',headers,Buffer.from('<svg></svg>'),'image/png')).status,400);
  assert.equal((await upload('/api/forum/avatar',headers,bytes,'video/mp4')).status,415);
  assert.equal((await request('/api/internal/mail-avatar')).status,403);
  assert.equal((await request('/api/internal/mail-avatar','GET',undefined,{'X-Team-Gene-Avatar-Token':'wrong','X-Team-Gene-Avatar-User':email})).status,403);
  const result=await upload('/api/forum/avatar',headers);assert.equal(result.status,200);
  const first=(await result.json()).avatarUrl;
  const image=await fetch(origin+first);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/webp');
  const metadata=await sharp(Buffer.from(await image.arrayBuffer())).metadata();assert.equal(metadata.width,512);assert.equal(metadata.height,512);assert.equal(metadata.exif,undefined);
  assert.equal((await (await request('/api/forum/auth','GET',undefined,headers)).json()).user.avatarUrl,first);
  assert.equal((await (await request('/api/internal/mail-avatar','GET',undefined,bridge)).json()).avatarUrl,first);
  const post=(await (await request('/api/forum/posts','POST',{body:'Avatar test'},headers)).json()).post;
  const comment=await request('/api/forum/posts/'+post.id+'/comments','POST',{body:'Avatar comment'},headers);assert.equal((await comment.json()).comment.avatarUrl,first);
  const secondUpload=await upload('/api/internal/mail-avatar',bridge);assert.equal(secondUpload.status,200);const second=(await secondUpload.json()).avatarUrl;assert.notEqual(first,second);
  const feed=(await (await request('/api/forum/posts')).json()).posts.find(p=>p.id===post.id);assert.equal(feed.avatarUrl,second);assert.equal(feed.comments[0].avatarUrl,second);assert.equal((await fetch(origin+first)).status,404);
  const other={...bridge,'X-Team-Gene-Avatar-User':'other@team-gene.com'};
  assert.equal((await (await request('/api/internal/mail-avatar','GET',undefined,other)).json()).avatarUrl,null);
  assert.equal((await request('/api/internal/mail-avatar','DELETE',undefined,bridge)).status,200);assert.equal((await fetch(origin+second)).status,404);
  assert.equal((await (await request('/api/forum/auth','GET',undefined,headers)).json()).user.avatarUrl,null);
  const third=await upload('/api/forum/avatar',headers);assert.equal(third.status,200);
  assert.equal((await request('/api/forum/avatar','DELETE',undefined,headers)).status,200);
  assert.equal((await (await request('/api/internal/mail-avatar','GET',undefined,bridge)).json()).avatarUrl,null);
  db.close();
});


test('malformed forum/mail payloads return validation errors, not server failures', async () => {
  await request('/api/forum/posts');
  const token=randomBytes(32).toString('base64url'),email='validation-test@example.invalid';
  const db=new DatabaseSync(join(directory,'content.sqlite'));
  db.prepare('INSERT INTO forum_profiles VALUES(?,?,?)').run(email,'Validation test',Date.now());
  db.prepare('INSERT INTO forum_sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),email,Date.now()+60000);
  db.close();
  const headers={Cookie:'gene_forum='+token};
  for(const value of [null, [], true, 123, 'bad']) {
    for(const path of ['/api/forum/auth','/api/forum/posts','/api/mail/signup']) {
      const response=await request(path,'POST',value,headers);
      assert.equal(response.status,400,path+': '+JSON.stringify(value));
      assert.equal(typeof (await response.json()).error,'string');
    }
  }
  for(const media of [null,'bad',{},1]) {
    assert.equal((await request('/api/forum/posts','POST',{body:'Invalid attachments',media},headers)).status,400);
  }
  for(const password of [' '.repeat(12),'valid1234567\n','valid1234567\r','valid1234567\0']) {
    const response=await request('/api/mail/signup','POST',{username:'validation',displayName:'Test',password,confirmation:password});
    assert.equal(response.status,400);
  }
});


test('forum pagination reaches older posts and comments without duplicates or omissions', async () => {
  const db=new DatabaseSync(join(directory,'content.sqlite'));
  const email='pagination@example.invalid',now=Date.now()+100000;
  db.prepare('INSERT INTO forum_profiles VALUES(?,?,?)').run(email,'Pagination test',now);
  const ids=Array.from({length:46},()=>randomUUID());
  for(const id of ids) db.prepare('INSERT INTO forum_posts(id,email,body,created_at) VALUES(?,?,?,?)').run(id,email,'Paging test',now);
  const comments=Array.from({length:54},()=>randomUUID());
  for(const id of comments) db.prepare('INSERT INTO forum_comments(id,post_id,email,body,created_at) VALUES(?,?,?,?,?)').run(id,ids[0],email,'Paging comment',now);
  let path='/api/forum/posts', seen=[];
  do {
    const response=await request(path);assert.equal(response.status,200);
    const page=await response.json();seen.push(...page.posts.map(p=>p.id));
    path=page.nextCursor?'/api/forum/posts?before='+encodeURIComponent(page.nextCursor):null;
  } while(path);
  assert.equal(new Set(seen).size,seen.length);for(const id of ids)assert.ok(seen.includes(id));
  path='/api/forum/posts/'+ids[0]+'/comments';seen=[];
  do {
    const response=await request(path);assert.equal(response.status,200);
    const page=await response.json();seen.push(...page.comments.map(c=>c.id));
    path=page.nextCursor?'/api/forum/posts/'+ids[0]+'/comments?after='+encodeURIComponent(page.nextCursor):null;
  } while(path);
  assert.deepEqual([...seen].sort(),[...comments].sort());
  assert.equal((await request('/api/forum/posts?before=invalid')).status,400);
  assert.equal((await request('/api/forum/posts/'+ids[0]+'/comments?after=invalid')).status,400);
  db.prepare('UPDATE forum_posts SET deleted=1 WHERE id=?').run(ids[0]);
  assert.equal((await request('/api/forum/posts/'+ids[0]+'/comments')).status,404);
  db.close();
});


test('media HEAD returns metadata with no body and ignores Range', async () => {
  const asset=await upload();
  for(let i=0;i<30;i++){
    const response=await request('/api/media/'+asset.key,'HEAD',undefined,{Range:'bytes=0-1'});
    assert.equal(response.status,200);assert.equal(response.headers.get('content-length'),String(png.length));
    assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('content-range'),null);
    assert.equal((await response.arrayBuffer()).byteLength,0);
  }
  assert.equal((await request('/api/media?key='+asset.key,'DELETE')).status,200);
});

test('resized media variants are cached WebP renditions, never enlarged, and removed with the upload', async () => {
  const photo=await sharp({create:{width:200,height:100,channels:3,background:'#3d7a63'}}).png().toBuffer();
  const uploaded=await fetch(origin+'/api/media',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'image/png','X-File-Name':'photo.png','X-File-Size':String(photo.length)},body:photo});
  assert.equal(uploaded.status,200);const {asset}=await uploaded.json();
  const response=await request('/api/media/'+asset.key+'?w=320');
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');
  assert.match(response.headers.get('cache-control'),/immutable/);
  const image=await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  assert.equal(image.format,'webp');assert.deepEqual([image.width,image.height],[200,100],'a smaller upload is not enlarged');
  const head=await request('/api/media/'+asset.key+'?w=640','HEAD');
  assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal((await request('/api/media/'+asset.key+'?w=500')).status,400,'only fixed widths are generated');
  assert.equal((await request('/api/media/'+asset.key)).headers.get('content-type'),'image/png','the original is unchanged');
  const variants=async()=>(await readdir(join(directory,'media-variants','v1')).catch(()=>[])).filter(file=>file.startsWith(asset.key));
  assert.equal((await variants()).length,2);
  assert.equal((await request('/api/media?key='+asset.key,'DELETE')).status,200);
  assert.deepEqual(await variants(),[]);
  assert.equal((await request('/api/media/'+asset.key+'?w=320')).status,404);
  const unreadable=await upload();
  const fallback=await fetch(origin+'/api/media/'+unreadable.key+'?w=320',{redirect:'manual'});
  assert.equal(fallback.status,307,'an image the resizer cannot read falls back to the original');
  assert.equal(fallback.headers.get('location'),'/api/media/'+unreadable.key);
  assert.equal((await request('/api/media?key='+unreadable.key,'DELETE')).status,200);
});

test('repeated wrong admin passwords are throttled per client, even for the right password', async () => {
  const attempt=(value,ip)=>request('/api/admin/session','POST',{password:value},{'X-Real-IP':ip});
  for(let i=0;i<10;i++)assert.equal((await attempt('wrong-password','198.51.100.7')).status,401);
  const blocked=await attempt(password,'198.51.100.7');
  assert.equal(blocked.status,429);assert.equal(blocked.headers.get('retry-after'),'900');
  assert.equal((await attempt(password,'198.51.100.8')).status,200,'other clients can still sign in');
});

test('stale CMS saves return the latest revision without overwriting either content or attachments', async () => {
  const asset=await upload(),original={...record(),title:'Concurrent research',modelImages:[asset]};
  const created=await request('/api/content','POST',original);
  assert.equal(created.status,200);
  const first=(await created.json()).entries.find(entry=>entry.id===original.id);
  const saved=await request('/api/content','POST',{...first,title:'Saved in another window'});
  assert.equal(saved.status,200);
  const latest=(await saved.json()).entries.find(entry=>entry.id===original.id);
  const stale=await request('/api/content','POST',{...first,title:'Unsaved draft',modelImages:[]});
  assert.equal(stale.status,409);
  assert.equal(stale.headers.get('cache-control'),'no-store');
  const conflict=await stale.json();
  assert.deepEqual(conflict.entries.find(entry=>entry.id===original.id),latest);
  assert.equal((await request('/api/media/'+asset.key)).status,200,'a rejected update must not remove saved attachments');
  const retry=await request('/api/content','POST',{...latest,title:'Reopened latest version'});
  assert.equal(retry.status,200,'the refreshed list must supply a usable revision');
  const final=(await retry.json()).entries.find(entry=>entry.id===original.id);
  assert.equal((await request('/api/content','DELETE',final)).status,200);
});

test('stale CMS deletes return the latest list, including a record already removed elsewhere', async () => {
  const original=record();
  const created=await request('/api/content','POST',original);
  assert.equal(created.status,200);
  const first=(await created.json()).entries.find(entry=>entry.id===original.id);
  const saved=await request('/api/content','POST',{...first,title:'Updated before deletion'});
  assert.equal(saved.status,200);
  const latest=(await saved.json()).entries.find(entry=>entry.id===original.id);
  const stale=await request('/api/content','DELETE',first);
  assert.equal(stale.status,409);
  assert.deepEqual((await stale.json()).entries.find(entry=>entry.id===original.id),latest);
  assert.equal((await request('/api/content','DELETE',latest)).status,200);
  const duplicate=await request('/api/content','DELETE',latest);
  assert.equal(duplicate.status,409);
  assert.equal((await duplicate.json()).entries.some(entry=>entry.id===original.id),false);
});
