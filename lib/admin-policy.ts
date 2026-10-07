export function isAdminEmail(email: string | undefined, configuredEmail: string | undefined): boolean {
  const allowed = configuredEmail?.trim().toLowerCase();
  return Boolean(allowed && email?.trim().toLowerCase() === allowed);
}
