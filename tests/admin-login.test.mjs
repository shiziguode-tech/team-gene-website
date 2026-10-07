import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ADMIN_LOGIN_MAX_PER_CLIENT, ADMIN_LOGIN_MAX_TOTAL, ADMIN_LOGIN_WINDOW_MS, adminLoginBlocked, adminLoginClient, clearAdminLoginFailures, recordAdminLoginFailure } from '../db/admin-login.ts';

test('failed admin logins are limited per client, cleared by success and expire after the window', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const now = Date.UTC(2026, 8, 30, 12);
    const attacker = adminLoginClient('203.0.113.4', 'secret'), admin = adminLoginClient('198.51.100.2', 'secret');
    assert.notEqual(attacker, admin); assert.doesNotMatch(attacker, /203\.0\.113/, 'addresses are not stored in clear');
    for (let i = 0; i < ADMIN_LOGIN_MAX_PER_CLIENT - 1; i++) recordAdminLoginFailure(db, attacker, now);
    assert.equal(adminLoginBlocked(db, attacker, now), false);
    recordAdminLoginFailure(db, attacker, now);
    assert.equal(adminLoginBlocked(db, attacker, now), true);
    assert.equal(adminLoginBlocked(db, admin, now), false, 'other clients are unaffected');
    assert.equal(adminLoginBlocked(db, attacker, now + ADMIN_LOGIN_WINDOW_MS), false, 'the lock lifts after 15 minutes');
    recordAdminLoginFailure(db, admin, now); clearAdminLoginFailures(db, admin);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_login_failures WHERE client_hash=?').get(admin).n, 0);
  } finally { db.close(); }
});

test('address rotation hits the global cap', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const now = Date.UTC(2026, 8, 30, 12);
    for (let i = 0; i < ADMIN_LOGIN_MAX_TOTAL; i++) recordAdminLoginFailure(db, adminLoginClient(`192.0.2.${i}`, 'secret'), now);
    assert.equal(adminLoginBlocked(db, adminLoginClient('192.0.2.250', 'secret'), now), true);
    recordAdminLoginFailure(db, 'later', now + ADMIN_LOGIN_WINDOW_MS);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_login_failures').get().n, 1, 'expired failures are pruned');
  } finally { db.close(); }
});
