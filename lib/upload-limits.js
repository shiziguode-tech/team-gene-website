export const IMAGE_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const FORUM_MEDIA_MAX_BYTES = 1024 * 1024 * 1024;
/** @param {string} type */
export function mediaMaxBytes(type) {
  return type === 'image' || type.startsWith('image/') ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
}
