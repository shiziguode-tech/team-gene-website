import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from '@/lib/upload-limits.js';
import { randomUUID } from 'node:crypto';
import { writeMediaStream, MediaUploadSizeError, deleteMedia } from '@/db/media';
import { forumUserForRequest } from '@/db/forum';
import { cancelForumUpload, completeForumUpload, ForumUploadLimitError, reserveForumUpload, sweepForumUploads } from '@/db/forum-uploads';
import { expectedRequestOrigin } from '@/app/admin-access';
import type { MediaAsset } from '@/lib/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TYPES: Record<string, { type: 'image' | 'video'; extension: string; limit: number }> = {
  'image/jpeg': { type: 'image', extension: 'jpg', limit: IMAGE_MAX_BYTES },
  'image/png': { type: 'image', extension: 'png', limit: IMAGE_MAX_BYTES },
  'image/webp': { type: 'image', extension: 'webp', limit: IMAGE_MAX_BYTES },
  'image/gif': { type: 'image', extension: 'gif', limit: IMAGE_MAX_BYTES },
  'image/avif': { type: 'image', extension: 'avif', limit: IMAGE_MAX_BYTES },
  'video/mp4': { type: 'video', extension: 'mp4', limit: VIDEO_MAX_BYTES },
  'video/webm': { type: 'video', extension: 'webm', limit: VIDEO_MAX_BYTES },
};

export async function POST(request: Request) {
  if (request.headers.get('origin') !== expectedRequestOrigin(request)) return Response.json({ error: '请求来源无效。' }, { status: 403 });
  const user = forumUserForRequest(request);
  if (!user) return Response.json({ error: '请先登录论坛。' }, { status: 401 });
  const mime = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
  const definition = TYPES[mime];
  if (!definition) return Response.json({ error: '支持 JPG、PNG、WebP、GIF、AVIF 图片和 MP4、WebM 视频。' }, { status: 415 });
  const size = Number(request.headers.get('content-length') || 0);
  if (!Number.isSafeInteger(size) || size < 1 || size > definition.limit) return Response.json({ error: definition.type === 'image' ? '每张图片最多 50 MB。' : '每段视频最多 500 MB。' }, { status: 413 });
  let name = '上传文件.' + definition.extension;
  try { name = decodeURIComponent(request.headers.get('x-file-name') || name); } catch { return Response.json({ error: '文件名无效。' }, { status: 400 }); }
  name = name.replace(/[\\/\u0000-\u001f]/g, '_').trim().slice(0, 240) || '上传文件.' + definition.extension;
  const key = `${randomUUID()}.${definition.extension}`;
  await sweepForumUploads().catch(error => console.error('Forum upload cleanup failed', error));
  try { reserveForumUpload(user.email, key, size); }
  catch (error) {
    if (error instanceof ForumUploadLimitError) return Response.json({ error: error.message }, { status: 429 });
    console.error('Forum upload reservation failed', error);
    return Response.json({ error: '上传失败，请稍后重试。' }, { status: 503 });
  }
  try {
    await writeMediaStream(key, request.body, size);
    const asset: MediaAsset = { key, name, type: definition.type, mime, size };
    completeForumUpload(asset);
    return Response.json({ asset }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    await deleteMedia(key).catch(cleanupError => console.error('Forum upload cleanup failed', cleanupError));
    try { cancelForumUpload(key); } catch (cleanupError) { console.error('Forum upload reservation release failed', cleanupError); }
    if (error instanceof MediaUploadSizeError) return Response.json({ error: '文件上传大小不匹配，请重试。' }, { status: 400 });
    console.error('Forum media upload failed', error);
    return Response.json({ error: '上传失败，请稍后重试。' }, { status: 503 });
  }
}
