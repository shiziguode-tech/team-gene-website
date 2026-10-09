import { forumDb } from './forum';
import { forumMediaReferenced } from './forum-feed';
import { deleteMedia } from './media';
import { listContent } from './content';
import { entryMedia, type MediaAsset } from '@/lib/content';
import { FORUM_DAILY_BYTES, FORUM_DAILY_FILES, FORUM_SITE_DAILY_BYTES } from '@/lib/upload-limits.js';

const DAY = 24 * 60 * 60 * 1000;
// An upload that has not become part of a post or comment by then is removed.
export const FORUM_UPLOAD_TTL_MS = DAY;

export class ForumUploadLimitError extends Error {}

// Reserve the declared size before the body is streamed, so concurrent uploads
// share one daily allowance. A failed transfer gives its reservation back.
export function reserveForumUpload(email: string, key: string, size: number, now = Date.now()) {
  const db = forumDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const since = now - DAY;
    const mine = db.prepare('SELECT COUNT(*) AS files, COALESCE(SUM(size), 0) AS bytes FROM forum_uploads WHERE email=? AND created_at>?').get(email, since) as { files: number; bytes: number };
    if (mine.files >= FORUM_DAILY_FILES || mine.bytes + size > FORUM_DAILY_BYTES) throw new ForumUploadLimitError('今天的上传量已达上限，请明天再试。');
    const site = db.prepare('SELECT COALESCE(SUM(size), 0) AS bytes FROM forum_uploads WHERE created_at>?').get(since) as { bytes: number };
    if (site.bytes + size > FORUM_SITE_DAILY_BYTES) throw new ForumUploadLimitError('论坛今天的上传量已达上限，请明天再试。');
    db.prepare('INSERT INTO forum_uploads (key, email, size, created_at) VALUES (?, ?, ?, ?)').run(key, email, size, now);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function completeForumUpload(asset: MediaAsset) {
  const result = forumDb().prepare('UPDATE forum_uploads SET name=?, type=?, mime=?, complete=1 WHERE key=? AND complete=0').run(asset.name, asset.type, asset.mime, asset.key);
  if (result.changes !== 1) throw new Error('Upload reservation expired');
}

export function cancelForumUpload(key: string) {
  forumDb().prepare('DELETE FROM forum_uploads WHERE key=? AND complete=0').run(key);
}

// Attachments of a new post or comment: only this member's own finished
// uploads, each exactly as the server recorded it. Null if any item is not.
export function ownForumMedia(email: string, media: MediaAsset[]): MediaAsset[] | null {
  const find = forumDb().prepare('SELECT key, name, type, mime, size FROM forum_uploads WHERE key=? AND email=? AND complete=1');
  const seen = new Set<string>();
  const owned: MediaAsset[] = [];
  for (const item of media) {
    if (seen.has(item.key)) return null;
    seen.add(item.key);
    const row = find.get(item.key, email) as MediaAsset | undefined;
    if (!row || row.type !== item.type || row.mime !== item.mime || row.size !== item.size) return null;
    owned.push({ key: row.key, name: row.name, type: row.type, mime: row.mime, size: row.size });
  }
  return owned;
}

// Remove attachments that nothing visible uses any more: no live post or
// comment, and no website content (an administrator may reuse a forum photo).
export async function releaseForumMedia(keys: string[]) {
  const candidates = [...new Set(keys)].filter(key => !forumMediaReferenced(key));
  if (!candidates.length) return;
  const website = new Set((await listContent()).flatMap(entry => entryMedia(entry).map(asset => asset.key)));
  for (const key of candidates) {
    if (website.has(key) || forumMediaReferenced(key)) continue;
    // Retire synchronously before yielding to file I/O: a simultaneous post
    // must not attach a file while cleanup is removing it. Keep its size and
    // timestamp until the daily window expires, so deletion cannot refund quota.
    forumDb().prepare('UPDATE forum_uploads SET complete=-1 WHERE key=?').run(key);
    await deleteMedia(key);
  }
}

// Uploads older than the allowance window are no longer needed for quotas or
// for attaching; delete the files that never reached a post or comment.
let lastSweep = 0;
export async function sweepForumUploads(now = Date.now(), force = false) {
  if (!force && now - lastSweep < 10 * 60 * 1000) return;
  lastSweep = now;
  const stale = forumDb().prepare('SELECT key FROM forum_uploads WHERE created_at<?').all(now - FORUM_UPLOAD_TTL_MS) as { key: string }[];
  if (!stale.length) return;
  await releaseForumMedia(stale.map(row => row.key));
  const forget = forumDb().prepare('DELETE FROM forum_uploads WHERE key=? AND created_at<?');
  for (const { key } of stale) forget.run(key, now - FORUM_UPLOAD_TTL_MS);
}
