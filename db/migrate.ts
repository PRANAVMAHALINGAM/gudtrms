// `npm run db:migrate`: adds tables that were introduced after your database was created.
// Safe to run any time: it only creates what's missing and never drops or changes data.

import { readFile } from 'node:fs/promises';
import { closePool, getPool } from '../src/db/client.ts';

await getPool().query(await readFile(new URL('./chat-schema.sql', import.meta.url), 'utf8'));
await closePool();
console.log('Migrate done: chat_messages, chat_state.');
