// Negotiation side (owner: Shruti). Mediator + advocates live in this folder.
//
// STUB so the conversation side can run end to end before the real engine exists:
// gives everything to Person A, no money changes hands, and always agrees.
// Shruti: replace with the real mediator + advocates (AGENTS.md section 6).
// Keep the export name and signature; Pranav imports `negotiate` from here.

import { query } from '../db/client.ts';
import type { Negotiate } from '../shared/contract.ts';
import type { Allocation, Item, Participant, Transfer } from '../shared/types.ts';

export const negotiate: Negotiate = async (caseId) => {
  const participants = await query<Participant>('select * from participants where case_id = $1', [caseId]);
  const a = participants.find((p) => p.role === 'A');
  if (!a) throw new Error(`Case ${caseId} has no Person A`);

  const items = await query<Item>("select * from items where case_id = $1 and kind <> 'lease_break_fee'", [caseId]);
  const allocation: Allocation = Object.fromEntries(items.map((i) => [i.id, { to: a.id, weekends: null }]));
  const transfer: Transfer = {
    from: null, to: null, buyout_cents: 0, deposit_cents: 0, total_cents: 0, deposit_split: null,
  };
  const moveOutDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const [row] = await query<{ id: string }>(
    `insert into proposals (case_id, round, allocation, transfer, move_out_date, status)
     values ($1, 1, $2, $3, $4, 'accepted') returning id`,
    [caseId, JSON.stringify(allocation), JSON.stringify(transfer), moveOutDate],
  );
  return { status: 'agreed', proposalId: row!.id };
};
