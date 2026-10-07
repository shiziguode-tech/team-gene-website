import type { MetadataRoute } from 'next';
import { SITE_URL, sectionSeo } from '@/lib/seo';
import { listContent } from '@/db/content';
import { entryPath, isEmptyOptionalSection, isPublicEntry } from '@/lib/content-links';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await listContent();
  return [...['', ...Object.keys(sectionSeo).filter(section => !isEmptyOptionalSection(section, entries)), 'mail'].map(path => ({ url: `${SITE_URL}/${path}` })),
    ...entries.filter(isPublicEntry).map(entry=>({url:SITE_URL+entryPath(entry)}))];
}
