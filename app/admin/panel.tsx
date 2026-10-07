/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation isolates the content and mailbox stylesheets. */
'use client';
import {IMAGE_ACCEPT,MEDIA_ACCEPT,sendAdminFile,validateAdminFiles,type MediaTarget} from '@/lib/admin-upload';
import {localContentDate} from '@/lib/admin-content';
import {runUploadBatch} from '@/lib/upload-transfer.js';

import {useEffect,useMemo,useRef,useState,type DragEvent,type ReactNode} from 'react';
import {useAdminSession} from './session-guard';
import {entryMedia,getAlumniYear,sections,type Entry,type MediaAsset,type ResearchHighlight,type Section} from '@/lib/content';
import legacyHighlights from '@/lib/redesign/highlights.json';
import {entryPath,isPublicEntry} from '@/lib/content-links';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {AlertTriangle,ArrowUpToLine,CheckCircle2,ExternalLink,FileText,Image as ImageIcon,Link2,Mail,LogOut,Pencil,Plus,Quote,RefreshCw,Save,Search,Trash2,UploadCloud,Video,X} from 'lucide-react';

type Target=MediaTarget;
type UploadItem={id:string;name:string;target:Target;loaded:number;total:number;done?:boolean};
type SortKey='default'|'date'|'title'|'year';

const mediaUrl=(asset:MediaAsset)=>`/api/media/${encodeURIComponent(asset.key)}`;
// Lists and tiles show small previews: load a resized rendition, not the upload.
const thumbUrl=(asset:MediaAsset,width:number)=>/\.(?:jpg|png|webp|avif)$/i.test(asset.key)?`${mediaUrl(asset)}?w=${width}`:mediaUrl(asset);
const formatSize=(bytes:number)=>bytes>=1024*1024?`${(bytes/1024/1024).toFixed(1)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`;
const formatDate=(date:string)=>date.replaceAll('-','.');
// Key results: drop empty rows; null when a row has only one of its two parts.
const cleanHighlights=(rows?:ResearchHighlight[])=>{
  if(rows===undefined)return undefined;
  const kept=(rows??[]).map(row=>({value:row.value.trim(),label:row.label.trim()})).filter(row=>row.value||row.label);
  return kept.some(row=>!row.value||!row.label)?null:kept;
};
const legacyHighlightsFor=(id:string)=>(legacyHighlights as Record<string,{highlights:ResearchHighlight[]}>)[id]?.highlights??[];
const isProfile=(entry:Pick<Entry,'section'|'alumniType'>)=>entry.section==='alumni'&&entry.alumniType==='profile';
// Cover thumbnail for the list: research prefers its title screenshot, everyone else the first image.
function coverOf(entry:Entry){
  const list=entry.section==='research'?[...(entry.titleImages??[]),...(entry.modelImages??[]),...(entry.media??[])]:(entry.media??[]);
  return list.find(asset=>asset.type==='image');
}
const draggingFiles=(event:DragEvent)=>Array.from(event.dataTransfer.types).includes('Files');

async function readContent(signal?:AbortSignal) {
  const response=await fetch('/api/content',{cache:'no-store',signal});
  const data=await response.json() as {entries?:Entry[];error?:string}|null;
  if(!response.ok||!Array.isArray(data?.entries))throw Error(data?.error||'加载失败，请重试。');
  return data.entries;
}

function Field({id,label,hint,count,max,children}:{id:string;label:string;hint?:string;count?:number;max?:number;children:ReactNode}){
  return <div className="cms-field">
    <div className="cms-field__label"><label htmlFor={id}>{label}</label>{max!==undefined&&<span className={`cms-count${(count??0)>max*.9?' is-warn':''}`} aria-hidden="true">{count??0} / {max}</span>}</div>
    {children}
    {hint&&<p className="cms-field__hint">{hint}</p>}
  </div>;
}

export default function Admin({name}:{name:string}){
  const session=useAdminSession();
  const [entries,setEntries]=useState<Entry[]>([]);
  const [section,setSection]=useState<Section>('members');
  const [alumniMode,setAlumniMode]=useState<'profile'|'update'>('profile');
  const [edit,setEdit]=useState<Entry|null>(null);
  const [snapshot,setSnapshot]=useState('');
  const [remove,setRemove]=useState<Entry|null>(null);
  const [confirmDiscard,setConfirmDiscard]=useState(false);
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [uploads,setUploads]=useState<UploadItem[]>([]);
  const [dragTarget,setDragTarget]=useState<Target|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [newMediaKeys,setNewMediaKeys]=useState<string[]>([]);
  const [query,setQuery]=useState('');
  const [sort,setSort]=useState<SortKey>('default');
  const uploadAbort=useRef<AbortController|null>(null);
  const saving=useRef(false);

  async function load(){setLoading(true);setError('');try{setEntries(await readContent())}catch(e){setError(e instanceof Error?e.message:'加载失败，请重试。')}finally{setLoading(false)}}
  useEffect(()=>{
    const controller=new AbortController();
    void readContent(controller.signal).then(data=>{if(!controller.signal.aborted)setEntries(data);})
      .catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'加载失败，请重试。');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[]);
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),4500);return()=>window.clearTimeout(timer)},[notice]);

  function blank(s:Section):Entry{return{id:crypto.randomUUID(),section:s,title:'',subtitle:'',tag:s==='members'?'机器学习':s==='alumni'?(alumniMode==='profile'?'计算机科学':'校友动态'):'',date:localContentDate(),body:'',url:'',revision:0,media:[],...(s==='alumni'?{alumniType:alumniMode}:{})}}
  // Every way of opening the editor goes through here so unsaved-change detection has a baseline.
  function openEditor(entry:Entry){setError('');setNewMediaKeys([]);setEdit(entry);setSnapshot(JSON.stringify(entry))}
  function openNew(){openEditor(blank(section))}
  function openExisting(entry:Entry){
    if(entry.section==='alumni')setAlumniMode((entry.alumniType??'update')==='profile'?'profile':'update');
    const inferredYear=entry.section==='alumni'&&(entry.alumniType??'update')==='profile'?getAlumniYear(entry):'其他';
    openEditor({...entry,graduationYear:entry.graduationYear??(inferredYear==='其他'?undefined:Number(inferredYear)),media:[...(entry.media??[])]});
  }
  const openRef=useRef({blank,openEditor,blocked:false});
  useEffect(()=>{openRef.current={blank,openEditor,blocked:!!edit||!!remove||busy||uploading};});
  useEffect(()=>{const ctx=(document as Document & {modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>unknown}}).modelContext;if(!ctx?.registerTool)return;const controller=new AbortController();try{Promise.resolve(ctx.registerTool({name:'start_team_content_creation',description:'打开 Team Gene 内容管理表单；仅准备新增记录，不保存。',inputSchema:{type:'object',properties:{section:{type:'string',enum:sections.slice(1).map(s=>s[0])}},required:['section'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input:unknown){const s=(input as {section?:Section})?.section;if(!sections.slice(1).some(x=>x[0]===s))throw Error('Invalid section');if(openRef.current.blocked)return {status:'editor_busy',message:'请先保存或关闭当前表单。'};setSection(s!);openRef.current.openEditor(openRef.current.blank(s!));return {status:'form_opened',section:s}}},{signal:controller.signal})).catch(()=>{})}catch{}return()=>controller.abort()},[]);

  const field=(key:keyof Entry,value:string)=>setEdit(e=>e?{...e,[key]:value}:e);
  const dirty=!!edit&&JSON.stringify(edit)!==snapshot;
  useEffect(()=>()=>uploadAbort.current?.abort(),[]);
  useEffect(()=>{
    if(!dirty&&!uploading&&!(busy&&edit))return;
    const preventClose=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',preventClose);
    return()=>window.removeEventListener('beforeunload',preventClose);
  },[dirty,uploading,busy,edit]);
  async function discardUploads(keys:string[]){await Promise.all(keys.map(key=>session.request(`/api/media?key=${encodeURIComponent(key)}`,{method:'DELETE'}).catch(()=>undefined)))}
  function cancelEdit(){if(busy||uploading)return;void discardUploads(newMediaKeys);setNewMediaKeys([]);setEdit(null);setConfirmDiscard(false);setError('')}
  function requestClose(){if(busy||uploading)return;if(dirty)setConfirmDiscard(true);else cancelEdit()}

  // Share exactly the same authentication/retry rules as content saves.
  async function uploadOne(file:File,onProgress:(loaded:number)=>void,signal:AbortSignal){
    return session.withSession(()=>{
      onProgress(0);
      return sendAdminFile(file,onProgress,signal);
    },signal);
  }
  async function uploadFiles(files:File[],target:Target='media'){
    if(!files.length||!edit||uploadAbort.current||saving.current)return;
    const invalid=validateAdminFiles(files,target,(edit[target]??[]).length);
    if(invalid){setError(invalid);return;}
    setUploading(true);setError('');
    const controller=new AbortController();uploadAbort.current=controller;
    const existing=[...(edit[target]??[])];
    const completed:Array<MediaAsset|undefined>=new Array(files.length);
    setUploads(files.map(file=>({id:crypto.randomUUID(),name:file.name,target,loaded:0,total:file.size})));
    try{
      await runUploadBatch(files,controller.signal,async(file,index,signal)=>{
        const {status,data}=await uploadOne(file,loaded=>setUploads(items=>items.map((item,i)=>i===index?{...item,loaded}:item)),signal);
        if(status<200||status>=300||!data.asset)throw Error(data.error||'上传失败，请重试。');
        return data.asset;
      },(asset,index)=>{
        completed[index]=asset;
        // Network completion order must never choose a different profile avatar.
        const ordered=completed.filter((item):item is MediaAsset=>!!item);
        setEdit(current=>current?{...current,[target]:target==='titleImages'?ordered:[...existing,...ordered]}:current);
        setNewMediaKeys(keys=>[...keys,asset.key]);
        setUploads(items=>items.map((item,i)=>i===index?{...item,loaded:item.total,done:true}:item));
      });
    }catch(reason){setError(reason instanceof DOMException&&reason.name==='AbortError'?'已取消上传，已完成的文件仍保留在表单中。':reason instanceof Error?reason.message:'上传失败，请重试。')}
    finally{setUploading(false);setUploads([]);uploadAbort.current=null}
  }
  function moveFirst(target:'media'|'modelImages',key:string){setEdit(current=>{if(!current)return current;const list=current[target]??[];const asset=list.find(item=>item.key===key);return asset?{...current,[target]:[asset,...list.filter(item=>item.key!==key)]}:current})}
  function removeAsset(target:Target,key:string){setEdit(current=>current?{...current,[target]:target==='titleImages'?[]:(current[target]??[]).filter(item=>item.key!==key)}:current)}

  async function save(entry:Entry,deleting=false){
    if(saving.current||uploadAbort.current)return;
    const highlights=!deleting&&entry.section==='research'?cleanHighlights(entry.researchHighlights):undefined;
    if(highlights===null){setError('每条关键结果都要同时填写数值和说明，或删除这一项。');return}
    saving.current=true;
    setBusy(true);setError('');setNotice('');
    try{
      const response=await session.request('/api/content',{method:deleting?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(!deleting&&entry.section==='research'?{...entry,body:'',researchBackground:entry.researchBackground??entry.body,researchResults:entry.researchResults??'',researchHighlights:highlights}:entry)});
      const data=await response.json() as {entries?:Entry[];error?:string};
      // Keep the open draft on a conflict, but replace the stale list so closing
      // and reopening the editor starts from the other window's saved revision.
      if(response.status===409&&Array.isArray(data.entries))setEntries(data.entries);
      if(!response.ok)throw Error(data.error||'保存失败，请重试。');
      if(!Array.isArray(data.entries))throw Error('保存响应无效，请重新加载列表确认保存结果。');
      setEntries(data.entries);setEdit(null);setRemove(null);setNotice(deleting?'内容已删除，前台已同步。':'保存成功，前台已同步。');
      const keep=new Set((deleting?[]:entryMedia(entry)).map(asset=>asset.key));void discardUploads(newMediaKeys.filter(key=>!keep.has(key)));setNewMediaKeys([]);
    }catch(e){setError(e instanceof Error?e.message:'保存失败，请重试。')}
    finally{saving.current=false;setBusy(false)}
  }
  async function signOut(){setBusy(true);try{const response=await fetch('/api/admin/session',{method:'DELETE'});if(!response.ok)throw new Error('退出失败');window.location.assign('/admin')}catch{setError('退出失败，请刷新页面重试。')}finally{setBusy(false)}}

  // ⌘/Ctrl+S saves the open form.
  useEffect(()=>{
    if(!edit||busy||uploading||confirmDiscard)return;
    const onKey=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){event.preventDefault();document.querySelector<HTMLFormElement>('.cms-editor__form')?.requestSubmit()}};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[edit,busy,uploading,confirmDiscard]);

  const visibleEntries=entries.filter(entry=>entry.section===section&&(section!=='alumni'||(entry.alumniType??'update')===alumniMode));
  const shownEntries=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    const list=needle?visibleEntries.filter(entry=>[entry.title,entry.subtitle,entry.tag,entry.body,entry.researchBackground??'',entry.researchResults??'',entry.graduationYear??'',entry.alumniMessage??''].join(' ').toLowerCase().includes(needle)):visibleEntries;
    if(sort==='date')return [...list].sort((a,b)=>b.date.localeCompare(a.date));
    if(sort==='title')return [...list].sort((a,b)=>a.title.localeCompare(b.title,'zh-CN'));
    if(sort==='year')return [...list].sort((a,b)=>(Number(getAlumniYear(b))||0)-(Number(getAlumniYear(a))||0));
    return list;
  },[visibleEntries,query,sort]);
  const sectionLabel=(id:Section)=>sections.find(item=>item[0]===id)?.[1]??'';
  const heading=section==='alumni'?(alumniMode==='profile'?'校友个人资料':'动态归档'):sectionLabel(section);
  const addLabel=section==='alumni'?(alumniMode==='profile'?'新增校友资料':'新增动态归档'):'新增内容';
  const hint=section==='alumni'?(alumniMode==='profile'?'资料卡：填写毕业届别数字（如 2020），前台会自动生成对应年份标签；副标题填写当前身份或补充说明。':'历史校友动态保留在后台归档，不会显示在前台校友介绍页。'):section==='members'?'教师成员的分类标签请填写「教师」，其余成员填写研究方向。':section==='research'?'上传成果标题截图和模型结构图，分别填写研究背景与研究成果。':'支持新增、编辑和整理当前栏目的内容与附件。';
  const isNew=!!edit&&edit.revision===0&&!entries.some(entry=>entry.id===edit.id);
  const profileForm=!!edit&&section==='alumni'&&edit.alumniType==='profile';
  const avatarFirst=!!edit&&(edit.section==='members'||profileForm);
  const uploadedTotal=uploads.reduce((sum,item)=>sum+item.loaded,0),uploadTotal=uploads.reduce((sum,item)=>sum+item.total,0);
  const uploadPercent=uploadTotal?Math.min(100,Math.floor(uploadedTotal/uploadTotal*100)):0;

  function dropZone(target:Target,disabled:boolean){
    return {
      'data-drag':dragTarget===target?'':undefined,
      onDragOver:(event:DragEvent)=>{if(!draggingFiles(event)||disabled)return;event.preventDefault();setDragTarget(target)},
      onDragLeave:(event:DragEvent)=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setDragTarget(null)},
      onDrop:(event:DragEvent)=>{if(!draggingFiles(event))return;event.preventDefault();setDragTarget(null);if(!disabled)void uploadFiles(Array.from(event.dataTransfer.files),target)},
    };
  }
  function uploadBox({target,label,title,accept,multiple,hint,full}:{target:Target;label:string;title:string;accept:string;multiple:boolean;hint:string;full:boolean}){
    const disabled=uploading||busy||full;
    const id=`upload-${target}`;
    return <div className={`cms-drop${disabled?' is-disabled':''}`} {...dropZone(target,disabled)}>
      <input id={id} className="sr-only" type="file" aria-label={label} accept={accept} multiple={multiple} disabled={disabled} onChange={event=>{const files=Array.from(event.target.files??[]);event.target.value='';void uploadFiles(files,target)}}/>
      <UploadCloud size={22} aria-hidden="true"/>
      <div><label htmlFor={id} className="cms-drop__pick">{title}</label><span className="cms-drop__or">或拖放文件到这里</span><small>{hint}</small></div>
    </div>;
  }
  function progressFor(target:Target){
    const items=uploads.filter(item=>item.target===target);
    if(!items.length)return null;
    return <ul className="cms-progress" aria-label="上传进度">{items.map(item=>{const percent=item.total?Math.min(100,Math.floor(item.loaded/item.total*100)):0;return <li key={item.id}>
      <div><span>{item.name}</span><small>{item.done?'已完成':percent===100?'服务器正在保存…':`${percent}% · ${formatSize(item.loaded)} / ${formatSize(item.total)}`}</small></div>
      <progress value={item.loaded} max={item.total||1} aria-label={`${item.name} 上传进度`}/>
    </li>})}</ul>;
  }
  function mediaGrid(target:Target,assets:MediaAsset[],removeLabel:string){
    if(!assets.length)return null;
    // Research screenshots and diagrams are shown whole; photos fill their tile.
    return <ul className={`cms-media${target!=='media'?' is-contain':''}${target==='titleImages'?' is-single':''}`}>{assets.map((asset,index)=><li className="cms-tile" key={asset.key}>
      <div className="cms-tile__thumb">{asset.type==='image'?<img src={thumbUrl(asset,640)} alt={asset.name} loading="lazy" decoding="async"/>:<video src={mediaUrl(asset)} controls preload="metadata"/>}
        {target==='media'&&avatarFirst&&asset===assets.find(item=>item.type==='image')&&<span className="cms-tile__badge">头像</span>}
        {index===0&&target==='modelImages'&&assets.length>1&&<span className="cms-tile__badge">首张</span>}
      </div>
      <div className="cms-tile__meta">
        {asset.type==='image'?<ImageIcon size={14} aria-hidden="true"/>:<Video size={14} aria-hidden="true"/>}
        <span title={asset.name}>{asset.name}</span><small>{formatSize(asset.size)}</small>
      </div>
      <div className="cms-tile__actions">
        {index>0&&target!=='titleImages'&&<button type="button" disabled={uploading||busy} onClick={()=>moveFirst(target as 'media'|'modelImages',asset.key)} aria-label={`将 ${asset.name} ${target==='media'&&avatarFirst&&asset.type==='image'?'设为头像':'移到最前'}`} title={target==='media'&&avatarFirst&&asset.type==='image'?'设为头像':'移到最前'}><ArrowUpToLine size={15}/></button>}
        <button type="button" className="is-danger" aria-label={removeLabel+asset.name} disabled={uploading||busy} onClick={()=>removeAsset(target,asset.key)}><X size={15}/></button>
      </div>
    </li>)}</ul>;
  }

  return <main id="main" className="admin-main cms">
    <header className="page-hero cms-hero">
      <div className="page-hero__ghost" aria-hidden="true">Studio</div>
      <div className="wrap page-hero__grid">
        <div>
          <p className="eyebrow">Team Gene <span className="sep">/</span> Content Studio</p>
          <h1>内容管理</h1>
          <p className="page-hero__lede">维护团队的每一份记录。保存后将同步展示在网站上。</p>
        </div>
        <div className="page-hero__meta cms-hero__meta">
          <div className="page-hero__count"><span>{loading?'—':String(entries.length).padStart(2,'0')}</span><small>条内容</small></div>
          <div className="cms-admin"><a className="btn btn--ghost btn--sm" href="/admin/mailboxes"><Mail size={15}/>邮箱账户管理</a><span className="chip chip--line">当前管理员：{name}</span><button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={()=>void signOut()}><LogOut size={15}/>退出后台</button></div>
        </div>
      </div>
    </header>

    <section className="section cms-section">
      <div className="wrap">
        <Tabs className="cms-tabs-root" value={section} onValueChange={value=>{setSection(value as Section);setNotice('');setQuery('');setSort('default')}}>
          <TabsList className="cms-tabs" variant="line" aria-label="内容栏目">{sections.slice(1).map(([id,label])=><TabsTrigger value={id} key={id}>{label}<span className="cms-tabs__count">{loading?'':entries.filter(entry=>entry.section===id).length}</span></TabsTrigger>)}</TabsList>
        {/* The list below is the panel of the selected tab, so each tab's aria-controls points at it. */}
        <TabsContent value={section} className="cms-panel">

        {section==='alumni'&&<div className="cms-seg" role="group" aria-label="校友内容类型" data-mode={alumniMode}>
          <button type="button" aria-pressed={alumniMode==='profile'} onClick={()=>{setAlumniMode('profile');setSort('default');setQuery('');}}>校友个人资料 <span>{entries.filter(entry=>entry.section==='alumni'&&entry.alumniType==='profile').length}</span></button>
          <button type="button" aria-pressed={alumniMode==='update'} onClick={()=>{setAlumniMode('update');setSort('default');setQuery('');}}>动态归档 <span>{entries.filter(entry=>entry.section==='alumni'&&(entry.alumniType??'update')==='update').length}</span></button>
        </div>}

        <div className="cms-head">
          <div><h2>{heading}<span className="cms-head__count">{visibleEntries.length}</span></h2><p className="cms-head__hint">{hint}</p></div>
          <button type="button" className="btn btn--clay" disabled={loading||busy} onClick={openNew}><Plus size={17}/>{addLabel}</button>
        </div>

        <div className="cms-toolbar">
          <div className="cms-search"><Search size={17} aria-hidden="true"/><label className="sr-only" htmlFor="cms-q">搜索当前栏目</label><input id="cms-q" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索标题、分类或正文" autoComplete="off"/></div>
          <label className="cms-sort"><span>排序</span><select value={sort} onChange={event=>setSort(event.target.value as SortKey)}>
            <option value="default">默认顺序</option><option value="date">日期（新→旧）</option><option value="title">标题</option>{section==='alumni'&&alumniMode==='profile'&&<option value="year">届别（新→旧）</option>}
          </select></label>
          <span className="cms-toolbar__count">{query?`${shownEntries.length} / ${visibleEntries.length}`:visibleEntries.length} 条</span>
        </div>

        {error&&!edit&&<div className="admin-alert cms-alert" role="alert"><span>{error}</span><button type="button" className="btn btn--ghost btn--sm" onClick={()=>void load()}><RefreshCw size={14}/>重新加载</button></div>}

        {loading?<ul className="cms-list" aria-busy="true" aria-label="正在加载团队内容">{[0,1,2].map(i=><li className="cms-row is-skeleton" key={i}><span/><span/><span/></li>)}</ul>
          :visibleEntries.length===0?(!error&&<div className="card cms-empty"><FileText size={28} aria-hidden="true"/><h3>暂无内容</h3><p>点击「{addLabel}」创建第一条记录。</p><button type="button" className="btn btn--forest btn--sm" disabled={busy} onClick={openNew}><Plus size={15}/>{addLabel}</button></div>)
          :shownEntries.length===0?<div className="card cms-empty"><Search size={28} aria-hidden="true"/><h3>没有匹配的内容</h3><p>换个关键词试试。</p><button type="button" className="btn btn--ghost btn--sm" onClick={()=>setQuery('')}>清除搜索</button></div>
          :<ul className="cms-list">{shownEntries.map(entry=>{
            const cover=coverOf(entry);const all=entryMedia(entry);const images=all.filter(a=>a.type==='image').length,videos=all.length-images;
            const profile=isProfile(entry);const year=profile?getAlumniYear(entry):'';
            return <li className="cms-row" key={entry.id}>
              <div className={`cms-row__thumb${entry.section==='members'||profile?' is-round':''}`} aria-hidden="true">{cover?<img src={thumbUrl(cover,320)} alt="" loading="lazy" decoding="async"/>:<span>{entry.title.slice(0,1)}</span>}</div>
              <div className="cms-row__main">
                <h3>{entry.title}</h3>
                <p className="cms-row__meta">{entry.tag&&<span className="chip chip--dot">{entry.tag}</span>}{profile&&year!=='其他'&&<span className="chip chip--clay">{year} 届</span>}<span>{entry.subtitle||'—'}</span></p>
                <p className="cms-row__facts">{!profile&&<span className="cms-row__date">{formatDate(entry.date)}</span>}{images>0&&<span><ImageIcon size={13} aria-hidden="true"/>{images} 张图片</span>}{videos>0&&<span><Video size={13} aria-hidden="true"/>{videos} 个视频</span>}{entry.alumniMessage&&<span><Quote size={13} aria-hidden="true"/>有寄语</span>}{entry.url&&<span><Link2 size={13} aria-hidden="true"/>有链接</span>}</p>
              </div>
              <div className="cms-row__actions">
                {isPublicEntry(entry)&&<a href={entryPath(entry)} target="_blank" rel="noopener" aria-label={'在网站查看 '+entry.title} title="在网站查看"><ExternalLink size={16}/></a>}
                <button type="button" aria-label={'编辑 '+entry.title} disabled={busy} onClick={()=>openExisting(entry)}><Pencil size={16}/><span>编辑</span></button>
                <button type="button" className="is-danger" aria-label={'删除 '+entry.title} disabled={busy} onClick={()=>{setError('');setRemove(entry)}}><Trash2 size={16}/></button>
              </div>
            </li>})}</ul>}
        </TabsContent>
        </Tabs>
      </div>
    </section>

    <div className={`cms-toast${notice?' is-on':''}`} role="status" aria-live="polite">{notice&&<><CheckCircle2 size={17}/>{notice}</>}</div>

    <Dialog open={!!edit} onOpenChange={open=>{if(!open)requestClose()}}>
      <DialogContent className="cms-editor" onInteractOutside={event=>event.preventDefault()}>
        <div className="cms-editor__head">
          <p className="eyebrow">{sectionLabel(section)}{section==='alumni'&&<> <span className="sep">/</span> {edit?.alumniType==='profile'?'个人资料':'动态归档'}</>}</p>
          <DialogTitle>{isNew?'新增内容':'编辑内容'}</DialogTitle>
          <DialogDescription>填写完整后保存，修改将立即显示在网站上。</DialogDescription>
        </div>
        {edit&&<form className="cms-editor__form" onSubmit={event=>{event.preventDefault();if(!busy&&!uploading)void save(edit)}}>
          <div className="cms-editor__body">
            <fieldset className="cms-group" disabled={busy}><legend>基本信息</legend>
              <div className="cms-grid">
                <Field id="f-title" label={profileForm?'校友姓名':'标题 / 姓名'} count={edit.title.length} max={150}><input id="f-title" value={edit.title} maxLength={150} required onChange={event=>field('title',event.target.value)}/></Field>
                {profileForm&&<Field id="f-year" label="毕业届别（数字）" hint="前台会自动生成对应年份标签。"><input id="f-year" type="number" inputMode="numeric" min={1900} max={2099} step={1} required value={edit.graduationYear??''} placeholder="如：2020" onChange={event=>setEdit(current=>current?{...current,graduationYear:event.target.value===''?undefined:Number(event.target.value)}:current)}/></Field>}
                {section!=='research'&&<Field id="f-subtitle" label={profileForm?'当前身份 / 补充说明':'副标题 / 身份 / 作者'}><input id="f-subtitle" value={edit.subtitle} maxLength={250} placeholder={profileForm?'如：计算机专业硕士 · 高校教师':''} onChange={event=>field('subtitle',event.target.value)}/></Field>}
                <Field id="f-tag" label={profileForm?'研究方向 / 领域':section==='research'?'期刊/会议名称':'分类标签'}><input id="f-tag" value={edit.tag} maxLength={50} placeholder={section==='members'?'教师 或研究方向':profileForm?'如：多模态学习':section==='research'?'如：NeurIPS / IEEE TPAMI':'如：学术交流'} onChange={event=>field('tag',event.target.value)}/></Field>
                {!profileForm&&<Field id="f-date" label="日期"><input id="f-date" type="date" value={edit.date} required onChange={event=>field('date',event.target.value)}/></Field>}
              </div>
            </fieldset>

            {section==='research'&&<fieldset className="cms-group" disabled={busy}><legend>成果图片</legend>
              <div className="cms-upload">
                <p className="cms-upload__title">成果标题截图 <small>{edit.titleImages?.length?'1 / 1':'0 / 1'}</small></p>
                {uploadBox({target:'titleImages',label:'上传成果标题截图',title:edit.titleImages?.length?'替换成果标题截图':'上传成果标题截图',accept:IMAGE_ACCEPT,multiple:false,hint:'支持 JPG、PNG、WebP、GIF、AVIF 图片，最多一张，不超过 50 MB。',full:false})}
                {progressFor('titleImages')}
                {mediaGrid('titleImages',edit.titleImages??[],'移除成果标题截图 ')}
              </div>
              <div className="cms-upload">
                <p className="cms-upload__title">模型结构图 <small>{edit.modelImages?.length??0} / 8</small></p>
                {uploadBox({target:'modelImages',label:'上传模型结构图',title:'上传模型结构图',accept:IMAGE_ACCEPT,multiple:true,hint:'支持 JPG、PNG、WebP、GIF、AVIF 图片；单张不超过 50 MB，最多 8 张。',full:(edit.modelImages?.length??0)>=8})}
                {progressFor('modelImages')}
                {mediaGrid('modelImages',edit.modelImages??[],'移除模型结构图 ')}
              </div>
            </fieldset>}

            <fieldset className="cms-group" disabled={busy}><legend>正文</legend>
              {section==='research'?<>
                <Field id="f-background" label="研究背景" count={(edit.researchBackground??edit.body).length} max={12000}><textarea id="f-background" value={edit.researchBackground??edit.body} maxLength={12000} rows={6} onChange={event=>field('researchBackground',event.target.value)}/></Field>
                <Field id="f-results" label="研究成果" count={(edit.researchResults??'').length} max={12000}><textarea id="f-results" value={edit.researchResults??''} maxLength={12000} rows={6} onChange={event=>field('researchResults',event.target.value)}/></Field>
                <div className="cms-field cms-kpis" role="group" aria-labelledby="f-kpis-label">
                  <div className="cms-field__label"><span id="f-kpis-label">关键结果（可选）</span><span className="cms-count" aria-hidden="true">{edit.researchHighlights?.length??0} / 4</span></div>
                  {(edit.researchHighlights??[]).map((row,index)=><div className="cms-kpi" key={index}>
                    <input aria-label={`关键结果 ${index+1} 数值`} placeholder="+4.0%" maxLength={20} value={row.value} onChange={event=>setEdit(e=>e?{...e,researchHighlights:(e.researchHighlights??[]).map((item,i)=>i===index?{...item,value:event.target.value}:item)}:e)}/>
                    <input aria-label={`关键结果 ${index+1} 说明`} placeholder="四个基准数据集上的平均准确率提升" maxLength={40} value={row.label} onChange={event=>setEdit(e=>e?{...e,researchHighlights:(e.researchHighlights??[]).map((item,i)=>i===index?{...item,label:event.target.value}:item)}:e)}/>
                    <button type="button" className="cms-kpi__remove" aria-label={`删除关键结果 ${index+1}`} onClick={()=>setEdit(e=>e?{...e,researchHighlights:(e.researchHighlights??[]).filter((_,i)=>i!==index)}:e)}><X size={15}/></button>
                  </div>)}
                  {(edit.researchHighlights?.length??0)<4&&<button type="button" className="btn btn--ghost btn--sm cms-kpis__add" onClick={()=>setEdit(e=>e?{...e,researchHighlights:[...(e.researchHighlights??[]),{value:'',label:''}]}:e)}><Plus size={14}/>添加一项</button>}
                  {edit.researchHighlights===undefined&&legacyHighlightsFor(edit.id).length>0&&<button type="button" className="btn btn--ghost btn--sm cms-kpis__add" onClick={()=>setEdit(e=>e?{...e,researchHighlights:[]}:e)}><X size={14}/>清除预置结果</button>}
                  <p className="cms-field__hint">{edit.researchHighlights===undefined&&legacyHighlightsFor(edit.id).length?`此论文有预置关键结果（${legacyHighlightsFor(edit.id).map(row=>`${row.value} ${row.label}`).join('；')}），研究背景与原文一致时显示。在这里填写可替换，或清除后保存。`:edit.researchHighlights?.length===0?'保存后不显示关键结果，也不会恢复预置值；论文页右侧显示期刊与发表信息。':'显示在论文页右侧和首页成果卡片上，如“+4.0%｜平均准确率提升”。不填时，论文页右侧显示期刊与发表信息。'}</p>
                </div>
              </>:<Field id="f-body" label={profileForm?'个人简介':'详细内容'} count={edit.body.length} max={12000}><textarea id="f-body" value={edit.body} maxLength={12000} rows={7} onChange={event=>field('body',event.target.value)}/></Field>}
              {profileForm&&<Field id="f-message" label="校友寄语（可选）" count={(edit.alumniMessage??'').length} max={3000}><textarea id="f-message" value={edit.alumniMessage??''} maxLength={3000} rows={4} placeholder="写给团队学弟学妹的话……" onChange={event=>field('alumniMessage',event.target.value)}/></Field>}
            </fieldset>

            <fieldset className="cms-group" disabled={busy}><legend>链接与媒体</legend>
              <Field id="f-url" label="相关链接（可选）"><input id="f-url" type="url" placeholder="https://" value={edit.url} maxLength={1000} onChange={event=>field('url',event.target.value)}/></Field>
              <div className="cms-upload">
                <p className="cms-upload__title">照片与视频 <small>{edit.media?.length??0} / 8</small></p>
                {uploadBox({target:'media',label:'上传照片或视频',title:'上传照片或视频',accept:MEDIA_ACCEPT,multiple:true,hint:avatarFirst?'第一张图片用于圆形头像，其余照片与视频显示在个人资料中。':'图片单张不超过 50 MB，视频单个不超过 500 MB；最多 8 个文件。',full:(edit.media?.length??0)>=8})}
                {progressFor('media')}
                {mediaGrid('media',edit.media??[],'移除 ')}
              </div>
            </fieldset>
          </div>

          <div className="cms-editor__foot">
            {error&&<p className="admin-alert" role="alert">{error}</p>}
            <div className="cms-editor__bar">
              <p className="cms-editor__status" aria-live="polite">{uploading?<><span className="cms-spinner" aria-hidden="true"/>正在上传 {uploadPercent}%<button type="button" className="cms-link" onClick={()=>uploadAbort.current?.abort()}>取消上传</button></>:busy?'正在保存…':dirty?<><span className="cms-dot" aria-hidden="true"/>有未保存的修改</>:<span className="cms-editor__shortcut">⌘ / Ctrl + S 保存</span>}</p>
              <button type="button" className="btn btn--ghost" disabled={busy||uploading} onClick={requestClose}>取消</button>
              <button className="btn btn--forest" disabled={busy||uploading}><Save size={16}/>{uploading?'正在上传…':busy?'正在保存…':'保存并发布内容'}</button>
            </div>
          </div>
        </form>}
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmDiscard} onOpenChange={open=>{if(!open)setConfirmDiscard(false)}}>
      <AlertDialogContent className="cms-confirm">
        <span className="cms-confirm__icon" aria-hidden="true"><AlertTriangle size={22}/></span>
        <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
        <AlertDialogDescription>关闭后，本次填写的内容和新上传但尚未保存的文件都会被清除。</AlertDialogDescription>
        <AlertDialogFooter><AlertDialogCancel className="btn btn--ghost">继续编辑</AlertDialogCancel><AlertDialogAction className="btn btn--danger" onClick={cancelEdit}>放弃修改</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={!!remove} onOpenChange={open=>{if(!open&&!busy)setRemove(null)}}>
      <AlertDialogContent className="cms-confirm">
        <span className="cms-confirm__icon" aria-hidden="true"><Trash2 size={22}/></span>
        <AlertDialogTitle>删除这条内容？</AlertDialogTitle>
        <AlertDialogDescription>「{remove?.title}」将从网站移除。此操作无法在页面内撤销。</AlertDialogDescription>
        {error&&<p className="admin-alert" role="alert">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel className="btn btn--ghost" disabled={busy}>取消</AlertDialogCancel><AlertDialogAction className="btn btn--danger" disabled={busy} onClick={event=>{event.preventDefault();if(remove)void save(remove,true)}}>{busy?'删除中…':'确认删除'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>;
}
