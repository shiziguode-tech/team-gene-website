import { forumDb, forumUserForRequest } from '@/db/forum';
import { expectedRequestOrigin } from '@/app/admin-access';
import { releaseForumMedia } from '@/db/forum-uploads';
import type { MediaAsset } from '@/lib/content';

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
  const attached: string[] = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    const post = db.prepare('SELECT media_json FROM forum_posts WHERE id=? AND email=? AND deleted=0').get(id, user.email) as { media_json: string } | undefined;
    if (!post) { db.exec('ROLLBACK'); return Response.json({ error: '动态不存在，或你没有删除权限。' }, { status: 404 }); }
    const comments = db.prepare('SELECT media_json FROM forum_comments WHERE post_id=? AND deleted=0').all(id) as { media_json: string }[];
    for (const { media_json } of [post, ...comments]) attached.push(...(JSON.parse(media_json) as MediaAsset[]).map(asset => asset.key));
    db.prepare('UPDATE forum_posts SET deleted=1 WHERE id=?').run(id);
    db.prepare('UPDATE forum_comments SET deleted=1 WHERE post_id=?').run(id);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  // A deleted post's photos and videos must not stay reachable by their address.
  try { await releaseForumMedia(attached); } catch (error) { console.error('Forum attachment cleanup failed', error); }
  return Response.json({ success: true });
}
