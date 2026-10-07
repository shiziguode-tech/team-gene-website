import tls from 'node:tls';

export async function verifyMailboxCredentials(email: string, password: string) {
  const host = process.env.MAIL_IMAP_HOST || '127.0.0.1';
  const port = Number(process.env.MAIL_IMAP_PORT || 993);
  const servername = process.env.MAIL_IMAP_SERVERNAME || 'mail.team-gene.com';
  return new Promise<boolean>((resolve, reject) => {
    let buffer = '';
    let phase: 'greeting' | 'login' | 'done' = 'greeting';
    let settled = false;
    const socket = tls.connect({ host, port, servername, rejectUnauthorized: true }, () => undefined);
    // Bound the whole exchange as well as idle time. A peer can keep the
    // connection alive without ever returning the tagged LOGIN result.
    const deadline = setTimeout(() => finish(false, new Error('邮箱验证超时，请稍后重试。')), 8000);
    const finish = (valid: boolean, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      if (error) reject(error); else resolve(valid);
    };
    socket.setTimeout(8000, () => finish(false, new Error('邮箱验证超时，请稍后重试。')));
    socket.on('error', error => finish(false, error));
    // A clean EOF does not emit "error", and a closed socket stops its idle
    // timer. Without this, the login request can remain pending forever.
    const disconnected = () => finish(false, new Error('邮箱服务连接已中断，请稍后重试。'));
    socket.on('end', disconnected);
    socket.on('close', disconnected);
    socket.on('data', data => {
      if (settled) return;
      buffer += data.toString('utf8');
      if (buffer.length > 32_000) return finish(false, new Error('邮箱服务返回内容异常。'));
      if (/^\* BYE\b[^\r\n]*\r?\n/im.test(buffer)) return disconnected();
      if (phase === 'greeting') {
        const greeting = buffer.match(/^\* (OK|PREAUTH)\b[^\r\n]*\r?\n/i);
        if (!greeting) return;
        buffer = buffer.slice(greeting[0].length);
        if (greeting[1].toUpperCase() === 'PREAUTH') return finish(false);
        phase = 'login';
        const quoted = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        socket.write(`A001 LOGIN ${quoted(email)} ${quoted(password)}\r\n`);
      }
      if (phase === 'login') {
        const result = /^A001 (OK|NO|BAD)\b[^\r\n]*\r?\n/im.exec(buffer);
        if (!result) return;
        phase = 'done';
        finish(result[1].toUpperCase() === 'OK');
      }
    });
  });
}
