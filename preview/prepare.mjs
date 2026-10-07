import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { initial } from '../lib/content.ts';

// This demo is entirely local. No production content or media is downloaded.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(root, 'data/local-preview');
await mkdir(join(dataDir, 'uploads'), { recursive: true });
const envFile = join(root, '.env.local');
const password = `local-${randomBytes(16).toString('hex')}`;
try {
  await writeFile(envFile, [
    'DATA_DIR=./data/local-preview',
    'ADMIN_LOCAL_ONLY=1',
    'ADMIN_ALLOWED_HOSTS=localhost,127.0.0.1,::1',
    `ADMIN_PASSWORD=${password}`,
    `ADMIN_SESSION_SECRET=${randomBytes(32).toString('hex')}`,
    `MAIL_SIGNUP_RATE_SECRET=${randomBytes(32).toString('hex')}`,
    'MAIL_SIGNUP_ENABLED=0',
    'MEDIA_ACCEL_REDIRECT=0',
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 });
  console.log(`Local administrator password: ${password}`);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Existing .env.local kept. Its settings and password were not changed.');
}
const databasePath = join(dataDir, 'team-gene.sqlite');
let exists = false;
try { await readFile(databasePath); exists = true; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!exists) {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec('CREATE TABLE content (id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,deleted INTEGER NOT NULL DEFAULT 0); BEGIN;');
    const insert = database.prepare('INSERT INTO content (id,payload,revision,deleted) VALUES (?,?,1,0)');
    for (const item of initial) insert.run(item.id, JSON.stringify(item));
    database.exec('COMMIT;');
  } finally { database.close(); }
  console.log(`Initialized ${initial.length} fictional demo entries.`);
} else {
  console.log('Existing local database kept. Local edits were not changed.');
}
console.log('Ready: npm run dev -- --hostname 127.0.0.1 --port 3000');
