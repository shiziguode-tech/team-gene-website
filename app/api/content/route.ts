import { listContent, contentDb } from '@/db/content';
import { deleteMedia } from '@/db/media';
import { contentSchema } from '@/lib/content-schema';
import { entryMedia, type Entry } from '@/lib/content';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, hasAdminSession } from '@/app/admin-session';
import { adminAccessAllowed, expectedRequestOrigin } from '@/app/admin-access';
import { after } from 'next/server';
import { entryPath, isPublicEntry } from '@/lib/content-links';
import { notifySearchEngines } from '@/lib/search-indexing';
import { forumMediaReferenced } from '@/db/forum-feed';

export const dynamic = 'force-dynamic';


export async function GET() {
  try { return Response.json({ entries: await listContent() }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { console.error('Content load failed', error); return Response.json({ error: '内容暂时无法加载，请稍后重试。' }, { status: 503 }); }
}

async function cleanUnreferenced(keys: string[]) {
  if (!keys.length) return;
  try {
    const used = new Set((await listContent()).flatMap(entry => entryMedia(entry).map(asset => asset.key)));
    await Promise.all(keys.filter(key => !used.has(key) && !forumMediaReferenced(key)).map(deleteMedia));
  } catch (error) { console.error('Unreferenced media cleanup failed', error); }
}

async function write(request: Request, remove: boolean) {
  if (!adminAccessAllowed(request)) return Response.json({ error: '无域名模式下，后台仅允许通过本机 SSH 隧道访问。' }, { status: 403 });
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!await hasAdminSession(token)) return Response.json({ error: '请先输入管理密码。' }, { status: 401 });
  const origin = request.headers.get('origin');
  if (!origin || origin !== expectedRequestOrigin(request)) return Response.json({ error: '请求来源无效。' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 100000) return Response.json({ error: '内容过长。' }, { status: 413 });
  let raw: unknown;
  try { const text = await request.text(); if (text.length > 40000) return Response.json({ error: '内容过长。' }, { status: 413 }); raw = JSON.parse(text); }
  catch { return Response.json({ error: '请求内容格式无效。' }, { status: 400 }); }
  const parsed = contentSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: '请填写标题、有效日期、媒体资料及正确的 HTTP 或 HTTPS 链接。' }, { status: 400 });
  const entry = parsed.data;
  try {
    const previous = contentDb().prepare('SELECT payload FROM content WHERE id=? AND deleted=0').get(entry.id) as { payload: string } | undefined;
    const oldMedia = previous ? entryMedia(JSON.parse(previous.payload) as Entry) : [];
    const result = contentDb().prepare('INSERT INTO content (id,payload,revision,deleted) VALUES (?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, revision=content.revision+1, deleted=excluded.deleted WHERE content.revision=?').run(entry.id, JSON.stringify(entry), remove ? 1 : 0, entry.revision);
    if (!result.changes) return Response.json({ error: '该内容已被其他窗口修改。当前输入仍保留，请先复制需要保留的内容，再关闭并重新编辑最新版本。', entries: await listContent() }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    const keep = new Set(remove ? [] : entryMedia(entry).map(asset => asset.key));
    await cleanUnreferenced(oldMedia.map(asset => asset.key).filter(key => !keep.has(key)));
    const oldEntry = previous ? JSON.parse(previous.payload) as Entry : undefined;
    const indexPaths = ['/', `/${entry.section}`, ...(isPublicEntry(entry) ? [entryPath(entry)] : []), ...(oldEntry && isPublicEntry(oldEntry) ? [`/${oldEntry.section}`, entryPath(oldEntry)] : [])];
    after(async () => { try { await notifySearchEngines(indexPaths); } catch (error) { console.error('Search indexing notification failed', error instanceof Error ? error.message : 'Unknown error'); } });
    return Response.json({ entries: await listContent() });
  } catch (error) { console.error('Content write failed', error); return Response.json({ error: '保存失败，输入已保留，请稍后重试。' }, { status: 503 }); }
}

export async function POST(request: Request) { return write(request, false); }
export async function DELETE(request: Request) { return write(request, true); }
