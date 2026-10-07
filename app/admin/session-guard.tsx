'use client';

import {createContext,useContext,useEffect,useState,type ReactNode,type FormEvent} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {createAdminSessionClient,createLoginWaiter} from '@/lib/admin-session-client';

const SessionContext = createContext<ReturnType<typeof createAdminSessionClient> | null>(null);
export function useAdminSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('Admin session guard is missing.');
  return session;
}

export default function AdminSessionGuard({children}:{children:ReactNode}) {
  const [status,setStatus] = useState<'checking'|'ready'|'expired'|'error'>('checking');
  const [password,setPassword] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [pending] = useState(createLoginWaiter);
  const [client] = useState(() => createAdminSessionClient({
    onStatus(authenticated) {
      setStatus(authenticated?'ready':'expired');
      if (authenticated) pending.resolve();
    },
    requireLogin() {
      setStatus('expired');
      return pending.wait();
    },
  }));

  useEffect(() => {
    let active = true;
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      void client.check().catch(reason => {
        if (active) {setStatus('error');setError(reason instanceof Error?reason.message:'无法验证登录状态，请重试。');}
      });
    };
    check();
    const timer = window.setInterval(check,60000);
    window.addEventListener('focus',check);
    window.addEventListener('pageshow',check);
    document.addEventListener('visibilitychange',check);
    return () => {
      active=false;window.clearInterval(timer);
      window.removeEventListener('focus',check);window.removeEventListener('pageshow',check);
      document.removeEventListener('visibilitychange',check);
      pending.cancel();
    };
  },[client,pending]);

  async function login(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError('');
    try {
      const response = await fetch('/api/admin/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password}),credentials:'same-origin',cache:'no-store'});
      const data = await response.json() as {authenticated?:boolean;error?:string};
      if (!response.ok || !data.authenticated) throw new Error(data.error||'验证失败，请重试。');
      client.verified();setPassword('');
      pending.resolve();
    } catch(reason) {setError(reason instanceof Error?reason.message:'验证失败，请重试。');}
    finally {setBusy(false);}
  }
  async function retry() {
    setBusy(true);setError('');
    try {await client.check();} catch(reason) {setError(reason instanceof Error?reason.message:'无法验证登录状态。');}
    finally {setBusy(false);}
  }
  const title = status==='expired'?'登录已过期，请重新验证':status!=='error'?'正在验证登录状态':'暂时无法验证登录状态';
  return <SessionContext.Provider value={client}>{children}<Dialog open={status!=='ready'}><DialogContent className="admin-session-dialog" overlayClassName="admin-session-overlay" showCloseButton={false} onEscapeKeyDown={event=>event.preventDefault()} onInteractOutside={event=>event.preventDefault()}>
    <span className={`admin-session-dialog__icon${status==='checking'?' is-checking':''}`} aria-hidden="true"/>
    <DialogTitle>{title}</DialogTitle>
    <DialogDescription>{status==='expired'?'当前填写的内容和已选文件仍然保留。输入管理密码后，继续刚才的操作。':'正在确认当前后台登录是否有效，表单内容会保留在当前页面。'}</DialogDescription>
    {status==='expired'&&<form className="form" onSubmit={login}>
      <div className="field"><label htmlFor="admin-reauth-password">管理密码</label><div className="control"><input id="admin-reauth-password" type="password" autoComplete="current-password" autoFocus required maxLength={256} value={password} onChange={event=>setPassword(event.target.value)}/></div></div>
      {error&&<p className="admin-alert" role="alert">{error}</p>}
      <button className="btn btn--forest btn--block" disabled={busy}>{busy?'正在验证…':'验证并继续'}</button>
    </form>}
    {status==='error'&&<><p className="admin-alert" role="alert">{error}</p><button className="btn btn--forest btn--block" disabled={busy} onClick={()=>void retry()}>重新检查</button></>}
  </DialogContent></Dialog></SessionContext.Provider>;
}
