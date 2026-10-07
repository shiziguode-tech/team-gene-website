/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation keeps each area's stylesheets isolated (CLAUDE.md rule 10). */
import { Icon, ICONS, RedesignStyles, SiteHeader } from '@/components/redesign/chrome';
import RedesignEffects from '../redesign-effects';


export default function AdminChrome({children, home = false}:{children:React.ReactNode; home?:boolean}) {
  return <div className="redesign-root" data-page="admin">
    <RedesignStyles extra={['/redesign/admin.css']}/>
    <SiteHeader nav={[]} actions={<>
      <span className="chip chip--line admin-badge">ADMIN</span>
      <a className="btn btn--ghost btn--sm admin-back" href={home ? "/" : "/admin"} aria-label={home ? "返回团队主页" : "返回网站管理"}><Icon d={ICONS.arrowLeft}/><span>{home ? "返回团队主页" : "返回网站管理"}</span></a>
    </>}/>
    {children}
    <footer className="admin-foot"><div className="wrap"><span>© 2026 Team Gene · 后台管理</span><span>仅限团队管理员使用</span></div></footer>
    <RedesignEffects contentKey="mail-admin"/>
  </div>;
}
