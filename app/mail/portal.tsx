'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, AtSign, Mail, ShieldCheck } from 'lucide-react';
import { DEFAULT_MAILBOX_QUOTA_MB } from '@/lib/mail-quota';

export default function MailPortal() {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');

  async function signup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setCreated('');
    try {
      const response = await fetch('/api/mail/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, displayName, password, confirmation, website: '' }),
      });
      const data = await response.json() as { success?: boolean; emailAddress?: string; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || '申领失败，请稍后重试。');
      setCreated(data.emailAddress || `${username}@team-gene.com`);
      setPassword(''); setConfirmation(''); setDisplayName('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '申领失败，请稍后重试。');
    } finally { setBusy(false); }
  }

  return <main className="site mail-site">
    <header className="masthead"><Link href="/" className="brand"><span className="brand-mark">G</span><span>TEAM GENE<small>COMPUTER SCIENCE & ARTIFICIAL INTELLIGENCE</small></span></Link><Link href="/" className="mail-back"><ArrowLeft size={16}/>返回首页</Link></header>
    <section className="mail-hero"><span className="eyebrow"><span/> TEAM GENE · MAIL & FORUM</span><h1>邮箱与论坛</h1><p>申领 <strong>@team-gene.com</strong> 邮箱并设置论坛昵称，邮箱开通后即可进入团队论坛。</p><div className="mail-pills"><span><ShieldCheck size={15}/>邮箱即时开通</span><span><AtSign size={15}/>邮箱与论坛同一账户</span></div></section>
    <section className="mail-content">
      <div className="mail-login-card"><div className="mail-icon"><Mail size={22}/></div><div><span className="eyebrow clay">TEAM GENE COMMUNITY</span><h2>邮箱与论坛</h2><p>已有邮箱？用邮箱账号验证身份，再设置昵称注册论坛或直接登录。</p></div><a className="primary mail-login" href="/forum">进入团队论坛 <ArrowUpRight size={17}/></a><a className="mail-secondary-link" href="https://mail.team-gene.com/" target="_blank" rel="noreferrer">打开网页版邮箱</a></div>
      <div className="mail-form-card"><span className="eyebrow clay">CREATE YOUR ACCOUNT</span><h2>申领邮箱并加入论坛</h2><p className="mail-help">填写昵称和邮箱账号，开通后论坛身份自动创建。邮箱默认容量 {DEFAULT_MAILBOX_QUOTA_MB} MB，可由管理员单独调整。同一网络每天最多申领 2 个邮箱。</p>
        {created ? <div className="mail-success" role="status"><strong>邮箱与论坛账号已开通</strong><span>{created}</span><a href="/forum">进入论坛，发布第一条动态 <ArrowUpRight size={16}/></a><a href="https://mail.team-gene.com/" target="_blank" rel="noreferrer">打开网页版邮箱 <ArrowUpRight size={16}/></a><button type="button" className="mail-another" onClick={()=>{setCreated('');setUsername('')}}>再申领一个邮箱</button></div> : <form onSubmit={signup}>
          <label>论坛昵称<input autoComplete="nickname" value={displayName} onChange={event=>setDisplayName(event.target.value)} minLength={1} maxLength={40} placeholder="例如：小 Gene" required/></label>
          <label>邮箱账号<div className="mail-username"><input autoComplete="username" value={username} onChange={event=>setUsername(event.target.value)} minLength={1} maxLength={32} pattern="(?:[a-z0-9]|[a-z0-9][a-z0-9._-]{0,30}[a-z0-9])" placeholder="例如：gene.research" required/><span>@team-gene.com</span></div></label>
          <small className="mail-field-hint">使用 1–32 位小写字母、数字、点、下划线或连字符（不能以标点开头或结尾）。</small>
          <label>设置密码<input type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} minLength={12} maxLength={128} placeholder="至少 12 位" required/></label>
          <label>确认密码<input type="password" autoComplete="new-password" value={confirmation} onChange={event=>setConfirmation(event.target.value)} minLength={12} maxLength={128} placeholder="再次输入邮箱密码" required/></label>
          {error&&<p className="mail-error" role="alert">{error}</p>}
          <button className="primary mail-submit" disabled={busy}>{busy?'正在开通…':'申领并立即开通'} <ArrowUpRight size={17}/></button>
          <p className="mail-privacy">密码仅用于邮箱登录，请勿与其他网站共用。</p>
        </form>}
      </div>
    </section>
    <footer><span className="footer-brand">TEAM GENE <small>思想相遇，智能生长。</small></span><div><span>© 2026 Team Gene</span><a href="/admin">管理后台</a></div></footer>
  </main>;
}
