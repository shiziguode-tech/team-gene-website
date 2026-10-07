import { avatarForEmail } from '@/db/avatars';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { contentDb } from '@/db/content';

export type ForumUser = { email: string; displayName: string; createdAt: number; avatarUrl?: string | null };
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

// Called for every forum request (and for each post in the feed), so create
// the tables once per connection rather than re-running the DDL each time.
const forumSchemaReady = new WeakSet<object>();
export function forumDb() {
  const db = contentDb();
  if (forumSchemaReady.has(db)) return db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS forum_profiles (
      email TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forum_sessions (
      token_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS forum_sessions_expiry ON forum_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS forum_posts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      body TEXT NOT NULL,
      media_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS forum_posts_feed ON forum_posts(deleted, created_at);
    CREATE TABLE IF NOT EXISTS forum_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      email TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS forum_comments_post ON forum_comments(post_id, deleted, created_at);
    CREATE TABLE IF NOT EXISTS forum_auth_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS forum_auth_attempts_ip ON forum_auth_attempts(ip_hash, created_at);
  `);
  const columns = db.prepare('PRAGMA table_info(forum_comments)').all() as { name: string }[];
  if (!columns.some(column => column.name === 'media_json')) {
    db.exec("ALTER TABLE forum_comments ADD COLUMN media_json TEXT NOT NULL DEFAULT '[]'");
  }
  forumSchemaReady.add(db);
  return db;
}

export function normalizeForumName(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 40) : '';
}

export function createForumSession(email: string) {
  const db = forumDb();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL;
  db.prepare('DELETE FROM forum_sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO forum_sessions (token_hash,email,expires_at) VALUES (?,?,?)')
    .run(createHash('sha256').update(token).digest('hex'), email, expiresAt);
  return { token, maxAge: SESSION_TTL / 1000 };
}

// Profile creation and the first login must succeed together. Otherwise a
// failed session write leaves an unusable identity that blocks signup retries,
// even after the mailbox service has rolled the new account back.
export function registerForumUser(email: string, displayName: string) {
  const db = forumDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const user = { email, displayName, createdAt: Date.now() };
    db.prepare('INSERT INTO forum_profiles (email,display_name,created_at) VALUES (?,?,?)')
      .run(user.email, user.displayName, user.createdAt);
    const session = createForumSession(email);
    db.exec('COMMIT');
    return { user, session };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function forumUserForToken(token?: string | null): ForumUser | null {
  if (!token || token.length > 128) return null;
  const row = forumDb().prepare(`
    SELECT p.email, p.display_name AS displayName, p.created_at AS createdAt
    FROM forum_sessions s JOIN forum_profiles p ON p.email=s.email
    WHERE s.token_hash=? AND s.expires_at>?
  `).get(createHash('sha256').update(token).digest('hex'), Date.now()) as ForumUser | undefined;
  return row ? { ...row, avatarUrl: avatarForEmail(row.email) } : null;
}

export function forumUserForRequest(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = /(?:^|;\s*)gene_forum=([A-Za-z0-9_-]{32,100})(?:;|$)/.exec(cookie);
  return forumUserForToken(match?.[1]);
}

export function deleteForumSession(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = /(?:^|;\s*)gene_forum=([A-Za-z0-9_-]{32,100})(?:;|$)/.exec(cookie);
  if (match) forumDb().prepare('DELETE FROM forum_sessions WHERE token_hash=?')
    .run(createHash('sha256').update(match[1]).digest('hex'));
}

export function revokeForumSessions(email: string) {
  forumDb().prepare('DELETE FROM forum_sessions WHERE email=?').run(email.toLowerCase());
}

// Preserve authorship and media when an address is released for reuse. A new
// mailbox owner must never inherit the previous owner's forum identity.
export function retireForumIdentity(address: string) {
  const email = address.toLowerCase();
  const archived = `retired:${randomUUID()}:${email}`;
  avatarForEmail(email); // Ensure the optional avatar table exists.
  const db = forumDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM forum_sessions WHERE email=?').run(email);
    for (const table of ['forum_profiles', 'forum_posts', 'forum_comments', 'account_avatars']) {
      db.prepare(`UPDATE ${table} SET email=? WHERE email=?`).run(archived, email);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function checkForumAuthRate(ip: string, secret: string) {
  const db = forumDb();
  const now = Date.now();
  const ipHash = createHash('sha256').update(secret).update(ip).digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM forum_auth_attempts WHERE created_at < ?').run(now - 24 * 60 * 60 * 1000);
    const count = db.prepare('SELECT COUNT(*) AS count FROM forum_auth_attempts WHERE ip_hash=? AND created_at>?')
      .get(ipHash, now - 15 * 60 * 1000) as { count: number };
    if (count.count >= 12) { db.exec('ROLLBACK'); return false; }
    db.prepare('INSERT INTO forum_auth_attempts (ip_hash,created_at) VALUES (?,?)').run(ipHash, now);
    db.exec('COMMIT');
    return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function forumSessionCookie(token: string, maxAge: number) {
  return `gene_forum=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export const FORUM_SESSION_COOKIE = 'gene_forum';
