import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withImageProcessingSlot } from '../lib/image-processing.js';

test('mixed image jobs share at most two decoding slots and errors release their slot', async () => {
  let running = 0, peak = 0;
  const gates = Array.from({ length: 6 }, () => Promise.withResolvers());
  const started = Array.from({ length: 6 }, () => Promise.withResolvers());
  const jobs = gates.map((gate, index) => withImageProcessingSlot(async () => {
    running++; peak = Math.max(peak, running); started[index].resolve();
    try { await gate.promise; if (index === 1) throw new Error('Bad image'); return index; }
    finally { running--; }
  }));
  const outcomes = Promise.allSettled(jobs);
  await Promise.all(started.slice(0, 2).map(gate => gate.promise));
  assert.equal(running, 2);
  for (let index = 0; index < gates.length; index++) {
    gates[index].resolve();
    if (index + 2 < gates.length) await started[index + 2].promise;
  }
  assert.equal(peak, 2);
  assert.equal((await outcomes)[1].status, 'rejected');
  assert.equal(await withImageProcessingSlot(async () => 'available'), 'available');
});
