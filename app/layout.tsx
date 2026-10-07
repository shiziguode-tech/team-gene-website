import type { Metadata, Viewport } from 'next';
import {pageMetadata} from '@/lib/seo';
const brand=pageMetadata('计算机科学与人工智能科研团队','以好奇心为起点，一起探索计算与智能的边界。Team Gene 科研团队。','/');
export const metadata:Metadata={metadataBase:new URL('https://team-gene.com'),title:{default:'Team Gene · 计算机科学与人工智能',template:'%s | Team Gene'},description:brand.description,openGraph:brand.openGraph,twitter:brand.twitter,icons:{icon:'/favicon.svg',apple:'/apple-touch-icon.png'}};
// Browser UI colour follows the page background; interactions.js updates it when the visitor picks a theme.
export const viewport:Viewport={themeColor:[{media:'(prefers-color-scheme: light)',color:'#f7f5ef'},{media:'(prefers-color-scheme: dark)',color:'#0c1512'}]};
const bootScript=`try{var d=document.documentElement,t=localStorage.getItem('tg-theme');if(t==='dark'||t==='light')d.dataset.theme=t;d.classList.add('js')}catch(e){}addEventListener('pagereveal',function(e){var v=e.viewTransition,n=function(){};if(v){v.ready.catch(n);v.finished.catch(n);v.updateCallbackDone.catch(n)}});`;
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:bootScript}}/></head><body>{children}</body></html>}
