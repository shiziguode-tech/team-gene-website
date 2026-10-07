'use client';
// Shown when a page fails to render, for example while the database is briefly
// unavailable. The failed page never linked its stylesheets, so link the public
// design system here; Next replaces the message with a digest in production.
import { useEffect } from 'react';
import { STYLE_VERSION } from '@/lib/redesign/style-version';

export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <div className="redesign-root" data-page="error">
    <link rel="stylesheet" href={`/redesign/fonts.css?v=${STYLE_VERSION}`} precedence="default"/>
    <link rel="stylesheet" href={`/redesign/site.css?v=${STYLE_VERSION}`} precedence="default"/>
    <main id="main" className="section">
      <div className="wrap empty" role="alert">
        <p className="eyebrow eyebrow--plain">Error</p>
        <h1 style={{ fontSize: 'var(--fs-2xl)' }}>页面暂时无法打开</h1>
        <p>请稍后重试。如果问题持续出现，请联系团队管理员{error.digest ? `，并告知错误编号 ${error.digest}` : ''}。</p>
        <div className="chip-row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn--forest" onClick={() => retry()}>重新加载</button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full navigation, like the rest of the site */}
          <a className="btn btn--ghost" href="/">回到首页</a>
        </div>
      </div>
    </main>
  </div>;
}
