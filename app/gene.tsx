'use client';

import {useState,useEffect} from 'react';
import ContentView,{Detail,NewsList,ProfileCards} from './content-view';
import {type Entry} from '@/lib/content';
import {useRouter} from 'next/navigation';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {ArrowUpRight,ArrowRight,Maximize2,Settings2,Users} from 'lucide-react';

const sections=[['overview','团队概览'],['members','团队成员'],['alumni','校友介绍'],['research','学术成果'],['awards','团队获奖'],['life','团建活动'],['rules','管理规则'],['news','活动与通知']];

export default function Gene({initialSection='overview',initialEntries}:{initialSection?:string;initialEntries:Entry[]}){
  const router=useRouter();
  const tab=initialSection;
  const setTab=(value:string)=>router.push(value==='overview'?'/':'/'+value);
  const [wide,setWide]=useState(false);
  const [entries,setEntries]=useState<Entry[]>(initialEntries);
  const [selected,setSelected]=useState<Entry|null>(null);
  const [loadError,setLoadError]=useState(false);
  const alumniProfiles=entries.filter(entry=>entry.section==='alumni'&&entry.alumniType==='profile');
  const teacherCount=entries.filter(entry=>entry.section==='members'&&entry.tag==='教师').length;
  const studentCount=entries.filter(entry=>entry.section==='members'&&entry.tag!=='教师').length;

  useEffect(()=>{let active=true;const refresh=()=>fetch('/api/content').then(async response=>{if(!response.ok)throw Error();const data=await response.json() as {entries:Entry[];error:string};if(active){setEntries(data.entries);setLoadError(false)}}).catch(()=>{if(active)setLoadError(true)});void refresh();window.addEventListener('focus',refresh);return()=>{active=false;window.removeEventListener('focus',refresh)}},[]);
  const openMembersAt=(anchor:string)=>router.push('/members#'+anchor);

  return <div className={'site '+(wide?'wide':'')}>
    <header className="masthead"><a href="/" className="brand"><span className="brand-mark">G</span><span>TEAM GENE<small>COMPUTER SCIENCE & ARTIFICIAL INTELLIGENCE</small></span></a><button className="width-button" onClick={()=>setWide(!wide)} title="切换页面宽度"><Maximize2 size={15}/>{wide?'宽屏':'50%'}</button></header>
    <Detail entry={selected} onClose={()=>setSelected(null)}/>
    {loadError&&<div className="load-warning" role="status">暂时无法同步最新内容，当前显示上次成功加载的资料。<button onClick={()=>window.location.reload()}>重试</button></div>}
    <Tabs value={tab} onValueChange={setTab}><TabsList className="navigation" variant="line">{sections.map(([id,label])=><TabsTrigger key={id} value={id} asChild><a href={id==='overview'?'/':'/'+id}>{label}</a></TabsTrigger>)}<a className="mail-nav-link" href="/mail">邮箱与论坛</a></TabsList>
      <TabsContent value="overview">
        <section className="hero"><div className="eyebrow"><span/> TEAM GENE · RESEARCH GROUP</div><h1>让好奇心生根，<br/>让智能<span>生长。</span></h1><p>Team Gene 是专注于计算机科学与人工智能的科研团队，<br className="desktop-break"/>在开放的交流与扎实的探索中，把想法变成新的可能。</p><button className="primary" onClick={()=>setTab('research')}>探索我们的研究 <ArrowUpRight size={17}/></button><div className="hero-bottom"><span>COMPUTE. CONNECT. CREATE.</span><span>01 — ∞</span></div><div className="orbital" aria-hidden="true"><div/><div/><div/><span>G</span></div></section>
        <div className="stats"><button className="stat-link" aria-label={`查看 ${teacherCount} 位指导教师`} onClick={()=>openMembersAt('teacher-members')}><strong>{String(teacherCount).padStart(2,'0')}<span>位</span></strong><small>指导教师</small></button><button className="stat-link" aria-label={`查看 ${studentCount} 位学生成员`} onClick={()=>openMembersAt('student-members')}><strong>{String(studentCount).padStart(2,'0')}<span>位</span></strong><small>学生成员</small></button><button className="stat-link" aria-label={`查看 ${alumniProfiles.length} 位校友介绍`} onClick={()=>setTab('alumni')}><strong>{String(alumniProfiles.length).padStart(2,'0')}<span>位</span></strong><small>校友介绍</small></button><button className="stat-link" aria-label="查看 4 个核心研究方向" onClick={()=>setTab('research')}><strong>04<span>个</span></strong><small>核心研究方向</small></button></div>
        <section className="section"><div className="section-heading"><div><span className="eyebrow clay">OUR FOCUS</span><h2>深耕计算，探索智能</h2></div><span className="subtle">从基础问题，到真实世界</span></div><div className="focus-grid">{[['01','机器学习','Learning to understand','深度学习、表征学习与可信人工智能'],['02','大语言模型','Language meets intelligence','知识增强、智能体与多模态推理'],['03','计算机视觉','Seeing beyond pixels','视觉理解、图像生成与场景感知'],['04','智能计算系统','Ideas into systems','高效计算、软件工程与智能应用']].map(([number,title,en,description])=><button key={number} className="focus-card" onClick={()=>setTab('research')}><span className="focus-number">{number} /</span><ArrowUpRight size={18}/><h3>{title}</h3><small>{en}</small><p>{description}</p></button>)}</div></section>
        <section className="section"><div className="section-heading"><div><span className="eyebrow clay">ALUMNI PROFILES</span><h2>校友介绍</h2></div><button className="text-link" onClick={()=>setTab('alumni')}>全部校友 <ArrowRight size={16}/></button></div>{alumniProfiles.length?<ProfileCards entries={alumniProfiles.slice(0,2)} onOpen={setSelected}/>:<div className="empty-state">校友资料正在整理中。</div>}</section>
        <section className="section"><div className="section-heading"><div><span className="eyebrow clay">HAPPENING AT GENE</span><h2>团队近况</h2></div><button className="text-link" onClick={()=>setTab('news')}>所有动态 <ArrowRight size={16}/></button></div><NewsList entries={entries.filter(entry=>entry.section==='news').sort((a,b)=>b.date.localeCompare(a.date)).slice(0,2)} onOpen={setSelected}/></section>
        <section className="team-strip"><Users size={28}/><div><h2>好的研究，始于一起思考。</h2><p>{teacherCount} 位老师，{studentCount} 位学生，一个共同探索的团队。</p></div><button onClick={()=>setTab('members')} aria-label="认识团队成员"><ArrowUpRight/></button></section>
      </TabsContent>
      {sections.slice(1).map(([id])=><TabsContent key={id} value={id}><ContentView section={id} entries={entries}/></TabsContent>)}
    </Tabs>
    <footer><span className="footer-brand">TEAM GENE <small>思想相遇，智能生长。</small></span><div><span>© 2026 Team Gene · 计算机科学与人工智能</span><a href="/admin"><Settings2 size={14}/> 内容管理</a></div></footer>
  </div>;
}
