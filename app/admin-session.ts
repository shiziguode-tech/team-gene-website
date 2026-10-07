export const ADMIN_COOKIE = 'gene_admin';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();

function sessionKey() {
  if (!process.env.ADMIN_SESSION_SECRET) throw new Error('Admin session secret is not configured.');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(process.env.ADMIN_SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  if (!/^[\w-]+$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function createAdminSession() {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(18)));
  const payload = `${expires}.${nonce}`;
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await sessionKey(), encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function hasAdminSession(token?: string | null) {
  if (!token) return false;
  const [expiryText, nonce, signatureText, extra] = token.split('.');
  if (extra !== undefined || !/^\d{10}$/.test(expiryText ?? '') || !/^[\w-]{20,30}$/.test(nonce ?? '')) return false;
  const expiry = Number(expiryText);
  const now = Math.floor(Date.now() / 1000);
  if (expiry <= now || expiry > now + SESSION_TTL_SECONDS) return false;
  const signature = fromBase64Url(signatureText ?? '');
  if (!signature) return false;
  try {
    return await crypto.subtle.verify('HMAC', await sessionKey(), signature, encoder.encode(`${expiryText}.${nonce}`));
  } catch {
    return false;
  }
}

export function passwordMatches(candidate: string) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const actualBytes = encoder.encode(candidate);
  const expectedBytes = encoder.encode(password);
  let difference = actualBytes.length ^ expectedBytes.length;
  const length = Math.max(actualBytes.length, expectedBytes.length);
  for (let i = 0; i < length; i++) difference |= (actualBytes[i] ?? 0) ^ (expectedBytes[i] ?? 0);
  return difference === 0;
}

export function adminCookie(value: string, maxAge = SESSION_TTL_SECONDS) {
  return `${ADMIN_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
