import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forumMutation } from '../lib/forum-client.ts';

test('expired forum mutations return the original error and request reauthentication', async () => {
  const originalFetch = globalThis.fetch;
  let expired = 0;
  try {
    globalThis.fetch = async () => Response.json({ error: '请先登录论坛。' }, { status: 401 });
    const response = await forumMutation('/api/forum/posts', { method: 'POST' }, () => { expired++; });
    assert.equal(expired, 1);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, '请先登录论坛。');
    for (const status of [200, 400, 403, 429, 503]) {
      globalThis.fetch = async () => Response.json({}, { status });
      assert.equal((await forumMutation('/api/forum/posts', { method: 'POST' }, () => { expired++; })).status, status);
    }
    globalThis.fetch = async () => { throw new TypeError('Network unavailable'); };
    await assert.rejects(forumMutation('/api/forum/posts', { method: 'POST' }, () => { expired++; }), /Network unavailable/);
    assert.equal(expired, 1, 'validation, rate limits and network failures must not log the user out');
  } finally { globalThis.fetch = originalFetch; }
});
