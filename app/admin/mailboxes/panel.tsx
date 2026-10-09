'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {Dialog as Modal} from 'radix-ui';
import {useAdminSession} from '../session-guard';
import { AlertTriangle, Eye, EyeOff, HardDrive, KeyRound, Mail, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { BYTES_PER_MB, DEFAULT_MAILBOX_QUOTA_MB, quotaBytesFromMB } from '@/lib/mail-quota';

type Mailbox = { id: string; address: string; createdAt: string | null; usedBytes: number; quotaBytes: number | null };
type SortKey = 'default' | 'newest' | 'used' | 'ratio' | 'address';
const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(0, Math.round(bytes / 1024))} KB` : bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const formatQuota = (bytes: number | null) => bytes ? `${Number((bytes / BYTES_PER_MB).toFixed(2))} MB` : '未设个人上限';
const usage = (box: Pick<Mailbox, 'usedBytes' | 'quotaBytes'>) => box.quotaBytes ? Math.min(1, box.usedBytes / box.quotaBytes) : null;
const level = (ratio: number | null) => ratio === null ? 'none' : ratio >= .9 ? 'high' : ratio >= .7 ? 'mid' : 'low';
const tone = (text: string) => [...text].reduce((sum, char) => sum + (char.codePointAt(0) || 0), 0) % 4;
const SORTS: [SortKey, string][] = [['default', '默认顺序'], ['newest', '最新开通'], ['used', '已用空间'], ['ratio', '使用率'], ['address', '邮箱地址']];

async function readMailboxes(request: (url: string, init?: RequestInit) => Promise<Response>) {
  const response = await request('/api/admin/mailboxes', { cache: 'no-store' });
  const data = await response.json() as { mailboxes?: Mailbox[]; error?: string };
  if (!response.ok) throw new Error(data.error || '邮箱账户暂时无法加载。');
  return data.mailboxes || [];
}

export default function AdminMailboxes() {
  const session = useAdminSession();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguishes "no accounts" from "the list could not be read".
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving=useRef(false);
  const modalTrigger=useRef<HTMLButtonElement|null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetTarget, setResetTarget] = useState<Mailbox | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Mailbox | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [quotaTarget, setQuotaTarget] = useState<Mailbox | null>(null);
  const [quotaMB, setQuotaMB] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('default');

  const load = useCallback(async () => {
    try {
      setMailboxes(await readMailboxes(session.request)); setError(''); setLoadFailed(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '邮箱账户暂时无法加载。'); setLoadFailed(true); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => {
    let active = true;
    void readMailboxes(session.request).then(items => {
      if (active) { setMailboxes(items); setLoadFailed(false); }
    }).catch(reason => {
      if (active) { setError(reason instanceof Error ? reason.message : '邮箱账户暂时无法加载。'); setLoadFailed(true); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session]);

  const closeModals = useCallback(() => { setQuotaTarget(null); setResetTarget(null); setDeleteTarget(null); }, []);
  function restoreModalFocus(event:Event) {
    event.preventDefault();
    const trigger=modalTrigger.current;
    if(trigger?.isConnected&&!trigger.disabled)trigger.focus();
    else document.getElementById('admin-q')?.focus();
  }

  async function resetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!resetTarget||saving.current) return;
    saving.current=true;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await session.request('/api/admin/mailboxes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: resetTarget.id, password: newPassword }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || '密码重置失败。');
      setNotice(`${resetTarget.address} 的密码已重置；原有邮箱客户端密码已失效。`); setResetTarget(null); setNewPassword('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '密码重置失败。'); }
    finally { saving.current=false;setBusy(false); }
  }

  async function removeMailbox() {
    if (!deleteTarget||saving.current) return;
    saving.current=true;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await session.request('/api/admin/mailboxes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || '删除失败。');
      setNotice(`${deleteTarget.address} 已删除，该邮箱中的邮件和设置一并清除。`); setDeleteTarget(null);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '删除失败。'); }
    finally { saving.current=false;setBusy(false); }
  }

  async function saveQuota(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!quotaTarget||saving.current) return;
    const bytes = quotaBytesFromMB(Number(quotaMB));
    if (bytes === null) { setError('请输入至少 1 MB 的整数容量。'); return; }
    if (bytes < quotaTarget.usedBytes) { setError('容量不能低于邮箱当前已用空间。'); return; }
    saving.current=true;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await session.request('/api/admin/mailboxes', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: quotaTarget.id, quotaMB: Number(quotaMB) }),
      });
      const data = await response.json() as { error?: string; quotaBytes: number; usedBytes: number };
      if (!response.ok) throw new Error(data.error || '容量修改失败。');
      setMailboxes(items => items.map(item => item.id === quotaTarget.id ? { ...item, quotaBytes: data.quotaBytes, usedBytes: data.usedBytes } : item));
      setNotice(`${quotaTarget.address} 的容量已调整为 ${formatQuota(data.quotaBytes)}。`);
      setQuotaTarget(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '容量修改失败。'); }
    finally { saving.current=false;setBusy(false); }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = mailboxes.filter(box => !needle || box.address.toLowerCase().includes(needle));
    const by: Record<SortKey, ((a: Mailbox, b: Mailbox) => number) | null> = {
      default: null,
      newest: (a, b) => (b.createdAt ? Date.parse(b.createdAt) : 0) - (a.createdAt ? Date.parse(a.createdAt) : 0),
      used: (a, b) => b.usedBytes - a.usedBytes,
      ratio: (a, b) => (usage(b) ?? -1) - (usage(a) ?? -1),
      address: (a, b) => a.address.localeCompare(b.address),
    };
    return by[sort] ? [...list].sort(by[sort]!) : list;
  }, [mailboxes, query, sort]);
  const totalUsed = mailboxes.reduce((sum, box) => sum + box.usedBytes, 0);
  const nearLimit = mailboxes.filter(box => (usage(box) ?? 0) >= .8).length;
  const unknown = loading || (loadFailed && !mailboxes.length);
  const quotaPreview = quotaTarget ? quotaBytesFromMB(Number(quotaMB)) : null;
  const previewRatio = quotaTarget && quotaPreview ? Math.min(1, quotaTarget.usedBytes / quotaPreview) : null;

  return <main id="main" className="admin-main">
    <header className="page-hero admin-hero">
      <div className="page-hero__ghost" aria-hidden="true">Mailboxes</div>
      <div className="wrap page-hero__grid">
        <div>
          <p className="eyebrow">Team Gene <span className="sep">/</span> Mail Administration</p>
          <h1>邮箱账户</h1>
          <p className="page-hero__lede">新邮箱默认容量 {DEFAULT_MAILBOX_QUOTA_MB} MB。可为每个账户单独调整容量、重置密码或移除账户。</p>
        </div>
      </div>
    </header>

    <section className="section admin-section">
      <div className="wrap">
        <div className="admin-stats" aria-label="账户概况">
          <div className="card admin-stat"><span>邮箱账户</span><strong>{unknown ? '—' : mailboxes.length}</strong><small>个已开通</small></div>
          <div className="card admin-stat"><span>已用空间合计</span><strong>{unknown ? '—' : formatBytes(totalUsed)}</strong><small>全部邮箱</small></div>
          <div className={`card admin-stat${nearLimit ? ' is-warn' : ''}`}><span>接近上限</span><strong>{unknown ? '—' : nearLimit}</strong><small>使用率 ≥ 80%</small></div>
        </div>

        <div className="admin-toolbar">
          <div className="admin-search">
            <label className="sr-only" htmlFor="admin-q">搜索邮箱地址</label>
            <Search size={17}/>
            <input id="admin-q" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索邮箱地址" autoComplete="off"/>
          </div>
          <label className="admin-sort"><span>排序</span>
            <select value={sort} onChange={event => setSort(event.target.value as SortKey)}>{SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          </label>
          <span className="admin-count">{query ? `${visible.length} / ${mailboxes.length}` : mailboxes.length} 个账户</span>
          <button className="btn btn--ghost btn--sm" type="button" disabled={loading||busy} onClick={()=>{setLoading(true);setError('');void load()}}><RefreshCw size={15} className={loading ? 'is-spinning' : ''}/>刷新</button>
        </div>

        {notice&&<p className="admin-notice" role="status">{notice}</p>}{error&&!(loadFailed&&mailboxes.length===0)&&<p className="admin-alert" role="alert">{error}</p>}

        {loading ? <ul className="admin-list" aria-busy="true" aria-label="正在读取邮箱账户">{[0, 1, 2, 3].map(i => <li className="admin-row is-skeleton" key={i}><span/><span/><span/></li>)}</ul>
          : loadFailed && mailboxes.length === 0 ? <div className="card admin-empty" role="alert"><RefreshCw size={28}/><h3>暂时无法读取邮箱账户</h3><p>{error||'邮箱服务暂时无法响应。'}邮件服务可用后，点击“刷新”重新读取。</p></div>
          : mailboxes.length === 0 ? <div className="card admin-empty"><Mail size={28}/><h3>目前还没有已注册的邮箱账户</h3><p>成员在邮箱入口申领后会显示在这里。</p></div>
          : visible.length === 0 ? <div className="card admin-empty"><Search size={28}/><h3>没有匹配的邮箱</h3><p>换个关键词试试。</p><button type="button" className="btn btn--ghost btn--sm" onClick={() => setQuery('')}>清除搜索</button></div>
          : <ul className="admin-list">{visible.map(box => {
            const ratio = usage(box);
            return <li className="admin-row" key={box.id}>
              <span className={`admin-row__avatar t${tone(box.address)}`} aria-hidden="true">{box.address.slice(0, 1).toUpperCase()}</span>
              <div className="admin-row__main">
                <strong>{box.address}</strong>
                <span>{box.createdAt ? `开通于 ${new Date(box.createdAt).toLocaleDateString('zh-CN')}` : '日期未知'}</span>
              </div>
              <div className="admin-row__usage" data-level={level(ratio)}>
                <div className="admin-row__numbers"><span>{formatBytes(box.usedBytes)}</span><small>/ {formatQuota(box.quotaBytes)}</small>{ratio !== null && <em>{Math.round(ratio * 100)}%</em>}</div>
                {!!box.quotaBytes && <progress max={box.quotaBytes} value={Math.min(box.usedBytes, box.quotaBytes)} aria-label={`${box.address} 已用存储空间`}/>}
              </div>
              <div className="admin-row__actions">
                <button type="button" disabled={busy} onClick={event=>{modalTrigger.current=event.currentTarget;setError('');setQuotaMB(String(box.quotaBytes?Math.ceil(box.quotaBytes/BYTES_PER_MB):DEFAULT_MAILBOX_QUOTA_MB));setQuotaTarget(box)}}><HardDrive size={15}/><span>调整容量</span></button>
                <button type="button" disabled={busy} onClick={event=>{modalTrigger.current=event.currentTarget;setError('');setNewPassword('');setShowNewPassword(false);setResetTarget(box)}}><KeyRound size={15}/><span>重置密码</span></button>
                <button type="button" className="is-danger" disabled={busy} onClick={event=>{modalTrigger.current=event.currentTarget;setError('');setDeleteTarget(box)}}><Trash2 size={15}/><span>删除</span></button>
              </div>
            </li>;
          })}</ul>}
      </div>
    </section>

    {quotaTarget&&<Modal.Root open onOpenChange={open=>{if(!open&&!busy)closeModals();}}><Modal.Portal><Modal.Overlay className="admin-modal-backdrop">
      <Modal.Content className="card admin-modal" aria-describedby={undefined} onCloseAutoFocus={restoreModalFocus} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}>
        <button className="admin-modal__close" type="button" aria-label="关闭" disabled={busy} onClick={()=>setQuotaTarget(null)}><X size={18}/></button>
        <p className="eyebrow">Mailbox storage</p>
        <Modal.Title asChild><h2>调整邮箱容量</h2></Modal.Title>
        <p className="admin-modal__target">{quotaTarget.address}</p>
        <form className="form" onSubmit={saveQuota}>
          <div className="field">
            <label htmlFor="quota-mb">容量上限</label>
            <div className="control"><input id="quota-mb" type="number" inputMode="numeric" autoFocus disabled={busy} min={Math.max(1,Math.ceil(quotaTarget.usedBytes/BYTES_PER_MB))} step="1" required value={quotaMB} onChange={event=>setQuotaMB(event.target.value)}/><span className="control__addon">MB</span></div>
            <p className="field__hint">输入整数，最低 1 MB，且不能低于已用空间。保存后立即应用到邮箱服务，已有邮件会保留。</p>
          </div>
          <div className="admin-quota-preview" data-level={level(previewRatio)}>
            <div><span>已用 {formatBytes(quotaTarget.usedBytes)}</span><span>当前上限 {formatQuota(quotaTarget.quotaBytes)}</span></div>
            <div className="admin-quota-preview__bar"><span style={{ width: `${Math.max(2, (previewRatio ?? 0) * 100)}%` }}/></div>
            <small>{previewRatio === null ? '请输入有效容量' : quotaPreview! < quotaTarget.usedBytes ? '新容量低于已用空间，无法保存' : `保存后使用率约 ${Math.round(previewRatio * 100)}%`}</small>
          </div>
          {error&&<p className="admin-alert" role="alert">{error}</p>}
          <div className="admin-modal__actions"><button type="button" className="btn btn--ghost" disabled={busy} onClick={()=>setQuotaTarget(null)}>取消</button><button className="btn btn--forest" disabled={busy}>{busy?'正在保存…':'保存容量'}</button></div>
        </form>
      </Modal.Content>
    </Modal.Overlay></Modal.Portal></Modal.Root>}

    {(resetTarget||deleteTarget)&&<Modal.Root open onOpenChange={open=>{if(!open&&!busy)closeModals();}}><Modal.Portal><Modal.Overlay className="admin-modal-backdrop">
      <Modal.Content className={`card admin-modal${deleteTarget ? ' is-danger' : ''}`} aria-describedby={undefined} onCloseAutoFocus={restoreModalFocus} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}>
        <button className="admin-modal__close" type="button" aria-label="关闭" disabled={busy} onClick={()=>{setResetTarget(null);setDeleteTarget(null)}}><X size={18}/></button>
        {resetTarget?<>
          <p className="eyebrow">Password reset</p>
          <Modal.Title asChild><h2>重置邮箱密码</h2></Modal.Title>
          <p className="admin-modal__target">{resetTarget.address}</p>
          <form className="form" onSubmit={resetPassword}>
            <div className="field">
              <label htmlFor="reset-password">新密码</label>
              <div className="control"><input id="reset-password" type={showNewPassword?'text':'password'} autoComplete="new-password" autoFocus disabled={busy} minLength={12} maxLength={128} required value={newPassword} onChange={event=>setNewPassword(event.target.value)} placeholder="至少 12 位"/>
                <button type="button" className="control__btn" aria-pressed={showNewPassword} aria-label={showNewPassword?'隐藏密码':'显示密码'} onClick={()=>setShowNewPassword(value=>!value)}>{showNewPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
              <p className="field__hint">重置后，原密码和已保存的邮箱客户端密码将失效。</p>
            </div>
            {error&&<p className="admin-alert" role="alert">{error}</p>}
            <div className="admin-modal__actions"><button className="btn btn--ghost" type="button" disabled={busy} onClick={()=>setResetTarget(null)}>取消</button><button className="btn btn--forest" disabled={busy}>{busy?'正在重置…':'确认重置'}</button></div>
          </form>
        </>:<>
          <span className="admin-modal__warn" aria-hidden="true"><AlertTriangle size={22}/></span>
          <p className="eyebrow">Delete mailbox</p>
          <Modal.Title asChild><h2>删除这个邮箱？</h2></Modal.Title>
          <p className="admin-modal__text">将永久删除 <strong>{deleteTarget?.address}</strong> 的邮箱账户、已有邮件和相关设置，此操作无法撤销。</p>
          {error&&<p className="admin-alert" role="alert">{error}</p>}
          <div className="admin-modal__actions"><button className="btn btn--ghost" disabled={busy} onClick={()=>setDeleteTarget(null)}>保留账户</button><button className="btn btn--danger" disabled={busy} onClick={()=>void removeMailbox()}>{busy?'正在删除…':'确认永久删除'}</button></div>
        </>}
      </Modal.Content>
    </Modal.Overlay></Modal.Portal></Modal.Root>}
  </main>;
}
