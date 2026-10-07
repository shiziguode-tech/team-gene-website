import test from 'node:test';
import assert from 'node:assert/strict';
import { runUploadBatch, sendFileRequest } from '../lib/upload-transfer.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
test('CMS batch uses two slots, starts the next file immediately, and returns selection order', async () => {
  const started = [], done = [];
  const jobs = new Map();
  const batch = runUploadBatch(['avatar', 'second', 'third', 'fourth'], new AbortController().signal, (file, index) => {
    started.push(file);
    return new Promise(resolve => jobs.set(index, () => resolve(file)));
  }, (file, index) => done.push({ file, index }));
  assert.deepEqual(started, ['avatar', 'second']);
  jobs.get(1)(); await tick();
  assert.deepEqual(started, ['avatar', 'second', 'third']);
  jobs.get(2)(); await tick();
  assert.equal(started.length, 4);
  jobs.get(3)(); jobs.get(0)();
  assert.deepEqual(await batch, ['avatar', 'second', 'third', 'fourth']);
  assert.deepEqual(done.map(item => item.index), [1, 2, 3, 0]);
  assert.deepEqual(done.sort((a,b) => a.index-b.index).map(item => item.file), ['avatar', 'second', 'third', 'fourth']);
});

test('batch failures stop pending uploads and retain completed work without replay', async () => {
  let failed, cancelled = 0;
  const completed = [], started = [];
  const batch = runUploadBatch([0,1,2,3], new AbortController().signal, async (value, _index, signal) => {
    started.push(value);
    if (value === 0) return 'saved';
    return new Promise((_resolve, reject) => {
      if (value === 1) failed = () => reject(new Error('disk full'));
      signal.addEventListener('abort', () => { cancelled++; reject(new DOMException('cancel', 'AbortError')); }, { once:true });
    });
  }, value => completed.push(value));
  const rejection = assert.rejects(batch, /disk full/);
  await tick(); failed(); await rejection;
  assert.deepEqual(completed, ['saved']);
  assert.deepEqual(started, [0,1,2]);
  assert.equal(cancelled, 2);
});

test('pre-cancelled batches issue no request, and a synchronous send failure clears timers/listeners', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runUploadBatch([1], controller.signal, async () => { assert.fail('must not send'); }), { name:'AbortError' });
  const original = globalThis.XMLHttpRequest;
  let aborted = false;
  globalThis.XMLHttpRequest = class {
    upload = {};
    open() {}
    setRequestHeader() {}
    send() { throw new Error('blocked'); }
    abort() { aborted = true; }
  };
  try {
    const active = new AbortController();
    await assert.rejects(sendFileRequest('/upload', new File(['x'], 'x.png'), active.signal, () => {}), /blocked/);
    active.abort();
    assert.equal(aborted, false);
  } finally { globalThis.XMLHttpRequest = original; }
});
