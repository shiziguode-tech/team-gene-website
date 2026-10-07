import { forumUserForRequest } from '@/db/forum';
import { AvatarError, saveAvatar, removeAvatar } from '@/db/avatars';
import { expectedRequestOrigin } from '@/app/admin-access';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== expectedRequestOrigin(request)) return Response.json({ error: '请求来源无效。' }, { status: 403 });
  const user = forumUserForRequest(request);
  if (!user) return Response.json({ error: '请先登录论坛。' }, { status: 401 });
  try { return Response.json({ avatarUrl: await saveAvatar(user.email, request) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json({ error: error instanceof AvatarError ? error.message : '头像保存失败，请稍后重试。' }, { status: error instanceof AvatarError ? error.status : 503 }); }
}
export async function DELETE(request: Request) {
  if (request.headers.get('origin') !== expectedRequestOrigin(request)) return Response.json({ error: '请求来源无效。' }, { status: 403 });
  const user = forumUserForRequest(request);
  if (!user) return Response.json({ error: '请先登录论坛。' }, { status: 401 });
  await removeAvatar(user.email);
  return Response.json({ avatarUrl: null }, { headers: { 'Cache-Control': 'no-store' } });
}
