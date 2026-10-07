import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import ts from 'typescript';
import { AnimatedMediaError, deleteMedia, mediaVariant, mediaVariantWidth, resizableMedia } from '../db/media.ts';

async function withUploads(run) {
  const root = await mkdtemp(join(tmpdir(), 'gene-variant-test-'));
  const previous = process.env.DATA_DIR; process.env.DATA_DIR = root;
  try { await mkdir(join(root, 'uploads')); await run(root); }
  finally {
    if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
}
const photo = (width, height) => sharp({ create: { width, height, channels: 3, background: '#3d7a63' } }).png().toBuffer();
const routeSource = (await readFile(new URL('../app/api/media/[key]/route.ts', import.meta.url), 'utf8'))
  .replace("'@/db/media'", JSON.stringify(new URL('../db/media.ts', import.meta.url).href))
  .replace("'@/lib/server-file-response'", JSON.stringify(new URL('../lib/server-file-response.ts', import.meta.url).href));
const route = await import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText).toString('base64'));

test('only fixed widths and still-image formats are resized', () => {
  assert.deepEqual([320, 640, 960, 1600].map(String).map(mediaVariantWidth), [320, 640, 960, 1600]);
  for (const value of ['500', '0', '', null, '640px', '1e3']) assert.equal(mediaVariantWidth(value), null);
  const key = randomUUID();
  for (const ext of ['jpg', 'png', 'webp', 'avif']) assert.ok(resizableMedia(`${key}.${ext}`));
  for (const ext of ['gif', 'mp4', 'webm']) assert.ok(!resizableMedia(`${key}.${ext}`), `${ext} keeps its original`);
  assert.ok(!resizableMedia('../../etc/passwd.png'));
});

test('animated WebP retains all original frames instead of becoming a still thumbnail', async () => {
  await withUploads(async root => {
    const key = `${randomUUID()}.webp`;
    const pixels = Buffer.from([
      255,0,0, 255,0,0, 255,0,0, 255,0,0,
      0,0,255, 0,0,255, 0,0,255, 0,0,255,
    ]);
    const animation = await sharp(pixels, { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } })
      .webp({ delay: [100, 100], loop: 0 }).toBuffer();
    const path = join(root, 'uploads', key);
    await writeFile(path, animation);
    assert.equal((await sharp(animation).metadata()).pages, 2);
    await assert.rejects(mediaVariant(key, 320), AnimatedMediaError);
    const response = await route.GET(new Request(`https://team-gene.com/api/media/${key}?w=320`), { params: Promise.resolve({ key }) });
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), `/api/media/${key}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await readFile(path), animation);
    await assert.rejects(stat(join(root, 'media-variants')), { code: 'ENOENT' });
  });
});

test('an orphaned cached thumbnail is not served when its original has been removed', async () => {
  await withUploads(async root => {
    const key = `${randomUUID()}.png`;
    const original = join(root, 'uploads', key);
    await writeFile(original, await photo(500, 300));
    await mediaVariant(key, 320);
    await unlink(original);
    await assert.rejects(mediaVariant(key, 320), { code: 'ENOENT' });
  });
});

// Pause only the final encoder result, after sharp has consumed the source.
// This makes deletion and failed publication deterministic without huge files.
async function pauseEncoding(run) {
  const original = sharp.prototype.toBuffer;
  const entered = Promise.withResolvers();
  const gate = Promise.withResolvers();
  sharp.prototype.toBuffer = async function (...args) {
    const result = await original.apply(this, args);
    entered.resolve();
    await gate.promise;
    return result;
  };
  try { await run(entered.promise, () => gate.resolve()); }
  finally { gate.resolve(); sharp.prototype.toBuffer = original; }
}

test('deletion during thumbnail generation cannot recreate cached or temporary files', async () => {
  await withUploads(async root => {
    const key = `${randomUUID()}.png`, source = join(root, 'uploads', key);
    await writeFile(source, await photo(500, 300));
    await pauseEncoding(async (encoded, release) => {
      const rejected = assert.rejects(mediaVariant(key, 320), { code: 'ENOENT' });
      await encoded;
      const deletion = deleteMedia(key);
      // Wait until unlink completes while the in-flight encoding job is held.
      const deadline = Date.now() + 3000;
      for (;;) {
        try { await stat(source); }
        catch (error) { assert.equal(error.code, 'ENOENT'); break; }
        assert.ok(Date.now() < deadline, 'deletion must unlink the original before draining encoder jobs');
        await new Promise(done => setImmediate(done));
      }
      release();
      await Promise.all([rejected, deletion]);
      assert.deepEqual(await readdir(join(root, 'media-variants', 'v1')), []);
      await assert.rejects(mediaVariant(key, 320), { code: 'ENOENT' });
    });
  });
});

test('failed thumbnail publication removes its temporary file', async () => {
  await withUploads(async root => {
    const key = `${randomUUID()}.png`;
    await writeFile(join(root, 'uploads', key), await photo(500, 300));
    await pauseEncoding(async (encoded, release) => {
      const rejected = assert.rejects(mediaVariant(key, 320));
      await encoded;
      const cache = join(root, 'media-variants', 'v1');
      // A directory at the output name makes the final atomic rename fail.
      await mkdir(join(cache, `${key}.320.webp`), { recursive: true });
      release();
      await rejected;
      assert.deepEqual(await readdir(cache), [`${key}.320.webp`]);
      assert.ok((await stat(join(root, 'uploads', key))).isFile());
    });
  });
});

test('variants keep proportions, are never enlarged, are cached and are deleted with the upload', async () => {
  await withUploads(async root => {
    const large = `${randomUUID()}.png`, small = `${randomUUID()}.jpg`;
    await writeFile(join(root, 'uploads', large), await photo(2400, 1800));
    await writeFile(join(root, 'uploads', small), await sharp({ create: { width: 200, height: 100, channels: 3, background: '#b35a34' } }).jpeg().toBuffer());
    const [first, concurrent] = await Promise.all([mediaVariant(large, 640), mediaVariant(large, 640)]);
    assert.deepEqual(first, concurrent, 'concurrent requests share one rendition');
    const meta = await sharp(first).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 640, 480]);
    assert.equal((await sharp(await mediaVariant(small, 1600)).metadata()).width, 200);
    assert.deepEqual(await mediaVariant(large, 640), first, 'second request reads the cached file');
    assert.deepEqual((await readdir(join(root, 'media-variants', 'v1'))).sort(), [`${large}.640.webp`, `${small}.1600.webp`].sort());
    await deleteMedia(large);
    assert.deepEqual(await readdir(join(root, 'media-variants', 'v1')), [`${small}.1600.webp`]);
    await assert.rejects(mediaVariant(large, 320), error => error.code === 'ENOENT', 'a removed upload is a 404, not a resize failure');
  });
});
