import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { randomUUID, randomBytes } from 'node:crypto';
import { contentSchema } from '../lib/content-schema.ts';
import { entryMedia } from '../lib/content.ts';
import sharp from 'sharp';

const origin = 'http://127.0.0.1:3196';
const directory = await mkdtemp(join(tmpdir(), 'gene-seo-test-'));
const password = randomBytes(24).toString('hex');
let server, cookie, logs = '';
const png = await sharp({create:{width:40,height:80,channels:3,background:'#be7656'}}).png().toBuffer();
const record = () => ({id:randomUUID(),section:'research',title:'Test research',subtitle:'Test author',tag:'NeurIPS',date:'2026-09-26',body:'',url:'https://example.com/paper',revision:0,media:[],researchBackground:'研究背景\n第二行',researchResults:'研究成果\n验证结果',modelImages:[]});

test('titles, share types, 404 head, theme colours and home-screen icons are consistent',async()=>{
  const head=async path=>(await (await fetch(origin+path)).text()).split('</head>')[0];
  const home=await head('/');
  assert.match(home,/<title>Team Gene · 计算机科学与人工智能科研团队<\/title>/);
  assert.match(home,/<meta name="theme-color" content="#0f2b24"/);
  assert.doesNotMatch(home,/name="robots"/,'public pages rely on the default index, follow');
  assert.match(await head('/alumni'),/<meta name="theme-color" content="#0c1512" media="\(prefers-color-scheme: dark\)"/);
  assert.match(home,/rel="apple-touch-icon" href="\/apple-touch-icon.png"/);assert.equal((await fetch(origin+'/apple-touch-icon.png')).status,200);assert.match(home,/rel="manifest" href="\/manifest.webmanifest"/);
  const manifest=await (await fetch(origin+'/manifest.webmanifest')).json();
  assert.equal(manifest.short_name,'Team Gene');
  for(const icon of manifest.icons)assert.equal((await fetch(origin+icon.src)).status,200);
  const missing=await fetch(origin+'/no-such-page');assert.equal(missing.status,404);
  const missingHead=(await missing.text()).split('</head>')[0];
  assert.deepEqual([...missingHead.matchAll(/name="robots" content="([^"]*)"/g)].map(m=>m[1]),['noindex'],'one robots tag on 404');
  // Next renders page-level 404s on the client; the title arrives in the RSC payload.
  for(const path of ['/no-such-page','/members/no-such-person','/forum/no-such-page']){
    const response=await fetch(origin+path),body=await response.text();
    assert.equal(response.status,404,path);
    assert.ok(body.includes('{\\"children\\":\\"页面未找到 | Team Gene\\"}'),path);
    assert.match(body,/Error 404/,path);
  }
  const paper={...record(),title:'Typed paper'};
  const member={...record(),section:'members',title:'类型测试',subtitle:'博士研究生 · 2024 级',tag:'机器学习',researchBackground:undefined,researchResults:undefined,modelImages:undefined};
  for(const [entry,type] of [[paper,'article'],[member,'profile']]){
    const saved=(await (await request('/api/content','POST',entry)).json()).entries.find(item=>item.id===entry.id);
    const page=await (await request('/'+saved.section+'/'+encodeURIComponent(saved.slug||saved.id))).text();
    assert.match(page,new RegExp('property="og:type" content="'+type+'"'));
    assert.equal((await request('/api/content','DELETE',saved)).status,200);
  }
});
async function request(path, method='GET', data, extra={}) {
  return fetch(origin+path, {method, headers:{Origin:origin, ...(cookie?{Cookie:cookie}:{}), ...(data!==undefined?{'Content-Type':'application/json'}:{}), ...extra}, ...(data!==undefined?{body:JSON.stringify(data)}:{})});
}
async function upload() {
  const response=await fetch(origin+'/api/media',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'image/png','X-File-Name':'model.png','X-File-Size':String(png.length)},body:png});
  assert.equal(response.status,200);
  return (await response.json()).asset;
}
before(async () => {
  server=spawn(process.execPath,['.next/standalone/server.js'],{env:{...process.env,HOSTNAME:'127.0.0.1',PORT:'3196',DATA_DIR:directory,DATABASE_PATH:join(directory,'content.sqlite'),ADMIN_PASSWORD:password,ADMIN_SESSION_SECRET:randomBytes(32).toString('hex'),ADMIN_LOCAL_ONLY:'0',ADMIN_ALLOWED_HOSTS:'127.0.0.1'},stdio:['ignore','pipe','pipe'],windowsHide:true});
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
  assert.equal(resolve(directory).startsWith(resolve(join(tmpdir(),'gene-seo-test-'))),true);
  await rm(directory,{recursive:true,force:true});
});


test('public pages prerender public links only, preload the serif subset and share one image viewer',async()=>{
  const page=async path=>(await (await fetch(origin+path)).text());
  const home=await page('/');
  const rules=JSON.parse(/<script type="speculationrules">([^<]*)<\/script>/.exec(home)[1]);
  assert.deepEqual(rules.prerender[0].where.and[1],{not:{href_matches:['/admin*','/forum*','/api/*']}});
  assert.equal(rules.prerender[0].eagerness,'moderate');
  // Next serialises the root 404 tree into every payload; only a real tag counts.
  for(const path of ['/admin','/forum'])assert.doesNotMatch(await page(path),/<script type="speculationrules">/,path+' never prerenders');
  const font=/<link rel="preload" href="(\/redesign\/fonts\/[0-9a-f]{16}\.woff2)" as="font" type="font\/woff2" crossorigin="anonymous"/i.exec(home);
  assert.ok(font,'serif subset preloaded');
  const fontResponse=await fetch(origin+font[1]);assert.equal(fontResponse.status,200);assert.match(fontResponse.headers.get('cache-control'),/immutable/);
  const css=await page('/redesign/fonts.css');
  assert.ok(css.includes(`font-family: 'Team Gene Serif'`)&&css.includes(font[1]),'fonts.css declares the preloaded subset');
  assert.doesNotMatch(home,/id="lightbox"/,'pages without zoomable images carry no viewer');
});
test('record sections with entries stay listed and indexed; HTTPS is pinned for a year',async()=>{
  const {isEmptyOptionalSection}=await import('../lib/content-links.ts');
  const award={...record(),section:'awards',researchBackground:undefined,researchResults:undefined,modelImages:undefined};
  assert.equal(isEmptyOptionalSection('awards',[]),true);
  assert.equal(isEmptyOptionalSection('awards',[award]),false);
  assert.equal(isEmptyOptionalSection('rules',[]),false,'only record sections are optional');
  const page=await request('/awards');
  assert.equal(page.headers.get('strict-transport-security'),'max-age=31536000');
  const head=(await page.text()).split('</head>')[0];
  assert.doesNotMatch(head,/name="robots"/,'the seeded awards keep the page indexable');
  assert.match(await (await request('/sitemap.xml')).text(),/<loc>https:\/\/team-gene\.com\/awards<\/loc>/);
});
test('the mail page and 404 pages list the same header sections as the home page',async()=>{
  // A 404 thrown by a dynamic route streams its body in the RSC payload, where quotes are escaped.
  const navOf=async path=>{
    const html=await (await request(path)).text();
    // Home/mail must expose the links in rendered HTML, not only a serialized 404 fallback.
    const markup=path==='/'||path==='/mail' ? html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'') : html.replace(/\\"/g,'"');
    return [...new Set([...markup.matchAll(/class="nav__link" href="([^"]+)"/g)].map(match=>match[1]))];
  };
  const home=await navOf('/');
  assert.ok(home.includes('/awards'),'the seeded record section is listed on the home page');
  for(const path of ['/mail','/no-such-section','/a/b/c/d'])assert.deepEqual(await navOf(path),home,path);
});
test('public entry detail HTML, discoverable links, sitemap updates and deletion are consistent',async()=>{
  let entry={...record(),title:'Searchable paper',researchBackground:'Unique background visible without JavaScript',researchResults:'Unique findings'};
  let response=await request('/api/content','POST',entry);assert.equal(response.status,200);
  entry=(await response.json()).entries.find(item=>item.id===entry.id);
  const path='/research/'+entry.id;
  let page=await (await request(path)).text();
  const visible=page.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  assert.ok(visible.includes(entry.researchBackground));assert.ok(visible.includes(entry.researchResults));
  assert.ok(page.includes('rel="canonical" href="https://team-gene.com'+path+'"'));
  const schemas=[...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match=>JSON.parse(match[1]));
  assert.ok(schemas.some(schema=>schema['@graph'].some(item=>item['@type']==='BreadcrumbList')));
  const listing=await (await request('/research')).text();
  assert.ok(listing.includes('href="'+path+'"'));
  assert.ok((await (await request('/sitemap.xml')).text()).includes('https://team-gene.com'+path));
  response=await request('/api/content','POST',{...entry,researchResults:'Updated findings'});assert.equal(response.status,200);
  entry=(await response.json()).entries.find(item=>item.id===entry.id);
  assert.ok((await (await request(path)).text()).includes('Updated findings'));
  assert.equal((await request('/members/'+entry.id)).status,404);
  assert.equal((await request('/research/nonexistent-id')).status,404);
  assert.equal((await request('/api/content','DELETE',entry)).status,200);
  assert.equal((await request(path)).status,404);
  assert.ok(!(await (await request('/sitemap.xml')).text()).includes(path));
});
test('hidden alumni updates and private pages stay out of public indexing',async()=>{
  assert.equal((await request('/alumni/alumni-01')).status,404);
  const xml=await (await request('/sitemap.xml')).text();
  for(const forbidden of ['/admin','/forum','/alumni/alumni-01'])assert.ok(!xml.includes(forbidden));
  const robots=await (await request('/robots.txt')).text();assert.ok(robots.includes('Allow: /api/media/'));
  const page=await (await request('/forum')).text();assert.ok(page.includes('noindex, nofollow'));
});

test('profile slugs, old-ID redirects and renamed aliases stay consistent with links and sitemap',async()=>{
  const asset=await upload();
  let entry={id:randomUUID(),section:'alumni',alumniType:'profile',graduationYear:2022,title:'林知夏',subtitle:'测试校友',tag:'AI',date:'2026-09-29',body:'个人简介测试',url:'',revision:0,media:[asset]};
  let response=await request('/api/content','POST',entry);assert.equal(response.status,200);
  entry=(await response.json()).entries.find(item=>item.id===entry.id);
  assert.equal(entry.slug,'2022-linzhixia');
  let redirect=await fetch(origin+'/alumni/'+entry.id,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 MicroMessenger'}});
  assert.equal(redirect.status,308);assert.ok(redirect.headers.get('location').endsWith('/alumni/2022-linzhixia'));
  let html=await (await request('/alumni/'+entry.slug)).text();
  const head=html.split('</head>')[0];
  assert.ok(head.includes('rel="canonical" href="https://team-gene.com/alumni/2022-linzhixia"'));
  for(const property of ['og:image','twitter:image']) assert.match(head,new RegExp(`(?:property|name)="${property}" content="https://team-gene.com/api/share-image/${asset.key}"`));
  assert.ok(html.includes(entry.body));
  assert.ok((await (await request('/alumni')).text()).includes('href="/alumni/2022-linzhixia"'));
  response=await request('/api/share-image/'+asset.key);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/jpeg/);
  const image=Buffer.from(await response.arrayBuffer());const dimensions=await sharp(image).metadata();
  assert.equal(dimensions.width,1200);assert.equal(dimensions.height,630);assert.ok(image.length<500000);
  assert.deepEqual(Buffer.from(await (await request('/api/media/'+asset.key)).arrayBuffer()),png,'original portrait unchanged');
  const second={...entry,id:randomUUID(),revision:0};response=await request('/api/content','POST',second);
  const other=(await response.json()).entries.find(item=>item.id===second.id);assert.equal(other.slug,'2022-linzhixia-2');
  response=await request('/api/content','POST',{...entry,graduationYear:2023});
  entry=(await response.json()).entries.find(item=>item.id===entry.id);assert.equal(entry.slug,'2023-linzhixia');
  redirect=await fetch(origin+'/alumni/2022-linzhixia',{redirect:'manual'});assert.equal(redirect.status,308);assert.ok(redirect.headers.get('location').endsWith('/alumni/2023-linzhixia'));
  const sitemap=await (await request('/sitemap.xml')).text();assert.ok(sitemap.includes('/alumni/2023-linzhixia</loc>'));assert.ok(!sitemap.includes('/alumni/'+entry.id));
  await request('/api/content','DELETE',entry);await request('/api/content','DELETE',other);
  assert.equal((await request('/alumni/2022-linzhixia')).status,404);
  assert.equal((await request('/api/share-image/'+asset.key)).status,404);
});

test('brand preview tags are in the initial head; requested example notices are removed',async()=>{
  for(const path of ['/','/members','/alumni','/research','/rules','/news','/life','/mail','/forum']) {
    const page=await (await fetch(origin+path,{headers:{'User-Agent':'Mozilla/5.0 MicroMessenger'}})).text();
    const head=page.split('</head>')[0];
    assert.match(head,/property="og:image" content="https:\/\/team-gene.com\/share\/team-gene.png"/);
    assert.match(head,/name="twitter:card" content="summary_large_image"/);
    for(const phrase of ['以上规则为网站示例草案，正式生效内容由团队确认。','此为示例通知。','此为示例活动记录。'])assert.ok(!page.includes(phrase));
  }
});
