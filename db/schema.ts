// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const content=sqliteTable('content',{id:text('id').primaryKey(),payload:text('payload').notNull(),revision:integer('revision').notNull().default(1),deleted:integer('deleted').notNull().default(0)});
