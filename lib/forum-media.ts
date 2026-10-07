import { FORUM_MEDIA_MAX_BYTES, mediaMaxBytes } from './upload-limits.js';
import type { MediaAsset } from './content';

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/avif': 'avif', 'video/mp4': 'mp4', 'video/webm': 'webm',
};

export function validForumMedia(value: unknown): value is MediaAsset[] {
  if (!Array.isArray(value) || value.length > 4) return false;
  let total = 0;
  for (const item of value) {
    if (!item || typeof item !== 'object') return false;
    const { key, mime, type, name, size } = item;
    if (typeof key !== 'string' || !/^[0-9a-f-]{36}\.[a-z0-9]+$/.test(key) ||
        typeof mime !== 'string' || !MIME_EXTENSION[mime] || !key.endsWith('.' + MIME_EXTENSION[mime]) ||
        type !== (mime.startsWith('image/') ? 'image' : 'video') ||
        typeof name !== 'string' || name.length > 240 ||
        !Number.isSafeInteger(size) || size < 1 || size > mediaMaxBytes(type)) return false;
    total += size;
  }
  return total <= FORUM_MEDIA_MAX_BYTES;
}
