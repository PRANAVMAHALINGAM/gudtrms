// Mediator (owner: Shruti). Deterministic: no DB, no LLM. AGENTS.md section 6.
// Sees valuations, deposit contributions, and move-out windows only. It never sees
// payment caps or dealbreakers (those stay with the advocates), which is why a proposal
// can be rejected and the next candidate gets proposed.

import type {
  Allocation, Cents, Constraint, DepositContribution, IsoDate, Item, Outcome, Transfer, Uuid, Valuation,
} from '../shared/types.ts';

export type MoveOutWindow = Extract<Constraint, { kind: 'move_out_window' }>['value'];

export interface MediatorInput {
  a: Uuid;
  b: Uuid;
  items: Item[];
  valuations: Valuation[];
  deposits: DepositContribution[];
  windows: Record<Uuid, MoveOutWindow>;
}

/** The numbers behind a candidate, for the judge view's math panel. Deposit is not included. */
export interface DealMath {
  totalValue: Cents;
  /** Half of what everything is worth to that person (keep / full-time values). May be fractional. */
  fairShare: Record<Uuid, number>;
  /** What the allocation is worth to that person, by their own valuations. */
  received: Record<Uuid, Cents>;
  excess: Record<Uuid, number>;
  surplus: number;
}

export interface Candidate {
  allocation: Allocation;
  transfer: Transfer;
  moveOutDate: IsoDate;
  math: DealMath;
}

/** One way a group of allocation entries can go, and what it's worth to A and to B. */
interface Option {
  set: Allocation;
  a: Cents;
  b: Cents;
}

/** The latest date inside every window, or null if they don't overlap. */
export function moveOutDate(windows: MoveOutWindow[]): IsoDate | null {
  const earliest = windows.map((w) => w.earliest).reduce((x, y) => (x > y ? x : y));
  const latest = windows.map((w) => w.latest).reduce((x, y) => (x < y ? x : y));
  return latest >= earliest ? latest : null;
}

/**
 * Candidate deals, best total value first (then the next best, and so on), each with its
 * Knaster buyout. Pull as many as the round cap allows. Yields nothing if the move-out
 * windows don't overlap: nothing can work, so the case goes straight to relaxation.
 */
export function* candidates(input: MediatorInput): Generator<Candidate> {
  const { a, b } = input;
  const windowA = input.windows[a];
  const windowB = input.windows[b];
  if (!windowA || !windowB) throw new Error('Both participants need a move-out window');
  const date = moveOutDate([windowA, windowB]);
  if (!date) return;

  const value = valueLookup(input.valuations);
  const groups = optionGroups(input, value);
  const fairShare = fairShares(input, value);
  const lease = input.items.find((i) => i.kind === 'lease');

  for (const pick of bestFirst(groups)) {
    const chosen = pick.map((i, g) => groups[g]![i]!);
    const allocation: Allocation = Object.assign({}, ...chosen.map((o) => o.set));
    const received = { [a]: sum(chosen.map((o) => o.a)), [b]: sum(chosen.map((o) => o.b)) };
    const excess = { [a]: received[a]! - fairShare[a]!, [b]: received[b]! - fairShare[b]! };
    const buyoutAToB = Math.round((excess[a]! - excess[b]!) / 2);

    yield {
      allocation,
      transfer: transferFor(input, lease && allocation[lease.id]?.to, buyoutAToB),
      moveOutDate: date,
      math: {
        totalValue: received[a]! + received[b]!,
        fairShare,
        received,
        excess,
        surplus: excess[a]! + excess[b]!,
      },
    };
  }
}

type ValueOf = (participantId: Uuid, item: Item, outcome: Outcome) => Cents;

/** Missing valuations count as $0, except the lease-break fee, which defaults to paying all of it. */
function valueLookup(valuations: Valuation[]): ValueOf {
  const byKey = new Map(valuations.map((v) => [`${v.participant_id}|${v.item_id}|${v.outcome}`, v.value_cents]));
  return (participantId, item, outcome) =>
    byKey.get(`${participantId}|${item.id}|${outcome}`) ?? (outcome === 'pay' ? -(item.amount_cents ?? 0) : 0);
}

/**
 * One group per item (the lease-break fee rides along with the lease, since it only exists
 * when both move out). Options are sorted best total first. On a tie the earlier-listed
 * option wins, which is how "cancelled" beats "someone keeps a $0 subscription" and
 * "both move out" beats "someone stays for $0". Options worth exactly the same to both
 * people as an earlier one are dropped, so a swap that changes nothing is never a new round.
 */
function optionGroups(input: MediatorInput, value: ValueOf): Option[][] {
  const { a, b } = input;
  const leases = input.items.filter((i) => i.kind === 'lease');
  const fees = input.items.filter((i) => i.kind === 'lease_break_fee');
  if (leases.length > 1 || fees.length > 1) throw new Error('At most one lease and one lease-break fee per case');
  if (fees.length && !leases.length) throw new Error('Lease-break fee without a lease');
  const fee = fees[0];

  const entry = (item: Item, to: Uuid | null, weekends: Uuid | null = null): Allocation =>
    ({ [item.id]: { to, weekends } });
  const keep = (item: Item, who: Uuid): Option => ({
    set: entry(item, who),
    a: who === a ? value(a, item, 'keep') : 0,
    b: who === b ? value(b, item, 'keep') : 0,
  });

  const groups: Option[][] = [];
  for (const item of input.items) {
    let options: Option[];
    switch (item.kind) {
      case 'item':
        options = [keep(item, a), keep(item, b)];
        break;
      case 'subscription':
        options = [{ set: entry(item, null), a: 0, b: 0 }, keep(item, a), keep(item, b)];
        break;
      case 'lease': {
        const bothOut: Option[] = fee
          ? [
              { set: { ...entry(item, null), ...entry(fee, a) }, a: value(a, fee, 'pay'), b: 0 },
              { set: { ...entry(item, null), ...entry(fee, b) }, a: 0, b: value(b, fee, 'pay') },
            ]
          : [{ set: entry(item, null), a: 0, b: 0 }];
        options = [...bothOut, keep(item, a), keep(item, b)];
        break;
      }
      case 'pet':
        options = [
          { set: entry(item, a), a: value(a, item, 'full'), b: 0 },
          { set: entry(item, a, b), a: value(a, item, 'primary'), b: value(b, item, 'visits') },
          { set: entry(item, b, a), a: value(a, item, 'visits'), b: value(b, item, 'primary') },
          { set: entry(item, b), a: 0, b: value(b, item, 'full') },
        ];
        break;
      case 'lease_break_fee':
        continue;
    }
    const distinct = options.filter((o, i) => options.findIndex((p) => p.a === o.a && p.b === o.b) === i);
    groups.push(distinct.sort((x, y) => y.a + y.b - (x.a + x.b)));
  }
  return groups;
}

/** F = (sum of your keep / full-time values) / 2. The lease-break fee isn't part of it. */
function fairShares(input: MediatorInput, value: ValueOf): Record<Uuid, number> {
  const total = (p: Uuid) =>
    sum(input.items
      .filter((i) => i.kind !== 'lease_break_fee')
      .map((i) => value(p, i, i.kind === 'pet' ? 'full' : 'keep')));
  return { [input.a]: total(input.a) / 2, [input.b]: total(input.b) / 2 };
}

/**
 * Deposit is a separate line, outside the fair-share math. One person stays: they pay the
 * other back that person's contribution now. Both move out: nobody pays up front, and the
 * landlord's refund is split in proportion to what each paid. Then everything is netted
 * into a single direction.
 */
function transferFor(input: MediatorInput, leaseTo: Uuid | null | undefined, buyoutAToB: Cents): Transfer {
  const { a, b } = input;
  const paid = (p: Uuid) => input.deposits.find((d) => d.participant_id === p)?.amount_cents ?? 0;

  let depositAToB = 0;
  let split: Record<Uuid, number> | null = null;
  if (leaseTo === a) depositAToB = paid(b);
  else if (leaseTo === b) depositAToB = -paid(a);
  else if (leaseTo === null && paid(a) + paid(b) > 0) {
    split = { [a]: paid(a) / (paid(a) + paid(b)), [b]: paid(b) / (paid(a) + paid(b)) };
  }

  const net = buyoutAToB + depositAToB;
  if (net === 0 && buyoutAToB === 0) {
    return { from: null, to: null, buyout_cents: 0, deposit_cents: 0, total_cents: 0, deposit_split: split };
  }
  const aPays = net >= 0;
  const sign = aPays ? 1 : -1;
  return {
    from: aPays ? a : b,
    to: aPays ? b : a,
    buyout_cents: sign * buyoutAToB,
    deposit_cents: sign * depositAToB,
    total_cents: sign * net,
    deposit_split: split,
  };
}

/**
 * Every combination of one option per group, in order of total value (best first).
 * Groups are sorted best-first, so this is a best-first walk where each combination has
 * exactly one parent (bump the last non-zero index down), which means no duplicates.
 */
function* bestFirst(groups: Option[][]): Generator<number[]> {
  const total = (pick: number[]) => sum(pick.map((i, g) => groups[g]![i]!.a + groups[g]![i]!.b));
  let seq = 0;
  const root = groups.map(() => 0);
  const frontier = [{ pick: root, last: 0, total: total(root), seq }];

  while (frontier.length) {
    let best = 0;
    for (let i = 1; i < frontier.length; i++) {
      const x = frontier[i]!;
      const y = frontier[best]!;
      if (x.total > y.total || (x.total === y.total && x.seq < y.seq)) best = i;
    }
    const node = frontier.splice(best, 1)[0]!;
    yield node.pick;
    for (let g = node.last; g < groups.length; g++) {
      if (node.pick[g]! + 1 >= groups[g]!.length) continue;
      const pick = [...node.pick];
      pick[g] = pick[g]! + 1;
      frontier.push({ pick, last: g, total: total(pick), seq: ++seq });
    }
  }
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
