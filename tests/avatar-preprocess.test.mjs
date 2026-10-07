import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { avatarDimensions, prepareAvatar } from '../lib/avatar-preprocess.js';

function png(width, height, size = 140_000) {
  const bytes = new Uint8Array(size);
  bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width); view.setUint32(20, height);
  return new File([bytes], '相片.png', { type:'image/png', lastModified:7 });
}
function browser({ width=1600, height=900, blob=new Blob(['webp'],{type:'image/webp'}), afterDecode=()=>{} } = {}) {
  const originals = { bitmap:globalThis.createImageBitmap, document:globalThis.document };
  let closed = false, draw;
  const context = { drawImage(...args) { draw=args; } };
  const canvas = { width:0, height:0, getContext:()=>context, toBlob(callback, mime, quality) {
    assert.equal(mime,'image/webp'); assert.equal(quality,0.92); callback(blob);
  } };
  const bitmap = { width,height,close(){closed=true;} };
  globalThis.createImageBitmap = async (_file, options) => { assert.equal(options.imageOrientation,'from-image'); afterDecode(); return bitmap; };
  globalThis.document = { createElement(name) { assert.equal(name,'canvas'); return canvas; } };
  return {canvas,context,get draw(){return draw;},get closed(){return closed;},restore(){globalThis.createImageBitmap=originals.bitmap;globalThis.document=originals.document;}};
}

test('camera avatars crop to centered 512 WebP, preserve filename identity, and release image resources', async () => {
  const env=browser();
  try {
    const result=await prepareAvatar(png(1600,900));
    assert.equal(result.name,'相片.webp');assert.equal(result.type,'image/webp');assert.equal(result.lastModified,7);
    assert.deepEqual(env.draw.slice(1),[350,0,900,900,0,0,512,512]);
    assert.equal(env.context.imageSmoothingQuality,'high'); assert.equal(env.closed,true);
    assert.equal(env.canvas.width,0);assert.equal(env.canvas.height,0);
  } finally {env.restore();}
});

test('EXIF-oriented portrait dimensions crop vertically; unsupported or larger encodings retain original bytes', async () => {
  const file=png(1600,900);
  const env=browser({width:900,height:1600,blob:new Blob([new Uint8Array(file.size+1)],{type:'image/webp'})});
  try {
    assert.equal(await prepareAvatar(file),file);
    assert.deepEqual(env.draw.slice(1),[0,350,900,900,0,0,512,512]);
  } finally {env.restore();}
  const fallback=browser({blob:new Blob(['pngfallback'],{type:'image/png'})});
  try {assert.equal(await prepareAvatar(file),file);} finally {fallback.restore();}
});

test('dimension checks prevent decoding oversized pixel images, and unknown formats safely use server processing', async () => {
  const env=browser({afterDecode(){assert.fail('must not decode');}});
  try {
    await assert.rejects(prepareAvatar(png(10_000,10_000)),/6400 万像素/);
    const avif=new File([new Uint8Array(140_000)],'a.avif',{type:'image/avif'});
    assert.equal(await prepareAvatar(avif),avif);
    const small=png(10,10,100);assert.equal(await prepareAvatar(small),small);
  } finally {env.restore();}
});

test('cancellation after bitmap decoding closes the image and prevents upload conversion', async () => {
  const controller=new AbortController();
  const env=browser({afterDecode(){controller.abort();}});
  try {
    await assert.rejects(prepareAvatar(png(1600,900),{signal:controller.signal}),{name:'AbortError'});
    assert.equal(env.closed,true);assert.equal(env.draw,undefined);
  } finally {env.restore();}
});

test('bounded header parser recognizes JPEG, GIF and WebP dimension variants without full decoding', () => {
  const jpeg=new Uint8Array([255,216,255,224,0,4,0,0,255,192,0,8,8,3,132,6,64,0]);
  assert.deepEqual(avatarDimensions(jpeg),{width:1600,height:900});
  const gif=new Uint8Array([71,73,70,56,57,97,64,6,132,3]);
  assert.deepEqual(avatarDimensions(gif),{width:1600,height:900});
  const webp=new Uint8Array(30);webp.set(Buffer.from('RIFF'),0);webp.set(Buffer.from('WEBPVP8X'),8);
  webp.set([63,6,0,131,3,0],24);
  assert.deepEqual(avatarDimensions(webp),{width:1600,height:900});
  assert.equal(avatarDimensions(new Uint8Array([255,216,255,192])),null);
});

test('header dimensions match real JPEG/PNG/GIF/lossy and lossless WebP encoders', async () => {
  const source=sharp({create:{width:640,height:360,channels:4,background:{r:120,g:30,b:200,alpha:0.7}}});
  for(const encoded of [source.clone().jpeg(),source.clone().png(),source.clone().gif(),source.clone().webp(),source.clone().webp({lossless:true})]) {
    const bytes=await encoded.toBuffer();
    assert.deepEqual(avatarDimensions(bytes),{width:640,height:360});
  }
});
