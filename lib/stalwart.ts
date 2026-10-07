import 'server-only';
import { DEFAULT_MAILBOX_QUOTA_BYTES } from './mail-quota';

const using = ['urn:ietf:params:jmap:core', 'urn:stalwart:jmap'];

type JmapError = { type?: string; description?: string; status?: number };
type MethodResult<T> = { methodResponses?: [string, T | JmapError, string][] };

export type MailServiceErrorCode = 'configuration' | 'unauthorized' | 'forbidden' | 'already-exists' | 'invalid-account' | 'upstream' | 'invalid-response';

export class MailServiceError extends Error {
  constructor(readonly code: MailServiceErrorCode, message: string) {
    super(message);
    this.name = 'MailServiceError';
  }
}
export type MailAccount = {
  id: string;
  '@type'?: string;
  domainId?: string;
  name?: string;
  emailAddress?: string;
  createdAt?: string;
  usedDiskQuota?: number;
  quotas?: Record<string, number>;
  roles?: { '@type'?: string };
};

function config() {
  const url = process.env.STALWART_API_URL;
  const token = process.env.STALWART_API_TOKEN;
  const domainId = process.env.STALWART_DOMAIN_ID;
  if (!url || !token || !domainId) throw new MailServiceError('configuration', 'Missing STALWART_API_URL, STALWART_API_TOKEN, or STALWART_DOMAIN_ID.');
  return { url, token, domainId };
}

function classifyJmapError(type: string): MailServiceErrorCode {
  if (type === 'alreadyExists') return 'already-exists';
  if (type === 'forbidden' || type === 'notAuthorized') return 'forbidden';
  if (type === 'unauthorized' || type === 'invalidCredentials') return 'unauthorized';
  if (type === 'invalidArguments' || type === 'invalidProperties' || type === 'invalidProperty' || type === 'notFound') return 'invalid-account';
  return 'upstream';
}

async function requestJmap<T>(method: string, args: Record<string, unknown>): Promise<T> {
  const { url, token } = config();
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ using, methodCalls: [[method, args, 'gene']] }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new MailServiceError(response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : 'upstream', `Stalwart HTTP ${response.status} during ${method}.`);
  }
  let data: MethodResult<T>;
  try {
    data = await response.json() as MethodResult<T>;
  } catch {
    throw new MailServiceError('invalid-response', `Stalwart returned invalid JSON during ${method}.`);
  }
  const result = data.methodResponses?.find(([, , callId]) => callId === 'gene');
  if (!result) throw new MailServiceError('invalid-response', `Stalwart omitted the ${method} result.`);
  if (result[0] === 'error' || (result[1] && typeof result[1] === 'object' && 'type' in result[1])) {
    const jmapError = result[1] as JmapError;
    const type = jmapError.type || 'unknown';
    const description = typeof jmapError.description === 'string' ? jmapError.description.slice(0, 240) : '';
    throw new MailServiceError(classifyJmapError(type), `Stalwart ${method} ${type}${description ? `: ${description}` : ''}.`);
  }
  return result[1] as T;
}

export async function createMailbox(localPart: string, password: string) {
  const { domainId } = config();
  const response = await requestJmap<{ created?: Record<string, MailAccount>; notCreated?: Record<string, { type?: string }> }>('x:Account/set', {
    create: {
      signup: {
        '@type': 'User',
        name: localPart,
        domainId,
        credentials: { '0': { '@type': 'Password', secret: password } },
        memberGroupIds: {},
        roles: { '@type': 'User' },
        permissions: { '@type': 'Inherit' },
        quotas: { maxDiskQuota: DEFAULT_MAILBOX_QUOTA_BYTES, maxEmails: 20000, maxEmailSubmissions: 20000 },
        aliases: {},
        encryptionAtRest: { '@type': 'Disabled' },
        locale: 'zh-CN',
        timeZone: 'Asia/Shanghai',
        description: 'Team Gene self-service mailbox',
      },
    },
  });
  const account = response.created?.signup;
  if (!account) {
    const reason = response.notCreated?.signup?.type || 'unknown';
    throw new MailServiceError(classifyJmapError(reason), `Stalwart rejected account creation (${reason}).`);
  }
  return { id: account.id, emailAddress: account.emailAddress || `${localPart}@team-gene.com` };
}

export async function listMailboxes() {
  const { domainId } = config();
  const accounts: MailAccount[] = [];
  let position = 0;
  while (true) {
    const query = await requestJmap<{ ids?: string[] }>('x:Account/query', {
      filter: { domainId }, position, limit: 200,
    });
    if (!query.ids?.length) break;
    const result = await requestJmap<{ list?: MailAccount[] }>('x:Account/get', {
      ids: query.ids,
      properties: ['id', '@type', 'domainId', 'name', 'emailAddress', 'createdAt', 'usedDiskQuota', 'roles', 'quotas'],
    });
    accounts.push(...(result.list ?? []));
    position += query.ids.length;
  }
  return accounts.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function getManagedMailbox(id: string) {
  const { domainId } = config();
  const result = await requestJmap<{ list?: MailAccount[] }>('x:Account/get', {
    ids: [id], properties: ['id', '@type', 'domainId', 'roles', 'quotas', 'usedDiskQuota'],
  });
  return result.list?.find(account => account.id === id && account.domainId === domainId && account['@type'] === 'User' && account.roles?.['@type'] === 'User') ?? null;
}

export async function updateMailboxQuota(id: string, quotaBytes: number) {
  const result = await requestJmap<{ updated?: Record<string, unknown>; notUpdated?: Record<string, JmapError> }>('x:Account/set', {
    update: { [id]: { 'quotas/maxDiskQuota': quotaBytes } },
  });
  // JMAP may return null as the value for a successfully updated object.
  if (!result.updated || !Object.prototype.hasOwnProperty.call(result.updated, id)) {
    const reason = result.notUpdated?.[id]?.type || 'unknown';
    throw new MailServiceError(classifyJmapError(reason), `Stalwart rejected quota update (${reason}).`);
  }
  const account = await getManagedMailbox(id);
  if (account?.quotas?.maxDiskQuota !== quotaBytes) throw new MailServiceError('invalid-response', 'Mailbox quota read-back did not match.');
  return account;
}

export async function resetMailboxPassword(id: string, password: string) {
  const result = await requestJmap<{ updated?: Record<string, unknown>; notUpdated?: Record<string, unknown> }>('x:Account/set', {
    update: { [id]: { credentials: { '0': { '@type': 'Password', secret: password } } } },
  });
  if (!result.updated || !Object.prototype.hasOwnProperty.call(result.updated, id)) throw new Error('邮箱密码无法更新。');
}

export async function deleteMailbox(id: string) {
  const response = await requestJmap<{ destroyed?: string[]; notDestroyed?: Record<string, unknown> }>('x:Account/set', { destroy: [id] });
  if (!response.destroyed?.includes(id)) throw new Error('删除失败，账户可能已被其他管理员处理。');
}
