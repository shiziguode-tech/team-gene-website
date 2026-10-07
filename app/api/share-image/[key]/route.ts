import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
import {listContent} from '@/db/content';
import {entryMedia} from '@/lib/content';
import {isPublicEntry} from '@/lib/content-links';
import {mediaFileInfo} from '@/db/media';
import {withImageProcessingSlot} from '@/lib/image-processing.js';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const pending=new Map<string,Promise<Buffer>>();
async function preview(key:string) {
  const directory=join(process.env.DATA_DIR||'./data','share-images','v1');
  const target=join(directory,key+'.jpg');
  try{return await readFile(target);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(pending.has(key))return pending.get(key)!;
  const work=withImageProcessingSlot(async()=>{
    const source=await mediaFileInfo(key);
    const image=await sharp(source.path,{limitInputPixels:80_000_000,sequentialRead:true})
      .rotate().resize(1200,630,{fit:'contain',background:'#f4f2ec'})
      .flatten({background:'#f4f2ec'}).jpeg({quality:85}).toBuffer();
    await mkdir(directory,{recursive:true});
    const temporary=target+'.'+crypto.randomUUID()+'.tmp';
    try{await writeFile(temporary,image);await rename(temporary,target);}
    finally{await unlink(temporary).catch(()=>{});}
    return image;
  });
  pending.set(key,work);
  try{return await work;}finally{pending.delete(key);}
}
export async function GET(request:Request,{params}:{params:Promise<{key:string}>}) {
  const {key}=await params;
  if(!/^[0-9a-f-]{36}\.(jpg|png|webp|gif|avif)$/.test(key))return new Response(null,{status:404});
  const referenced=(await listContent()).filter(isPublicEntry).some(entry=>entryMedia(entry).some(asset=>asset.key===key&&asset.type==='image'));
  if(!referenced)return new Response(null,{status:404});
  try{
    const image=await preview(key);
    return new Response(new Uint8Array(image),{headers:{'Content-Type':'image/jpeg','Content-Length':String(image.length),'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
  }catch(error){
    console.error('Share image failed',error instanceof Error?error.message:'unknown');
    // Corrupt or unsupported images still share the brand card instead of a broken preview.
    return new Response(null,{status:307,headers:{Location:'/share/team-gene.png','Cache-Control':'no-store'}});
  }
}
