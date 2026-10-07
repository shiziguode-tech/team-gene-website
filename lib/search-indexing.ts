import 'server-only';
import { SITE_URL } from './seo';

// Notify supporting search engines after a public content change. Failure must
// never change the result of the administrator's successful save.
export async function notifySearchEngines(paths: string[]) {
  const key=process.env.INDEXNOW_KEY;
  if(!key)return;
  if(!/^[a-zA-Z0-9-]{8,128}$/.test(key))throw new Error('Invalid IndexNow configuration');
  const urlList=[...new Set(paths)].map(path=>{
    const url=new URL(path,SITE_URL);
    if(url.origin!==SITE_URL||!/^\/(?:$|(?:members|alumni|research|awards|life|rules|news)(?:\/[^/]+)?$)/.test(url.pathname))throw new Error('Non-public indexing URL');
    return url.href;
  });
  const response=await fetch('https://api.indexnow.org/indexnow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:'team-gene.com',key,keyLocation:`${SITE_URL}/${key}.txt`,urlList}),signal:AbortSignal.timeout(10000)});
  if(![200,202].includes(response.status))throw new Error(`IndexNow HTTP ${response.status}`);
}
