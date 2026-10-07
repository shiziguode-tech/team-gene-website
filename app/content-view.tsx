'use client';

import {useState} from 'react';
import EntryLink from './entry-link';
import {entryPath} from '@/lib/content-links';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {ArrowUpRight,BookOpen,Trophy,TreePine,Coffee,Activity,ArrowRight} from 'lucide-react';
import {getAlumniYear,type Entry,sections} from '@/lib/content';

export function MediaGallery({entry,omitAvatar=false}:{entry:Entry;omitAvatar?:boolean}){
  const avatarKey=omitAvatar?entry.media?.find(asset=>asset.type==='image')?.key:undefined;
  const media=(entry.media??[]).filter(asset=>asset.key!==avatarKey);
  if(!media.length)return null;
  return <div className="detail-media-grid">{media.map(asset=><figure key={asset.key}>{asset.type==='image'?<img src={`/api/media/${encodeURIComponent(asset.key)}`} alt={asset.name}/>:<video src={`/api/media/${encodeURIComponent(asset.key)}`} controls preload="metadata"/>}<figcaption>{asset.name}</figcaption></figure>)}</div>;
}

export function ResearchDetails({entry}:{entry:Entry}){
  const background=entry.researchBackground??entry.body;
  return <div className="research-detail-sections">
    {!!entry.titleImages?.length&&<div className="research-model-gallery research-title-image">{entry.titleImages.map(asset=><figure key={asset.key}><a href={`/api/media/${encodeURIComponent(asset.key)}`} target="_blank" rel="noopener noreferrer"><img src={`/api/media/${encodeURIComponent(asset.key)}`} alt={`${entry.title} · 成果标题截图`}/></a></figure>)}</div>}
    {!!entry.modelImages?.length&&<section><h3>模型结构图</h3><div className="research-model-gallery">{entry.modelImages.map(asset=><figure key={asset.key}><a href={`/api/media/${encodeURIComponent(asset.key)}`} target="_blank" rel="noopener noreferrer"><img src={`/api/media/${encodeURIComponent(asset.key)}`} alt={asset.name}/></a><figcaption>{asset.name}</figcaption></figure>)}</div></section>}
    {!!background.trim()&&<section><h3>研究背景</h3><div className="detail-body">{background}</div></section>}
    {!!entry.researchResults?.trim()&&<section><h3>研究成果</h3><div className="detail-body">{entry.researchResults}</div></section>}
  </div>;
}

export function Detail({entry,onClose}:{entry:Entry|null;onClose:()=>void}){
  const isProfile=!!entry&&(entry.section==='members'||entry.section==='alumni'&&entry.alumniType==='profile');
  const avatar=entry?.media?.find(asset=>asset.type==='image');
  return <Dialog open={!!entry} onOpenChange={open=>{if(!open)onClose()}}><DialogContent className={isProfile?'detail-dialog profile-dialog':'detail-dialog'}>{entry&&isProfile?<><div className="profile-cover" aria-hidden="true"/><div className="profile-summary"><div className="profile-avatar-large">{avatar?<img src={`/api/media/${encodeURIComponent(avatar.key)}`} alt={`${entry.title}头像`}/>:<span>{entry.title.slice(-1)}</span>}</div><div className="profile-identity"><span className="tag">{entry.tag||'Team Gene'}</span><DialogTitle className="detail-title">{entry.title}</DialogTitle><DialogDescription className="profile-headline">{entry.subtitle||'Team Gene 团队成员'}</DialogDescription></div></div><div className="profile-body"><section className="profile-about"><h3>个人简介</h3><p>{entry.body||'个人简介尚未添加。'}</p></section>{entry.section==='alumni'&&entry.alumniType==='profile'&&entry.alumniMessage?.trim()&&<section className="profile-about alumni-message"><h3>校友寄语</h3><blockquote>{entry.alumniMessage}</blockquote></section>}{entry.url&&<section className="profile-about profile-links"><h3>相关链接</h3><a href={entry.url} target="_blank" rel="noopener noreferrer">个人主页 / 相关页面 <ArrowUpRight size={15}/></a></section>}{(entry.media??[]).some(asset=>asset.type==='video'||asset.key!==avatar?.key)&&<section className="profile-about"><h3>照片与动态</h3><MediaGallery entry={entry} omitAvatar/></section>}<p><a className="text-link" href={entryPath(entry)}>查看独立页面 / 分享此资料 ↗</a></p><small className="sample-note">个人资料由团队维护。</small></div></>:entry&&<><span className="eyebrow clay">TEAM GENE · {entry.tag}</span><DialogTitle className="detail-title">{entry.title}</DialogTitle><DialogDescription>{entry.subtitle&&<>{entry.subtitle} · </>}{entry.date}</DialogDescription>{entry.section==='research'?<ResearchDetails entry={entry}/>:<div className="detail-body">{entry.body}</div>}<MediaGallery entry={entry}/>{entry.url&&<a className="primary" href={entry.url} target="_blank" rel="noopener noreferrer">查看相关链接 <ArrowUpRight size={16}/></a>}<p><a className="text-link" href={entryPath(entry)}>查看独立页面 / 分享此内容 ↗</a></p></>}</DialogContent></Dialog>;
}

export function ProfileCards({entries,onOpen}:{entries:Entry[];onOpen:(entry:Entry)=>void}){
  return <div className="member-grid">{entries.map((entry,index)=>{const avatar=entry.media?.find(asset=>asset.type==='image');return <EntryLink key={entry.id} className="member-card" entry={entry} onOpen={onOpen}><div className={'avatar tone-'+index%4}>{avatar?<img src={`/api/media/${encodeURIComponent(avatar.key)}`} alt=""/>:<span>{entry.title.slice(-2)}</span>}<small>{String(index+1).padStart(2,'0')}</small></div><h3>{entry.title}<ArrowUpRight size={14}/></h3><p>{entry.subtitle}</p><span className="tag">{entry.tag}</span></EntryLink>})}</div>;
}

export function NewsList({entries,onOpen}:{entries:Entry[];onOpen:(entry:Entry)=>void}){
  return <>{entries.map(entry=><EntryLink key={entry.id} className="news-row news-button" entry={entry} onOpen={onOpen}><time dateTime={entry.date}><strong>{entry.date.slice(8)}</strong>{entry.date.slice(0,7).replace('-','.')}</time><div><span className={'tag '+(entry.tag==='团队日常'?'brown':'')}>{entry.tag}</span><h3>{entry.title}</h3><p>{entry.subtitle}</p></div><ArrowUpRight size={19}/></EntryLink>)}</>;
}

export default function ContentView({section,entries}:{section:string;entries:Entry[]}){
  const [selected,setSelected]=useState<Entry|null>(null);
  const [selectedAlumniYear,setSelectedAlumniYear]=useState('全部');
  const list=entries.filter(entry=>entry.section===section);
  const teachers=list.filter(entry=>entry.tag==='教师');
  const students=list.filter(entry=>entry.tag!=='教师');
  const alumniProfiles=list.filter(entry=>entry.alumniType==='profile');
  const alumniYears=Array.from(new Set(alumniProfiles.map(getAlumniYear))).sort((a,b)=>a==='其他'?(b==='其他'?0:1):b==='其他'?-1:Number(b)-Number(a));
  const activeAlumniYear=selectedAlumniYear==='全部'||alumniYears.includes(selectedAlumniYear)?selectedAlumniYear:'全部';
  const visibleAlumniProfiles=activeAlumniYear==='全部'?alumniProfiles:alumniProfiles.filter(entry=>getAlumniYear(entry)===activeAlumniYear);
  const intros:Record<string,string>={members:'在不同的研究兴趣之间，找到共同探索的方向。',alumni:'认识 Team Gene 的校友，按毕业年份浏览个人资料。',research:'从一个值得追问的问题，到一次可以复现的探索。',awards:'每一份认可，记录一段并肩投入的时光。',life:'科研之外，也有值得记录的日常。',rules:'让协作有序，让探索自由。',news:'在这里，了解下一场交流和团队的最新安排。'};
  return <section className="section inner-page"><span className="eyebrow clay">TEAM GENE / {section.toUpperCase()}</span><h1>{sections.find(item=>item[0]===section)?.[1]}</h1><p>{intros[section]}</p><div className="page-divider"><span>{section==='alumni'?`${String(alumniProfiles.length).padStart(2,'0')} 位校友`:`${String(list.length).padStart(2,'0')} ${section==='members'?'位同行者':'项记录'}`}</span><span>{section==='alumni'?'个人资料 · 可在后台编辑':'团队资料 · 持续更新'}</span></div>
    {!list.length&&section!=='alumni'&&<div className="empty-state">暂无内容，团队动态将在这里更新。</div>}
    {section==='members'&&<><h2 className="minor-heading" id="teacher-members">指导教师 <span>FACULTY</span></h2>{teachers.map(entry=>{const avatar=entry.media?.find(asset=>asset.type==='image');return <EntryLink className="teacher-card" key={entry.id} entry={entry} onOpen={setSelected}><div className="teacher-avatar">{avatar?<img src={`/api/media/${encodeURIComponent(avatar.key)}`} alt=""/>:<span>{entry.title.slice(0,1)}</span>}<small>TEAM GENE</small></div><div><span className="tag">{entry.subtitle}</span><h2>{entry.title}</h2><p>{entry.body.split('\n')[0]}</p><span className="text-link">了解更多 <ArrowUpRight size={15}/></span></div></EntryLink>})}<h2 className="minor-heading" id="student-members">学生成员 <span>STUDENTS / {students.length}</span></h2><ProfileCards entries={students} onOpen={setSelected}/></>}
    {section==='alumni'&&<><h2 className="minor-heading">校友个人资料 <span>ALUMNI PROFILES / {alumniProfiles.length}</span></h2><div className="alumni-year-tabs" role="tablist" aria-label="按毕业年份筛选校友">{['全部',...alumniYears].map(year=><button key={year} type="button" role="tab" aria-selected={activeAlumniYear===year} onClick={()=>setSelectedAlumniYear(year)}>{year==='全部'?'全部':year==='其他'?'其他':`${year}届`}</button>)}</div>{visibleAlumniProfiles.length?<ProfileCards entries={visibleAlumniProfiles} onOpen={setSelected}/>:<div className="empty-state">{alumniProfiles.length?`${activeAlumniYear==='其他'?'未标届别':`${activeAlumniYear} 届`}暂无校友资料。`:'暂无校友个人资料。可在后台新增资料并填写毕业届别数字（如 2020），页面会自动生成对应年份标签。'}</div>}</>}
    {section==='news'&&<NewsList entries={[...list].sort((a,b)=>b.date.localeCompare(a.date))} onOpen={setSelected}/>}
    {section==='rules'&&<div className="rules-list">{list.map((entry,index)=><details key={entry.id} open={index===0}><summary><span>0{index+1}</span><div><h3>{entry.title}</h3><p>{entry.subtitle}</p></div><span className="rule-plus">+</span></summary><div className="rule-body">{entry.body}<p><a href={entryPath(entry)}>查看独立页面 ↗</a></p></div></details>)}</div>}
    {section==='life'&&<div className="life-grid">{list.map((entry,index)=>{const Icon=[TreePine,Coffee,Activity][index%3];return <EntryLink key={entry.id} className="life-card" entry={entry} onOpen={setSelected}><div className={'life-art tone-'+index%4}><Icon size={48} strokeWidth={1}/><span>{entry.tag}</span><time>{entry.date.replaceAll('-',' / ')}</time></div><div className="life-copy"><h3>{entry.title}</h3><p>{entry.subtitle}</p><span className="text-link">活动详情 <ArrowRight size={15}/></span></div></EntryLink>})}</div>}
    {['research','awards'].includes(section)&&<div className="publication-list">{list.map(entry=><EntryLink className="publication" key={entry.id} entry={entry} onOpen={setSelected}><span className="publication-icon">{section==='awards'?<Trophy size={25} strokeWidth={1.5}/>:<BookOpen size={24} strokeWidth={1.5}/>}</span><div><span className="tag brown">{entry.tag}</span><h3>{entry.title}</h3><p>{entry.subtitle}</p><small>{entry.date.slice(0,4)} · {section==='awards'?'荣誉':'成果'}</small></div><ArrowUpRight size={19}/></EntryLink>)}</div>}
    <Detail entry={selected} onClose={()=>setSelected(null)}/>
  </section>;
}
