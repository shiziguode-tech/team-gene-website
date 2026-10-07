import { avatarForEmail } from '@/db/avatars';
import { validForumMedia } from '@/lib/forum-media';
import { randomUUID } from 'node:crypto';
import { forumDb, forumUserForRequest } from '@/db/forum';
import { expectedRequestOrigin } from '@/app/admin-access';
import type { MediaAsset } from '@/lib/content';
import { readForumCursor, forumCursor } from '@/lib/forum-pagination';
import { commentPage } from '@/db/forum-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  let cursor;
  try { cursor = readForumCursor(new URL(request.url).searchParams.get('before')); }
  catch { return Response.json({error:'分页位置无效，请刷新重试。'},{status:400}); }
  try {
    const db = forumDb();
    const posts = db.prepare(`
      SELECT p.id, p.email, p.body, p.media_json AS mediaJson, p.created_at AS createdAt,
             f.display_name AS displayName
      FROM forum_posts p JOIN forum_profiles f ON f.email=p.email
      WHERE p.deleted=0 ${cursor ? 'AND (p.created_at<? OR (p.created_at=? AND p.id<?))' : ''}
      ORDER BY p.created_at DESC, p.id DESC LIMIT 41
    `).all(...(cursor ? [cursor.createdAt,cursor.createdAt,cursor.id] : [])) as { id: string; email: string; body: string; mediaJson: string; createdAt: number; displayName: string }[];
    const user = forumUserForRequest(request);
    const result = posts.slice(0,40).map(post => {
      const comments = commentPage(post.id);
      return ({
      id: post.id,
      author: post.displayName,
      avatarUrl: avatarForEmail(post.email),
      isOwn: post.email === user?.email,
      body: post.body,
      media: JSON.parse(post.mediaJson) as MediaAsset[],
      createdAt: post.createdAt,
      comments: comments.comments,
      nextCommentCursor: comments.nextCursor,
    }); });
    return Response.json({ posts: result, nextCursor: posts.length > 40 ? forumCursor(posts[39]) : null, user: user ? { email: user.email, displayName: user.displayName } : null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Forum feed failed', error);
    return Response.json({ error: '论坛内容暂时无法读取。' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (request.headers.get('origin') !== expectedRequestOrigin(request)) return Response.json({ error: '请求来源无效。' }, { status: 403 });
  const user = forumUserForRequest(request);
  if (!user) return Response.json({ error: '请先登录论坛。' }, { status: 401 });
  if (Number(request.headers.get('content-length') || 0) > 96_000) return Response.json({ error: '动态内容过长。' }, { status: 413 });
  let body: Record<string, unknown>;
  try { const text = await request.text(); if (text.length > 96_000) return Response.json({ error: '动态内容过长。' }, { status: 413 }); body = JSON.parse(text) as Record<string, unknown>; }
  catch { return Response.json({ error: '内容格式无效。' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: '内容格式无效。' }, { status: 400 });
  const message = typeof body.body === 'string' ? body.body.trim() : '';
  const media = body.media === undefined ? [] : body.media;
  if (!validForumMedia(media)) return Response.json({ error: '附件无效，最多 4 个文件，图片最多 50 MB、视频最多 500 MB，合计最多 1 GB。' }, { status: 400 });
  if ((!message && !media.length) || message.length > 5000) return Response.json({ error: '请输入动态内容，文字最多 5000 字。' }, { status: 400 });
  const db = forumDb();
  const since = Date.now() - 60 * 60 * 1000;
  const recent = db.prepare('SELECT COUNT(*) AS count FROM forum_posts WHERE email=? AND created_at>? AND deleted=0').get(user.email, since) as { count: number };
  if (recent.count >= 12) return Response.json({ error: '发布太频繁，请稍后再试。' }, { status: 429 });
  const id = randomUUID();
  const createdAt = Date.now();
  db.prepare('INSERT INTO forum_posts (id,email,body,media_json,created_at) VALUES (?,?,?,?,?)').run(id, user.email, message, JSON.stringify(media), createdAt);
  return Response.json({ success: true, post: { id, author: user.displayName, body: message, media, createdAt, comments: [] } }, { headers: { 'Cache-Control': 'no-store' } });
}
