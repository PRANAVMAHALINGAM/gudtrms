// `npm run demo:agreement`: the 11 PM sync point (AGENTS.md section 11). Runs the seeded demo case
// (4F7K, Alex and Sam) through negotiate() and the agreement writer, then has both reply YES.
// Prints every message instead of sending it. Expected: the exact Alex/Sam agreement from section 5.
//
// Resets only the demo case's negotiation rows first, so it can run again and again.
// Needs the demo seed (`npm run db:reset` once on your own Neon branch).

import assert from 'node:assert/strict';
import { closePool, query } from '../src/db/client.ts';
import { runNegotiation } from '../src/conversation/negotiation.ts';
import { captureOutbound } from '../src/messaging/index.ts';
import { route } from '../src/router/index.ts';
import { demoIds, demoParticipants } from '../src/shared/demoScenario.ts';

const caseId = demoIds.CASE_ID;
const nameOf = Object.fromEntries(demoParticipants.map((p) => [p.handle, p.display_name]));
const sent: { to: string; text: string }[] = [];
captureOutbound((to, text) => {
  sent.push({ to, text });
  console.log(`\n-> ${nameOf[to] ?? to}:\n${text}`);
});

for (const table of ['agreements', 'leak_events', 'advocate_notes', 'proposals']) {
  await query(`delete from ${table} where case_id = $1`, [caseId]);
}
await query(`update cases set status = 'intake' where id = $1`, [caseId]);

try {
  const result = await runNegotiation(caseId);
  console.log(`\nnegotiate() returned ${result?.status}`);
  assert.equal(result?.status, 'agreed');

  const agreement = sent[0]!.text;
  assert.ok(agreement.includes('Alex pays Sam $640 as a buyout.'));
  assert.ok(agreement.includes('Total: Alex pays Sam $1,390.'));
  assert.ok(agreement.includes('Sam moves out by Nov 30.'));
  assert.equal(sent.length, 2, 'both people get the same agreement');
  assert.equal(sent[1]!.text, agreement);
  const rounds = await query<{ round: number; status: string }>(
    'select round, status from proposals where case_id = $1 order by round', [caseId]);
  assert.deepEqual(rounds.map((r) => r.status), ['rejected', 'accepted'], 'round 1 REJECT, round 2 deal (section 8)');

  for (const handle of ['+15550100001', '+15550100002']) {
    console.log(`\n${nameOf[handle]} > YES`);
    await route(handle, 'YES');
  }
  const [c] = await query<{ status: string }>('select status from cases where id = $1', [caseId]);
  assert.equal(c!.status, 'closed');
  console.log('\nSync point passed: agreed in round 2, agreement sent to both, both confirmed, case closed.');
} finally {
  await closePool();
}
