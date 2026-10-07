import test from 'node:test';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import { EventEmitter } from 'node:events';
import { verifyMailboxCredentials } from '../lib/imap-auth.ts';

class FakeSocket extends EventEmitter {
  writes = [];
  destroyed = false;
  setTimeout(_milliseconds, callback) { this.idleTimeout = callback; }
  write(value) { this.writes.push(value); }
  destroy() { this.destroyed = true; this.emit('close'); }
  data(value) { this.emit('data', Buffer.from(value)); }
}

test('IMAP authentication handles split replies and escapes quoted credentials', async t => {
  const socket = new FakeSocket();
  t.mock.method(tls, 'connect', () => socket);
  const pending = verifyMailboxCredentials('member@team-gene.com', 'with"quote\\slash');
  socket.data('* OK [CAPABILITY IMAP4rev1] Rea');
  assert.equal(socket.writes.length, 0);
  socket.data('dy\r\n');
  assert.equal(socket.writes[0], 'A001 LOGIN "member@team-gene.com" "with\\"quote\\\\slash"\r\n');
  socket.data('* CAPABILITY IMAP4rev1\r\nA001 O');
  socket.data('K Logged in\r\n');
  assert.equal(await pending, true);
  assert.equal(socket.destroyed, true);
});

test('a clean IMAP close before greeting or LOGIN completion rejects promptly', async t => {
  for (const phase of ['greeting', 'login']) {
    for (const event of ['end', 'close']) {
      const socket = new FakeSocket();
      const mock = t.mock.method(tls, 'connect', () => socket);
      const pending = verifyMailboxCredentials('member@team-gene.com', 'example-password');
      const rejected = assert.rejects(pending, /连接已中断/);
      if (phase === 'login') socket.data('* OK Ready\r\n');
      socket.emit(event);
      await rejected;
      assert.equal(socket.destroyed, true);
      mock.mock.restore();
    }
  }
});

test('IMAP rejection, BYE and timeout terminate the connection without hanging', async t => {
  for (const scenario of ['rejected', 'bye', 'idle']) {
    const socket = new FakeSocket();
    const mock = t.mock.method(tls, 'connect', () => socket);
    const pending = verifyMailboxCredentials('member@team-gene.com', 'example-password');
    socket.data('* OK Ready\r\n');
    if (scenario === 'rejected') {
      socket.data('A001 NO Invalid credentials\r\n');
      assert.equal(await pending, false);
    } else {
      const rejected = assert.rejects(pending, scenario === 'bye' ? /连接已中断/ : /超时/);
      if (scenario === 'bye') socket.data('* BYE Server shutting down\r\n');
      else socket.idleTimeout();
      await rejected;
    }
    assert.equal(socket.destroyed, true);
    mock.mock.restore();
  }
});

test('IMAP activity cannot extend the overall authentication deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const socket = new FakeSocket();
  t.mock.method(tls, 'connect', () => socket);
  const pending = verifyMailboxCredentials('member@team-gene.com', 'example-password');
  const rejected = assert.rejects(pending, /超时/);
  socket.data('* OK Ready\r\n');
  t.mock.timers.tick(7000);
  socket.data('* OK Still processing\r\n');
  t.mock.timers.tick(1000);
  await rejected;
  assert.equal(socket.destroyed, true);
});
