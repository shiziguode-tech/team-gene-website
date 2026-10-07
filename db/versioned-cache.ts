import type { DatabaseSync } from 'node:sqlite';

// A cheap token that changes whenever the database content may have changed:
// PRAGMA data_version moves when another connection (another route bundle or
// process) commits, total_changes() when this connection writes.
export function databaseVersion(db: DatabaseSync) {
  const { data_version: data } = db.prepare('PRAGMA data_version').get() as { data_version: number };
  const { changes } = db.prepare('SELECT total_changes() AS changes').get() as { changes: number };
  return `${data}:${changes}`;
}

// Keep a value derived from the database until the database changes. Writes
// made by compute() itself (for example allocating profile routes) belong to
// the result, but an external commit during computation may not have been
// observed by its reads. Do not stamp that earlier result with the new version.
export function versionedCache<T>(compute: (db: DatabaseSync) => T) {
  let cached: { db: DatabaseSync; version: string; value: T } | undefined;
  return (db: DatabaseSync) => {
    const before = databaseVersion(db);
    if (cached?.db === db && cached.version === before) return cached.value;
    const value = compute(db);
    const after = databaseVersion(db);
    cached = before.split(':')[0] === after.split(':')[0]
      ? { db, version: after, value }
      : undefined;
    return value;
  };
}
