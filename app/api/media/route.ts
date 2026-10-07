import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from '@/lib/upload-limits.js';
import {writeMediaStream,MediaUploadSizeError,deleteMedia} from '@/db/media';
import {cookies} from 'next/headers';
import {ADMIN_COOKIE,hasAdminSession} from '@/app/admin-session';
import {listContent} from '@/db/content';
import {entryMedia,type MediaAsset} from '@/lib/content';
import {adminAccessAllowed,expectedRequestOrigin} from '@/app/admin-access';
import {forumMediaReferenced} from '@/db/forum-feed';

export const dynamic='force-dynamic';
const types:Record<string,{type:'image'|'video';mime:string;extension:string;max:number}>={
  'image/jpeg':{type:'image',mime:'image/jpeg',extension:'jpg',max:IMAGE_MAX_BYTES},
  'image/png':{type:'image',mime:'image/png',extension:'png',max:IMAGE_MAX_BYTES},
  'image/webp':{type:'image',mime:'image/webp',extension:'webp',max:IMAGE_MAX_BYTES},
  'image/gif':{type:'image',mime:'image/gif',extension:'gif',max:IMAGE_MAX_BYTES},
  'image/avif':{type:'image',mime:'image/avif',extension:'avif',max:IMAGE_MAX_BYTES},
  'video/mp4':{type:'video',mime:'video/mp4',extension:'mp4',max:VIDEO_MAX_BYTES},
  'video/webm':{type:'video',mime:'video/webm',extension:'webm',max:VIDEO_MAX_BYTES},
};

function validOrigin(request:Request){return request.headers.get('origin')===expectedRequestOrigin(request)}
async function authorized(){return hasAdminSession((await cookies()).get(ADMIN_COOKIE)?.value)}

export async function POST(request:Request){
  if(!adminAccessAllowed(request))return Response.json({error:'无域名模式下，后台仅允许通过本机 SSH 隧道访问。'},{status:403});
  if(!await authorized())return Response.json({error:'请先输入管理密码。'},{status:401});
  if(!validOrigin(request))return Response.json({error:'请求来源无效。'},{status:403});
  const mime=request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()??'';
  const definition=types[mime];
  if(!definition)return Response.json({error:'支持 JPG、PNG、WebP、GIF、AVIF 图片，以及 MP4、WebM 视频。'},{status:415});
  const filenameHeader=request.headers.get('x-file-name')??'';
  let name:string;
  try{name=decodeURIComponent(filenameHeader)}catch{return Response.json({error:'文件名无效。'},{status:400})}
  name=name.replace(/[\\/\u0000-\u001f]/g,'_').trim().slice(0,240)||`上传文件.${definition.extension}`;
  const size=Number(request.headers.get('x-file-size')||request.headers.get('content-length')||0);
  if(!Number.isSafeInteger(size)||size<1||size>definition.max)return Response.json({error:definition.type==='image'?'图片大小不能超过 50 MB。':'视频大小不能超过 500 MB。'},{status:413});
  const length=Number(request.headers.get('content-length')||size);
  if(length!==size)return Response.json({error:'文件大小不匹配，请重新选择。'},{status:400});
  const key=`${crypto.randomUUID().toLowerCase()}.${definition.extension}`;
  try{
    await writeMediaStream(key,request.body,size);
    const asset:MediaAsset={key,name,type:definition.type,mime:definition.mime,size};
    return Response.json({asset},{headers:{'Cache-Control':'no-store'}});
  }catch(error){if(error instanceof MediaUploadSizeError)return Response.json({error:'文件上传大小不匹配，请重试。'},{status:400});console.error('Media upload failed',error);return Response.json({error:'文件上传失败，请稍后重试。'},{status:503})}
}

export async function DELETE(request:Request){
  if(!adminAccessAllowed(request))return Response.json({error:'无域名模式下，后台仅允许通过本机 SSH 隧道访问。'},{status:403});
  if(!await authorized())return Response.json({error:'请先输入管理密码。'},{status:401});
  if(!validOrigin(request))return Response.json({error:'请求来源无效。'},{status:403});
  const key=new URL(request.url).searchParams.get('key')??'';
  if(!/^[0-9a-f-]{36}\.(?:jpg|png|webp|gif|avif|mp4|webm)$/.test(key))return Response.json({error:'文件标识无效。'},{status:400});
  try{
    const used=(await listContent()).some(entry=>entryMedia(entry).some(asset=>asset.key===key));
    if(used||forumMediaReferenced(key))return Response.json({error:'此文件仍被网站或论坛内容引用，请先从内容中移除。'},{status:409});
    await deleteMedia(key);
    return Response.json({deleted:true});
  }catch(error){console.error('Media deletion failed',error);return Response.json({error:'文件删除失败，请稍后重试。'},{status:503})}
}
