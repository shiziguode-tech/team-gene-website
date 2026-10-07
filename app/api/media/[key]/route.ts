import { AnimatedMediaError, mediaVariantInfo, mediaVariantWidth, mediaFileInfo, resizableMedia } from '@/db/media';
import { publicFileResponse } from '@/lib/server-file-response';

export const dynamic = 'force-dynamic';

// ?w=320|640|960|1600 serves a cached WebP rendition for page thumbnails and
// srcset; without it the original upload is streamed as before.
async function variant(request: Request, key: string, value: string) {
  const width = mediaVariantWidth(value);
  if (!width) return new Response('Unsupported width', { status: 400 });
  const original = `/api/media/${encodeURIComponent(key)}`;
  if (!resizableMedia(key)) return new Response(null, { status: 308, headers: { Location: original } });
  try {
    return await publicFileResponse(request, await mediaVariantInfo(key, width), 'image/webp');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response('Not found', { status: 404 });
    if (!(error instanceof AnimatedMediaError)) console.error('Media variant failed', key, width, error instanceof Error ? error.message : 'Unknown error');
    // An image the resizer cannot read still displays from the original upload.
    return new Response(null, { status: 307, headers: { Location: original, 'Cache-Control': 'no-store' } });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp|gif|avif|mp4|webm)$/.test(key)) return new Response('Not found', { status: 404 });
  const width = new URL(request.url).searchParams.get('w');
  if (width !== null) return variant(request, key, width);
  try {
    const ext = key.split('.').pop()!;
    const mime = ({ jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm' } as Record<string, string>)[ext];
    return await publicFileResponse(request, await mediaFileInfo(key), mime);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response('Not found', { status: 404 });
    console.error('Media read failed', error);
    return new Response('Media unavailable', { status: 503 });
  }
}

// Next's automatic HEAD handler discards GET's body without consuming the file
// stream. Handle metadata probes explicitly so every opened file is closed.
export async function HEAD(request: Request, context: { params: Promise<{ key: string }> }) {
  return GET(request, context);
}
