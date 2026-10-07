import Redesign from '../redesign';
import { listContent } from '@/db/content';
import { pageMetadata } from '@/lib/seo';
export const metadata = pageMetadata('邮箱与论坛', 'Team Gene 团队邮箱与论坛入口：申领团队邮箱，登录邮箱并参与团队交流。', '/mail');

export const dynamic = 'force-dynamic';

// The header hides empty record sections, so it needs the same content as every other page.
export default async function MailPage() {
  return <Redesign section="mail" entries={await listContent()} />;
}
