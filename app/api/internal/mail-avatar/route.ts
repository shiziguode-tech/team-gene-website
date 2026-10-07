import { timingSafeEqual } from 'node:crypto';
import { avatarForEmail, AvatarError, saveAvatar, removeAvatar } from '@/db/avatars';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Roundcube derives the email from its authenticated server session. Nginx blocks
// this route from the Internet; the loopback bridge additionally requires a secret.
function account(request: Request) {
  const secret = process.env.MAIL_AVATAR_BRIDGE_SECRET || '';
  const supplied = request.headers.get('x-team-gene-avatar-token') || '';
  if (secret.length < 32 || Buffer.byteLength(supplied) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) return null;
  const email = (request.headers.get('x-team-gene-avatar-user') || '').toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,31}@team-gene\.com$/.test(email) ? email : null;
}
async function handle(request: Request) {
  const email = account(request);
  if (!email) return Response.json({ error: 'Access denied' }, { status: 403 });
  try {
    if (request.method === 'POST') return Response.json({ avatarUrl: await saveAvatar(email, request) });
    if (request.method === 'DELETE') await removeAvatar(email);
    return Response.json({ avatarUrl: avatarForEmail(email) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: error instanceof AvatarError ? error.message : '头像保存失败，请稍后重试。' }, { status: error instanceof AvatarError ? error.status : 503 }); }
}
export { handle as GET, handle as POST, handle as DELETE };
