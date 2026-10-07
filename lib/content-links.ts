import type { Entry } from './content';

export function isPublicEntry(entry: Entry) {
  return entry.section !== 'alumni' || entry.alumniType === 'profile';
}
// Record sections that leave the navigation and sitemap while they have no
// public entries (lib/redesign/templates.mjs hides the same links).
export const OPTIONAL_SECTIONS = ['awards', 'life', 'news'] as const;
export function isEmptyOptionalSection(section: string, entries: Entry[]) {
  return (OPTIONAL_SECTIONS as readonly string[]).includes(section) && !entries.some(entry => entry.section === section && isPublicEntry(entry));
}
export function entryPath(entry: Pick<Entry, 'section' | 'id' | 'slug'>) {
  return `/${entry.section}/${encodeURIComponent(entry.slug || entry.id)}`;
}
export function entryDescription(entry: Entry) {
  return [entry.subtitle, entry.tag, entry.researchBackground ?? entry.body, entry.researchResults]
    .filter(Boolean).join(' · ').replace(/\s+/g, ' ').slice(0, 160)
    || `${entry.title}，Team Gene 团队公开资料。`;
}
