// Agreement writer (owner: Pranav). AGENTS.md section 5, step 7.
// The text is filled into fixed templates from the accepted proposal: no LLM, so nothing can leak
// beyond what the proposal itself says (privacy rules 2 and 7: never say which constraint drove it).

import { query } from '../db/client.ts';
import { sendTo } from '../privacy/sendTo.ts';
import type { Cents, IsoDate, Item, Participant, Proposal, Uuid } from '../shared/types.ts';

export interface AgreementInput {
  code: string;
  /** Exactly the two participants, A first. */
  people: Pick<Participant, 'id' | 'role' | 'display_name'>[];
  items: Pick<Item, 'id' | 'name' | 'kind' | 'amount_cents'>[];
  proposal: Pick<Proposal, 'allocation' | 'transfer' | 'move_out_date'>;
}

export function formatMoney(cents: Cents): string {
  const dollars = Math.abs(cents) / 100;
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 'YYYY-MM-DD' -> 'Nov 30'. */
export function formatDate(iso: IsoDate): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "the couch", "the TV", "my desk" stays "my desk". */
function theItem(name: string): string {
  if (/^(the|my|our|a|an)\s/i.test(name)) return name;
  const lowered = /^[A-Z][a-z]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name;
  return `the ${lowered}`;
}

/** ["a"] -> "a", ["a","b"] -> "a and b", ["a","b","c"] -> "a, b, and c". */
function listOf(parts: string[]): string {
  if (parts.length <= 2) return parts.join(' and ');
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}

export function renderAgreement({ code, people, items, proposal }: AgreementInput): string {
  const { allocation, transfer, move_out_date } = proposal;
  const name = (id: Uuid | null) => {
    const p = people.find((x) => x.id === id);
    return p?.display_name ?? (p?.role === 'B' ? 'Person B' : 'Person A');
  };
  const other = (id: Uuid) => people.find((p) => p.id !== id)!.id;
  const outBy = formatDate(move_out_date);
  const lines: string[] = [];

  // Lease and move-out date.
  const lease = items.find((i) => i.kind === 'lease');
  const stayer = lease ? (allocation[lease.id]?.to ?? null) : null;
  if (lease && stayer) {
    lines.push(`${name(stayer)} keeps the apartment and the lease. ${name(other(stayer))} moves out by ${outBy}.`);
  } else if (lease) {
    lines.push(`You both move out by ${outBy}.`);
  } else {
    lines.push(`Move-out date: ${outBy}.`);
  }

  // Lease-break fee (only allocated when both move out).
  for (const fee of items.filter((i) => i.kind === 'lease_break_fee')) {
    const payer = allocation[fee.id]?.to;
    if (payer && fee.amount_cents) {
      lines.push(`${name(payer)} pays the landlord the ${formatMoney(fee.amount_cents)} lease-break fee.`);
    }
  }

  // Money. buyout_cents and deposit_cents are signed relative to from -> to.
  const direction = (signed: Cents): [Uuid, Uuid] =>
    signed > 0 ? [transfer.from!, transfer.to!] : [transfer.to!, transfer.from!];
  if (transfer.from && transfer.to && transfer.buyout_cents !== 0) {
    const [payer, payee] = direction(transfer.buyout_cents);
    lines.push(`${name(payer)} pays ${name(payee)} ${formatMoney(transfer.buyout_cents)} as a buyout.`);
  }
  if (transfer.from && transfer.to && transfer.deposit_cents !== 0) {
    const [payer, payee] = direction(transfer.deposit_cents);
    lines.push(
      `The deposit stays with the landlord under ${name(payer)}'s lease, so ${name(payer)} pays ${name(payee)} back ` +
        `${name(payee)}'s ${formatMoney(transfer.deposit_cents)} share.`,
    );
  }
  if (transfer.deposit_split) {
    const shares = Object.entries(transfer.deposit_split)
      .sort(([, x], [, y]) => y - x)
      .map(([id, share]) => `${name(id)} gets ${Math.round(share * 100)}%`);
    lines.push(
      `Security deposit: when the landlord returns it, ${listOf(shares)} (any deductions are shared the same way). ` +
        'Whoever receives it sends the other their share.',
    );
  }
  if (transfer.from && transfer.to && transfer.buyout_cents !== 0 && transfer.deposit_cents !== 0) {
    lines.push(`Total: ${name(transfer.from)} pays ${name(transfer.to)} ${formatMoney(transfer.total_cents)}.`);
  }

  // Stuff, grouped per person (A first).
  for (const person of people) {
    const kept = items.filter((i) => i.kind === 'item' && allocation[i.id]?.to === person.id);
    if (kept.length) lines.push(`${name(person.id)} keeps ${listOf(kept.map((i) => theItem(i.name)))}.`);
  }

  // Pets.
  for (const pet of items.filter((i) => i.kind === 'pet')) {
    const a = allocation[pet.id];
    if (!a?.to) continue;
    lines.push(
      a.weekends
        ? `${pet.name} lives with ${name(a.to)}. ${name(a.weekends)} has ${pet.name} every other weekend.`
        : `${pet.name} lives with ${name(a.to)} full-time.`,
    );
  }

  // Subscriptions.
  for (const sub of items.filter((i) => i.kind === 'subscription')) {
    const keeper = allocation[sub.id]?.to;
    lines.push(
      keeper
        ? `${name(keeper)} keeps ${sub.name} and takes over the bill from ${outBy}.`
        : `${sub.name} gets cancelled.`,
    );
  }

  return [`gudtrms agreement · Case ${code}`, '', ...lines.map((l) => `- ${l}`), '', 'Reply YES to confirm.'].join('\n');
}

/**
 * Renders the accepted proposal, sends it to both people, then records it and moves the case to
 * awaiting_confirmation. The agreements row is written only after both sends, because the router
 * treats "a row exists" as "the agreement was sent", which is when YES starts to count.
 */
export async function sendAgreement(caseId: Uuid, proposalId: Uuid): Promise<string> {
  const [[c], people, items, [proposal]] = await Promise.all([
    query<{ code: string }>('select code from cases where id = $1', [caseId]),
    query<Participant>('select * from participants where case_id = $1 order by role', [caseId]),
    query<Item>('select id, case_id, name, kind, added_by, amount_cents from items where case_id = $1 order by created_at, id', [caseId]),
    query<Proposal>('select * from proposals where id = $1 and case_id = $2', [proposalId, caseId]),
  ]);
  if (!c || !proposal || people.length !== 2) throw new Error(`sendAgreement: case ${caseId} / proposal ${proposalId} not found`);

  const text = renderAgreement({ code: c.code, people, items, proposal });
  for (const p of people) await sendTo(p.id, text);

  await query('insert into agreements (case_id, proposal_id, text) values ($1, $2, $3)', [caseId, proposalId, text]);
  await query(`update cases set status = 'awaiting_confirmation' where id = $1`, [caseId]);
  return text;
}
