import test from 'node:test';
import assert from 'node:assert/strict';
import {localContentDate} from '../lib/admin-content.ts';

test('new CMS records use the local calendar day on either side of UTC midnight',()=>{
  const previous=process.env.TZ;
  try {
    process.env.TZ='Asia/Taipei';
    assert.equal(localContentDate(new Date('2026-09-29T17:00:00Z')),'2026-09-30');
    assert.equal(localContentDate(new Date('2026-12-31T16:00:00Z')),'2027-01-01');
    process.env.TZ='America/Los_Angeles';
    assert.equal(localContentDate(new Date('2026-10-01T03:00:00Z')),'2026-09-30');
  } finally {
    if(previous===undefined)delete process.env.TZ;
    else process.env.TZ=previous;
  }
});
