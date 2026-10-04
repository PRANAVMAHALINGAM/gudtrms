// Turns a snapshot into a list of steps (for replay and the scrubber) and works out what the
// screen shows at any one step. Pure functions: the UI just renders `viewAt(...)`.

import { fairShare, received, valueLookup } from '../../../src/engine/values.ts';
import type { Item } from '../../../src/shared/types.ts';
import type { Leak, Note, ProposalRow, Snapshot } from './types.ts';

export type Step =
  | { kind: 'intake' }
  | { kind: 'proposal'; proposalId: string; round: number }
  | { kind: 'rogue'; leakId: string; fromId: string | null }
  | { kind: 'decision'; proposalId: string; participantId: string; decision: 'accept' | 'reject' }
  | { kind: 'verdict'; proposalId: string; round: number; deal: boolean }
  | { kind: 'agreement'; proposalId: string }
  | { kind: 'sign'; participantId: string }
  /** Someone replied NO to the agreement: back to the table. `byId` is null when we can't tell who. */
  | { kind: 'declined'; proposalId: string; byId: string | null }
  | { kind: 'split' };

/** How long each step holds during playback at 1x, in ms. Big moments get longer. */
export const STEP_MS: Record<Step['kind'], number> = {
  intake: 1800, proposal: 1600, rogue: 2200, decision: 1100, verdict: 1800, agreement: 2600, sign: 1300, declined: 2600, split: 6000,
};

export const proposalsOf = (s: Snapshot) => s.proposals as unknown as ProposalRow[];

/**
 * Who replied NO, from the YESes on the declined agreement: if exactly one person had confirmed,
 * it was the other one. Otherwise we can't tell (nothing records the NO itself).
 */
function decliner(s: Snapshot, a: Snapshot['agreements'][number] | undefined): string | null {
  const [pa, pb] = roles(s);
  if (!a || a.a_confirmed === a.b_confirmed) return null;
  return (a.a_confirmed ? pb?.id : pa?.id) ?? null;
}

export function buildSteps(s: Snapshot): Step[] {
  const steps: Step[] = [{ kind: 'intake' }];
  const agreementFor = new Map(s.agreements.map((a) => [a.proposal_id, a]));
  // A superseded proposal is shown only if it was agreed and then declined (someone replied NO).
  // Any other superseded row is a leftover from a negotiate() run that failed midway: never agreed, so hidden.
  const proposals = proposalsOf(s).filter((p) => p.status !== 'superseded' || agreementFor.has(p.id));
  const ids = new Set(proposals.map((p) => p.id));
  const order = { proposal: 0, rogue: 1, decision: 2, agreement: 3 } as const;

  type Ev = { t: string; o: number; step: Step };
  const agreed = proposals.filter((p) => p.status === 'accepted' || p.status === 'superseded');
  const events: Ev[] = [
    // The agreement goes out after the round's last decision. An accepted proposal can be waiting on
    // its agreements row (written only after both sends), so it falls back to that decision's time.
    ...agreed.flatMap((p): Ev[] => {
      const votes = s.decisions.filter((d) => d.proposal_id === p.id);
      if (votes.length < s.participants.length || votes.some((d) => d.decision !== 'accept')) return [];
      const t = agreementFor.get(p.id)?.created_at ?? votes.map((d) => d.created_at).sort().at(-1)!;
      return [{ t, o: order.agreement, step: { kind: 'agreement', proposalId: p.id } }];
    }),
    ...proposals.map((p): Ev => ({ t: p.created_at, o: order.proposal, step: { kind: 'proposal', proposalId: p.id, round: p.round } })),
    ...s.leaks.map((l): Ev => ({
      t: l.created_at, o: order.rogue,
      step: { kind: 'rogue', leakId: l.id, fromId: s.participants.find((p) => p.id !== l.target_participant_id)?.id ?? null },
    })),
    ...s.decisions.filter((d) => ids.has(d.proposal_id)).map((d): Ev => ({
      t: d.created_at, o: order.decision,
      step: { kind: 'decision', proposalId: d.proposal_id, participantId: d.participant_id, decision: d.decision },
    })),
  ];
  events.sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : x.o - y.o));

  const [a, b] = roles(s);
  const seen = new Map<string, number>();
  for (const e of events) {
    steps.push(e.step);
    if (e.step.kind === 'agreement') {
      // YESes have no timestamps, so they follow the agreement. A NO always comes before the next run's proposals.
      const p = proposals.find((x) => x.id === (e.step as { proposalId: string }).proposalId)!;
      const row = agreementFor.get(p.id);
      if (row?.a_confirmed && a) steps.push({ kind: 'sign', participantId: a.id });
      if (row?.b_confirmed && b) steps.push({ kind: 'sign', participantId: b.id });
      if (p.status === 'superseded') steps.push({ kind: 'declined', proposalId: p.id, byId: decliner(s, row) });
      else if (row?.a_confirmed && row.b_confirmed) steps.push({ kind: 'split' });
      continue;
    }
    if (e.step.kind !== 'decision') continue;
    const n = (seen.get(e.step.proposalId) ?? 0) + 1;
    seen.set(e.step.proposalId, n);
    if (n === s.participants.length) {
      const p = proposals.find((x) => x.id === (e.step as { proposalId: string }).proposalId)!;
      const deal = s.decisions.filter((d) => d.proposal_id === p.id).every((d) => d.decision === 'accept');
      steps.push({ kind: 'verdict', proposalId: p.id, round: p.round, deal });
    }
  }
  return steps;
}

export const roles = (s: Snapshot) =>
  [s.participants.find((p) => p.role === 'A'), s.participants.find((p) => p.role === 'B')] as const;

/** `declined`: both advocates accepted, then a person replied NO to the agreement. */
export interface RoundSummary { round: number; deal: boolean; declined: boolean; totalCents: number; payerId: string | null }

export interface View {
  step: Step;
  current: ProposalRow | null;
  decisions: Record<string, 'accept' | 'reject'>;
  verdict: boolean | null;
  /** Items sit in the boxes when a proposal is on the table and hasn't been turned down. */
  assigned: boolean;
  past: RoundSummary[];
  notes: Record<string, Note[]>;
  rogueNotes: Record<string, Note[]>;
  leaks: Leak[];
  rogue: { leak: Leak; fromId: string | null } | null;
  agreement: ProposalRow | null;
  /** Set while the agreement on screen has just been turned down with a NO. */
  declined: { byId: string | null } | null;
  signed: Record<string, boolean>;
  split: boolean;
  status: 'Intake' | 'Negotiating' | 'Agreed' | 'Declined' | 'Stuck' | 'Parted';
}

export function viewAt(s: Snapshot, steps: Step[], cursor: number): View {
  const proposals = proposalsOf(s);
  const shown = steps.slice(0, cursor + 1);
  const step = steps[cursor] ?? { kind: 'intake' };

  let current: ProposalRow | null = null;
  let verdict: boolean | null = null;
  const decisions: Record<string, 'accept' | 'reject'> = {};
  const past: RoundSummary[] = [];
  const decided = new Set<string>();
  const rogueShown = new Set<string>();
  let agreement: ProposalRow | null = null;
  let declined: View['declined'] = null;
  let signed: Record<string, boolean> = {};
  let split = false;

  for (const st of shown) {
    if (st.kind === 'proposal') {
      if (current && verdict !== null) {
        past.push({ round: current.round, deal: verdict, declined: !!declined, totalCents: current.transfer.total_cents, payerId: current.transfer.from });
      }
      current = proposals.find((p) => p.id === st.proposalId) ?? null;
      verdict = null;
      // Back at the table after a NO: the declined agreement leaves, and a new one needs two new YESes.
      agreement = null;
      declined = null;
      signed = {};
      for (const k of Object.keys(decisions)) delete decisions[k];
    } else if (st.kind === 'decision') {
      decisions[st.participantId] = st.decision;
      decided.add(`${st.proposalId}|${st.participantId}`);
    } else if (st.kind === 'verdict') {
      verdict = st.deal;
    } else if (st.kind === 'rogue') {
      rogueShown.add(st.leakId);
    } else if (st.kind === 'agreement') {
      agreement = proposals.find((p) => p.id === st.proposalId) ?? null;
    } else if (st.kind === 'sign') {
      signed[st.participantId] = true;
    } else if (st.kind === 'declined') {
      declined = { byId: st.byId };
    } else if (st.kind === 'split') {
      split = true;
    }
  }

  const notes: Record<string, Note[]> = {};
  const rogueNotes: Record<string, Note[]> = {};
  for (const n of s.notes) {
    const isRogue = n.note.startsWith('ROGUE:');
    if (isRogue) {
      // The leak this note belongs to: the latest one aimed away from this person, logged no later than the note.
      const leak = s.leaks
        .filter((l) => l.target_participant_id !== n.participant_id && l.created_at <= n.created_at)
        .at(-1);
      if (leak && rogueShown.has(leak.id)) (rogueNotes[n.participant_id] ??= []).push(n);
    } else if (decided.has(`${n.proposal_id}|${n.participant_id}`)) {
      (notes[n.participant_id] ??= []).push(n);
    }
  }

  const leaks = s.leaks.filter((l) => rogueShown.has(l.id));
  const rogue = step.kind === 'rogue'
    ? { leak: s.leaks.find((l) => l.id === step.leakId)!, fromId: step.fromId }
    : null;

  const atEnd = cursor >= steps.length - 1;
  const status: View['status'] = split ? 'Parted'
    : declined ? 'Declined'
      : agreement ? 'Agreed'
      : atEnd && s.case?.status === 'needs_relaxation' ? 'Stuck'
        : current ? 'Negotiating' : 'Intake';

  return {
    step, current, decisions: { ...decisions }, verdict, assigned: !!current && verdict !== false,
    past, notes, rogueNotes, leaks, rogue, agreement, declined, signed, split, status,
  };
}

export const asItems = (s: Snapshot): Item[] =>
  s.items.map((i) => ({ ...i, case_id: s.case?.id ?? '', added_by: null, kind: i.kind as Item['kind'] }));

/** The fairness numbers for one proposal: Knaster from each person's own valuations. Deposit excluded. */
export function fairness(s: Snapshot, p: ProposalRow) {
  const items = asItems(s);
  const value = valueLookup(s.valuations as never);
  const [a, b] = roles(s);
  if (!a || !b) return null;
  const rows = [a, b].map((x) => {
    const fair = fairShare(x.id, items, value);
    const got = received(x.id, p.allocation, items, value);
    const buyoutIn = p.transfer.to === x.id ? p.transfer.buyout_cents : p.transfer.from === x.id ? -p.transfer.buyout_cents : 0;
    return { participant: x, fair, got, buyoutIn, final: got + buyoutIn };
  });
  const surplus = rows.reduce((t, r) => t + r.final - r.fair, 0);
  return { rows, surplus };
}
