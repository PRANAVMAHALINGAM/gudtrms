// Neon access for the chat agent (owner: Pranav). Everything here is scoped to ONE person: their own
// valuations, constraints, transcript and flags, plus the shared facts both sides may see (item names,
// deposit contributions, the lease-break fee, the other person's first name). Privacy rule 1.

import { query } from '../db/client.ts';
import type { LlmTurn } from '../llm/index.ts';
import type { Membership } from '../router/cases.ts';
import type { Cents, Constraint, Item, ItemKind, Outcome, Participant, Uuid, Valuation } from '../shared/types.ts';

/** Progress the data rows can't show on their own. */
export interface Flags {
  /** Said the shared list is complete (for now). */
  items_done?: boolean;
  /** Answered the payment-cap question (no constraints row can also mean "no cap"). */
  cap_answered?: boolean;
  /** Answered the dealbreakers / anything-else question. */
  limits_answered?: boolean;
  /** Changed something since the last relaxation ask or NO, so negotiating again can give a new result. */
  changed_since_ask?: boolean;
}

export interface MyState {
  me: Membership;
  other: Pick<Participant, 'id' | 'display_name' | 'intake_done' | 'joined_at'> | null;
  items: Item[];
  myValues: Valuation[];
  myConstraints: Constraint[];
  myDeposit: Cents | null;
  theirDeposit: Cents | null;
  flags: Flags;
}

/** Which outcomes a person must put a number on, per item kind (AGENTS.md section 5). */
export const OUTCOMES_FOR: Record<ItemKind, Outcome[]> = {
  item: ['keep'],
  lease: ['keep'],
  subscription: ['keep'],
  pet: ['full', 'primary', 'visits'],
  lease_break_fee: ['pay'],
};

export async function loadState(me: Membership): Promise<MyState> {
  const [others, items, myValues, myConstraints, deposits, flagRows] = await Promise.all([
    query<Participant>('select * from participants where case_id = $1 and id <> $2', [me.case_id, me.id]),
    query<Item>(
      'select id, case_id, name, kind, added_by, amount_cents from items where case_id = $1 order by created_at, id',
      [me.case_id],
    ),
    query<Valuation>('select participant_id, item_id, outcome, value_cents from valuations where participant_id = $1', [me.id]),
    query<Constraint>('select id, participant_id, kind, value from constraints where participant_id = $1 order by id', [me.id]),
    query<{ participant_id: Uuid; amount_cents: Cents }>(
      'select participant_id, amount_cents from deposit_contributions where case_id = $1',
      [me.case_id],
    ),
    query<{ flags: Flags }>('select flags from chat_state where participant_id = $1', [me.id]),
  ]);
  const other = others[0] ?? null;
  return {
    me,
    other,
    items,
    myValues,
    myConstraints,
    myDeposit: deposits.find((d) => d.participant_id === me.id)?.amount_cents ?? null,
    theirDeposit: other ? (deposits.find((d) => d.participant_id === other.id)?.amount_cents ?? null) : null,
    flags: flagRows[0]?.flags ?? {},
  };
}

/** The steps of intake still open, in the order the agent should work through them. */
export type Step =
  | { step: 'items' }
  | { step: 'values'; item: Item; outcomes: Outcome[] }
  | { step: 'deposit' }
  | { step: 'window' }
  | { step: 'cap' }
  | { step: 'limits' };

export function missingSteps(s: MyState): Step[] {
  const steps: Step[] = [];
  if (!s.flags.items_done) steps.push({ step: 'items' });
  for (const item of s.items) {
    const have = new Set(s.myValues.filter((v) => v.item_id === item.id).map((v) => v.outcome));
    const outcomes = OUTCOMES_FOR[item.kind].filter((o) => !have.has(o));
    if (outcomes.length) steps.push({ step: 'values', item, outcomes });
  }
  if (s.myDeposit === null) steps.push({ step: 'deposit' });
  if (!s.myConstraints.some((c) => c.kind === 'move_out_window')) steps.push({ step: 'window' });
  if (!s.flags.cap_answered) steps.push({ step: 'cap' });
  if (!s.flags.limits_answered) steps.push({ step: 'limits' });
  return steps;
}

/** The person's own thread, oldest first, trimmed so it starts with something they said. */
export async function recentTurns(participantId: Uuid, limit = 30): Promise<LlmTurn[]> {
  const rows = await query<{ role: 'user' | 'assistant'; text: string }>(
    `select role, text from (
       select role, text, created_at from chat_messages where participant_id = $1 order by created_at desc limit $2
     ) t order by created_at`,
    [participantId, limit],
  );
  const firstUser = rows.findIndex((r) => r.role === 'user');
  return firstUser < 0 ? [] : rows.slice(firstUser).map((r) => ({ role: r.role, text: r.text }));
}

export async function setFlags(participantId: Uuid, patch: Flags): Promise<void> {
  await query(
    `insert into chat_state (participant_id, flags) values ($1, $2)
     on conflict (participant_id) do update set flags = chat_state.flags || excluded.flags`,
    [participantId, JSON.stringify(patch)],
  );
}

export function findItem(items: Item[], name: string): Item | undefined {
  const key = name.trim().toLowerCase();
  return items.find((i) => i.name.toLowerCase() === key) ?? items.find((i) => i.name.toLowerCase().includes(key));
}

export async function addItem(caseId: Uuid, addedBy: Uuid, name: string, kind: ItemKind, amountCents: Cents | null = null): Promise<Item> {
  const [row] = await query<Item>(
    `insert into items (case_id, name, kind, added_by, amount_cents) values ($1, $2, $3, $4, $5)
     returning id, case_id, name, kind, added_by, amount_cents`,
    [caseId, name, kind, addedBy, amountCents],
  );
  return row!;
}

export async function removeItem(itemId: Uuid): Promise<void> {
  await query('delete from items where id = $1', [itemId]); // cascades to both people's valuations
}

export async function setFeeAmount(itemId: Uuid, amountCents: Cents): Promise<void> {
  await query('update items set amount_cents = $2 where id = $1', [itemId, amountCents]);
}

export async function upsertValue(participantId: Uuid, itemId: Uuid, outcome: Outcome, cents: Cents): Promise<void> {
  await query(
    `insert into valuations (participant_id, item_id, outcome, value_cents) values ($1, $2, $3, $4)
     on conflict (participant_id, item_id, outcome) do update set value_cents = excluded.value_cents`,
    [participantId, itemId, outcome, cents],
  );
}

export async function setDeposit(caseId: Uuid, participantId: Uuid, cents: Cents): Promise<void> {
  await query(
    `insert into deposit_contributions (case_id, participant_id, amount_cents) values ($1, $2, $3)
     on conflict (case_id, participant_id) do update set amount_cents = excluded.amount_cents`,
    [caseId, participantId, cents],
  );
}

/**
 * Sets the person's one cap or one move-out window. Updates the existing row rather than adding a
 * second one (AGENTS.md section 11: an advocate applies every cap row, so an old one would still win).
 */
export async function upsertSingleConstraint(
  participantId: Uuid,
  kind: 'max_payment_cents' | 'move_out_window',
  value: object,
): Promise<void> {
  const updated = await query('update constraints set value = $3 where participant_id = $1 and kind = $2 returning id', [
    participantId,
    kind,
    JSON.stringify(value),
  ]);
  if (updated.length === 0) {
    await query('insert into constraints (participant_id, kind, value) values ($1, $2, $3)', [
      participantId,
      kind,
      JSON.stringify(value),
    ]);
  }
}

export async function deleteConstraints(participantId: Uuid, kind: Constraint['kind'], itemId?: Uuid): Promise<void> {
  if (itemId) {
    await query(`delete from constraints where participant_id = $1 and kind = $2 and value->>'item_id' = $3`, [
      participantId,
      kind,
      itemId,
    ]);
  } else {
    await query('delete from constraints where participant_id = $1 and kind = $2', [participantId, kind]);
  }
}

export async function deleteSoftPreference(participantId: Uuid, text: string): Promise<void> {
  await query(`delete from constraints where participant_id = $1 and kind = 'other' and value->>'text' = $2`, [participantId, text]);
}

export async function addConstraint(participantId: Uuid, kind: 'must_keep_item' | 'other', value: object): Promise<void> {
  await query('insert into constraints (participant_id, kind, value) values ($1, $2, $3)', [
    participantId,
    kind,
    JSON.stringify(value),
  ]);
}

export async function setIntakeDone(participantId: Uuid, done: boolean): Promise<void> {
  await query('update participants set intake_done = $2 where id = $1', [participantId, done]);
}

export async function latestAgreementText(caseId: Uuid): Promise<string | null> {
  const [row] = await query<{ text: string }>('select text from agreements where case_id = $1 order by created_at desc limit 1', [
    caseId,
  ]);
  return row?.text ?? null;
}
