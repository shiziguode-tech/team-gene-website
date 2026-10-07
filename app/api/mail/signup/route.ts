import { createHmac, randomUUID } from 'node:crypto';
import { contentDb } from '@/db/content';
import { createMailbox, deleteMailbox, listMailboxes, MailServiceError } from '@/lib/stalwart';
import { expectedRequestOrigin } from '@/app/admin-access';
import { registerForumUser, forumSessionCookie, normalizeForumName } from '@/db/forum';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESERVED = new Set(['admin', 'administrator', 'abuse', 'postmaster', 'root', 'hostmaster', 'webmaster', 'support', 'mailer-daemon', 'security', 'contact', 'noreply', 'no-reply']);
const LOCAL_PART = /^(?!.*\.\.)(?:[a-z0-9]|[a-z0-9][a-z0-9._-]{0,30}[a-z0-9])$/;

function reserveSignup(hash: string, requestId: string) {
  const db = contentDb();
  db.exec(`CREATE TABLE IF NOT EXISTS mail_signup_attempts (id TEXT PRIMARY KEY, ip_hash TEXT NOT NULL, created_at INTEGER NOT NULL);`);
  db.exec('BEGIN IMMEDIATE');
  try {
    const now = Date.now();
    db.prepare('DELETE FROM mail_signup_attempts WHERE created_at < ?').run(now - 30 * 24 * 60 * 60 * 1000);
    const recent = db.prepare('SELECT COUNT(*) AS count FROM mail_signup_attempts WHERE ip_hash=? AND created_at>?').get(hash, now - 24 * 60 * 60 * 1000) as { count: number };
    if (recent.count >= 2) { db.exec('ROLLBACK'); return false; }
    db.prepare('INSERT INTO mail_signup_attempts (id,ip_hash,created_at) VALUES (?,?,?)').run(requestId, hash, now);
    db.exec('COMMIT');
    return true;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export async function POST(request: Request) {
  if (process.env.MAIL_SIGNUP_ENABLED === '0') return Response.json({ error: '邮箱申领暂时关闭。' }, { status: 503 });
  if (request.headers.get('origin') !== expectedRequestOrigin(request)) return Response.json({ error: '请求来源无效，请刷新页面后重试。' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({ error: '请求内容过长。' }, { status: 413 });
  let data: unknown;
  try {
    const text = await request.text();
    if (text.length > 4096) return Response.json({ error: '请求内容过长。' }, { status: 413 });
    data = JSON.parse(text);
  } catch { return Response.json({ error: '请求内容格式无效。' }, { status: 400 }); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return Response.json({ error: '请填写邮箱账号和密码。' }, { status: 400 });
  const body = data as Record<string, unknown>;
  if (typeof body.website === 'string' && body.website) return Response.json({ success: true });
  const localPart = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const displayName = normalizeForumName(body.displayName);
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmation = typeof body.confirmation === 'string' ? body.confirmation : '';
  if (!LOCAL_PART.test(localPart) || RESERVED.has(localPart)) return Response.json({ error: '邮箱账号需为 1–32 位小写字母、数字或 . _ -，且不能使用保留名称。' }, { status: 400 });
  if (!displayName || /[\u0000-\u001f\u007f]/.test(displayName)) return Response.json({ error: '请输入 1–40 个字符的论坛昵称。' }, { status: 400 });
  if (password.length < 12 || password.length > 128 || !/[^\s]/.test(password) || /[\r\n\u0000]/.test(password)) return Response.json({ error: '密码需为 12–128 位，不能包含换行或空字符，建议使用独立且难猜的密码。' }, { status: 400 });
  if (password !== confirmation) return Response.json({ error: '两次输入的密码不一致。' }, { status: 400 });
  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const secret = process.env.MAIL_SIGNUP_RATE_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!secret) return Response.json({ error: '邮箱申领服务暂未就绪。' }, { status: 503 });
  const ipHash = createHmac('sha256', secret).update(ip).digest('hex');
  const requestId = randomUUID();
  try {
    const existing = await listMailboxes();
    if (existing.length >= 50) return Response.json({ error: '目前邮箱申领名额已满，请联系团队管理员。' }, { status: 409 });
    if (existing.some(account => account.name?.toLowerCase() === localPart)) return Response.json({ error: '这个邮箱地址已经被申领。' }, { status: 409 });
    if (!reserveSignup(ipHash, requestId)) return Response.json({ error: '同一网络每天最多申领 2 个邮箱，请明天再试。' }, { status: 429 });
    try {
      const mailbox = await createMailbox(localPart, password);
      try {
        const { session } = registerForumUser(mailbox.emailAddress.toLowerCase(), displayName);
        return Response.json({ success: true, emailAddress: mailbox.emailAddress, forumName: displayName }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': forumSessionCookie(session.token, session.maxAge) } });
      } catch (error) {
        await deleteMailbox(mailbox.id).catch(cleanupError => {
          console.error('Mailbox rollback failed after forum profile creation error', cleanupError);
        });
        throw error;
      }
    } catch (error) {
      contentDb().prepare('DELETE FROM mail_signup_attempts WHERE id=?').run(requestId);
      console.error('Mailbox creation failed', {
        requestId,
        code: error instanceof MailServiceError ? error.code : 'forum-or-database',
        detail: error instanceof Error ? error.message : 'Unknown error',
      });
      if (error instanceof MailServiceError && error.code === 'already-exists') {
        return Response.json({ error: '这个邮箱地址已经被申领。' }, { status: 409 });
      }
      if (error instanceof MailServiceError && ['configuration', 'unauthorized', 'forbidden', 'invalid-account'].includes(error.code)) {
        return Response.json({ error: '邮箱服务配置暂不可用，请联系团队管理员处理。' }, { status: 503 });
      }
      return Response.json({ error: '邮箱开通失败，请稍后重试。' }, { status: 503 });
    }
  } catch (error) {
    console.error('Mailbox signup failed', error);
    return Response.json({ error: '邮箱服务暂时无法响应，请稍后重试。' }, { status: 503 });
  }
}
