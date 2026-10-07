import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadTS(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  for (const [from, to] of replacements) source = source.replace(from, to);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}
const quota = await loadTS('../lib/mail-quota.ts');

test('quota units and validation reject unlimited, fractional, strings and overflow', () => {
  assert.equal(quota.DEFAULT_MAILBOX_QUOTA_BYTES, 536870912);
  assert.equal(quota.quotaBytesFromMB(1), 1048576);
  assert.equal(quota.quotaBytesFromMB(512), 536870912);
  for (const value of [0, -1, 1.1, '512', null, undefined, Infinity, NaN, Number.MAX_SAFE_INTEGER]) {
    assert.equal(quota.quotaBytesFromMB(value), null);
  }
});

test('quota patch accepts a null JMAP success, patches only disk quota and verifies persisted value', async () => {
  const stalwart = await loadTS('../lib/stalwart.ts', [
    ["import 'server-only';", ''],
    ["import { DEFAULT_MAILBOX_QUOTA_BYTES } from './mail-quota';", 'const DEFAULT_MAILBOX_QUOTA_BYTES = 536870912;'],
  ]);
  process.env.STALWART_API_URL = 'https://example.invalid/jmap';
  process.env.STALWART_API_TOKEN = 'test-only';
  process.env.STALWART_DOMAIN_ID = 'b';
  const originalFetch = globalThis.fetch;
  let requestedPatch;
  let persisted = 768 * 1048576;
  globalThis.fetch = async (_, options) => {
    const [method, args, id] = JSON.parse(options.body).methodCalls[0];
    if (method === 'x:Account/set') {
      requestedPatch = args;
      return Response.json({ methodResponses: [[method, { updated: { c: null } }, id]] });
    }
    return Response.json({ methodResponses: [[method, { list: [{ id: 'c', '@type': 'User', domainId: 'b', roles: { '@type': 'User' }, quotas: { maxDiskQuota: persisted, maxEmails: 20000 } }] }, id]] });
  };
  try {
    const updated = await stalwart.updateMailboxQuota('c', persisted);
    assert.deepEqual(requestedPatch, { update: { c: { 'quotas/maxDiskQuota': 805306368 } } });
    assert.equal(updated.quotas.maxEmails, 20000);
    persisted = 128 * 1048576;
    await assert.rejects(stalwart.updateMailboxQuota('c', 512 * 1048576), /read-back/);
    process.env.STALWART_DOMAIN_ID = 'other-domain';
    assert.equal(await stalwart.getManagedMailbox('c'), null);
  } finally { globalThis.fetch = originalFetch; }
});

test('admin route refuses shrinking below used space without updating the mailbox', async () => {
  const route = await loadTS('../app/api/admin/mailboxes/route.ts', [
    [/^import .*;\r?\n/gm, ''],
    ['export const runtime', `
      const cookies = async () => ({get: () => ({value: 'test'})});
      const ADMIN_COOKIE = 'gene_admin';
      const hasAdminSession = async () => true;
      const adminAccessAllowed = () => true;
      const expectedRequestOrigin = () => 'https://team-gene.com';
      const quotaBytesFromMB = value => Number.isSafeInteger(value) && value > 0 ? value * 1048576 : null;
      const getManagedMailbox = async () => ({usedDiskQuota: 2 * 1048576});
      const updateMailboxQuota = async () => { throw new Error('Must not update'); };
      export const runtime`],
  ]);
  const result = await route.PATCH(new Request('https://team-gene.com/api/admin/mailboxes', {
    method: 'PATCH', headers: {Origin: 'https://team-gene.com'}, body: JSON.stringify({id: 'c', quotaMB: 1}),
  }));
  assert.equal(result.status, 409);
});


test('mailbox password reset accepts the JMAP null success response', async () => {
  const stalwart = await loadTS('../lib/stalwart.ts', [
    ["import 'server-only';", ''],
    ["import { DEFAULT_MAILBOX_QUOTA_BYTES } from './mail-quota';", 'const DEFAULT_MAILBOX_QUOTA_BYTES = 536870912;'],
  ]);
  process.env.STALWART_API_URL='https://example.invalid/jmap';
  process.env.STALWART_API_TOKEN='test-only'; process.env.STALWART_DOMAIN_ID='b';
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({methodResponses:[['x:Account/set',{updated:{c:null}},'gene']]});
  try { await stalwart.resetMailboxPassword('c','test-only-password'); }
  finally { globalThis.fetch=originalFetch; }
});

test('mailbox deletion isolates old forum authorship; password reset revokes sessions', async () => {
  const forum=await loadTS('../db/forum.ts',[
    ["import { contentDb } from '@/db/content';", "import { DatabaseSync } from 'node:sqlite'; export const testDb=new DatabaseSync(':memory:'); const contentDb=()=>testDb;"],
    ["import { avatarForEmail } from '@/db/avatars';", "const avatarForEmail=()=>{ testDb.exec('CREATE TABLE IF NOT EXISTS account_avatars(email TEXT PRIMARY KEY, avatar_id TEXT)');return null; };"],
  ]);
  const db=forum.forumDb(), email='previous@team-gene.com';
  try {
    db.prepare('INSERT INTO forum_profiles VALUES(?,?,?)').run(email,'Previous owner',1);
    db.prepare('INSERT INTO forum_posts(id,email,body,created_at) VALUES(?,?,?,?)').run('post',email,'Keep this post',1);
    db.prepare('INSERT INTO forum_comments(id,post_id,email,body,created_at) VALUES(?,?,?,?,?)').run('comment','post',email,'Keep this comment',1);
    const first=forum.createForumSession(email);
    assert.ok(forum.forumUserForToken(first.token));
    forum.revokeForumSessions(email); assert.equal(forum.forumUserForToken(first.token),null);
    const second=forum.createForumSession(email);
    db.prepare('INSERT INTO account_avatars VALUES(?,?)').run(email,'old-photo');
    forum.retireForumIdentity(email);
    assert.equal(forum.forumUserForToken(second.token),null);
    assert.equal(db.prepare('SELECT * FROM forum_profiles WHERE email=?').get(email),undefined);
    db.prepare('INSERT INTO forum_profiles VALUES(?,?,?)').run(email,'New owner',2);
    assert.equal(db.prepare('SELECT p.display_name FROM forum_posts f JOIN forum_profiles p ON p.email=f.email').get().display_name,'Previous owner');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM forum_comments').get().n,1);
    assert.equal(db.prepare('SELECT avatar_id FROM account_avatars WHERE email=?').get(email),undefined);
  } finally {db.close();}
});
