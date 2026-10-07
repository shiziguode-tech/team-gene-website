import Redesign from './redesign';
import { listContent } from '@/db/content';
import { pageMetadata, SITE_URL } from '@/lib/seo';
export const dynamic = 'force-dynamic';
// The root layout's title template does not apply to the root page itself, so name the brand here.
export const metadata = {...pageMetadata('计算机科学与人工智能科研团队', 'Team Gene 是专注于计算机科学与人工智能的科研团队，研究方向涵盖机器学习、大语言模型、计算机视觉与智能计算系统。了解团队成员、学术成果、校友与活动通知。', '/'), title: {absolute: 'Team Gene · 计算机科学与人工智能科研团队'}};
// The page opens on the dark forest hero.
export const viewport = {themeColor: '#0f2b24'};
export default async function Home(){return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@graph':[{'@type':'Organization','@id':`${SITE_URL}/#organization`,name:'Team Gene',url:SITE_URL,description:'计算机科学与人工智能科研团队'},{'@type':'WebSite','@id':`${SITE_URL}/#website`,name:'Team Gene',url:SITE_URL,inLanguage:'zh-CN',publisher:{'@id':`${SITE_URL}/#organization`}}]}).replace(/</g,'\\u003c')}}/><Redesign entries={await listContent()}/></>}
