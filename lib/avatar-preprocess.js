// Shared by the forum and the standalone webmail plugin. This is deliberately
// a browser-native ES module, with no React, package imports or server globals.
const MAX_PIXELS = 64_000_000;
const MAX_BYTES = 50 * 1024 * 1024;

/** @param {Uint8Array} bytes */
export function avatarDimensions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset, text) => offset + text.length <= bytes.length && [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  if (bytes.length >= 24 && bytes[0] === 137 && ascii(1, 'PNG\r\n\x1a\n') && ascii(12, 'IHDR')) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 10 && (ascii(0, 'GIF87a') || ascii(0, 'GIF89a'))) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (bytes.length >= 30 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) {
    if (ascii(12, 'VP8X')) return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
    if (ascii(12, 'VP8 ') && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (ascii(12, 'VP8L') && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) return null;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd8) continue;
      if (offset + 2 > bytes.length) return null;
      const size = view.getUint16(offset);
      if (size < 2 || offset + size > bytes.length) return null;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && size >= 7) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += size;
    }
  }
  return null;
}

/**
 * Avatar uploads are already cropped to 512×512 WebP on the server. Producing
 * that same shape locally avoids uploading the full camera original. Other
 * media uploads never use this function.
 * @param {File} file
 * @param {{signal?:AbortSignal}} [options]
 * @returns {Promise<File>}
 */
export async function prepareAvatar(file, { signal } = {}) {
  signal?.throwIfAborted();
  if (!file.size || file.size > MAX_BYTES) throw new Error('头像图片不能为空，最大 50 MB。');
  // Existing small files have little to gain; browsers lacking bitmap/canvas
  // support and formats without a bounded header parser use the server path.
  if (file.size <= 128 * 1024 || typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  const dimensions = avatarDimensions(new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer()));
  signal?.throwIfAborted();
  if (!dimensions) return file;
  if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > MAX_PIXELS) throw new Error('图片无法读取，请选择有效图片（最多 6400 万像素）。');
  /** @type {ImageBitmap | undefined} */
  let bitmap;
  /** @type {HTMLCanvasElement | undefined} */
  let canvas;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    signal?.throwIfAborted();
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) throw new Error('Invalid decoded image dimensions');
    canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 512, 512);
    const blob = await new Promise(resolve => canvas?.toBlob(resolve, 'image/webp', 0.92));
    signal?.throwIfAborted();
    if (!(blob instanceof Blob) || blob.type !== 'image/webp' || !blob.size || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.webp', { type: 'image/webp', lastModified: file.lastModified });
  } catch (error) {
    signal?.throwIfAborted();
    // Encoding support differs between browsers; server-side processing stays
    // authoritative and is the compatibility fallback.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    return file;
  } finally {
    bitmap?.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
