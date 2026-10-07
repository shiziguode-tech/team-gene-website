import {mediaMaxBytes} from './upload-limits.js';
import type {MediaAsset} from './content';
import {sendFileRequest} from './upload-transfer.js';

export type MediaTarget = 'media'|'modelImages'|'titleImages';
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif';
export const MEDIA_ACCEPT = IMAGE_ACCEPT+',video/mp4,video/webm';

// Validate the complete selection before starting any upload.
export function validateAdminFiles(files:Pick<File,'name'|'type'|'size'>[], target:MediaTarget, existing:number) {
  if (target==='titleImages' && files.length>1) return '成果标题截图只能上传一张图片。';
  if (target!=='titleImages' && existing+files.length>8) return target==='modelImages'?'最多添加 8 张模型结构图。':'每条内容最多添加 8 个照片或视频。';
  for (const file of files) {
    if (!MEDIA_ACCEPT.split(',').includes(file.type)) return '支持 JPG、PNG、WebP、GIF、AVIF 图片，以及 MP4、WebM 视频。';
    const image = IMAGE_ACCEPT.split(',').includes(file.type);
    if (target!=='media' && !image) return '成果标题截图和模型结构图仅支持图片。';
    if (!file.size) return `「${file.name}」是空文件，请重新选择。`;
    if (file.size>mediaMaxBytes(file.type)) return image?'单张图片不能超过 50 MB。':'单个视频不能超过 500 MB。';
  }
  return '';
}

export function sendAdminFile(file:File, onProgress:(loaded:number)=>void, signal:AbortSignal) {
  return sendFileRequest('/api/media',file,signal,onProgress) as Promise<{status:number;data:{asset?:MediaAsset;error?:string}}>;
}
