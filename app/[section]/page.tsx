import { notFound } from 'next/navigation';
import Redesign from '../redesign';
import { listContent } from '@/db/content';
import { notFoundMetadata, pageMetadata, sectionSeo } from '@/lib/seo';
import { isEmptyOptionalSection } from '@/lib/content-links';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ section: string }> };
function findSection(key: string) {
  return Object.prototype.hasOwnProperty.call(sectionSeo, key) ? key as keyof typeof sectionSeo : null;
}
export async function generateMetadata({ params }: Props) {
  const section = findSection((await params).section);
  if (!section) return notFoundMetadata;
  const { title, description } = sectionSeo[section];
  const metadata = pageMetadata(title, description, `/${section}`);
  // An empty record section is reachable but not worth indexing until it has entries.
  return isEmptyOptionalSection(section, await listContent()) ? { ...metadata, robots: { index: false, follow: true } } : metadata;
}
export default async function SectionPage({ params }: Props) {
  const section = findSection((await params).section) ?? notFound();
  return <Redesign section={section} entries={await listContent()} />;
}
