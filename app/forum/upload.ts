import type { MediaAsset } from '@/lib/content';
import { runUploadBatch, sendFileRequest } from '../../lib/upload-transfer.js';

export type DraftMedia = { file: File; url: string; asset?: MediaAsset };
export type UploadProgress = { loaded: number; total: number; speed: number; saving: boolean };

// Keep successful uploads on the draft so retrying a failed publication does not upload them again.
export async function uploadAttachments(items: DraftMedia[], signal: AbortSignal, onProgress: (progress: UploadProgress) => void, onExpired: () => void = () => {}) {
  const loaded = items.map(item => item.asset ? item.file.size : 0);
  const initial = loaded.reduce((a, b) => a + b, 0);
  const total = items.reduce((sum, item) => sum + item.file.size, 0);
  const started = performance.now();
  const report = () => {
    const bytes = loaded.reduce((a, b) => a + b, 0);
    onProgress({ loaded: bytes, total, speed: (bytes - initial) / Math.max(1, (performance.now() - started) / 1000), saving: bytes === total });
  };
  report();
  const pending = items.map((item, index) => ({ item, index })).filter(({ item }) => !item.asset);
  await runUploadBatch(pending, signal, async ({ item, index }, _queueIndex, transferSignal) => {
    const { status, data } = await sendFileRequest('/api/forum/media', item.file, transferSignal, bytes => {
      loaded[index] = bytes; report();
    });
    if (status === 401) onExpired();
    if (status < 200 || status >= 300 || !data.asset) throw new Error(typeof data.error === 'string' ? data.error : `上传失败（${status}），请稍后重试。`);
    item.asset = data.asset as MediaAsset;
    loaded[index] = item.file.size; report();
    return item.asset;
  });
  return items.map(item => item.asset!);
}
