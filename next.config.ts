import type { NextConfig } from "next";

// Baseline hardening for every response. Script sources are not restricted:
// the public pages rely on inline boot and structured-data scripts.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  // HTTPS only from now on (browsers ignore it over plain-HTTP local development).
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Chat preview crawlers also need metadata in <head> and real HTTP redirects.
  htmlLimitedBots: /.*/,
  poweredByHeader: false,
  experimental: { cpus: 1 },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // Font files have content-hashed names and never change in place.
      { source: '/redesign/fonts/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};

export default nextConfig;
