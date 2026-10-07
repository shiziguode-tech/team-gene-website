import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { listContent,contentDb } from '@/db/content';
import {resolveRouteId} from '@/db/content-routes';
import { entryDescription, entryPath, isPublicEntry } from '@/lib/content-links';
import { SITE_URL, sectionSeo, pageMetadata, notFoundMetadata } from '@/lib/seo';
import Redesign from '@/app/redesign';

export const dynamic='force-dynamic';
type Props={params:Promise<{section:string;id:string}>};
// Unknown paths resolve to null: generateMetadata answers with the 404 title and
// only the page throws notFound().
const findEntry=cache(async(section:string,id:string)=>{
  if(!Object.prototype.hasOwnProperty.call(sectionSeo,section))return null;
  const entries=await listContent();
  const entryId=entries.some(item=>item.section===section&&item.id===id)?id:resolveRouteId(contentDb(),section,id);
  const entry=entries.find(item=>item.section===section&&item.id===entryId&&isPublicEntry(item));
  if(!entry)return null;
  if(entry.slug&&id!==entry.slug)permanentRedirect(entryPath(entry));
  return entry;
});
export async function generateMetadata({params}:Props):Promise<Metadata>{
  const {section,id}=await params,entry=await findEntry(section,id);
  if(!entry)return notFoundMetadata;
  const image=entry.section==='members'||entry.section==='alumni'?entry.media?.find(asset=>asset.type==='image'):entry.titleImages?.[0]??entry.media?.find(asset=>asset.type==='image');
  return pageMetadata(entry.title,entryDescription(entry),entryPath(entry),image?{url:`/api/share-image/${encodeURIComponent(image.key)}`,alt:entry.title}:undefined,entry.section==='members'||entry.section==='alumni'?'profile':'article');
}
export default async function EntryPage({params}:Props){
  const {section,id}=await params,entry=await findEntry(section,id)??notFound();
  const label=sectionSeo[entry.section].title;
  const profile=section==='members'||section==='alumni';
  const avatar=entry.media?.find(asset=>asset.type==='image');
  const url=SITE_URL+entryPath(entry);
  const schema={'@context':'https://schema.org','@graph':[
    {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Team Gene',item:SITE_URL+'/'},{'@type':'ListItem',position:2,name:label,item:SITE_URL+'/'+section},{'@type':'ListItem',position:3,name:entry.title,item:url}]},
    profile?{'@type':'ProfilePage',url,name:entry.title,description:entryDescription(entry),mainEntity:{'@type':'Person',name:entry.title,description:entry.body,...(avatar?{image:SITE_URL+'/api/media/'+encodeURIComponent(avatar.key)}:{})}}:{'@type':'WebPage',url,name:entry.title,description:entryDescription(entry),inLanguage:'zh-CN',isPartOf:{'@id':SITE_URL+'/#website'}}
  ]};
  return <><Redesign section={section} entryId={entry.id} entries={await listContent()}/>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema).replace(/</g,'\\u003c')}}/>
  </>;
}
