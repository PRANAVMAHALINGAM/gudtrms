// Negotiation side (owner: Shruti). AGENTS.md section 6.
// negotiate(caseId): the mediator proposes, both advocates accept or reject, up to the round cap.
// Every move is written to Neon as it happens, so the judge view (polling) can follow along.
// Pranav imports `negotiate` from here; keep the name and signature.
//
// Status: on 'needs_relaxation' this sets cases.status = 'needs_relaxation'. On 'agreed' it leaves
// the status alone: the conversation side sends the agreement and sets 'awaiting_confirmation'.
// Relaxing a constraint should UPDATE the person's existing constraint row, not add a second one
// (an advocate applies every cap row it sees, so the old, stricter cap would still win).
//
// Rogue mode: with ROGUE_MODE=B (or A), that advocate tries once, on the first proposal, to send a
// free-text question across. The protocol blocks it and logs it to leak_events; the deal is unaffected.

import { setTimeout as sleep } from 'node:timers/promises';
import { query } from '../db/client.ts';
import type { Negotiate, RelaxAsk } from '../shared/contract.ts';
import type {
  Constraint, Decision, DepositContribution, IsoDate, Item, Participant, Role, Uuid, Valuation,
} from '../shared/types.ts';
import { decide, relaxAsk, rogueAttempt, type AdvocateView, type ProposalTerms } from './advocate.ts';
import { candidates, type MoveOutWindow } from './mediator.ts';
import { checkWire } from './protocol.ts';

/** Max proposals per negotiate() call, so a side can't probe the other's limits (privacy rule 4). */
export const ROUND_CAP = 5;

/** When the windows don't overlap, how far to ask someone to stretch. Fixed, so it reveals nothing. */
const WINDOW_STRETCH_DAYS = 14;

export const negotiate: Negotiate = async (caseId) => {
  const participants = await query<Participant>('select * from participants where case_id = $1', [caseId]);
  const a = participants.find((p) => p.role === 'A');
  const b = participants.find((p) => p.role === 'B');
  if (!a || !b) throw new Error(`Case ${caseId} needs both participants`);

  const [items, valuations, deposits, constraints] = await Promise.all([
    query<Item>(
      `select id, case_id, name, kind, added_by, amount_cents from items
       where case_id = $1 order by created_at, id`, [caseId]),
    query<Valuation>(
      `select v.participant_id, v.item_id, v.outcome, v.value_cents from valuations v
       join participants p on p.id = v.participant_id where p.case_id = $1`, [caseId]),
    query<DepositContribution>('select * from deposit_contributions where case_id = $1', [caseId]),
    query<Constraint>(
      `select c.id, c.participant_id, c.kind, c.value from constraints c
       join participants p on p.id = c.participant_id where p.case_id = $1 order by c.id`, [caseId]),
  ]);

  // Each advocate gets only its own person's private rows.
  const viewFor = (me: Uuid): AdvocateView => ({
    me,
    items,
    valuations: valuations.filter((v) => v.participant_id === me),
    constraints: constraints.filter((c) => c.participant_id === me),
  });
  const advocates = [a, b].map((p) => ({ participant: p, view: viewFor(p.id) }));

  // The mediator gets valuations, deposits, and move-out windows. No caps, no dealbreakers.
  const windows: Record<Uuid, MoveOutWindow> = {};
  for (const c of constraints) if (c.kind === 'move_out_window') windows[c.participant_id] = c.value;
  if (!windows[a.id] || !windows[b.id]) throw new Error(`Case ${caseId}: both people need a move-out window`);

  await query("update cases set status = 'negotiating' where id = $1", [caseId]);
  // Rounds keep counting across calls (after a relaxation), so the judge view's counter never resets.
  const [previous] = await query<{ last: number }>(
    'select coalesce(max(round), 0)::int as last from proposals where case_id = $1', [caseId]);

  const rogue = rogueRole();
  let rogueTried = false;

  const rejected: ProposalTerms[] = [];
  let round = previous!.last;
  for (const candidate of candidates({ a: a.id, b: b.id, items, valuations, deposits, windows })) {
    if (rejected.length === ROUND_CAP) break;
    round++;
    const terms: ProposalTerms = {
      allocation: candidate.allocation, transfer: candidate.transfer, move_out_date: candidate.moveOutDate,
    };

    const [proposal] = await query<{ id: Uuid }>(
      `insert into proposals (case_id, round, allocation, transfer, move_out_date, status)
       values ($1, $2, $3, $4, $5, 'pending') returning id`,
      [caseId, round, JSON.stringify(terms.allocation), JSON.stringify(terms.transfer), terms.move_out_date]);
    const proposalId = proposal!.id;
    await pace();

    let allAccept = true;
    for (const { participant, view } of advocates) {
      const other = participant.id === a.id ? b : a;

      if (participant.role === rogue && !rogueTried) {
        rogueTried = true;
        await sendAcross(caseId, proposalId, participant, other, rogueAttempt(other.display_name ?? 'your ex'));
        await pace();
      }

      const { decision, note } = decide(view, terms);
      // decisions has no reason column on purpose; the note goes to advocate_notes (judge view only).
      await query('insert into advocate_notes (case_id, proposal_id, participant_id, note) values ($1, $2, $3, $4)',
        [caseId, proposalId, participant.id, note]);
      const sent = await sendAcross(caseId, proposalId, participant, other, { type: decision });
      if (sent !== 'accept') allAccept = false;
      await pace();
    }

    await query('update proposals set status = $2 where id = $1', [proposalId, allAccept ? 'accepted' : 'rejected']);
    if (allAccept) return { status: 'agreed', proposalId };
    rejected.push(terms);
  }

  // Stuck. Ask both people at once (null for whoever has nothing to relax), so neither is singled out.
  await query("update cases set status = 'needs_relaxation' where id = $1", [caseId]);
  const asks: Record<Uuid, RelaxAsk | null> = {};
  for (const { participant, view } of advocates) asks[participant.id] = relaxAsk(view, rejected);

  // No proposal at all means the move-out windows don't overlap. Ask whoever's window ends first
  // to stretch it by a fixed amount (never to the other person's date, which would leak it).
  if (rejected.length === 0) {
    const early = windows[a.id]!.latest <= windows[b.id]!.latest ? a : b;
    asks[early.id] = { kind: 'move_out_window', suggestedLatest: addDays(windows[early.id]!.latest, WINDOW_STRETCH_DAYS) };
  }
  return { status: 'needs_relaxation', asks };
};

/**
 * The only way an advocate's message reaches the other side. ACCEPT / REJECT is recorded in
 * `decisions`. Anything else is refused: `leak_events` gets the reason only (never the content),
 * and the attempt goes in the sender's own advocate_notes so the judge view can show it in that
 * advocate's private lane. Returns the decision that crossed, or null if it was blocked.
 */
async function sendAcross(
  caseId: Uuid, proposalId: Uuid, from: Participant, to: Participant, message: unknown,
): Promise<Decision | null> {
  const check = checkWire(message);
  if (check.ok) {
    await query('insert into decisions (proposal_id, participant_id, decision) values ($1, $2, $3)',
      [proposalId, from.id, check.decision]);
    return check.decision;
  }
  await query('insert into leak_events (case_id, target_participant_id, reason) values ($1, $2, $3)',
    [caseId, to.id, `${check.reason} (from ${from.role}'s advocate)`]);
  const text = (message as { text?: unknown } | null)?.text;
  await query('insert into advocate_notes (case_id, proposal_id, participant_id, note) values ($1, $2, $3, $4)',
    [caseId, proposalId, from.id, `ROGUE: tried to send "${typeof text === 'string' ? text : '?'}" across. ${check.reason}`]);
  return null;
}

/** ROGUE_MODE=A or B picks which advocate goes rogue (true means B). Anything else is off. */
function rogueRole(): Role | null {
  const flag = (process.env.ROGUE_MODE ?? '').trim().toUpperCase();
  if (flag === 'A' || flag === 'B') return flag;
  return flag === 'TRUE' ? 'B' : null;
}

/** Demo pacing (AGENTS.md section 8): wait between moves so judges can follow. Off unless DEMO_PACING_MS > 0. */
function pace(): Promise<void> {
  const ms = Number(process.env.DEMO_PACING_MS ?? 0);
  return ms > 0 ? sleep(ms) : Promise.resolve();
}

function addDays(iso: IsoDate, days: number): IsoDate {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
