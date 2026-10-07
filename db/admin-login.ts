import { createHmac } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

// Password-guessing protection for POST /api/admin/session. Only failed
// attempts count; a successful login clears them for that client. The global
// cap keeps address rotation from turning the limit into unlimited guesses.
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const ADMIN_LOGIN_MAX_PER_CLIENT = 10;
export const ADMIN_LOGIN_MAX_TOTAL = 200;

const ready = new WeakSet<DatabaseSync>();
function failures(db: DatabaseSync) {
  if (!ready.has(db)) {
    db.exec(`CREATE TABLE IF NOT EXISTS admin_login_failures (client_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS admin_login_failures_client ON admin_login_failures(client_hash, created_at);
      CREATE INDEX IF NOT EXISTS admin_login_failures_time ON admin_login_failures(created_at);`);
    ready.add(db);
  }
  return db;
}

// Addresses are stored only as keyed hashes.
export function adminLoginClient(ip: string, secret: string) {
  return createHmac('sha256', secret).update(ip).digest('hex');
}

export function adminLoginBlocked(db: DatabaseSync, client: string, now = Date.now()) {
  const since = now - ADMIN_LOGIN_WINDOW_MS;
  const count = (sql: string, ...values: (string | number)[]) => (failures(db).prepare(sql).get(...values) as { n: number }).n;
  return count('SELECT COUNT(*) AS n FROM admin_login_failures WHERE client_hash=? AND created_at>?', client, since) >= ADMIN_LOGIN_MAX_PER_CLIENT
    || count('SELECT COUNT(*) AS n FROM admin_login_failures WHERE created_at>?', since) >= ADMIN_LOGIN_MAX_TOTAL;
}

export function recordAdminLoginFailure(db: DatabaseSync, client: string, now = Date.now()) {
  failures(db).prepare('DELETE FROM admin_login_failures WHERE created_at<=?').run(now - ADMIN_LOGIN_WINDOW_MS);
  db.prepare('INSERT INTO admin_login_failures (client_hash, created_at) VALUES (?, ?)').run(client, now);
}

export function clearAdminLoginFailures(db: DatabaseSync, client: string) {
  failures(db).prepare('DELETE FROM admin_login_failures WHERE client_hash=?').run(client);
}
