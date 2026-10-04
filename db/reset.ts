// `npm run db:reset`: drops and recreates every table, then loads the demo scenario.
// Point DATABASE_URL at your own Neon branch; this wipes whatever database it points at.

import { readFile } from 'node:fs/promises';
import { closePool, getPool } from '../src/db/client.ts';
import {
  demoCase, demoConstraints, demoDeposits, demoItems, demoParticipants, demoValuations,
} from '../src/shared/demoScenario.ts';

const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const db = getPool();

await db.query(schema);
await db.query(await readFile(new URL('./chat-schema.sql', import.meta.url), 'utf8'));

await db.query('insert into cases (id, code, status, created_at) values ($1, $2, $3, $4)',
  [demoCase.id, demoCase.code, demoCase.status, demoCase.created_at]);

for (const p of demoParticipants) {
  await db.query(
    `insert into participants (id, case_id, handle, role, display_name, intake_done, invite_sent_at, joined_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [p.id, p.case_id, p.handle, p.role, p.display_name, p.intake_done, p.invite_sent_at, p.joined_at]);
}

for (const i of demoItems) {
  await db.query('insert into items (id, case_id, name, kind, added_by, amount_cents) values ($1, $2, $3, $4, $5, $6)',
    [i.id, i.case_id, i.name, i.kind, i.added_by, i.amount_cents]);
}

for (const v of demoValuations) {
  await db.query('insert into valuations (participant_id, item_id, outcome, value_cents) values ($1, $2, $3, $4)',
    [v.participant_id, v.item_id, v.outcome, v.value_cents]);
}

for (const d of demoDeposits) {
  await db.query('insert into deposit_contributions (case_id, participant_id, amount_cents) values ($1, $2, $3)',
    [d.case_id, d.participant_id, d.amount_cents]);
}

for (const c of demoConstraints) {
  await db.query('insert into constraints (id, participant_id, kind, value) values ($1, $2, $3, $4)',
    [c.id, c.participant_id, c.kind, JSON.stringify(c.value)]);
}

await closePool();
console.log(`Reset done. Demo case ${demoCase.code} loaded.`);
