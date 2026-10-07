import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { contentDb } from '@/db/content';
import { withImageProcessingSlot } from '../lib/image-processing.js';

export const AVATAR_LIMIT = 50 * 1024 * 1024;
const formats = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);
const mimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const root = () => join(process.env.DATA_DIR || './data', 'avatars');
let active = 0;

// Looked up for every post and comment author in the forum feed, so create
// the table once per connection.
const avatarSchemaReady = new WeakSet<object>();
function avatarDb() {
  const db = contentDb();
  if (!avatarSchemaReady.has(db)) {
    db.exec('CREATE TABLE IF NOT EXISTS account_avatars (email TEXT PRIMARY KEY, avatar_id TEXT NOT NULL UNIQUE, updated_at INTEGER NOT NULL)');
    avatarSchemaReady.add(db);
  }
  return db;
}
export function avatarForEmail(email: string) {
  const row = avatarDb().prepare('SELECT avatar_id FROM account_avatars WHERE email=?').get(email.toLowerCase()) as { avatar_id: string } | undefined;
  return row ? '/api/avatars/' + row.avatar_id : null;
}
export class AvatarError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export async function saveAvatar(email: string, request: Request) {
  const type = request.headers.get('content-type')?.split(';')[0] || '';
  const size = Number(request.headers.get('content-length'));
  if (!mimeTypes.has(type)) throw new AvatarError('支持 JPG、PNG、WebP、GIF 和 AVIF 图片。', 415);
  if (!Number.isSafeInteger(size) || size < 1 || size > AVATAR_LIMIT || !request.body) throw new AvatarError('头像图片不能为空，最大 50 MB。', 413);
  if (active >= 2) throw new AvatarError('正在处理其他头像，请稍后重试。', 429);
  active++;
  const id = randomUUID(), temporary = join(root(), id + '.tmp'), target = join(root(), id + '.webp');
  let saved = false;
  try {
    await mkdir(root(), { recursive: true });
    let bytes = 0;
    const limiter = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > size ? new AvatarError('上传大小不匹配。') : null, chunk);
    }});
    await pipeline(Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]), limiter, createWriteStream(temporary, { flags: 'wx', mode: 0o600, highWaterMark: 256 * 1024 }));
    if (bytes !== size) throw new AvatarError('图片上传不完整，请重试。');
    try {
      await withImageProcessingSlot(async () => {
        const image = sharp(temporary, { limitInputPixels: 64_000_000, animated: false });
        const metadata = await image.metadata();
        if (!metadata.format || !formats.has(metadata.format)) throw new Error('Unsupported image');
        await image.rotate().resize(512, 512, { fit: 'cover', position: 'centre' }).webp({ quality: 85 }).toFile(target);
      });
    } catch { throw new AvatarError('图片无法读取，请选择有效图片（最多 6400 万像素）。'); }
    const db = avatarDb();
    const previous = db.prepare('SELECT avatar_id FROM account_avatars WHERE email=?').get(email) as { avatar_id: string } | undefined;
    db.prepare('INSERT INTO account_avatars(email,avatar_id,updated_at) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET avatar_id=excluded.avatar_id,updated_at=excluded.updated_at').run(email, id, Date.now());
    saved = true;
    if (previous) await unlink(join(root(), previous.avatar_id + '.webp')).catch(() => {});
    return '/api/avatars/' + id;
  } finally {
    active--;
    await unlink(temporary).catch(() => {});
    if (!saved) await unlink(target).catch(() => {});
  }
}
export async function removeAvatar(email: string) {
  const db = avatarDb();
  const previous = db.prepare('SELECT avatar_id FROM account_avatars WHERE email=?').get(email) as { avatar_id: string } | undefined;
  db.prepare('DELETE FROM account_avatars WHERE email=?').run(email);
  if (previous) await unlink(join(root(), previous.avatar_id + '.webp')).catch(() => {});
}
export async function readAvatar(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  try { return await readFile(join(root(), id + '.webp')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export async function avatarFileInfo(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const path = join(root(), id + '.webp');
  try { return { path, stat: await stat(path), accelUri: `/_team_gene_media/avatars/${id}.webp` }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
