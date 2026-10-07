declare namespace Cloudflare {
  interface Env {
    ADMIN_EMAIL?: string;
    ADMIN_PASSWORD?: string;
    ADMIN_SESSION_SECRET?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
