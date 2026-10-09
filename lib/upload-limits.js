export const IMAGE_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
export const FORUM_MEDIA_MAX_BYTES = 1024 * 1024 * 1024;
// Forum uploads in any 24 hours, per member and for the whole forum. Members can
// open mailboxes themselves, so uploads must not be able to fill the disk.
export const FORUM_DAILY_FILES = 120;
export const FORUM_DAILY_BYTES = 3 * 1024 * 1024 * 1024;
export const FORUM_SITE_DAILY_BYTES = 20 * 1024 * 1024 * 1024;
/** @param {string} type */
export function mediaMaxBytes(type) {
  return type === 'image' || type.startsWith('image/') ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
}
