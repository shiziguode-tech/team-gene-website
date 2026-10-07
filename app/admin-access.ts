/** In no-domain deployments, permit management mutations only via an SSH tunnel to localhost. */
export function adminAccessAllowed(request: Request) {
  const authority = request.headers.get('host') || new URL(request.url).host;
  const host = new URL(`http://${authority}`).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (process.env.ADMIN_LOCAL_ONLY === '1') return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const allowedHosts = (process.env.ADMIN_ALLOWED_HOSTS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  return allowedHosts.length === 0 || allowedHosts.includes(host);
}

export function expectedRequestOrigin(request: Request) {
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || new URL(request.url).protocol.slice(0, -1);
  const host = request.headers.get('host') || new URL(request.url).host;
  return `${protocol}://${host}`;
}
