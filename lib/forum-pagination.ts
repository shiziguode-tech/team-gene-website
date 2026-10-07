export function readForumCursor(value: string | null) {
  if (!value) return null;
  const match = /^(\d{1,16}):([0-9a-f-]{36})$/.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[1]))) throw new Error('Invalid cursor');
  return { createdAt: Number(match[1]), id: match[2] };
}
export function forumCursor(row: {createdAt: number; id: string}) {
  return `${row.createdAt}:${row.id}`;
}
