export const BYTES_PER_MB = 1024 * 1024;
export const DEFAULT_MAILBOX_QUOTA_MB = 512;
export const DEFAULT_MAILBOX_QUOTA_BYTES = DEFAULT_MAILBOX_QUOTA_MB * BYTES_PER_MB;

export function quotaBytesFromMB(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) return null;
  const bytes = value * BYTES_PER_MB;
  return Number.isSafeInteger(bytes) ? bytes : null;
}
