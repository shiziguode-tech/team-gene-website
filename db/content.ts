import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { initial, type Entry } from '@/lib/content';
import {withContentRoutes} from './content-routes';
import {versionedCache} from './versioned-cache';

let database: DatabaseSync | undefined;

export function contentDb() {
  if (!database) {
    const file = process.env.DATABASE_PATH || join(process.env.DATA_DIR || './data', 'team-gene.sqlite');
    mkdirSync(dirname(file), { recursive: true });
    database = new DatabaseSync(file);
    database.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS content (id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0);`);
  }
  return database;
}

const normalize = (entry: Entry): Entry => entry.section === 'news' && entry.tag === '校友动态' ? { ...entry, section: 'alumni' } : entry;

// Every public page renders from the full CMS. Parse it once per database
// change instead of on every request; callers must treat the result as read-only.
const snapshot = versionedCache((db): readonly Entry[] => {
  const rows = db.prepare('SELECT id, payload, revision, deleted FROM content').all() as { id: string; payload: string; revision: number; deleted: number }[];
  const map = new Map(initial.map((entry) => [entry.id, entry]));
  for (const row of rows) {
    if (row.deleted) map.delete(row.id);
    else map.set(row.id, normalize({ ...JSON.parse(row.payload), revision: row.revision } as Entry));
  }
  return withContentRoutes(db,[...map.values()]);
});

export async function listContent(): Promise<Entry[]> {
  return snapshot(contentDb()) as Entry[];
}
