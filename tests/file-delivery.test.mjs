import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { publicFileResponse } from '../lib/server-file-response.ts';

test('public file downloads support conditional caches, valid ranges, HEAD and If-Range', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gene-delivery-'));
  const previous = process.env.MEDIA_ACCEL_REDIRECT; delete process.env.MEDIA_ACCEL_REDIRECT;
  try {
    const path = join(dir, 'video.mp4'), payload = Buffer.from('0123456789');
    await writeFile(path, payload);
    const file = { path, stat: await stat(path), accelUri: '/_team_gene_media/uploads/known-key.mp4' };
    const request = (headers = {}, method = 'GET') => new Request('http://localhost/api/media/video.mp4', { method, headers });
    const result = await publicFileResponse(request(), file, 'video/mp4');
    assert.equal(result.status, 200); assert.equal(await result.text(), '0123456789');
    const etag = result.headers.get('etag'), modified = result.headers.get('last-modified');
    for (const headers of [{ 'if-none-match': etag }, { 'if-none-match': 'W/' + etag }, { 'if-none-match': '*' }, { 'if-modified-since': modified }]) {
      const cached = await publicFileResponse(request(headers), file, 'video/mp4');
      assert.equal(cached.status, 304); assert.equal(cached.body, null); assert.equal(cached.headers.get('content-length'), null);
    }
    const precedence = await publicFileResponse(request({ 'if-none-match': '"different"', 'if-modified-since': modified }), file, 'video/mp4');
    assert.equal(precedence.status, 200); await precedence.body.cancel();
    for (const [range, expected, position] of [['bytes=2-5', '2345', '2-5'], ['bytes=-3', '789', '7-9'], ['bytes=8-', '89', '8-9']]) {
      const partial = await publicFileResponse(request({ range, 'if-range': etag }), file, 'video/mp4');
      assert.equal(partial.status, 206); assert.equal(partial.headers.get('content-range'), `bytes ${position}/10`); assert.equal(await partial.text(), expected);
    }
    const changed = await publicFileResponse(request({ range: 'bytes=2-5', 'if-range': '"outdated"' }), file, 'video/mp4');
    assert.equal(changed.status, 200); assert.equal(await changed.text(), '0123456789');
    for (const range of ['bytes=99-', 'bytes=-0', 'bytes=5-2', 'bytes=0-1,5-9', 'invalid']) {
      const invalid = await publicFileResponse(request({ range }), file, 'video/mp4');
      assert.equal(invalid.status, 416); assert.equal(invalid.headers.get('content-range'), 'bytes */10');
    }
    const head = await publicFileResponse(request({ range: 'bytes=2-5' }, 'HEAD'), file, 'video/mp4');
    assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '10'); assert.equal(head.body, null);
  } finally {
    if (previous === undefined) delete process.env.MEDIA_ACCEL_REDIRECT; else process.env.MEDIA_ACCEL_REDIRECT = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test('nginx acceleration is explicitly enabled, keeps metadata and leaves range delivery to nginx', async () => {
  const previous = process.env.MEDIA_ACCEL_REDIRECT; process.env.MEDIA_ACCEL_REDIRECT = '1';
  try {
    // Metadata already validated by the caller: the accelerated handler never
    // opens or reads the payload, even for a multi-gigabyte file.
    const file = { path: 'never-open-this-file', stat: { size: 500 * 1024 * 1024, mtimeMs: 1700000000000 }, accelUri: '/_team_gene_media/uploads/valid.mp4' };
    for (const method of ['GET', 'HEAD']) {
      const response = await publicFileResponse(new Request('http://localhost/file', { method, headers: { range: 'bytes=50-99' } }), file, 'video/mp4');
      assert.equal(response.status, 200); assert.equal(response.body, null);
      assert.equal(response.headers.get('x-accel-redirect'), file.accelUri);
      assert.equal(response.headers.get('content-length'), String(file.stat.size));
      assert.equal(response.headers.get('content-range'), null);
      assert.equal(response.headers.get('etag'), '"6553f100-1f400000"');
    }
  } finally {
    if (previous === undefined) delete process.env.MEDIA_ACCEL_REDIRECT; else process.env.MEDIA_ACCEL_REDIRECT = previous;
  }
});
