import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeMediaStream, MediaUploadSizeError } from '../db/media.ts';

test('failed or misdeclared streams remove only their own partial file',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gene-stream-test-'));
  const previous=process.env.DATA_DIR;process.env.DATA_DIR=root;
  try {
    for(const [parts,size] of [[[new Uint8Array(2)],3],[[new Uint8Array(4)],3]]){
      const body=new ReadableStream({start(c){parts.forEach(p=>c.enqueue(p));c.close();}});
      await assert.rejects(writeMediaStream(randomUUID()+'.png',body,size),MediaUploadSizeError);
      assert.deepEqual(await readdir(join(root,'uploads')),[]);
    }
    let calls=0;
    const broken=new ReadableStream({pull(c){if(calls++===0)c.enqueue(new Uint8Array(3));else c.error(new Error('Disconnected'));}});
    await assert.rejects(writeMediaStream(randomUUID()+'.mp4',broken,6),/Disconnected/);
    assert.deepEqual(await readdir(join(root,'uploads')),[]);
  } finally {
    if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;
    assert.ok(resolve(root).startsWith(resolve(join(tmpdir(),'gene-stream-test-'))));
    await rm(root,{recursive:true,force:true});
  }
});

test('streaming uploads publish atomically, preserve bytes and never overwrite an existing key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gene-stream-test-'));
  const previous = process.env.DATA_DIR; process.env.DATA_DIR = root;
  try {
    const key = randomUUID() + '.mp4', payload = Buffer.alloc(2 * 1024 * 1024, 0x7b);
    let controller;
    const body = new ReadableStream({ start(c) { controller = c; } });
    const transfer = writeMediaStream(key, body, payload.length);
    controller.enqueue(payload.subarray(0, 32 * 1024));
    await new Promise(done => setTimeout(done, 30));
    await assert.rejects(stat(join(root, 'uploads', key)), { code: 'ENOENT' }, 'partial videos must not be readable');
    for (let offset = 32 * 1024; offset < payload.length; offset += 32 * 1024) controller.enqueue(payload.subarray(offset, offset + 32 * 1024));
    controller.close();
    await transfer;
    assert.deepEqual(await readFile(join(root, 'uploads', key)), payload);
    const duplicate = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2])); c.close(); } });
    await assert.rejects(writeMediaStream(key, duplicate, 2), { code: 'EEXIST' });
    assert.deepEqual(await readFile(join(root, 'uploads', key)), payload);
    assert.deepEqual(await readdir(join(root, 'uploads')), [key]);
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
