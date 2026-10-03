// Advocate (owner: Shruti). One per person. AGENTS.md section 6.
// Sees only its own person's private data. Its only moves are ACCEPT / REJECT (no reason
// crosses over) and privately asking its own person to relax something. Deterministic in v1.
// The one-line note is for advocate_notes (judge view only). It is never sent to anyone.

import type { RelaxAsk } from '../shared/contract.ts';
import type { Cents, Constraint, Decision, IsoDate, Item, Proposal, Uuid, Valuation } from '../shared/types.ts';
import type { MoveOutWindow } from './mediator.ts';
import { fairShare, received, valueLookup } from './values.ts';

export interface AdvocateView {
  me: Uuid;
  /** The item list is shared by both sides. Valuations and constraints must be mine only. */
  items: Item[];
  valuations: Valuation[];
  constraints: Constraint[];
}

export type ProposalTerms = Pick<Proposal, 'allocation' | 'transfer' | 'move_out_date'>;

export type Check =
  | { kind: 'max_payment'; ok: boolean; payCents: Cents; capCents: Cents }
  | { kind: 'must_keep'; ok: boolean; itemId: Uuid; itemName: string }
  | { kind: 'move_out_window'; ok: boolean; date: IsoDate; window: MoveOutWindow }
  | { kind: 'fair_share'; ok: boolean; getsCents: number; fairCents: number };

const CHECK_ORDER: Check['kind'][] = ['max_payment', 'must_keep', 'move_out_window', 'fair_share'];

export interface AdvocateDecision {
  decision: Decision;
  /** One line for advocate_notes, e.g. "Total $1,615 is over my $1,600 cap. REJECT" */
  note: string;
  checks: Check[];
}

/** Accept only if every check passes: cap, dealbreakers, move-out window, fair share. */
export function decide(view: AdvocateView, terms: ProposalTerms): AdvocateDecision {
  assertOwnDataOnly(view);
  const { me, items, constraints } = view;
  const value = valueLookup(view.valuations);
  const { allocation, transfer } = terms;
  const checks: Check[] = [];

  const payCents = transfer.from === me ? transfer.total_cents : 0;
  for (const c of constraints) {
    if (c.kind === 'max_payment_cents') {
      checks.push({ kind: 'max_payment', ok: payCents <= c.value.cents, payCents, capCents: c.value.cents });
    } else if (c.kind === 'must_keep_item') {
      // For a pet, "lives with me" means full-time or primary with ex on weekends: either way, to === me.
      const item = items.find((i) => i.id === c.value.item_id);
      checks.push({
        kind: 'must_keep', ok: allocation[c.value.item_id]?.to === me,
        itemId: c.value.item_id, itemName: item?.name ?? 'that item',
      });
    } else if (c.kind === 'move_out_window') {
      const date = terms.move_out_date;
      checks.push({ kind: 'move_out_window', ok: c.value.earliest <= date && date <= c.value.latest, date, window: c.value });
    }
  }

  // Deposit excluded: it's just people's own money coming back.
  const buyoutToMe = transfer.to === me ? transfer.buyout_cents : transfer.from === me ? -transfer.buyout_cents : 0;
  const getsCents = received(me, allocation, items, value) + buyoutToMe;
  const fairCents = fairShare(me, items, value);
  // The buyout is rounded to the cent, so allow half a cent.
  checks.push({ kind: 'fair_share', ok: getsCents + 0.5 >= fairCents, getsCents, fairCents });
  checks.sort((x, y) => CHECK_ORDER.indexOf(x.kind) - CHECK_ORDER.indexOf(y.kind));

  const decision: Decision = checks.every((c) => c.ok) ? 'accept' : 'reject';
  const shown = decision === 'accept' ? checks : checks.filter((c) => !c.ok);
  const note = [...shown.map(describe).filter(Boolean), decision.toUpperCase()].join(' ');
  return { decision, note, checks };
}

/**
 * When nothing passed, the smallest single change that would have made one of the
 * rejected proposals pass for me, to ask my own person about privately. Prefers the
 * smallest cap raise, then the smallest window stretch, then a dealbreaker.
 * null if I didn't block anything (or nothing is one change away).
 */
export function relaxAsk(view: AdvocateView, rejected: ProposalTerms[]): RelaxAsk | null {
  let cap: RelaxAsk & { kind: 'max_payment' } | null = null;
  let window: RelaxAsk & { kind: 'move_out_window' } | null = null;
  let mustKeep: RelaxAsk | null = null;

  for (const terms of rejected) {
    const failed = decide(view, terms).checks.filter((c) => !c.ok);
    if (failed.length !== 1) continue;
    const [f] = failed;
    if (f!.kind === 'max_payment') {
      if (!cap || f!.payCents < cap.suggestedCents) cap = { kind: 'max_payment', suggestedCents: f!.payCents };
    } else if (f!.kind === 'move_out_window' && f!.date > f!.window.latest) {
      if (!window || f!.date < window.suggestedLatest) window = { kind: 'move_out_window', suggestedLatest: f!.date };
    } else if (f!.kind === 'must_keep') {
      mustKeep ??= { kind: 'must_keep', itemId: f!.itemId };
    }
  }
  return cap ?? window ?? mustKeep;
}

function describe(c: Check): string {
  switch (c.kind) {
    case 'max_payment':
      if (c.payCents === 0 && c.ok) return '';
      return `Total ${money(c.payCents)} is ${c.ok ? 'under' : 'over'} my ${money(c.capCents)} cap.`;
    case 'must_keep':
      return `${c.itemName} ${c.ok ? 'stays' : "doesn't stay"} with me.`;
    case 'move_out_window':
      return `${shortDate(c.date)} is ${c.ok ? 'inside' : 'outside'} my window.`;
    case 'fair_share':
      return `I get ${money(c.getsCents)}, ${c.ok ? 'above' : 'below'} my ${money(c.fairCents)} fair share.`;
  }
}

/** Advocates must never be handed the other side's private rows. */
function assertOwnDataOnly(view: AdvocateView): void {
  const foreign = [...view.valuations, ...view.constraints].some((r) => r.participant_id !== view.me);
  if (foreign) throw new Error("Advocate was given the other person's private data");
}

function money(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = abs % 100;
  return `${cents < 0 ? '-' : ''}$${dollars}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(iso: IsoDate): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m! - 1]} ${d}`;
}
