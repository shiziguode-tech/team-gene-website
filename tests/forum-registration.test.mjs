import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function isolatedForum() {
  const source = (await readFile(new URL('../db/forum.ts', import.meta.url), 'utf8'))
    .replace("import { contentDb } from '@/db/content';", "import { DatabaseSync } from 'node:sqlite'; export const testDb = new DatabaseSync(':memory:'); const contentDb = () => testDb;")
    .replace("import { avatarForEmail } from '@/db/avatars';", 'const avatarForEmail = () => null;');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

test('forum signup rolls profile creation back when its initial session fails and permits retry', async () => {
  const forum = await isolatedForum();
  const db = forum.forumDb();
  const email = 'retry@team-gene.com';
  try {
    db.exec(`CREATE TRIGGER reject_test_session BEFORE INSERT ON forum_sessions
      BEGIN SELECT RAISE(ABORT, 'Simulated session storage failure'); END;`);
    assert.throws(() => forum.registerForumUser(email, 'Retry member'), /Simulated session storage failure/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM forum_profiles').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM forum_sessions').get().n, 0);
    db.exec('DROP TRIGGER reject_test_session');
    const { user, session } = forum.registerForumUser(email, 'Retry member');
    assert.equal(user.email, email);
    assert.equal(forum.forumUserForToken(session.token).displayName, 'Retry member');
    assert.throws(() => forum.registerForumUser(email, 'Do not replace'), /UNIQUE constraint/);
    assert.equal(forum.forumUserForToken(session.token).displayName, 'Retry member');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM forum_sessions').get().n, 1);
  } finally { db.close(); }
});
