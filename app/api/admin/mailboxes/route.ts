import { cookies } from 'next/headers';
import { ADMIN_COOKIE, hasAdminSession } from '@/app/admin-session';
import { adminAccessAllowed, expectedRequestOrigin } from '@/app/admin-access';
import { deleteMailbox, getManagedMailbox, listMailboxes, resetMailboxPassword, updateMailboxQuota } from '@/lib/stalwart';
import { quotaBytesFromMB } from '@/lib/mail-quota';
import { retireForumIdentity, revokeForumSessions } from '@/db/forum';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authorized(request: Request, writes: boolean) {
  if (!adminAccessAllowed(request)) return false;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!await hasAdminSession(token)) return false;
  return !writes || request.headers.get('origin') === expectedRequestOrigin(request);
}

export async function GET(request: Request) {
  if (!await authorized(request, false)) return Response.json({ error: '请先登录后台。' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  try {
    const mailboxes = await listMailboxes();
    return Response.json({ mailboxes: mailboxes.filter(account => account.roles?.['@type'] === 'User').map(account => ({
      id: account.id,
      address: account.emailAddress || `${account.name || 'unknown'}@team-gene.com`,
      createdAt: account.createdAt || null,
      usedBytes: Number(account.usedDiskQuota || 0),
      quotaBytes: account.quotas?.maxDiskQuota ?? null,
    })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Mailbox admin list failed', error);
    return Response.json({ error: '邮箱服务暂时无法响应。' }, { status: 503 });
  }
}

async function readJson(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 4096) return null;
  try {
    const text = await request.text();
    if (text.length > 4096) return null;
    const body: unknown = JSON.parse(text);
    return body && typeof body === 'object' ? body as Record<string, unknown> : null;
  } catch { return null; }
}

export async function POST(request: Request) {
  if (!await authorized(request, true)) return Response.json({ error: '请先登录后台，或刷新页面后重试。' }, { status: 403 });
  const body = await readJson(request);
  const id = typeof body?.id === 'string' ? body.id : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!id || id.length > 128 || password.length < 12 || password.length > 128 || !/[^\s]/.test(password) || /[\r\n\u0000]/.test(password)) return Response.json({ error: '请填写有效账户和 12–128 位的新密码，不能全为空格或包含换行。' }, { status: 400 });
  try {
    const account = (await listMailboxes()).find(item => item.id === id && item.roles?.['@type'] === 'User');
    if (!account) return Response.json({ error: '未找到此邮箱账户。' }, { status: 404 });
    await resetMailboxPassword(id, password);
    revokeForumSessions(account.emailAddress || `${account.name}@team-gene.com`);
    return Response.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Mailbox password reset failed', error);
    return Response.json({ error: '密码重置失败，请稍后重试。' }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!await authorized(request, true)) return Response.json({ error: '请先登录后台，或刷新页面后重试。' }, { status: 403 });
  const body = await readJson(request);
  const id = typeof body?.id === 'string' ? body.id : '';
  const quotaBytes = quotaBytesFromMB(body?.quotaMB);
  if (!id || id.length > 128 || quotaBytes === null) return Response.json({ error: '请填写有效账户及至少 1 MB 的整数容量。' }, { status: 400 });
  try {
    const account = await getManagedMailbox(id);
    if (!account) return Response.json({ error: '未找到此邮箱账户。' }, { status: 404 });
    if (quotaBytes < (account.usedDiskQuota || 0)) return Response.json({ error: '容量不能低于该邮箱当前已用空间，请先清理邮件或设置更大的容量。' }, { status: 409 });
    const updated = await updateMailboxQuota(id, quotaBytes);
    return Response.json({ success: true, quotaBytes: updated.quotas?.maxDiskQuota, usedBytes: updated.usedDiskQuota || 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Mailbox quota update failed', error);
    return Response.json({ error: '容量修改失败，请刷新查看当前限额后重试。' }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!await authorized(request, true)) return Response.json({ error: '请先登录后台，或刷新页面后重试。' }, { status: 403 });
  const body = await readJson(request);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id || id.length > 128) return Response.json({ error: '账户信息无效。' }, { status: 400 });
  try {
    const account = (await listMailboxes()).find(item => item.id === id && item.roles?.['@type'] === 'User');
    if (!account) return Response.json({ error: '未找到此邮箱账户。' }, { status: 404 });
    await deleteMailbox(id);
    retireForumIdentity(account.emailAddress || `${account.name}@team-gene.com`);
    return Response.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Mailbox deletion failed', error);
    return Response.json({ error: '邮箱删除失败，请稍后重试。' }, { status: 503 });
  }
}
