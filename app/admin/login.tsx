'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, FileText, HardDrive, KeyRound, Lock, Trash2 } from 'lucide-react';

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  // Focus the password for mouse and keyboard users; on touch screens that
  // would open the keyboard over half the page before anyone asked for it.
  useEffect(() => { if (!matchMedia('(pointer: coarse)').matches) field.current?.focus(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || '验证失败，请重试。');
      window.location.assign('/admin');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '验证失败，请重试。');
      setBusy(false);
    }
  }

  return <main id="main" className="admin-main admin-login">
    <div className="page-hero__ghost" aria-hidden="true">Admin</div>
    <div className="wrap admin-login__grid">
      <div className="admin-login__intro">
        <p className="eyebrow">Team Gene <span className="sep">/</span> Administration</p>
        <h1>团队后台管理</h1>
        <p className="page-hero__lede">输入团队管理密码，进入后台管理网站内容、邮箱账户和容量。</p>
        <ul className="admin-login__list">
          <li><FileText size={18}/><span><strong>网站内容</strong>七个栏目的新增、编辑、图片与视频</span></li>
          <li><HardDrive size={18}/><span><strong>调整容量</strong>为每个邮箱单独设置上限</span></li>
          <li><KeyRound size={18}/><span><strong>重置密码</strong>旧密码与论坛会话同时失效</span></li>
          <li><Trash2 size={18}/><span><strong>移除账户</strong>保留论坛历史内容，隔离旧身份</span></li>
        </ul>
      </div>
      <form className="card form admin-login__card" onSubmit={submit}>
        <span className="admin-login__icon" aria-hidden="true"><Lock size={22}/></span>
        <div>
          <h2>管理员验证</h2>
          <p>验证通过后 30 天内无需重复登录。</p>
        </div>
        <div className="field">
          <label htmlFor="admin-password">管理密码</label>
          <div className="control">
            <span className="control__icon" aria-hidden="true"><KeyRound size={16}/></span>
            <input id="admin-password" type={showPassword ? 'text' : 'password'} value={password} autoComplete="current-password" required maxLength={256} onChange={event => setPassword(event.target.value)} ref={field}/>
            <button type="button" className="control__btn" aria-pressed={showPassword} aria-label={showPassword ? '隐藏密码' : '显示密码'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
          </div>
        </div>
        {error && <p className="admin-alert" role="alert">{error}</p>}
        <button className="btn btn--forest btn--block" disabled={busy}>{busy ? '正在验证…' : '进入后台'}<ArrowRight size={16} className="icon--right"/></button>
      </form>
    </div>
  </main>;
}
