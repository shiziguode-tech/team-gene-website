import { forumDb } from './forum';
import { avatarForEmail } from './avatars';
import { forumCursor } from '@/lib/forum-pagination';
import type { MediaAsset } from '@/lib/content';

export function forumMediaReferenced(key: string) {
  const db = forumDb();
  return !!db.prepare(`SELECT 1 FROM forum_posts p, json_each(p.media_json) m
    WHERE p.deleted=0 AND json_extract(m.value,'$.key')=? LIMIT 1`).get(key)
    || !!db.prepare(`SELECT 1 FROM forum_comments c JOIN forum_posts p ON p.id=c.post_id, json_each(c.media_json) m
    WHERE c.deleted=0 AND p.deleted=0 AND json_extract(m.value,'$.key')=? LIMIT 1`).get(key);
}

export function commentPage(postId: string, cursor: {createdAt: number; id: string} | null = null) {
  const rows = forumDb().prepare(`
    SELECT c.id, c.email, c.body, c.media_json AS mediaJson, c.created_at AS createdAt, f.display_name AS displayName
    FROM forum_comments c JOIN forum_profiles f ON f.email=c.email
    WHERE c.post_id=? AND c.deleted=0
      ${cursor ? 'AND (c.created_at>? OR (c.created_at=? AND c.id>?))' : ''}
    ORDER BY c.created_at ASC, c.id ASC LIMIT 51
  `).all(postId, ...(cursor ? [cursor.createdAt, cursor.createdAt, cursor.id] : [])) as {id:string; email:string; body:string; mediaJson:string; createdAt:number; displayName:string}[];
  const page = rows.slice(0,50);
  return {
    comments: page.map(({id,email,body,mediaJson,createdAt,displayName}) => ({id,body,media:JSON.parse(mediaJson) as MediaAsset[],createdAt,author:displayName,avatarUrl:avatarForEmail(email)})),
    nextCursor: rows.length > 50 ? forumCursor(page[49]) : null,
  };
}
