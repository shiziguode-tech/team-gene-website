/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation isolates the public design stylesheet from the forum. */
'use client';
import { uploadAttachments, type DraftMedia, type UploadProgress } from './upload';
import { Avatar, AvatarEditor } from './avatar';
import { AttachButton, AttachmentPreviews, MediaGallery, UploadStatus, addAttachments } from './attachments';
import { SiteFooter, SiteHeader, RedesignStyles, Icon, ICONS, WEBMAIL_URL } from '@/components/redesign/chrome';
import RedesignEffects from '../redesign-effects';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Eye, EyeOff, ImagePlus, LogOut, Mail, MessageCircle, RefreshCw, Send, ShieldCheck, Sparkles, Trash2, Users } from 'lucide-react';
import type { MediaAsset } from '@/lib/content';
import { forumMutation } from '@/lib/forum-client';

type User = { email: string; displayName: string; avatarUrl?: string | null };
type Comment = { id: string; avatarUrl?: string | null; author: string; body: string; media: MediaAsset[]; createdAt: number };
type Post = { id: string; avatarUrl?: string | null; author: string; isOwn: boolean; body: string; media: MediaAsset[]; createdAt: number; comments: Comment[]; nextCommentCursor?: string | null };

const LIMITS = '最多 4 个附件 · 图片 50 MB / 视频 500 MB · 合计 1 GB';
const fullDate = (timestamp: number) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
function relativeTime(timestamp: number, now: number) {
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时前`;
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / 1440)} 天前`;
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat('zh-CN', { year: sameYear ? undefined : 'numeric', month: 'long', day: 'numeric' }).format(new Date(timestamp));
}
function When({ timestamp, now }: { timestamp: number; now: number }) {
  return <time dateTime={new Date(timestamp).toISOString()} title={fullDate(timestamp)}>{relativeTime(timestamp, now)}</time>;
}
const draggingFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');
// A post or comment rejected because its uploads expired re-uploads them on the next try.
const forgetExpiredUploads = (items: DraftMedia[], result: { code?: string }) => { if (result.code === 'media') items.forEach(item => { item.asset = undefined; }); };
const feedFailureMessage = (reason: unknown) => reason instanceof Error && !(reason instanceof TypeError) && !(reason instanceof SyntaxError)
  ? reason.message : '论坛动态暂时无法加载，请检查网络后点击“刷新”重试。';

// A reply grows with what is typed (up to a few lines, then scrolls). Enter
// sends and Shift+Enter starts a new line; Enter that confirms an IME
// candidate never sends.
function ReplyField({ id, value, disabled, onChange }: { id: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 168)}px`;
  }, [value]);
  return <textarea ref={field} id={id} rows={1} disabled={disabled} value={value} maxLength={1200} placeholder="写下你的评论…" aria-label="评论内容"
    onChange={event => onChange(event.target.value)}
    onKeyDown={event => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault(); event.currentTarget.form?.requestSubmit();
    }}/>;
}

// Long posts start folded to eight lines so one essay does not push the rest of
// the feed away; short ones never show the toggle.
function PostBody({ text }: { text: string }) {
  const body = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const node = body.current;
    if (!node || open) return;
    const measure = () => setLong(node.scrollHeight > node.clientHeight + 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text, open]);
  return <>
    <p ref={body} className={`forum-post__body${open ? '' : ' is-folded'}`}>{text}</p>
    {(long || open) && <button type="button" className="forum-post__more" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? '收起' : '展开全文'}</button>}
  </>;
}

export default function Forum() {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadVersion = useRef(0);
  const mutationPending = useRef(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<DraftMedia[]>([]);
  const [dragging, setDragging] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [feedError, setFeedError] = useState('');
  // Shown beside the reply box or avatar that failed, which may be far from the composer.
  const [replyError, setReplyError] = useState<{ postId: string; message: string } | null>(null);
  const [avatarError, setAvatarError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [commentFiles, setCommentFiles] = useState<Record<string, DraftMedia[]>>({});
  const [operation, setOperation] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const composer = useRef<HTMLFormElement>(null);
  const commentFilesRef = useRef(commentFiles);
  useEffect(() => { commentFilesRef.current = commentFiles; }, [commentFiles]);
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  const expireSession = useCallback(() => {
    setUser(null);
    setMode('login');
    setPosts(current => current.map(post => ({ ...post, isOwn: false })));
  }, []);
  function avatarBusy(value: boolean) {
    mutationPending.current = value;
    if (value) ++loadVersion.current;
    setBusy(value); setOperation(value ? 'avatar' : null);
  }

  const loadPosts = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const [feedResponse, userResponse] = await Promise.all([
        fetch('/api/forum/posts', { cache: 'no-store' }),
        fetch('/api/forum/auth', { cache: 'no-store' }),
      ]);
      const feed = await feedResponse.json() as { posts?: Post[]; nextCursor?: string | null; error?: string };
      const auth = await userResponse.json() as { user?: User | null; error?: string };
      if (!feedResponse.ok) throw new Error(feed.error || '论坛内容暂时无法读取。');
      if (!userResponse.ok) throw new Error(auth.error || '登录状态暂时无法读取，请重试。');
      if (version !== loadVersion.current) return;
      setNextCursor(feed.nextCursor || null);
      setPosts(feed.posts || []);
      setUser(auth.user || null);
      if (auth.user) setEmail(auth.user.email);
      setNow(Date.now()); setLoaded(true); setLoadFailed(false); setFeedError('');
    } catch (reason) { if (version === loadVersion.current) { setFeedError(feedFailureMessage(reason)); setLoaded(true); setLoadFailed(true); } }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- State changes follow the asynchronous API responses, not synchronous effect execution.
  useEffect(() => { void loadPosts(); }, [loadPosts]);
  useEffect(() => {
    let active=true;
    const refreshAvatar = async () => {
      if (mutationPending.current) return;
      const version=loadVersion.current;
      try {
        const response=await fetch('/api/forum/auth',{cache:'no-store'});
        const data=await response.json() as {user?:User|null};
        if(active&&response.ok&&version===loadVersion.current&&!mutationPending.current) {
          if (data.user) setUser(data.user); else expireSession();
        }
      } catch { /* A failed background check must not erase the loaded feed or drafts. */ }
    };
    window.addEventListener('focus', refreshAvatar);
    return () => {active=false;window.removeEventListener('focus', refreshAvatar);};
  }, [expireSession]);
  useEffect(() => () => {
    filesRef.current.forEach(item => URL.revokeObjectURL(item.url));
    Object.values(commentFilesRef.current).flat().forEach(item => URL.revokeObjectURL(item.url));
    uploadController.current?.abort();
  }, []);
  useEffect(() => {
    if (!operation) return;
    const preventClose = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', preventClose);
    return () => window.removeEventListener('beforeunload', preventClose);
  }, [operation]);
  // Keep "N 分钟前" labels current without refetching.
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4200); return () => window.clearTimeout(timer); }, [notice]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(mutationPending.current)return;mutationPending.current=true;
    ++loadVersion.current; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/forum/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: mode, email, displayName: name, password }) });
      const data = await response.json() as { user?: User; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error || '无法登录论坛。');
      setUser(data.user); setPassword(''); setName(''); setShowPassword(false); setNotice(mode === 'register' ? '论坛账号已创建，欢迎加入！' : '登录成功，欢迎回来。');
      await loadPosts();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '认证失败，请重试。'); }
    finally { mutationPending.current=false;setBusy(false); }
  }

  async function signOut() {
    if(mutationPending.current)return;mutationPending.current=true;
    ++loadVersion.current; setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/forum/auth', { method: 'DELETE' });
      if (!response.ok) throw new Error('退出失败，请重试。');
      setUser(null); setPosts(current => current.map(post => ({ ...post, isOwn: false })));
      setNotice('已退出论坛。'); await loadPosts();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '退出失败，请重试。'); }
    finally { mutationPending.current=false;setBusy(false); }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!user || mutationPending.current) return;
    mutationPending.current=true;++loadVersion.current;
    setBusy(true); setOperation('post'); setError(''); setNotice('');
    const controller = new AbortController(); uploadController.current = controller;
    try {
      const media = await uploadAttachments(files, controller.signal, setProgress, expireSession);
      if (controller.signal.aborted) throw new Error('已取消上传，草稿已保留。');
      setProgress(null); uploadController.current = null;
      const response = await forumMutation('/api/forum/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: draft, media }) }, expireSession);
      const result = await response.json() as { error?: string; code?: string };
      if (!response.ok) { forgetExpiredUploads(files, result); throw new Error(result.error || '发布失败。'); }
      setDraft(''); files.forEach(item => URL.revokeObjectURL(item.url)); setFiles([]); setNotice('动态已发布。'); await loadPosts();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '发布失败，请重试。'); }
    finally { mutationPending.current=false;setBusy(false); setOperation(null); setProgress(null); uploadController.current = null; }
  }

  async function comment(post: Post) {
    const body = (commentDrafts[post.id] || '').trim(); const attachments = commentFiles[post.id] || [];
    if (mutationPending.current || (!body && !attachments.length)) return;
    mutationPending.current=true;++loadVersion.current;
    setBusy(true); setOperation(post.id); setReplyError(null); setNotice('');
    const controller = new AbortController(); uploadController.current = controller;
    try {
      const media = await uploadAttachments(attachments, controller.signal, setProgress, expireSession);
      if (controller.signal.aborted) throw new Error('已取消上传，草稿已保留。');
      setProgress(null); uploadController.current = null;
      const response = await forumMutation(`/api/forum/posts/${post.id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, media }) }, expireSession);
      const result = await response.json() as { comment?: Comment; error?: string; code?: string };
      if (!response.ok || !result.comment) { forgetExpiredUploads(attachments, result); throw new Error(result.error || '评论失败。'); }
      setPosts(current => current.map(item => item.id === post.id ? { ...item, comments: [...item.comments, result.comment!] } : item));
      setCommentDrafts(current => ({ ...current, [post.id]: '' }));
      attachments.forEach(item => URL.revokeObjectURL(item.url));
      setCommentFiles(current => ({ ...current, [post.id]: [] }));
    } catch (reason) { setReplyError({ postId: post.id, message: reason instanceof Error ? reason.message : '评论失败，请重试。' }); }
    finally { mutationPending.current=false;setBusy(false); setOperation(null); setProgress(null); uploadController.current = null; }
  }

  async function loadMore(post?: Post) {
    const cursor = post ? post.nextCommentCursor : nextCursor;
    if (mutationPending.current || !cursor) return;
    mutationPending.current=true;
    setBusy(true); ++loadVersion.current;
    try {
      const path = post ? `/api/forum/posts/${post.id}/comments?after=${encodeURIComponent(cursor)}` : `/api/forum/posts?before=${encodeURIComponent(cursor)}`;
      const response = await fetch(path, {cache:'no-store'});
      const data = await response.json() as {posts?:Post[]; comments?:Comment[]; nextCursor?:string|null; error?:string};
      if (!response.ok) throw new Error(data.error || '加载失败，请重试。');
      if (post) {
        setPosts(current => current.map(item => item.id === post.id ? {...item,
          comments: [...new Map([...item.comments,...(data.comments || [])].map(comment => [comment.id,comment])).values()].sort((a,b) => a.createdAt-b.createdAt || a.id.localeCompare(b.id)),
          nextCommentCursor:data.nextCursor || null,
        } : item));
      } else {
        setPosts(current => [...new Map([...current,...(data.posts || [])].map(item => [item.id,item])).values()]);
        setNextCursor(data.nextCursor || null);
      }
      setFeedError('');
    } catch (reason) { setFeedError(feedFailureMessage(reason)); }
    finally { mutationPending.current=false;setBusy(false); }
  }

  async function removePost(post: Post) {
    if(mutationPending.current)return;
    if (!window.confirm('确定删除这条动态及其评论吗？')) return;
    mutationPending.current=true;++loadVersion.current;
    setBusy(true); setError('');
    try {
      const response = await forumMutation(`/api/forum/posts/${post.id}`, { method: 'DELETE' }, expireSession);
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '删除失败。');
      setPosts(current => current.filter(item => item.id !== post.id));
      setNotice('动态已删除。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '删除失败，请重试。'); }
    finally { mutationPending.current=false;setBusy(false); }
  }

  async function refresh() {
    if(mutationPending.current||refreshing)return;
    setRefreshing(true);
    try { await loadPosts(); } finally { setRefreshing(false); }
  }

  function switchMode(next: 'login' | 'register') { setMode(next); setError(''); }

  // Composer conveniences: ⌘/Ctrl+Enter publishes; drop or paste files to attach.
  function composerKeys(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); composer.current?.requestSubmit(); }
  }
  function pasteFiles(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(event.clipboardData.files);
    if (!pasted.length || busy) return;
    event.preventDefault(); addAttachments(files, pasted, setFiles, setError);
  }
  function dropFiles(event: DragEvent<HTMLFormElement>) {
    if (!draggingFiles(event)) return;
    event.preventDefault(); setDragging(false);
    if (!busy) addAttachments(files, Array.from(event.dataTransfer.files), setFiles, setError);
  }

  const commentLabel = (post: Post) => post.comments.length ? `${post.comments.length}${post.nextCommentCursor ? '+' : ''} 条评论` : '评论';
  const publishLabel = operation === 'post' ? (progress ? '正在上传…' : '正在发布…') : '发布动态';

  return <div className="redesign-root" data-page="forum">
    <RedesignStyles extra={['/redesign/forum.css']}/>
    <SiteHeader
      nav={[{ href: '/', label: '团队主页' }, { href: '/mail', label: '邮箱申领' }, { href: '/forum', label: '团队论坛', current: true }]}
      actions={user
        ? <a className="btn btn--sm btn--mail forum-user-pill" href="#me"><Avatar name={user.displayName} url={user.avatarUrl} size="xs"/>{user.displayName}</a>
        : <a className="btn btn--sm btn--mail" href="/mail"><Icon d={ICONS.mail}/>申领邮箱</a>}/>

    <main id="main">
      <header className="page-hero forum-hero">
        <div className="page-hero__ghost" aria-hidden="true">Forum</div>
        <div className="wrap page-hero__grid">
          <div>
            <p className="eyebrow" data-reveal>Team Gene <span className="sep">/</span> Community</p>
            <h1 data-reveal style={{ '--d': 1 } as React.CSSProperties}>团队论坛</h1>
            <p className="page-hero__lede" data-reveal style={{ '--d': 2 } as React.CSSProperties}>记录灵感、分享进展，在交流中让想法继续生长。</p>
          </div>
          <div className="forum-hero__links" data-reveal style={{ '--d': 3 } as React.CSSProperties}>
            <a className="link-arrow" href="/mail">邮箱与论坛入口 <ArrowRight size={15}/></a>
            <a className="link-arrow" href={WEBMAIL_URL} target="_blank" rel="noreferrer">网页版邮箱 <ArrowUpRight size={15}/></a>
          </div>
        </div>
      </header>

      <section className="section forum-section">
        <div className="wrap forum-layout">
          <div className="forum-feed-col">
            {user && <form ref={composer} className={`card forum-composer${dragging ? ' is-dragging' : ''}`} onSubmit={publish}
              onDragOver={event => { if (draggingFiles(event)) { event.preventDefault(); setDragging(true); } }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
              onDrop={dropFiles}>
              <div className="forum-composer__row">
                <Avatar name={user.displayName} url={user.avatarUrl}/>
                <textarea disabled={busy} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={composerKeys} onPaste={pasteFiles}
                  maxLength={5000} rows={3} placeholder={`${user.displayName}，此刻有什么新发现？`} aria-label="动态内容"/>
              </div>
              <AttachmentPreviews items={files} onChange={setFiles} disabled={busy}/>
              {operation === 'post' && progress && <UploadStatus progress={progress} cancel={() => uploadController.current?.abort()}/>}
              <div className="forum-composer__bar">
                <div className="forum-composer__tools">
                  <AttachButton items={files} onChange={setFiles} onError={setError} disabled={busy}/>
                  <span className="forum-hint">{LIMITS}</span>
                </div>
                <span className={`forum-count${draft.length > 4500 ? ' is-warn' : ''}`} aria-live="polite">{draft.length}/5000</span>
                <button className="btn btn--clay btn--sm" disabled={busy || (!draft.trim() && !files.length)} title="⌘ / Ctrl + Enter 发布">{publishLabel}<Send size={15}/></button>
              </div>
              <div className="forum-drop" aria-hidden="true"><ImagePlus size={26}/><span>松开以添加照片或视频</span></div>
            </form>}

            {error && user && <p className="forum-alert" role="alert">{error}</p>}
            {/* Narrow screens list the posts before the sign-in card; this jumps to it. */}
            {loaded && !user && <a className="btn btn--clay btn--sm forum-guest-cta" href="#auth">登录或注册论坛<ArrowDown size={15}/></a>}

            <div className="forum-feed-head">
              <div><p className="eyebrow">Latest from the team</p><h2>最近动态{loaded && !loadFailed && <span className="chip">{posts.length}{nextCursor ? '+' : ''}</span>}</h2></div>
              <button className="btn btn--ghost btn--sm" type="button" disabled={busy || refreshing} onClick={() => void refresh()}><RefreshCw size={15} className={refreshing ? 'is-spinning' : ''}/>刷新</button>
            </div>

            {feedError && <p className="forum-alert" role="alert">{feedError}{posts.length > 0 && ' 当前显示的是已加载的动态。'}</p>}

            {!loaded ? <div className="forum-feed" aria-busy="true" aria-label="正在加载动态">{[0, 1, 2].map(i => <div className="card forum-skeleton" key={i}><span/><span/><span/></div>)}</div>
              : loadFailed && posts.length === 0 ? <div className="card forum-empty" role="status"><RefreshCw size={28}/><h3>暂时无法读取论坛动态</h3><p>请检查网络，然后点击上方“刷新”重试。</p></div>
              : posts.length === 0 ? <div className="card forum-empty">
                <svg viewBox="0 0 120 96" aria-hidden="true"><path pathLength="1" d="M14 18h60a8 8 0 0 1 8 8v28a8 8 0 0 1-8 8H38l-14 11V62H14a8 8 0 0 1-8-8V26a8 8 0 0 1 8-8z"/><path pathLength="1" style={{ '--n': 1 } as React.CSSProperties} d="M90 38h16a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8h-4v10l-12-10H74a8 8 0 0 1-8-8v-2"/><path pathLength="1" style={{ '--n': 2 } as React.CSSProperties} d="M22 34h44M22 46h28"/></svg>
                <h3>这里还没有动态</h3>
                <p>{user ? '发布第一条动态，开始交流。' : '登录论坛后分享团队里的新鲜事。'}</p>
              </div>
              : <div className="forum-feed">{posts.map(post => <article className="card forum-post" key={post.id}>
                <header className="forum-post__head">
                  <Avatar name={post.author} url={post.avatarUrl}/>
                  <div className="forum-post__meta">
                    <strong>{post.author}{post.isOwn && <span className="chip chip--line">我</span>}</strong>
                    <When timestamp={post.createdAt} now={now}/>
                  </div>
                  {post.isOwn && <button type="button" className="forum-icon-btn is-danger" onClick={() => void removePost(post)} disabled={busy} aria-label="删除动态" title="删除动态"><Trash2 size={16}/></button>}
                </header>
                {post.body && <PostBody text={post.body}/>}
                <MediaGallery media={post.media}/>
                <div className="forum-post__bar">
                  <button type="button" className="forum-post__action" onClick={() => document.getElementById(`reply-${post.id}`)?.focus()}><MessageCircle size={16}/>{commentLabel(post)}</button>
                </div>
                {post.comments.length > 0 && <ol className="forum-comments">{post.comments.map(item => <li className="forum-comment" key={item.id}>
                  <Avatar name={item.author} url={item.avatarUrl} size="sm"/>
                  <div className="forum-comment__bubble">
                    <div className="forum-comment__head"><strong>{item.author}</strong><When timestamp={item.createdAt} now={now}/></div>
                    {item.body && <p>{item.body}</p>}
                    <MediaGallery media={item.media || []}/>
                  </div>
                </li>)}</ol>}
                {post.nextCommentCursor && <button className="forum-more" type="button" disabled={busy} onClick={() => void loadMore(post)}>查看更多评论</button>}
                {user ? <form className="forum-reply" onSubmit={event => { event.preventDefault(); void comment(post); }}>
                  <Avatar name={user.displayName} url={user.avatarUrl} size="sm"/>
                  <div className="forum-reply__box">
                    <div className="forum-reply__row">
                      <ReplyField id={`reply-${post.id}`} disabled={busy} value={commentDrafts[post.id] || ''} onChange={value => setCommentDrafts(current => ({ ...current, [post.id]: value }))}/>
                      <AttachButton compact items={commentFiles[post.id] || []} onChange={items => setCommentFiles(current => ({ ...current, [post.id]: items }))} onError={message => setReplyError(message ? { postId: post.id, message } : null)} disabled={busy}/>
                      <button className="forum-send" disabled={busy || (!(commentDrafts[post.id] || '').trim() && !(commentFiles[post.id] || []).length)}><Send size={15}/><span>{operation === post.id ? '正在发送…' : '评论'}</span></button>
                    </div>
                    <AttachmentPreviews items={commentFiles[post.id] || []} onChange={items => setCommentFiles(current => ({ ...current, [post.id]: items }))} disabled={busy}/>
                    {!!(commentFiles[post.id] || []).length && <small className="forum-hint">{LIMITS}</small>}
                    {operation === post.id && progress && <UploadStatus progress={progress} cancel={() => uploadController.current?.abort()}/>}
                    {replyError?.postId === post.id && <p className="forum-alert forum-reply__error" role="alert">{replyError.message}</p>}
                  </div>
                </form> : <p className="forum-guest">登录论坛后即可评论。还没有邮箱？<a href="/mail">先申领一个</a></p>}
              </article>)}</div>}
            {nextCursor && <button className="btn btn--ghost btn--block forum-load-more" type="button" disabled={busy} onClick={() => void loadMore()}>加载更多动态</button>}
          </div>

          <aside className="forum-aside">
            {user ? <section className="card forum-me" id="me" aria-label="我的论坛账户">
              <AvatarEditor name={user.displayName} url={user.avatarUrl} disabled={busy} onBusy={avatarBusy} onError={setAvatarError} onSaved={loadPosts} onExpired={expireSession}/>
              <div className="forum-me__who"><strong>{user.displayName}</strong><span>{user.email}</span></div>
              <p className="forum-me__note">头像与网页版邮箱同步 · 图片最大 50 MB，自动居中裁剪</p>
              {avatarError && <p className="forum-alert" role="alert">{avatarError}</p>}
              <div className="forum-me__links">
                <a className="btn btn--ghost btn--sm" href={WEBMAIL_URL} target="_blank" rel="noreferrer"><Mail size={15}/>网页版邮箱</a>
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => void signOut()} disabled={busy}><LogOut size={15}/>退出</button>
              </div>
            </section> : <section className="card forum-auth" id="auth" aria-labelledby="auth-title">
              <div className="forum-seg" data-mode={mode}>
                <button type="button" disabled={busy} aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>论坛登录</button>
                <button type="button" disabled={busy} aria-pressed={mode === 'register'} onClick={() => switchMode('register')}>注册论坛</button>
              </div>
              <h2 id="auth-title">{mode === 'register' ? '用团队邮箱注册' : '欢迎回到论坛'}</h2>
              <p>{mode === 'register' ? '邮箱必须已开通。系统会验证邮箱密码，并将论坛昵称保存在服务器。' : '使用完整邮箱地址与邮箱密码登录。论坛不会保存邮箱密码。'}</p>
              <form className="form" onSubmit={authenticate}>
                {mode === 'register' && <div className="field">
                  <label htmlFor="forum-name">论坛昵称</label>
                  <div className="control"><input id="forum-name" disabled={busy} value={name} onChange={event => setName(event.target.value)} minLength={1} maxLength={40} placeholder="例如：小 Gene" autoComplete="nickname" required/></div>
                </div>}
                <div className="field">
                  <label htmlFor="forum-email">团队邮箱</label>
                  <div className="control"><span className="control__icon" aria-hidden="true"><Mail size={16}/></span><input id="forum-email" type="email" disabled={busy} value={email} onChange={event => setEmail(event.target.value)} placeholder="name@team-gene.com" autoComplete="username" required/></div>
                </div>
                <div className="field">
                  <label htmlFor="forum-password">邮箱密码</label>
                  <div className="control"><input id="forum-password" disabled={busy} type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} minLength={12} maxLength={128} placeholder="至少 12 位" autoComplete="current-password" required/>
                    <button type="button" className="control__btn" aria-pressed={showPassword} aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>
                </div>
                {error && <p className="forum-alert" role="alert">{error}</p>}
                <button className="btn btn--clay btn--block" disabled={busy}>{busy ? '正在验证…' : mode === 'register' ? '验证邮箱并注册' : '登录论坛'}<ArrowRight size={16} className="icon--right"/></button>
              </form>
              <a className="link-arrow forum-auth__foot" href="/mail">还没有邮箱？先申领一个 <ArrowUpRight size={14}/></a>
            </section>}

            <section className="card forum-guide" aria-labelledby="guide-title">
              <p className="eyebrow">A place to share</p>
              <h3 id="guide-title">想法相遇，交流生长。</h3>
              <p>使用已开通的 Team Gene 邮箱注册或登录论坛。每位成员可发文字动态、照片和视频，也可以在动态下交流。</p>
              <ul>
                <li><Users size={16}/>尊重他人，友善讨论。</li>
                <li><Sparkles size={16}/>分享科研、学习与团队生活。</li>
                <li><ShieldCheck size={16}/>不要发布他人隐私或侵权材料。</li>
              </ul>
            </section>
          </aside>
        </div>
      </section>
    </main>

    <SiteFooter links={[{ href: '/mail', label: '申领邮箱' }, { href: '/forum', label: '团队论坛' }, { href: WEBMAIL_URL, label: '网页版邮箱' }]}/>
    <div className={`forum-toast${notice ? ' is-on' : ''}`} role="status" aria-live="polite">{notice && <><MessageCircle size={16}/>{notice}</>}</div>
    <RedesignEffects contentKey="forum"/>
  </div>;
}
