// Keep file bytes in a Blob throughout the transfer. No base64 conversion,
// full-file JS buffering, or automatic replay of a possibly committed POST.
/**
 * @param {string} url
 * @param {File} file
 * @param {AbortSignal} signal
 * @param {(loaded:number)=>void} onProgress
 * @returns {Promise<{status:number,data:Record<string,unknown>}>}
 */
export function sendFileRequest(url, file, signal, onProgress) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('已取消上传。', 'AbortError')); return; }
    const xhr = new XMLHttpRequest();
    let finished = false;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); };
    /** @param {Error} error */
    const fail = error => { if (finished) return; finished = true; cleanup(); reject(error); };
    const cancel = () => { fail(new DOMException('已取消上传。', 'AbortError')); xhr.abort(); };
    // An actively progressing large upload may take longer than a fixed
    // deadline on a mobile connection. Only stop transfers that have stalled.
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fail(new Error('上传已连续 2 分钟没有响应，请检查网络后重试。已完成的文件会保留。'));
        xhr.abort();
      }, 120_000);
    };
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    xhr.setRequestHeader('X-File-Size', String(file.size));
    xhr.upload.onprogress = event => {
      if (finished) return;
      touch(); onProgress(Math.min(event.loaded, file.size));
    };
    xhr.upload.onload = () => { if (!finished) touch(); };
    xhr.ontimeout = () => fail(new Error('上传超时，请重试。'));
    xhr.onerror = () => fail(new Error('网络连接中断，请重试。已完成的文件会保留。'));
    xhr.onabort = () => fail(new DOMException('已取消上传。', 'AbortError'));
    xhr.onload = () => {
      if (finished) return;
      /** @type {Record<string,unknown>} */
      let data = {};
      try {
        const parsed = JSON.parse(xhr.responseText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
      } catch { /* Authentication failures can have an HTML response. */ }
      finished = true; cleanup(); resolve({ status: xhr.status, data });
    };
    signal.addEventListener('abort', cancel, { once: true });
    touch();
    try { xhr.send(file); } catch (error) { fail(error instanceof Error ? error : new Error('无法上传文件。')); }
  });
}

/**
 * Two simultaneous requests hide per-file latency without saturating the small
 * VPS or splitting the uplink among every selected video. Complete callbacks
 * receive the selection index; callers can retain successful files in order.
 * @template T,R
 * @param {T[]} items
 * @param {AbortSignal} signal
 * @param {(item:T,index:number,signal:AbortSignal)=>Promise<R>} upload
 * @param {(result:R,index:number)=>void} [onComplete]
 * @returns {Promise<R[]>}
 */
export async function runUploadBatch(items, signal, upload, onComplete = () => {}) {
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  let next = 0;
  /** @type {R[]} */
  const result = new Array(items.length);
  async function worker() {
    while (next < items.length) {
      controller.signal.throwIfAborted();
      const index = next++;
      result[index] = await upload(items[index], index, controller.signal);
      onComplete(result[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(2, items.length) }, () => worker());
  try { await Promise.all(workers); return result; }
  catch (error) { controller.abort(); await Promise.allSettled(workers); throw error; }
  finally { signal.removeEventListener('abort', abort); }
}
