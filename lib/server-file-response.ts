import { open } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { Readable } from 'node:stream';

type FileInfo = { path: string; stat: Stats; accelUri: string };

// All descriptors come from server-side validated media keys; never pass a
// request pathname or arbitrary header into this helper.
export async function publicFileResponse(request: Request, file: FileInfo, mime: string) {
  const { size, mtimeMs } = file.stat;
  const modified = Math.floor(mtimeMs / 1000) * 1000;
  // Match nginx's static-file ETag so conditional/If-Range requests behave the
  // same with and without internal sendfile acceleration.
  const etag = `"${(modified / 1000).toString(16)}-${size.toString(16)}"`;
  const headers = new Headers({
    'Content-Type': mime, 'Content-Length': String(size),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'ETag': etag, 'Last-Modified': new Date(modified).toUTCString(),
    'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline', 'Accept-Ranges': 'bytes',
  });
  const matches = request.headers.get('if-none-match');
  const since = request.headers.get('if-modified-since');
  if ((matches && matches.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag)) ||
      (!matches && since && Date.parse(since) >= modified)) {
    headers.delete('Content-Length');
    return new Response(null, { status: 304, headers });
  }

  let range = request.method === 'HEAD' ? null : request.headers.get('range');
  const ifRange = request.headers.get('if-range');
  if (range && ifRange && ifRange !== etag && !(Date.parse(ifRange) >= modified)) range = null;
  let start = 0, end = size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
    } else start = size;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) {
      headers.set('Content-Range', `bytes */${size}`);
      headers.delete('Content-Length');
      return new Response(null, { status: 416, headers });
    }
  }

  // Enabled only when nginx has matching `internal` aliases. nginx performs
  // Range/HEAD processing and sendfile; Node doesn't open or move the payload.
  if (process.env.MEDIA_ACCEL_REDIRECT === '1') {
    headers.set('X-Accel-Redirect', file.accelUri);
    return new Response(null, { headers });
  }
  if (range) {
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
  }
  if (request.method === 'HEAD' || size === 0) return new Response(null, { headers });
  const handle = await open(file.path, 'r');
  try {
    const stream = Readable.toWeb(handle.createReadStream({ start, end, autoClose: true, highWaterMark: 256 * 1024 }), {
      strategy: { highWaterMark: 256 * 1024, size: (chunk: Uint8Array) => chunk.byteLength },
    });
    return new Response(stream as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers });
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
}
