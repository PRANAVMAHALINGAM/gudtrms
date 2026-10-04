// Runs Shruti's negotiate() and tells both people the outcome (owner: Pranav).
// AGENTS.md section 5, steps 5 to 7, and the negotiate() rules in section 11.

import { query } from '../db/client.ts';
import { negotiate } from '../engine/index.ts';
import { sendTo } from '../privacy/sendTo.ts';
import type { NegotiationResult, RelaxAsk } from '../shared/contract.ts';
import type { CaseStatus, Uuid } from '../shared/types.ts';
import { formatDate, formatMoney, sendAgreement } from './agreement.ts';

/**
 * Call when both people have finished intake (status 'intake') or someone relaxed a constraint
 * (status 'needs_relaxation'). Returns null if the case isn't ready or another call is already
 * negotiating it (A's and B's messages run in parallel, so both may try at once).
 */
export async function runNegotiation(caseId: Uuid): Promise<NegotiationResult | null> {
  const [c] = await query<{ status: CaseStatus }>('select status from cases where id = $1', [caseId]);
  if (c?.status !== 'intake' && c?.status !== 'needs_relaxation') return null;

  let result: NegotiationResult;
  try {
    result = await negotiate(caseId);
  } catch (err) {
    if (err instanceof Error && /already being negotiated|can't start negotiating/.test(err.message)) return null;
    throw err;
  }

  if (result.status === 'agreed') {
    await sendAgreement(caseId, result.proposalId);
  } else {
    await sendRelaxationAsks(caseId, result.asks);
  }
  return result;
}

/** Starts negotiating once both people in the case have finished intake. */
export async function onIntakeDone(caseId: Uuid): Promise<void> {
  const [row] = await query<{ done: number }>(
    'select count(*) filter (where intake_done)::int as done from participants where case_id = $1',
    [caseId],
  );
  if (row?.done === 2) await runNegotiation(caseId);
}

/** The private ask for one person. Never mentions the other person or why (privacy rule 7). */
export function relaxationText(ask: RelaxAsk | null, itemName?: string): string {
  const reassurance = 'Totally fine to say no. Nobody will know you were asked.';
  if (!ask) return "Nothing fits yet, so I'm checking whether there's any room to move. I'll get back to you soon.";
  switch (ask.kind) {
    case 'max_payment':
      return `Nothing fits yet. Would you go up to ${formatMoney(ask.suggestedCents)} in total? ${reassurance}`;
    case 'move_out_window':
      return `Nothing fits yet. Could you be moved out as late as ${formatDate(ask.suggestedLatest)}? ${reassurance}`;
    case 'must_keep':
      return `Nothing fits yet. Would a deal where you don't end up with ${itemName ?? 'that'} still be okay? ${reassurance}`;
  }
}

/** Asks both people at the same time, so neither is singled out as the blocker (AGENTS.md section 4). */
async function sendRelaxationAsks(caseId: Uuid, asks: Record<Uuid, RelaxAsk | null>): Promise<void> {
  const items = await query<{ id: Uuid; name: string }>('select id, name from items where case_id = $1', [caseId]);
  const nameOf = (id: Uuid) => items.find((i) => i.id === id)?.name;
  await Promise.all(
    Object.entries(asks).map(([participantId, ask]) =>
      sendTo(participantId, relaxationText(ask, ask?.kind === 'must_keep' ? nameOf(ask.itemId) : undefined)),
    ),
  );
}
