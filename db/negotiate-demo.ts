// `npm run demo:negotiate`: runs negotiate() on the seeded demo case and prints what crossed the wire
// (proposals and accept / reject, no reasons). Run `npm run db:reset` first for a clean case.
// Expected: round 1 rejected ($1,615), round 2 agreed ($1,390), move-out Nov 30.

import { closePool, query } from '../src/db/client.ts';
import { negotiate } from '../src/engine/index.ts';
import { demoIds } from '../src/shared/demoScenario.ts';
import type { Proposal } from '../src/shared/types.ts';

const caseId = demoIds.CASE_ID;
const result = await negotiate(caseId);

const names = Object.fromEntries((await query<{ id: string; display_name: string }>(
  'select id, display_name from participants where case_id = $1', [caseId])).map((p) => [p.id, p.display_name]));
const itemNames = Object.fromEntries((await query<{ id: string; name: string }>(
  'select id, name from items where case_id = $1', [caseId])).map((i) => [i.id, i.name]));
const proposals = await query<Proposal>('select * from proposals where case_id = $1 order by round', [caseId]);
const decisions = await query<{ proposal_id: string; participant_id: string; decision: string }>(
  'select d.* from decisions d join proposals p on p.id = d.proposal_id where p.case_id = $1', [caseId]);

for (const p of proposals) {
  const who = (id: string | null) => (id ? names[id] : 'nobody');
  const gets = Object.entries(p.allocation)
    .map(([item, { to, weekends }]) => `${itemNames[item]}: ${who(to)}${weekends ? ` (${who(weekends)} weekends)` : ''}`);
  const money = p.transfer.from
    ? `${who(p.transfer.from)} pays ${who(p.transfer.to)} $${p.transfer.total_cents / 100}`
      + ` ($${p.transfer.buyout_cents / 100} buyout + $${p.transfer.deposit_cents / 100} deposit)`
    : 'no money changes hands';
  const votes = decisions.filter((d) => d.proposal_id === p.id).map((d) => `${who(d.participant_id)} ${d.decision.toUpperCase()}`);
  console.log(`Round ${p.round} · ${p.status}\n  ${gets.join(' · ')}\n  ${money} · out by ${p.move_out_date}\n  ${votes.join(', ')}`);
}
console.log('\nnegotiate() returned:', JSON.stringify(result));
await closePool();
