import { avatarFileInfo } from '@/db/avatars';
import { publicFileResponse } from '@/lib/server-file-response';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const image = await avatarFileInfo((await params).id);
  if (!image) return new Response(null, { status: 404 });
  return publicFileResponse(request, image, 'image/webp');
}
export const HEAD = GET;
