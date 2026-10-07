import { forumDb, forumUserForRequest } from '@/db/forum';
import { expectedRequestOrigin } from '@/app/admin-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== expectedRequestOrigin(request)) return Response.json({ error: '请求来源无效。' }, { status: 403 });
  const user = forumUserForRequest(request);
  if (!user) return Response.json({ error: '请先登录论坛。' }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: '动态不存在。' }, { status: 404 });
  // Hide the post and its comments together.
  const db = forumDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare('UPDATE forum_posts SET deleted=1 WHERE id=? AND email=? AND deleted=0').run(id, user.email);
    if (!result.changes) { db.exec('ROLLBACK'); return Response.json({ error: '动态不存在，或你没有删除权限。' }, { status: 404 }); }
    db.prepare('UPDATE forum_comments SET deleted=1 WHERE post_id=?').run(id);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return Response.json({ success: true });
}
