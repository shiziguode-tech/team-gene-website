import { avatarForEmail } from '@/db/avatars';
import { createForumSession, deleteForumSession, forumDb, forumSessionCookie, forumUserForRequest, normalizeForumName, checkForumAuthRate, registerForumUser } from '@/db/forum';
import { expectedRequestOrigin } from '@/app/admin-access';
import { verifyMailboxCredentials } from '@/lib/imap-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const EMAIL = /^([a-z0-9]|[a-z0-9][a-z0-9._-]{0,30}[a-z0-9])@team-gene\.com$/;

export async function GET(request: Request) {
  const user = forumUserForRequest(request);
  return Response.json({ user: user ? { ...user, avatarUrl: avatarForEmail(user.email) } : null }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== expectedRequestOrigin(request)) return Response.json({ error: '请求来源无效，请刷新页面后重试。' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({ error: '请求内容过长。' }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 4096) return Response.json({ error: '请求内容过长。' }, { status: 413 });
    body = JSON.parse(text) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
  } catch { return Response.json({ error: '请求格式无效。' }, { status: 400 }); }
  const action = body.action === 'register' ? 'register' : body.action === 'login' ? 'login' : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const displayName = normalizeForumName(body.displayName);
  if (!action || !EMAIL.test(email)) return Response.json({ error: '请输入有效的 @team-gene.com 邮箱地址。' }, { status: 400 });
  if (password.length < 12 || password.length > 128 || /[\r\n\u0000]/.test(password)) return Response.json({ error: '请填写邮箱密码（至少 12 位）。' }, { status: 400 });
  if (action === 'register' && (!displayName || /[\u0000-\u001f\u007f]/.test(displayName))) return Response.json({ error: '请输入 1–40 个字符的论坛昵称。' }, { status: 400 });
  const secret = process.env.MAIL_SIGNUP_RATE_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!secret) return Response.json({ error: '论坛服务暂未就绪。' }, { status: 503 });
  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  try {
    if (!checkForumAuthRate(ip, secret)) return Response.json({ error: '尝试次数过多，请 15 分钟后再试。' }, { status: 429 });
    const existing = forumDb().prepare('SELECT email, display_name AS displayName, created_at AS createdAt FROM forum_profiles WHERE email=?').get(email) as { email: string; displayName: string; createdAt: number } | undefined;
    if (action === 'register' && existing) return Response.json({ error: '这个邮箱已经注册论坛，请直接登录。' }, { status: 409 });
    if (action === 'login' && !existing) return Response.json({ error: '这个邮箱还没有论坛身份，请先注册。' }, { status: 404 });
    const valid = await verifyMailboxCredentials(email, password);
    if (!valid) return Response.json({ error: '邮箱或密码不正确，请确认邮箱已开通。' }, { status: 401 });
    const { session, user } = action === 'register'
      ? registerForumUser(email, displayName)
      : { session: createForumSession(email), user: existing! };
    return Response.json({ user: user ? { ...user, avatarUrl: avatarForEmail(user.email) } : null }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': forumSessionCookie(session.token, session.maxAge) } });
  } catch (error) {
    console.error('Forum authentication failed', error);
    return Response.json({ error: '论坛登录暂时无法完成，请稍后重试。' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (request.headers.get('origin') !== expectedRequestOrigin(request)) return Response.json({ error: '请求来源无效。' }, { status: 403 });
  deleteForumSession(request);
  return Response.json({ success: true }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': 'gene_forum=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' } });
}
