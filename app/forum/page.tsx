import Forum from './forum';
import {pageMetadata} from '@/lib/seo';
// Styles: public/redesign/{fonts,site,forum}.css, linked by the Forum component (same design system as /mail).
export const metadata = { ...pageMetadata('团队论坛','Team Gene 团队论坛：分享科研进展、图片与视频，一起交流。','/forum'), robots: { index: false, follow: false } };

export const dynamic = 'force-dynamic';

export default function ForumPage() {
  return <Forum />;
}
