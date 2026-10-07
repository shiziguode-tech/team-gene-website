import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { versionedCache } from '../db/versioned-cache.ts';

test('cached database reads refresh after writes from this or another connection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gene-cache-test-'));
  const reader = new DatabaseSync(join(directory, 'cache.sqlite')), writer = new DatabaseSync(join(directory, 'cache.sqlite'));
  try {
    reader.exec('PRAGMA journal_mode = WAL; CREATE TABLE content (id TEXT PRIMARY KEY, title TEXT)');
    let computed = 0;
    const titles = versionedCache(db => { computed++; return db.prepare('SELECT title FROM content ORDER BY id').all().map(row => row.title); });
    assert.deepEqual(titles(reader), []);
    assert.equal(titles(reader), titles(reader)); assert.equal(computed, 1, 'unchanged data is not read again');
    writer.prepare('INSERT INTO content VALUES (?, ?)').run('a', 'from another connection');
    assert.deepEqual(titles(reader), ['from another connection']);
    reader.prepare('INSERT INTO content VALUES (?, ?)').run('b', 'from this connection');
    assert.deepEqual(titles(reader), ['from another connection', 'from this connection']);
    assert.equal(computed, 3);
    const selfWriting = versionedCache(db => { db.prepare('INSERT OR IGNORE INTO content VALUES (?, ?)').run('c', 'allocated while computing'); return ++computed; });
    assert.equal(selfWriting(reader), selfWriting(reader), 'writes made while computing do not invalidate the result');
  } finally { reader.close(); writer.close(); await rm(directory, { recursive: true, force: true }); }
});

test('a commit made by another connection during computation is not hidden behind a fresh cache version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'gene-cache-race-test-'));
  const reader = new DatabaseSync(join(directory, 'cache.sqlite')), writer = new DatabaseSync(join(directory, 'cache.sqlite'));
  try {
    reader.exec("PRAGMA journal_mode = WAL; CREATE TABLE content (title TEXT); INSERT INTO content VALUES ('before edit')");
    let computed = 0;
    const title = versionedCache(db => {
      computed++;
      const value = db.prepare('SELECT title FROM content').get().title;
      // This commit lands after the SELECT but before the cache reads its
      // final token, exactly like a CMS update in another route/process.
      if (computed === 1) writer.prepare('UPDATE content SET title=?').run('after edit');
      return value;
    });
    assert.equal(title(reader), 'before edit', 'the first read may observe the snapshot before the concurrent edit');
    assert.equal(title(reader), 'after edit', 'the subsequent request must not reuse the stale read');
    assert.equal(title(reader), 'after edit');
    assert.equal(computed, 2, 'a stable recomputation can be cached normally');
  } finally {
    reader.close(); writer.close();
    assert.ok(directory.startsWith(join(tmpdir(), 'gene-cache-race-test-')));
    await rm(directory, { recursive: true, force: true });
  }
});
