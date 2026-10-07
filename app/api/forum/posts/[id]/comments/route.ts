import { validForumMedia } from '@/lib/forum-media';
import { randomUUID } from 'node:crypto';
import { forumDb, forumUserForRequest } from '@/db/forum';
import { expectedRequestOrigin } from '@/app/admin-access';
import { commentPage } from '@/db/forum-feed';
import { readForumCursor } from '@/lib/forum-pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: {params: Promise<{id:string}>}) {
  const {id} = await params;
  let cursor;
  try { cursor = readForumCursor(new URL(request.url).searchParams.get('after')); }
  catch { return Response.json({error:'分页位置无效，请刷新重试。'}, {status:400}); }
  if (!/^[0-9a-f-]{36}$/.test(id) || !forumDb().prepare('SELECT id FROM forum_posts WHERE id=? AND deleted=0').get(id)) return Response.json({error:'动态不存在。'},{status:404});
  return Response.json(commentPage(id,cursor),{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get('origin') !== expectedRequestOrigin(request)) return Response.json({ error: '请求来源无效。' }, { status: 403 });
  const user = forumUserForRequest(request);
  if (!user) return Response.json({ error: '请先登录后再评论。' }, { status: 401 });
  if (Number(request.headers.get('content-length') || 0) > 24_000) return Response.json({ error: '评论内容过长。' }, { status: 413 });
  const { id: postId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(postId)) return Response.json({ error: '动态不存在。' }, { status: 404 });
  let data: { body?: unknown; media?: unknown };
  try { const text = await request.text(); if (text.length > 24_000) return Response.json({ error: '评论内容过长。' }, { status: 413 }); data = JSON.parse(text); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid body'); } catch { return Response.json({ error: '评论内容格式无效。' }, { status: 400 }); }
  const body = typeof data.body === 'string' ? data.body.trim() : '';
  const media = data.media ?? [];
  if (!validForumMedia(media)) return Response.json({ error: '附件无效，最多 4 个文件，图片最多 50 MB、视频最多 500 MB，合计最多 1 GB。' }, { status: 400 });
  if ((!body && !media.length) || body.length > 1200) return Response.json({ error: '请输入评论文字或添加照片、视频，文字最多 1200 字。' }, { status: 400 });
  const db = forumDb();
  if (!db.prepare('SELECT id FROM forum_posts WHERE id=? AND deleted=0').get(postId)) return Response.json({ error: '动态不存在。' }, { status: 404 });
  const recent = db.prepare('SELECT COUNT(*) AS count FROM forum_comments WHERE email=? AND created_at>? AND deleted=0').get(user.email, Date.now() - 60 * 60 * 1000) as { count: number };
  if (recent.count >= 30) return Response.json({ error: '评论太频繁，请稍后再试。' }, { status: 429 });
  const comment = { id: randomUUID(), author: user.displayName, avatarUrl: user.avatarUrl, body, media, createdAt: Date.now() };
  db.prepare('INSERT INTO forum_comments (id,post_id,email,body,media_json,created_at) VALUES (?,?,?,?,?,?)').run(comment.id, postId, user.email, body, JSON.stringify(media), comment.createdAt);
  return Response.json({ success: true, comment }, { headers: { 'Cache-Control': 'no-store' } });
}
