'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, ImagePlus, Play, Check, X } from 'lucide-react';
import { FORUM_MEDIA_MAX_BYTES, mediaMaxBytes } from '@/lib/upload-limits.js';
import type { MediaAsset } from '@/lib/content';
import type { DraftMedia, UploadProgress } from './upload';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'video/mp4', 'video/webm'];
const mediaUrl = (asset: MediaAsset) => `/api/media/${encodeURIComponent(asset.key)}`;
// Resized WebP renditions from the media route (GIFs keep their animation);
// the original upload stays one click away through the “原图” link.
const resizable = (asset: MediaAsset) => /\.(?:jpg|png|webp|avif)$/i.test(asset.key);
const variantUrl = (asset: MediaAsset, width: number) => resizable(asset) ? `${mediaUrl(asset)}?w=${width}` : mediaUrl(asset);
const gridSrcSet = (asset: MediaAsset) => resizable(asset) ? [320, 640, 960].map(width => `${mediaUrl(asset)}?w=${width} ${width}w`).join(', ') : undefined;
const singleSrcSet = (asset: MediaAsset) => resizable(asset) ? [320, 640, 960, 1600].map(width => `${mediaUrl(asset)}?w=${width} ${width}w`).join(', ') : undefined;
const megabytes = (value: number) => (value / 1024 / 1024).toFixed(1);

// One validation path for the file picker, drag-and-drop and paste.
export function addAttachments(items: DraftMedia[], files: File[], onChange: (items: DraftMedia[]) => void, onError: (error: string) => void) {
  if (!files.length) return;
  if (items.length + files.length > 4) return onError('最多上传 4 个照片或视频。');
  if (files.some(file => !ACCEPTED.includes(file.type))) return onError('支持 JPG、PNG、WebP、GIF、AVIF 图片和 MP4、WebM 视频。');
  if (files.some(file => !file.size || file.size > mediaMaxBytes(file.type))) return onError('请选择非空文件，图片最多 50 MB，视频最多 500 MB。');
  if ([...items.map(item => item.file), ...files].reduce((sum, file) => sum + file.size, 0) > FORUM_MEDIA_MAX_BYTES) return onError('附件总大小不能超过 1 GB。');
  onError(''); onChange([...items, ...files.map(file => ({ file, url: URL.createObjectURL(file) }))]);
}

export function AttachButton({ items, onChange, onError, disabled, compact = false }: {
  items: DraftMedia[]; onChange: (items: DraftMedia[]) => void; onError: (error: string) => void; disabled: boolean; compact?: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  function pick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []); event.target.value = '';
    if (disabled) return;
    addAttachments(items, files, onChange, onError);
  }
  const full = items.length >= 4;
  return <>
    <input ref={picker} type="file" hidden multiple disabled={disabled} accept={ACCEPTED.join(',')} onChange={pick}/>
    <button className={compact ? 'forum-icon-btn' : 'forum-tool'} type="button" disabled={disabled || full} onClick={() => picker.current?.click()}
      aria-label={compact ? '添加照片或视频' : undefined} title={full ? '最多 4 个附件' : '添加照片或视频'}>
      <ImagePlus size={compact ? 18 : 17}/>{!compact && <span>照片 / 视频</span>}{!compact && items.length > 0 && <small>{items.length}/4</small>}
    </button>
  </>;
}

export function AttachmentPreviews({ items, onChange, disabled }: { items: DraftMedia[]; onChange: (items: DraftMedia[]) => void; disabled: boolean }) {
  if (!items.length) return null;
  return <ul className="forum-previews" aria-label="待上传的附件">{items.map((item, index) => <li className="forum-preview" key={item.url}>
    {item.file.type.startsWith('image/') ? <img src={item.url} alt={item.file.name}/> : <><video src={item.url} muted preload="metadata"/><span className="forum-preview__badge"><Play size={12}/>视频</span></>}
    <span className="forum-preview__size">{item.asset ? <><Check size={11}/>已上传</> : `${megabytes(item.file.size)} MB`}</span>
    <button type="button" disabled={disabled} aria-label={`移除附件 ${item.file.name}`} onClick={() => { URL.revokeObjectURL(item.url); onChange(items.filter((_, i) => i !== index)); }}><X size={14}/></button>
  </li>)}</ul>;
}

export function MediaGallery({ media }: { media: MediaAsset[] }) {
  const [open, setOpen] = useState<string | null>(null);
  // Files removed from the server (a deleted post, a retired account) show a
  // quiet placeholder instead of the browser's broken-image icon.
  const [missing, setMissing] = useState<Set<string>>(() => new Set());
  if (!media.length) return null;
  const images = media.filter(asset => asset.type === 'image');
  const lose = (key: string) => setMissing(current => current.has(key) ? current : new Set(current).add(key));
  const openIndex = images.findIndex(asset => asset.key === open);
  // Keep natural proportions, but let narrow/mobile feeds download a smaller
  // rendition. The lightbox and original link remain available at full size.
  const single = media.length === 1;
  return <div className={'forum-gallery count-' + Math.min(media.length, 4)}>
    {media.map(asset => <div className={'forum-gallery__item is-' + asset.type} key={asset.key}>
      {missing.has(asset.key) ? <MissingAttachment asset={asset}/>
        : asset.type === 'image'
        ? <button type="button" onClick={() => setOpen(asset.key)} aria-label={`查看图片 ${asset.name}`}><img src={variantUrl(asset, single ? 960 : 640)} srcSet={single ? singleSrcSet(asset) : gridSrcSet(asset)} sizes={single ? '(min-width: 1025px) 720px, calc(100vw - 66px)' : '(min-width: 700px) 340px, 50vw'} alt={asset.name} loading="lazy" decoding="async" onError={() => lose(asset.key)}/></button>
        : <VideoAttachment asset={asset} onMissing={() => lose(asset.key)}/>}
    </div>)}
    {openIndex >= 0 && <Lightbox images={images} index={openIndex} onIndex={index=>setOpen(images[index].key)} onClose={() => setOpen(null)}/>}
  </div>;
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
type NetworkInformation = { saveData?: boolean; effectiveType?: string };

// Uploaded videos have no poster, so a bare <video preload="none"> showed a
// black box. A cover with the name, size and play button stands in until the
// visitor plays it. Mouse/keyboard devices on an unmetered connection also
// fetch the metadata near the viewport to show the real first frame behind the
// button; touch screens and data-saver connections download nothing first.
function MissingAttachment({ asset }: { asset: MediaAsset }) {
  return <div className="forum-missing" role="img" aria-label={`${asset.type === 'image' ? '图片' : '视频'}已失效：${asset.name}`}>
    <ImageOff size={20} aria-hidden="true"/><strong>{asset.type === 'image' ? '图片' : '视频'}已失效</strong><small>{asset.name}</small>
  </div>;
}

function VideoAttachment({ asset, onMissing }: { asset: MediaAsset; onMissing: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [frame, setFrame] = useState(false);
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    const node = video.current;
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (!node || matchMedia('(pointer: coarse)').matches || connection?.saveData || /2g/.test(connection?.effectiveType || '') || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting) || node.getAttribute('src')) return;
      observer.disconnect();
      node.preload = 'metadata';
      node.src = `${mediaUrl(asset)}#t=0.1`;
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [asset]);
  function play() {
    const node = video.current;
    if (!node) return;
    setStarted(true);
    node.controls = true; // focusable now, before React re-renders
    if (!node.getAttribute('src')) node.src = mediaUrl(asset);
    else if (node.currentTime < 0.5) node.currentTime = 0; // the first-frame preview sits at 0.1 s
    node.focus();
    void node.play().catch(() => {});
  }
  return <>
    <video ref={video} controls={started} preload="none" playsInline aria-label={asset.name} onError={onMissing}
      onLoadedMetadata={event => setDuration(event.currentTarget.duration)} onLoadedData={() => setFrame(true)}/>
    {!started && <button type="button" className={'forum-video-cover' + (frame ? ' has-frame' : '')} onClick={play} aria-label={`播放视频 ${asset.name}`}>
      <span className="forum-video-cover__play" aria-hidden="true"><Play size={22}/></span>
      <span className="forum-video-cover__meta">{asset.name} · {megabytes(asset.size)} MB{Number.isFinite(duration) && duration > 0 ? ` · ${clock(duration)}` : ''}</span>
    </button>}
  </>;
}

function Lightbox({ images, index, onIndex, onClose }: { images: MediaAsset[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Focus the dialog itself rather than letting the browser ring its first link.
  useEffect(() => { dialog.current?.showModal(); dialog.current?.focus(); }, []);
  const asset = images[index];
  const step = (delta: number) => onIndex((index + delta + images.length) % images.length);
  return <dialog ref={dialog} className="forum-lightbox" aria-label="图片预览" tabIndex={-1} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
    onKeyDown={event => { if (images.length > 1 && event.key === 'ArrowRight') step(1); if (images.length > 1 && event.key === 'ArrowLeft') step(-1); }}>
    <figure>
      <img src={variantUrl(asset, 1600)} alt={asset.name}/>
      <figcaption>
        <span>{asset.name}{images.length > 1 && <small>{index + 1} / {images.length}</small>}</span>
        <a href={mediaUrl(asset)} target="_blank" rel="noreferrer"><ExternalLink size={14}/>原图</a>
      </figcaption>
    </figure>
    {images.length > 1 && <>
      <button type="button" className="forum-lightbox__nav is-prev" aria-label="上一张" onClick={() => step(-1)}><ChevronLeft size={22}/></button>
      <button type="button" className="forum-lightbox__nav is-next" aria-label="下一张" onClick={() => step(1)}><ChevronRight size={22}/></button>
    </>}
    <button type="button" className="forum-lightbox__close" aria-label="关闭" onClick={() => dialog.current?.close()}><X size={18}/></button>
  </dialog>;
}

export function UploadStatus({ progress, cancel }: { progress: UploadProgress; cancel?: () => void }) {
  const percent = progress.total ? Math.min(100, Math.floor(progress.loaded / progress.total * 100)) : 100;
  const remaining = progress.speed > 0 ? Math.ceil((progress.total - progress.loaded) / progress.speed) : 0;
  return <div className="forum-upload" role="status" aria-live="polite">
    <div className="forum-upload__head">
      <strong>{progress.saving ? '附件已传输，正在保存…' : `正在上传 ${percent}%`}</strong>
      {cancel && <button type="button" onClick={cancel}>取消上传</button>}
    </div>
    <progress value={progress.loaded} max={progress.total || 1} aria-label="附件上传进度"/>
    <small>{megabytes(progress.loaded)} / {megabytes(progress.total)} MB{progress.speed > 0 && !progress.saving && ` · ${megabytes(progress.speed)} MB/s · 预计还需 ${remaining < 60 ? remaining + ' 秒' : Math.ceil(remaining / 60) + ' 分钟'}`}</small>
  </div>;
}
