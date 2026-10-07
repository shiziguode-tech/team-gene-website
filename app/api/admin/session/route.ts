import { cookies } from 'next/headers';
import { ADMIN_COOKIE, adminCookie, createAdminSession, hasAdminSession, passwordMatches } from '@/app/admin-session';
import { adminAccessAllowed, expectedRequestOrigin } from '@/app/admin-access';
import { contentDb } from '@/db/content';
import { adminLoginBlocked, adminLoginClient, clearAdminLoginFailures, recordAdminLoginFailure } from '@/db/admin-login';

export const dynamic = 'force-dynamic';

// The login limiter must never lock the administrator out because of a
// storage problem, so it fails open.
function limiter<T>(action: () => T, fallback: T) {
  try { return action(); } catch (error) { console.error('Admin login limiter unavailable', error); return fallback; }
}

function validOrigin(request: Request) {
  return request.headers.get('origin') === expectedRequestOrigin(request);
}

export async function GET(request: Request) {
  if (!adminAccessAllowed(request)) return Response.json({ error: '无域名模式下，后台仅允许通过本机 SSH 隧道访问。' }, { status: 403 });
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return Response.json({ authenticated: await hasAdminSession(token) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!adminAccessAllowed(request)) return Response.json({ error: '无域名模式下，后台仅允许通过本机 SSH 隧道访问。' }, { status: 403 });
  if (!validOrigin(request)) return Response.json({ error: '请求来源无效。' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({ error: '请求内容过长。' }, { status: 413 });
  let data: unknown;
  try {
    const body = await request.text();
    if (body.length > 4096) return Response.json({ error: '请求内容过长。' }, { status: 413 });
    data = JSON.parse(body);
  } catch {
    return Response.json({ error: '请求内容格式无效。' }, { status: 400 });
  }
  const password = data && typeof data === 'object' && 'password' in data ? (data as { password?: unknown }).password : undefined;
  const ip = request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const client = adminLoginClient(ip, process.env.ADMIN_SESSION_SECRET || '');
  if (limiter(() => adminLoginBlocked(contentDb(), client), false)) {
    return Response.json({ error: '尝试次数过多，请 15 分钟后再试。' }, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '900' } });
  }
  if (typeof password !== 'string' || password.length > 256 || !passwordMatches(password)) {
    limiter(() => recordAdminLoginFailure(contentDb(), client), undefined);
    return Response.json({ error: '密码不正确，请重试。' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  limiter(() => clearAdminLoginFailures(contentDb(), client), undefined);
  const token = await createAdminSession();
  return Response.json({ authenticated: true }, { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': adminCookie(token) } });
}

export async function DELETE(request: Request) {
  if (!adminAccessAllowed(request)) return Response.json({ error: '无域名模式下，后台仅允许通过本机 SSH 隧道访问。' }, { status: 403 });
  if (!validOrigin(request)) return Response.json({ error: '请求来源无效。' }, { status: 403 });
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'Set-Cookie': adminCookie('', 0) } });
}
