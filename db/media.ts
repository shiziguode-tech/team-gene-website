import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { link, mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { withImageProcessingSlot } from '../lib/image-processing.js';

// Metadata probes must not retain upload file handles and prevent deletion on
// Windows. The image operation/memory cache remains enabled.
sharp.cache({ files: 0 });

const KEY = /^[0-9a-f-]{36}\.(?:jpg|png|webp|gif|avif|mp4|webm)$/;
const dataDir = () => process.env.DATA_DIR || './data';

function uploadPath(key: string) {
  if (!KEY.test(key)) throw new Error('Invalid media key');
  return join(dataDir(), 'uploads', key);
}

export class MediaUploadSizeError extends Error {}
export class AnimatedMediaError extends Error {}

export async function writeMediaStream(key: string, body: ReadableStream<Uint8Array> | null, expectedSize: number) {
  if (!body || !Number.isSafeInteger(expectedSize) || expectedSize < 1) throw new MediaUploadSizeError('Missing upload body or size');
  const path = uploadPath(key);
  await mkdir(join(dataDir(), 'uploads'), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  let written = 0;
  try {
    const limiter = new Transform({ transform(chunk, _encoding, callback) {
      written += chunk.length;
      callback(written > expectedSize ? new MediaUploadSizeError('Upload exceeds declared size') : null, chunk);
    }});
    // Bounded buffering allows the filesystem stream to batch small network
    // chunks with writev, while backpressure prevents whole videos entering RAM.
    await pipeline(Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]), limiter,
      createWriteStream(temporary, { flags: 'wx', mode: 0o644, highWaterMark: 256 * 1024 }));
    if (written !== expectedSize) throw new MediaUploadSizeError('Incomplete upload');
    // Publish only a complete file, and never overwrite an existing key.
    // A same-directory hard link is atomic on both Linux and Windows.
    await link(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export async function openMediaFile(key: string) { return open(uploadPath(key), 'r'); }
export async function mediaFileInfo(key: string) {
  const path = uploadPath(key);
  return { path, stat: await stat(path), accelUri: `/_team_gene_media/uploads/${key}` };
}
export async function deleteMedia(key: string) {
  try { await unlink(uploadPath(key)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await deleteMediaVariants(key);
}

/* ---------- Resized variants ----------
   Pages show photos at 40–500 CSS px, while uploads are often multi-megabyte
   originals. Variants are WebP renditions at a few fixed widths (never
   enlarged), cached on disk next to the uploads. Animated images and videos
   are served as originals to preserve playback without expensive transcoding. */
export const MEDIA_VARIANT_WIDTHS = [320, 640, 960, 1600] as const;
const RESIZABLE = /\.(?:jpg|png|webp|avif)$/;
const variantDir = () => join(dataDir(), 'media-variants', 'v1');
const variantPath = (key: string, width: number) => join(variantDir(), `${key}.${width}.webp`);

export function mediaVariantWidth(value: string | null) {
  const width = Number(value);
  return (MEDIA_VARIANT_WIDTHS as readonly number[]).includes(width) ? width : null;
}
export function resizableMedia(key: string) { return KEY.test(key) && RESIZABLE.test(key); }

// Decoding large photos is memory-heavy on the small VPS: at most two at a
// time, and concurrent requests for the same variant share one job.
const pending = new Map<string, Promise<void>>();

export async function mediaVariantInfo(key: string, width: number) {
  if (!resizableMedia(key) || !mediaVariantWidth(String(width))) throw new Error('Invalid media variant');
  const source = uploadPath(key);
  // A leftover rendition must never make a removed upload available again.
  await stat(source);
  const target = variantPath(key, width);
  const info = async () => ({ path: target, stat: await stat(target), accelUri: `/_team_gene_media/media-variants/v1/${key}.${width}.webp` });
  try { return await info(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const id = target;
  const existing = pending.get(id);
  if (existing) { await existing; return info(); }
  const job = withImageProcessingSlot(async () => {
    await stat(source); // A missing original rejects with ENOENT (404), not an image error.
    const input = sharp(source, { limitInputPixels: 80_000_000, sequentialRead: true });
    const metadata = await input.metadata();
    if ((metadata.pages ?? 1) > 1) {
      input.destroy();
      throw new AnimatedMediaError('Animated images retain their original frames');
    }
    const image = await input
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    await mkdir(variantDir(), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, image);
      await stat(source); // Deletion may have happened while the image was decoding.
      await rename(temporary, target);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  });
  pending.set(id, job);
  try { await job; return await info(); } finally { pending.delete(id); }
}

// Retained for callers which actually need decoded bytes. HTTP responses use
// mediaVariantInfo so cached files are never copied into Node's heap.
export async function mediaVariant(key: string, width: number): Promise<Buffer> {
  return readFile((await mediaVariantInfo(key, width)).path);
}

export async function deleteMediaVariants(key: string) {
  if (!KEY.test(key)) throw new Error('Invalid media key');
  // The original is removed first by deleteMedia. Drain its existing jobs so
  // none can publish a rendition after this cleanup has completed.
  await Promise.allSettled(MEDIA_VARIANT_WIDTHS.map(width => pending.get(variantPath(key, width))).filter(job => job !== undefined));
  await Promise.all(MEDIA_VARIANT_WIDTHS.map(width => unlink(variantPath(key, width)).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  })));
}
