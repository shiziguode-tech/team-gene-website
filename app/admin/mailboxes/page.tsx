import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, hasAdminSession } from '@/app/admin-session';
import AdminMailboxes from './panel';
import AdminChrome from '../chrome';
import AdminSessionGuard from '../session-guard';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!await hasAdminSession(token)) redirect('/admin');
  return <AdminChrome><AdminSessionGuard><AdminMailboxes /></AdminSessionGuard></AdminChrome>;
}
