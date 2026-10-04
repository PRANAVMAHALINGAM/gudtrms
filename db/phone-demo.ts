// `npm run demo:phones -- <case code>`: try the agreement flow on real phones before intake exists.
// Loads the section 8 demo values into a real case (A gets Alex's values, B gets Sam's), marks intake
// done, runs the negotiation, and sends the agreement over the configured provider. Then it keeps
// running as the normal bot, so both people can reply YES.
//
// The case must already have both people joined (A texted start, B replied JOIN).
// Replaces that case's items, values, and negotiation history. Fake data only, never a real case.
// Stop any other running bot first, or each reply gets answered twice.

import { query } from '../src/db/client.ts';
import { runNegotiation } from '../src/conversation/negotiation.ts';
import { sendToHandle, startMessaging, whenConnected } from '../src/messaging/index.ts';
import { route } from '../src/router/index.ts';
import { demoConstraints, demoDeposits, demoIds, demoItems, demoValuations } from '../src/shared/demoScenario.ts';
import type { Participant, Uuid } from '../src/shared/types.ts';

const code = (process.argv[2] ?? '').trim().toUpperCase();
const [c] = await query<{ id: Uuid; status: string }>(`select id, status from cases where code = $1`, [code]);
if (!c) throw new Error(`No case with code "${code}". Usage: npm run demo:phones -- <case code>`);
const people = await query<Participant>('select * from participants where case_id = $1', [c.id]);
const a = people.find((p) => p.role === 'A');
const b = people.find((p) => p.role === 'B');
if (!a?.joined_at || !b?.joined_at) throw new Error(`Case ${code} needs both people joined first.`);

// Fresh slate for this case, then the demo values under the real participants.
for (const table of ['agreements', 'leak_events', 'advocate_notes', 'proposals', 'deposit_contributions']) {
  await query(`delete from ${table} where case_id = $1`, [c.id]);
}
await query('delete from constraints where participant_id = any($1)', [[a.id, b.id]]);
await query('delete from items where case_id = $1', [c.id]); // cascades to valuations

const person: Record<Uuid, Uuid> = { [demoIds.ALEX]: a.id, [demoIds.SAM]: b.id };
const item: Record<Uuid, Uuid> = {};
for (const i of demoItems) {
  const [row] = await query<{ id: Uuid }>(
    'insert into items (case_id, name, kind, added_by, amount_cents) values ($1, $2, $3, $4, $5) returning id',
    [c.id, i.name, i.kind, i.added_by ? person[i.added_by] : null, i.amount_cents],
  );
  item[i.id] = row!.id;
}
for (const v of demoValuations) {
  await query('insert into valuations (participant_id, item_id, outcome, value_cents) values ($1, $2, $3, $4)', [
    person[v.participant_id], item[v.item_id], v.outcome, v.value_cents,
  ]);
}
for (const d of demoDeposits) {
  await query('insert into deposit_contributions (case_id, participant_id, amount_cents) values ($1, $2, $3)', [
    c.id, person[d.participant_id], d.amount_cents,
  ]);
}
for (const k of demoConstraints) {
  const value = k.kind === 'must_keep_item' ? { item_id: item[k.value.item_id] } : k.value;
  await query('insert into constraints (participant_id, kind, value) values ($1, $2, $3)', [
    person[k.participant_id], k.kind, JSON.stringify(value),
  ]);
}
await query('update participants set intake_done = true where case_id = $1', [c.id]);
await query(`update cases set status = 'intake' where id = $1`, [c.id]);
console.log(`[demo:phones] loaded demo values into case ${code} (A = Alex's values, B = Sam's)`);

// Same bot as `npm start`, so YES replies are handled.
void startMessaging(async (handle, text) => {
  try {
    await route(handle, text);
  } catch (err) {
    console.error(`[router] failed for ${handle}:`, err);
    await sendToHandle(handle, 'Sorry, something went wrong on our side. Try again in a minute.').catch(() => {});
  }
});
await whenConnected();

const result = await runNegotiation(c.id);
console.log(`[demo:phones] negotiate() returned ${result?.status ?? 'nothing (case not ready)'}; agreement sent to both.`);
console.log('[demo:phones] still running as the bot. Reply YES from both phones; Ctrl+C to stop.');
