type SessionClientOptions = {
  fetcher?: typeof fetch;
  requireLogin: () => Promise<void>;
  onStatus: (authenticated: boolean) => void;
};

function abortable<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('已取消操作。', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, {once:true});
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function createLoginWaiter() {
  let pending: {promise:Promise<void>;resolve:()=>void;reject:(error:Error)=>void} | undefined;
  return {
    wait() {
      if (!pending) {
        let resolve!:()=>void, reject!:(error:Error)=>void;
        const promise = new Promise<void>((yes,no) => {resolve=yes;reject=no});
        pending = {promise,resolve,reject};
      }
      return pending.promise;
    },
    resolve() {pending?.resolve();pending=undefined;},
    cancel() {pending?.reject(new Error('后台页面已关闭。'));pending=undefined;},
  };
}

// Only replay requests explicitly rejected by authentication, never network failures
// or server errors, which may already have committed a write.
export function createAdminSessionClient({fetcher = fetch, requireLogin, onStatus}: SessionClientOptions) {
  let generation = 0;
  let checking: Promise<boolean> | undefined;
  function verified() { generation++; onStatus(true); }
  function check(): Promise<boolean> {
    if (checking) return checking;
    const started = generation;
    const pending = (async () => {
      try {
        const response = await fetcher('/api/admin/session', {cache:'no-store', credentials:'same-origin'});
        if (!response.ok) throw new Error('暂时无法确认登录状态，请重试。');
        const data = await response.json() as {authenticated?: boolean} | null;
        if (started !== generation) return true;
        if (typeof data?.authenticated !== 'boolean') throw new Error('登录状态响应无效，请重试。');
        onStatus(data.authenticated);
        return data.authenticated;
      } catch (error) {
        if (started !== generation) return true;
        throw error;
      }
    })();
    checking = pending;
    void pending.finally(() => { if (checking === pending) checking = undefined; }).catch(() => {});
    return pending;
  }
  async function withSession<T extends {status:number}>(send:()=>Promise<T>, signal?:AbortSignal|null): Promise<T> {
    signal?.throwIfAborted();
    if (!await abortable(check(), signal)) await abortable(requireLogin(), signal);
    signal?.throwIfAborted();
    const sentGeneration = generation;
    let response = await send();
    if (response.status === 401 || (response.status === 403 && !await abortable(check(), signal))) {
      signal?.throwIfAborted();
      // Another pending operation may already have renewed the cookie while
      // this request was in flight. Its old 401 must not invalidate that login.
      if (sentGeneration === generation) {
        onStatus(false);
        await abortable(requireLogin(), signal);
      }
      signal?.throwIfAborted();
      const retryGeneration = generation;
      response = await send();
      if (response.status === 401 && retryGeneration === generation) onStatus(false);
    }
    return response;
  }
  function request(url: string, init?: RequestInit) {
    return withSession(() => fetcher(url, {...init, credentials:'same-origin'}), init?.signal);
  }
  return {check, request, verified, withSession};
}
