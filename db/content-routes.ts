import type {DatabaseSync} from 'node:sqlite';
import {pinyin} from 'pinyin-pro';
import type {Entry} from '../lib/content';

export function profileSlugBase(entry:Entry) {
  const name=pinyin(entry.title,{toneType:'none',type:'array',surname:'head',v:true}).join('')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90).replace(/-+$/,'')||'profile';
  const year=entry.section==='alumni'?(entry.graduationYear||`${entry.subtitle} ${entry.tag}`.match(/((?:19|20)\d{2})\s*届/)?.[1]):entry.tag==='教师'?'':entry.subtitle.match(/((?:19|20)\d{2})\s*级/)?.[1];
  return year&&year!=='其他'?`${year}-${name}`:name;
}

type Route={section:string;slug:string;entry_id:string;base:string;current:number};
const routeTables=new WeakSet<DatabaseSync>();
const routesTable=(db:DatabaseSync)=>{
  if(routeTables.has(db))return;
  db.exec(`CREATE TABLE IF NOT EXISTS content_routes (
    section TEXT NOT NULL, slug TEXT NOT NULL, entry_id TEXT NOT NULL,
    base TEXT NOT NULL, current INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(section,slug));
    CREATE UNIQUE INDEX IF NOT EXISTS content_routes_current ON content_routes(section,entry_id) WHERE current=1;`);
  routeTables.add(db);
};
// Retain every allocated alias, including renamed and removed profiles, so links
// never get reassigned to a different person. Names/years may change in the CMS.
export function withContentRoutes(db:DatabaseSync,entries:Entry[]):Entry[] {
  routesTable(db);
  const profiles=entries.filter(entry=>entry.section==='members'||entry.section==='alumni'&&entry.alumniType==='profile');
  if(!profiles.length)return entries;
  // Usual case: every profile already has a current route for its name and year.
  // Read without taking the write lock.
  const bases=new Map(profiles.map(entry=>[entry,profileSlugBase(entry)]));
  const currentRoutes=new Map((db.prepare('SELECT section,entry_id,slug,base FROM content_routes WHERE current=1').all() as Route[]).map(route=>[`${route.section}/${route.entry_id}`,route]));
  if(profiles.every(entry=>currentRoutes.get(`${entry.section}/${entry.id}`)?.base===bases.get(entry))) {
    return entries.map(entry=>bases.has(entry)?{...entry,slug:currentRoutes.get(`${entry.section}/${entry.id}`)!.slug}:entry);
  }
  const slugs=new Map<string,string>();
  db.exec('BEGIN IMMEDIATE');
  try {
    const routes=db.prepare('SELECT * FROM content_routes').all() as Route[];
    const reserved=new Map(routes.map(route=>[`${route.section}/${route.slug}`,route.entry_id]));
    for(const entry of entries)reserved.set(`${entry.section}/${entry.id}`,entry.id);
    for(const entry of [...profiles].sort((a,b)=>a.id.localeCompare(b.id))) {
      const base=bases.get(entry)!;
      const current=routes.find(route=>route.entry_id===entry.id&&route.section===entry.section&&route.current===1);
      if(current?.base===base){slugs.set(entry.id,current.slug);continue;}
      let slug=base,suffix=2;
      while(reserved.has(`${entry.section}/${slug}`)&&reserved.get(`${entry.section}/${slug}`)!==entry.id)slug=`${base}-${suffix++}`;
      db.prepare('UPDATE content_routes SET current=0 WHERE section=? AND entry_id=?').run(entry.section,entry.id);
      db.prepare(`INSERT INTO content_routes(section,slug,entry_id,base,current) VALUES(?,?,?,?,1)
        ON CONFLICT(section,slug) DO UPDATE SET base=excluded.base,current=1 WHERE content_routes.entry_id=excluded.entry_id`).run(entry.section,slug,entry.id,base);
      reserved.set(`${entry.section}/${slug}`,entry.id);slugs.set(entry.id,slug);
    }
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
  return entries.map(entry=>slugs.has(entry.id)?{...entry,slug:slugs.get(entry.id)}:entry);
}

export function resolveRouteId(db:DatabaseSync,section:string,slug:string):string|undefined {
  const row=db.prepare('SELECT entry_id FROM content_routes WHERE section=? AND slug=?').get(section,slug) as {entry_id:string}|undefined;
  return row?.entry_id;
}
