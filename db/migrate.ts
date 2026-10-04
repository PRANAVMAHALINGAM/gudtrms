// `npm run db:migrate`: sets up a new database, or adds tables introduced after yours was created.
// Safe to run any time (Docker runs it before every bot start): it never drops or changes data.
//   - Empty database (no `cases` table): creates every table from schema.sql. No demo data; that's db:reset.
//   - Existing database: only creates what's missing.

import { readFile } from 'node:fs/promises';
import { closePool, getPool } from '../src/db/client.ts';

const sqlFile = (name: string) => readFile(new URL(`./${name}`, import.meta.url), 'utf8');
const db = getPool();

// schema.sql starts by dropping every table, so only run it when there's nothing to lose.
const { rows } = await db.query<{ exists: boolean }>("select to_regclass('public.cases') is not null as exists");
const fresh = !rows[0]?.exists;
if (fresh) await db.query(await sqlFile('schema.sql'));

await db.query(await sqlFile('chat-schema.sql'));
await db.query(await sqlFile('usage-schema.sql'));
await closePool();
console.log(fresh ? 'Migrate done: new database, created every table.' : 'Migrate done: chat_messages, chat_state, llm_usage.');
