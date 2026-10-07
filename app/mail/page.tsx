import Redesign from '../redesign';
import { pageMetadata } from '@/lib/seo';
export const metadata = pageMetadata('邮箱与论坛', 'Team Gene 团队邮箱与论坛入口：申领团队邮箱，登录邮箱并参与团队交流。', '/mail');

export const dynamic = 'force-dynamic';

export default function MailPage() {
  return <Redesign section="mail" />;
}
