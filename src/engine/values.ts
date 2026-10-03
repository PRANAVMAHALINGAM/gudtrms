// What things are worth to one person, by their own valuations. Shared by the mediator
// and the advocates. Every function here works on one participant at a time.

import type { Allocation, Cents, Item, Outcome, Uuid, Valuation } from '../shared/types.ts';

export type ValueOf = (participantId: Uuid, item: Item, outcome: Outcome) => Cents;

/** Missing valuations count as $0, except the lease-break fee, which defaults to paying all of it. */
export function valueLookup(valuations: Valuation[]): ValueOf {
  const byKey = new Map(valuations.map((v) => [`${v.participant_id}|${v.item_id}|${v.outcome}`, v.value_cents]));
  return (participantId, item, outcome) =>
    byKey.get(`${participantId}|${item.id}|${outcome}`) ?? (outcome === 'pay' ? -(item.amount_cents ?? 0) : 0);
}

/** F = (sum of your keep / full-time values) / 2. The lease-break fee isn't part of it. May be fractional. */
export function fairShare(participantId: Uuid, items: Item[], value: ValueOf): number {
  return sum(items
    .filter((i) => i.kind !== 'lease_break_fee')
    .map((i) => value(participantId, i, i.kind === 'pet' ? 'full' : 'keep'))) / 2;
}

/** What an allocation is worth to this person (money not included). */
export function received(participantId: Uuid, allocation: Allocation, items: Item[], value: ValueOf): Cents {
  return sum(items.map((item) => {
    const slot = allocation[item.id];
    if (!slot) return 0;
    if (item.kind === 'pet') {
      if (slot.to === participantId) return value(participantId, item, slot.weekends ? 'primary' : 'full');
      return slot.weekends === participantId ? value(participantId, item, 'visits') : 0;
    }
    if (slot.to !== participantId) return 0;
    return value(participantId, item, item.kind === 'lease_break_fee' ? 'pay' : 'keep');
  }));
}

export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
