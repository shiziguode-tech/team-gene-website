import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const baseUrl = process.argv[2];
const dataDir = process.env.DATA_DIR || './data';
if (!baseUrl || !/^https:\/\//.test(baseUrl)) throw new Error('Usage: node scripts/import-live-site.mjs https://your-live-site.example');
const response = await fetch(new URL('/api/content', baseUrl), { headers: { accept: 'application/json' } });
if (!response.ok) throw new Error(`Live content API returned ${response.status}`);
const { entries } = await response.json();
if (!Array.isArray(entries)) throw new Error('Live content API response is malformed');

await mkdir(join(dataDir, 'uploads'), { recursive: true });
const database = new DatabaseSync(join(dataDir, 'team-gene.sqlite'));
database.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS content (id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0);');
const save = database.prepare('INSERT INTO content (id,payload,revision,deleted) VALUES (?, ?, ?, 0) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, revision=excluded.revision, deleted=0');
const deleteDefault = database.prepare('INSERT INTO content (id,payload,revision,deleted) VALUES (?, ?, 1, 1) ON CONFLICT(id) DO UPDATE SET deleted=1');
const defaultIds = [
  'teacher-01', ...Array.from({ length: 16 }, (_, i) => `student-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 4 }, (_, i) => `paper-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 3 }, (_, i) => `award-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 3 }, (_, i) => `life-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 4 }, (_, i) => `rule-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 3 }, (_, i) => `news-${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 2 }, (_, i) => `alumni-${String(i + 1).padStart(2, '0')}`),
];
const liveIds = new Set(entries.map(entry => entry.id));
for (const id of defaultIds) if (!liveIds.has(id)) deleteDefault.run(id, '{}');
let mediaCount = 0;

for (const entry of entries) {
  const revision = Math.max(1, Number(entry.revision) || 1);
  const saved = { ...entry, revision };
  save.run(entry.id, JSON.stringify(saved), revision);
  for (const asset of entry.media ?? []) {
    if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp|gif|avif|mp4|webm)$/.test(asset.key)) continue;
    const target = join(dataDir, 'uploads', asset.key);
    try {
      const file = await fetch(new URL(`/api/media/${encodeURIComponent(asset.key)}`, baseUrl));
      if (!file.ok) throw new Error(`Media download returned ${file.status}`);
      await writeFile(target, new Uint8Array(await file.arrayBuffer()));
      mediaCount++;
    } catch (error) {
      throw new Error(`Could not import media ${asset.key}: ${error.message}`);
    }
  }
}
database.close();
console.log(`Imported ${entries.length} entries and ${mediaCount} media files.`);
