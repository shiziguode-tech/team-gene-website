'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, RotateCcw } from 'lucide-react';
import { forumMutation } from '@/lib/forum-client';
import { sendFileRequest } from '@/lib/upload-transfer.js';
import { prepareAvatar } from '@/lib/avatar-preprocess.js';

// Stable tint per name so initials avatars are distinguishable in a thread.
const tone = (name: string) => [...name].reduce((sum, char) => sum + (char.codePointAt(0) || 0), 0) % 4;

export function Avatar({ name, url, size = 'md' }: { name: string; url?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  return <span className={`forum-avatar is-${size} t${tone(name)}`}>{url ? <img src={url} alt={`${name}的头像`} decoding="async"/> : <span aria-hidden="true">{name.slice(0, 1)}</span>}</span>;
}

export function AvatarEditor({ name, url, disabled, onBusy, onSaved, onError, onExpired }: {
  name: string; url?: string | null; disabled: boolean; onBusy: (busy: boolean) => void; onSaved: () => Promise<void>; onError: (message: string) => void; onExpired: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || disabled || saving.current) return;
    if (!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(file.type)) return onError('头像支持 JPG、PNG、WebP、GIF 和 AVIF 图片。');
    if (!file.size || file.size > 50 * 1024 * 1024) return onError('头像图片不能为空，最大 50 MB。');
    saving.current = true; onBusy(true); onError(''); setProgress(0);
    const controller = new AbortController(); pending.current = controller;
    try {
      const upload = await prepareAvatar(file, { signal: controller.signal });
      const { status, data } = await sendFileRequest('/api/forum/avatar', upload, controller.signal, loaded => setProgress(Math.min(100, Math.floor(loaded / upload.size * 100))));
      if (status === 401) onExpired();
      if (status !== 200) throw new Error(typeof data.error === 'string' ? data.error : '头像上传失败。');
      await onSaved();
    } catch (error) { onError(error instanceof Error ? error.message : '头像上传失败。'); }
    finally { saving.current = false; pending.current = null; setProgress(null); onBusy(false); }
  }
  async function remove() {
    if (disabled || saving.current) return;
    saving.current = true; onBusy(true); onError('');
    try {
      const response = await forumMutation('/api/forum/avatar', { method: 'DELETE' }, onExpired);
      if (!response.ok) throw new Error(((await response.json()) as { error?: string }).error || '移除失败，请重试。');
      await onSaved();
    } catch (error) { onError(error instanceof Error ? error.message : '移除失败。'); }
    finally { saving.current = false; onBusy(false); }
  }
  return <div className="forum-avatar-editor">
    <input ref={picker} hidden type="file" disabled={disabled} accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={choose}/>
    <button type="button" className="forum-avatar-editor__photo" disabled={disabled} onClick={() => picker.current?.click()} aria-label={url ? '更换头像' : '上传头像'}>
      <Avatar name={name} url={url} size="lg"/>
      <span className="forum-avatar-editor__cam" aria-hidden="true"><Camera size={14}/></span>
      {progress !== null && <span className="forum-avatar-editor__ring" style={{ '--p': progress } as React.CSSProperties} aria-hidden="true"/>}
    </button>
    <div className="forum-avatar-editor__actions">
      {progress !== null
        ? <span role="status">{progress === 100 ? '正在处理头像…' : `上传中 ${progress}%`}<button type="button" onClick={() => pending.current?.abort()}>取消</button></span>
        : <>
          <button type="button" disabled={disabled} onClick={() => picker.current?.click()}><Camera size={13}/>{url ? '更换头像' : '上传头像'}</button>
          {url && <button type="button" disabled={disabled} onClick={() => void remove()}><RotateCcw size={13}/>恢复默认</button>}
        </>}
    </div>
  </div>;
}
