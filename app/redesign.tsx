// The public design stylesheets are linked here, scoped to public pages; admin/forum link their own.
import type {Entry} from '@/lib/content';
import {getAlumniYear} from '@/lib/content';
import {isPublicEntry} from '@/lib/content-links';
import {createRedesign} from '@/lib/redesign/templates.mjs';
import RedesignEffects from './redesign-effects';
import {createHash} from 'node:crypto';
import highlights from '@/lib/redesign/highlights.json';
import {STYLE_VERSION} from '@/lib/redesign/style-version';
import {SERIF_SUBSET_URL} from '@/lib/redesign/font-subset';

// Public pages prerender the page a visitor is about to open (hover on desktop,
// touch on phones), so the next page appears at once with its view transition.
// Admin, forum and API links are never prerendered.
const speculationRules = JSON.stringify({
  prerender: [{
    where: {and: [
      {href_matches: '/*'},
      {not: {href_matches: ['/admin*', '/forum*', '/api/*']}},
      {not: {selector_matches: '[target=_blank], [download], [data-no-prerender]'}},
    ]},
    eagerness: 'moderate',
  }],
});

// Keep the supplied design's quoted results only while the CMS abstract matches.
function researchHighlights(entry: Entry) {
  // An explicitly empty list also takes precedence: administrators cleared it.
  if (entry.researchHighlights !== undefined) return entry.researchHighlights;
  const extra = (highlights as Record<string,{backgroundHash:string;highlights:{value:string;label:string}[]}>)[entry.id];
  const hash = createHash('sha256').update((entry.researchBackground || '').replace(/\s+/g,' ').trim()).digest('hex');
  return extra?.backgroundHash === hash ? extra.highlights : [];
}

export default function Redesign({entries = [], section = 'home', entryId}: {entries?: Entry[]; section?: string; entryId?: string}) {
  const content = entries.filter(isPublicEntry).map(entry => ({
    ...entry,
    highlights: researchHighlights(entry),
    graduationYear: getAlumniYear(entry),
    media: [...(entry.media || [])].sort((a,b) => Number(b.type === 'image') - Number(a.type === 'image')),
  }));
  const templates = createRedesign(content);
  const entry = entryId ? content.find(item => item.id === entryId && item.section === section) : undefined;
  const page = entry ? templates.detail(entry) : templates.page(section);
  return <>
    {/* precedence hoists both into <head>, so the browser finds them before the page body. */}
    <link rel="stylesheet" href={`/redesign/fonts.css?v=${STYLE_VERSION}`} precedence="default" />
    <link rel="stylesheet" href={`/redesign/site.css?v=${STYLE_VERSION}`} precedence="default" />
    {/* Headings on every public page use this one Chinese serif file; fetch it with the CSS. */}
    <link rel="preload" href={SERIF_SUBSET_URL} as="font" type="font/woff2" crossOrigin="anonymous" />
    <div className="redesign-root" data-page={page.key} dangerouslySetInnerHTML={{__html:page.html}} />
    <RedesignEffects contentKey={createHash('sha256').update(page.html).digest('hex')} />
    <script type="speculationrules" dangerouslySetInnerHTML={{__html: speculationRules}} />
  </>;
}
