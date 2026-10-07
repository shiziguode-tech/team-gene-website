import { readFile, writeFile, copyFile, cp } from 'node:fs/promises';

// Apply the same finite upload timeouts to every standalone release.
const server = new URL('../.next/standalone/server.js', import.meta.url);
const marker = "import './upload-timeouts.cjs';\n";
const source = await readFile(server, 'utf8');
if (!source.startsWith(marker)) await writeFile(server, marker + source);
await copyFile(new URL('../deploy/upload-timeouts.cjs', import.meta.url), new URL('../.next/standalone/upload-timeouts.cjs', import.meta.url));

// Next does not trace public assets or browser chunks. Include both so the
// standalone server (and its integration tests) serves the complete website.
await Promise.all([
  cp(new URL('../public/', import.meta.url), new URL('../.next/standalone/public/', import.meta.url), { recursive: true }),
  cp(new URL('../.next/static/', import.meta.url), new URL('../.next/standalone/.next/static/', import.meta.url), { recursive: true }),
]);
