/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation keeps each area's stylesheets isolated (CLAUDE.md rule 10). */
import type { ReactNode } from 'react';
import { STYLE_VERSION } from '@/lib/redesign/style-version';

// Same markup and class names as the /mail header in app/mail/markup.ts, so
// public/redesign/site.css and interactions.js apply without changes.
export const WEBMAIL_URL = 'https://mail.team-gene.com/';

export function Icon({ d, className = '' }: { d: string; className?: string }) {
  return <svg className={`icon${className ? ' ' + className : ''}`} viewBox="0 0 24 24" aria-hidden="true"><path d={d}/></svg>;
}

export const ICONS = {
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm18 3-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7',
  message: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  arrowRight: 'M5 12h14m-7-7 7 7-7 7',
  arrowUpRight: 'M7 7h10v10M7 17 17 7',
  arrowUp: 'm5 12 7-7 7 7M12 19V5',
  arrowLeft: 'M19 12H5m7 7-7-7 7-7',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
};

type NavItem = { href: string; label: string; current?: boolean };

export function SiteHeader({ nav, actions }: { nav: NavItem[]; actions?: ReactNode }) {
  return <>
    <a className="skip-link" href="#main">跳到正文</a>
    <header className="site-header">
      <div className="wrap site-header__inner">
        <a className="brand" href="/" aria-label="Team Gene 团队主页">
          <svg className="brand__mark" viewBox="0 0 40 40" aria-hidden="true">
            <circle className="ring" cx="20" cy="20" r="18.5" fill="none" strokeWidth="1"/>
            <g transform="rotate(-28 20 20)"><ellipse className="orbit" cx="20" cy="20" rx="19.5" ry="6.5" fill="none" strokeWidth="1"/></g>
            <text x="20" y="27.6" textAnchor="middle" fontSize="22">G</text>
          </svg>
          <span className="brand__text"><span className="brand__name">TEAM GENE</span><span className="brand__sub">CS &amp; AI RESEARCH GROUP</span></span>
        </a>
        {nav.length > 0 && <nav className="nav" aria-label="主导航">
          <span className="nav__pill" aria-hidden="true"/>
          <ul className="nav__list">{nav.map(item => <li key={item.href}><a className="nav__link" href={item.href} aria-current={item.current ? 'page' : undefined}>{item.label}</a></li>)}</ul>
        </nav>}
        <div className="header-actions">
          {actions}
          <button className="icon-btn theme-toggle" type="button" data-theme-toggle aria-label="切换深浅色主题"><Icon className="i-sun" d={ICONS.sun}/><Icon className="i-moon" d={ICONS.moon}/></button>
          {nav.length > 0 && <button className="icon-btn menu-toggle" type="button" aria-controls="menu" aria-expanded="false" aria-label="打开菜单"><span/><span/></button>}
        </div>
      </div>
    </header>
    {nav.length > 0 && <div className="menu" id="menu">
      <nav aria-label="站点菜单">
        <ol className="menu__list">{nav.map((item, i) => <li key={item.href}><a className="menu__link" style={{ '--i': i } as React.CSSProperties} href={item.href} aria-current={item.current ? 'page' : undefined}><span className="menu__num">{String(i + 1).padStart(2, '0')}</span><span className="menu__label">{item.label}</span></a></li>)}</ol>
      </nav>
      <div className="menu__foot">
        <a className="btn btn--ghost-light btn--sm" href={WEBMAIL_URL}><Icon d={ICONS.mail}/>网页版邮箱</a>
      </div>
    </div>}
  </>;
}

export function SiteFooter({ links }: { links: { href: string; label: string }[] }) {
  return <footer className="site-footer">
    <div className="wrap">
      <div className="footer-top">
        <div>
          <p className="footer-tagline">思想相遇，<br/><em>智能生长。</em></p>
          <p className="footer-note">Team Gene 是专注于计算机科学与人工智能的科研团队，在开放的交流与扎实的探索中，把想法变成新的可能。</p>
        </div>
        <div className="footer-cols"><div className="footer-col"><h2>邮箱与论坛</h2><ul>{links.map(link => <li key={link.href}><a href={link.href}>{link.label}</a></li>)}</ul></div></div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Team Gene · 计算机科学与人工智能</span>
        <nav aria-label="页脚"><button type="button" className="to-top" data-top>回到顶部 <Icon d={ICONS.arrowUp}/></button></nav>
      </div>
    </div>
    <div className="footer-wordmark" aria-hidden="true">Team Gene</div>
  </footer>;
}

// Stylesheets hoisted into <head> by React 19 (precedence) so the page never paints unstyled.
export function RedesignStyles({ extra }: { extra: string[] }) {
  return <>
    <link rel="stylesheet" href={`/redesign/fonts.css?v=${STYLE_VERSION}`} precedence="default"/>
    <link rel="stylesheet" href={`/redesign/site.css?v=${STYLE_VERSION}`} precedence="default"/>
    {extra.map(href => <link key={href} rel="stylesheet" href={`${href}?v=${STYLE_VERSION}`} precedence="default"/>)}
  </>;
}
