// The chat agent's tools (owner: Pranav). The LLM can only change data through these, and each one
// validates in code. All writes go to the agent's own person's rows (or to the shared item list).
// Messages to the OTHER person are fixed text with shared facts only (item names, deposit, fee).

import type { LlmTool, LlmToolCall } from '../llm/index.ts';
import { sendTo } from '../privacy/sendTo.ts';
import type { Item, ItemKind, Outcome } from '../shared/types.ts';
import { formatMoney } from '../conversation/agreement.ts';
import {
  addConstraint, addItem, deleteConstraints, deleteSoftPreference, findItem, missingSteps, OUTCOMES_FOR, removeItem, setDeposit,
  setFeeAmount, setFlags, setIntakeDone, upsertSingleConstraint, upsertValue, type MyState,
} from './store.ts';

const obj = (properties: Record<string, unknown>): LlmTool['inputSchema'] => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const dollars = { type: 'integer', description: 'Whole US dollars.' };
const itemName = { type: 'string', description: 'The item name as it appears in the shared list.' };

const TOOLS: Record<string, LlmTool> = {
  reply: {
    name: 'reply',
    description: 'Send your message to the person. Call this exactly once per turn, after any other tools.',
    inputSchema: obj({ text: { type: 'string' } }),
  },
  add_item: {
    name: 'add_item',
    description:
      'Add something to the shared list (both people see item names, never values). kind: item = furniture/electronics/stuff, ' +
      'lease = the apartment lease (one per case), pet, subscription = Netflix/Spotify/internet etc.',
    inputSchema: obj({ name: { type: 'string' }, kind: { type: 'string', enum: ['item', 'lease', 'pet', 'subscription'] } }),
  },
  remove_item: {
    name: 'remove_item',
    description: 'Remove an item this person added by mistake.',
    inputSchema: obj({ item: itemName }),
  },
  done_listing_items: {
    name: 'done_listing_items',
    description: 'The person says the shared list is complete (they can still add more later).',
    inputSchema: obj({}),
  },
  set_value: {
    name: 'set_value',
    description:
      'Record what an outcome is worth to this person, in dollars. Outcomes: keep (item, lease, subscription: keeping it / ' +
      'staying in the apartment vs both moving out; lease and subscription may be negative), full / primary / visits (pet: ' +
      'lives with me full-time / lives with me and ex has every other weekend / lives with ex and I have every other weekend), ' +
      'pay (lease_break_fee: what someone would have to pay them to cover the whole fee; record as a positive number).',
    inputSchema: obj({ item: itemName, outcome: { type: 'string', enum: ['keep', 'full', 'primary', 'visits', 'pay'] }, dollars }),
  },
  set_deposit: {
    name: 'set_deposit',
    description: 'How much of the security deposit this person paid. This is a fact and IS shown to their ex to confirm.',
    inputSchema: obj({ dollars }),
  },
  set_lease_break_fee: {
    name: 'set_lease_break_fee',
    description: "The landlord's fee for breaking the lease early. A fact, shown to both people. Only if there is a lease.",
    inputSchema: obj({ dollars }),
  },
  set_move_out_window: {
    name: 'set_move_out_window',
    description: 'The range of dates that works for whoever moves out to be gone. Dates as YYYY-MM-DD.',
    inputSchema: obj({ earliest: { type: 'string' }, latest: { type: 'string' } }),
  },
  set_max_payment: {
    name: 'set_max_payment',
    description: 'The most this person could pay their ex in total (buyout plus deposit payback). Private.',
    inputSchema: obj({ dollars }),
  },
  no_payment_cap: {
    name: 'no_payment_cap',
    description: 'The person has no limit on what they could pay.',
    inputSchema: obj({}),
  },
  add_dealbreaker: {
    name: 'add_dealbreaker',
    description: 'Something this person must keep (for a pet: it must live with them). Private.',
    inputSchema: obj({ item: itemName }),
  },
  remove_dealbreaker: {
    name: 'remove_dealbreaker',
    description: 'Drop a dealbreaker the person no longer insists on.',
    inputSchema: obj({ item: itemName }),
  },
  add_soft_preference: {
    name: 'add_soft_preference',
    description:
      "Something that matters to the person but isn't a number or a dealbreaker (e.g. 'no handoffs with them'). Short text. Private.",
    inputSchema: obj({ text: { type: 'string' } }),
  },
  remove_soft_preference: {
    name: 'remove_soft_preference',
    description: 'Drop a soft preference the person no longer cares about (or cares about less). Pass its text or a few words from it.',
    inputSchema: obj({ text: { type: 'string' } }),
  },
  done_with_limits: {
    name: 'done_with_limits',
    description: 'The person has no more dealbreakers or preferences to add.',
    inputSchema: obj({}),
  },
  finish_intake: {
    name: 'finish_intake',
    description: 'Everything is recorded and the person confirmed the recap. Starts the negotiation once both people are done.',
    inputSchema: obj({}),
  },
  try_again: {
    name: 'try_again',
    description: 'After the person changed something (a value, their cap, their window, a dealbreaker, a soft preference), look for a new deal.',
    inputSchema: obj({}),
  },
};

const STOP_WORDS = new Set(['the', 'and', 'with', 'them', 'want', 'really', 'dont', "don't", 'not', 'have', 'that', 'this',
  'for', 'about', 'would', 'like', 'any', 'more', 'just', 'thing', 'matter', 'matters', 'care']);
const words = (s: string) =>
  new Set((s.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((w) => w.length > 1 && !STOP_WORDS.has(w)));

/**
 * Which saved soft preference the person means: exact text, then containment, then the single best word
 * overlap ("the TV thing doesn't matter" -> "I'd really like the TV"). Undefined if none or ambiguous.
 */
export function matchSoftPreference(prefs: string[], query: string): string | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const exact = prefs.find((p) => p.toLowerCase() === q);
  if (exact) return exact;
  const contains = prefs.filter((p) => p.toLowerCase().includes(q) || q.includes(p.toLowerCase()));
  if (contains.length === 1) return contains[0];
  const qw = words(q);
  const scored = prefs.map((p) => ({ p, n: [...words(p)].filter((w) => qw.has(w)).length }));
  const best = Math.max(0, ...scored.map((x) => x.n));
  const top = scored.filter((x) => x.n === best);
  return best > 0 && top.length === 1 ? top[0]!.p : undefined;
}

const bareName = (s: string) => s.trim().toLowerCase().replace(/^(the|our|my|a|an)\s+/, '');

/**
 * An item of the same kind whose name contains the new one or the other way round ("internet" vs
 * "Internet contract", "the couch" vs "Couch"), so the other person's agent doesn't add it twice.
 */
export function similarItem(items: Item[], name: string, kind: ItemKind): Item | undefined {
  const n = bareName(name);
  if (!n) return undefined;
  return items.find((i) => {
    const e = bareName(i.name);
    return i.kind === kind && (e.includes(n) || n.includes(e));
  });
}

/** Which tools the agent gets depends on where the case is. */
export function toolsFor(status: string): LlmTool[] {
  const names =
    status === 'intake'
      ? ['add_item', 'remove_item', 'done_listing_items', 'set_value', 'set_deposit', 'set_lease_break_fee',
         'set_move_out_window', 'set_max_payment', 'no_payment_cap', 'add_dealbreaker', 'remove_dealbreaker',
         'add_soft_preference', 'remove_soft_preference', 'done_with_limits', 'finish_intake']
      : status === 'needs_relaxation'
        ? ['set_value', 'set_move_out_window', 'set_max_payment', 'no_payment_cap', 'remove_dealbreaker',
           'remove_soft_preference', 'try_again']
        : [];
  return [...names.map((n) => TOOLS[n]!), TOOLS.reply!];
}

/** What running the tools did, so index.ts can reply and then act. */
export interface ToolOutcome {
  results: { tool: string; ok: boolean; note: string }[];
  reply: string | null;
  finished: boolean;
  tryAgain: boolean;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: string) => ISO.test(d) && !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime());

export async function runTools(calls: LlmToolCall[], s: MyState): Promise<ToolOutcome> {
  const out: ToolOutcome = { results: [], reply: null, finished: false, tryAgain: false };
  const me = s.me;
  const myName = me.display_name ?? 'Your ex';
  let changed = false;

  for (const call of calls) {
    const input = call.input as Record<string, unknown>;
    const ok = (note: string) => out.results.push({ tool: call.name, ok: true, note });
    const fail = (note: string) => out.results.push({ tool: call.name, ok: false, note });
    const item = typeof input.item === 'string' ? findItem(s.items, input.item) : undefined;
    const cents = typeof input.dollars === 'number' ? Math.round(input.dollars) * 100 : null;

    switch (call.name) {
      case 'reply':
        out.reply = String(input.text ?? '').trim() || null;
        break;

      case 'add_item': {
        const name = String(input.name ?? '').trim();
        const kind = input.kind as ItemKind;
        if (!name) { fail('empty name'); break; }
        const existing = findItem(s.items, name);
        if (existing && existing.name.toLowerCase() === name.toLowerCase()) { ok(`"${existing.name}" is already on the list`); break; }
        const similar = similarItem(s.items, name, kind);
        if (similar) {
          fail(`"${similar.name}" is already on the list. If that's the same thing, use "${similar.name}". If it's really something else, add it with a more specific name.`);
          break;
        }
        if (kind === 'lease' && s.items.some((i) => i.kind === 'lease')) { fail('there is already a lease on the list'); break; }
        const added = await addItem(me.case_id, me.id, name, kind);
        s.items.push(added);
        ok(`added "${name}" (${kind})`);
        // The other person needs to value it too. Item names are shared by design.
        if (s.other?.joined_at && s.other.intake_done) {
          await setIntakeDone(s.other.id, false);
          await sendTo(s.other.id, `${myName} added "${name}" to your shared list. When you get a sec, tell me what it's worth to you.`);
        }
        break;
      }

      case 'remove_item': {
        if (!item) { fail('no such item'); break; }
        if (item.added_by !== me.id) { fail(`"${item.name}" was added by ${s.other?.display_name ?? 'their ex'}, so only they can remove it`); break; }
        await removeItem(item.id);
        s.items.splice(s.items.indexOf(item), 1);
        ok(`removed "${item.name}"`);
        break;
      }

      case 'done_listing_items':
        await setFlags(me.id, { items_done: true });
        s.flags.items_done = true;
        ok('item list marked complete');
        break;

      case 'set_value': {
        const outcome = input.outcome as Outcome;
        if (!item) { fail(`no item called "${String(input.item)}"; add it first`); break; }
        if (!OUTCOMES_FOR[item.kind].includes(outcome)) {
          fail(`"${item.name}" is a ${item.kind}; its outcomes are ${OUTCOMES_FOR[item.kind].join(', ')}`);
          break;
        }
        if (cents === null) { fail('missing dollars'); break; }
        if ((item.kind === 'item' || item.kind === 'pet') && cents < 0) { fail('items and pets cannot have a negative value'); break; }
        // Taking on the lease-break fee costs you: always stored negative.
        const stored = outcome === 'pay' ? -Math.abs(cents) : cents;
        await upsertValue(me.id, item.id, outcome, stored);
        s.myValues = s.myValues.filter((v) => !(v.item_id === item.id && v.outcome === outcome));
        s.myValues.push({ participant_id: me.id, item_id: item.id, outcome, value_cents: stored });
        changed = true;
        ok(`${item.name} / ${outcome} = ${formatMoney(stored)}${stored < 0 ? ' (negative)' : ''}`);
        break;
      }

      case 'set_deposit': {
        if (cents === null || cents < 0) { fail('deposit must be 0 or more'); break; }
        await setDeposit(me.case_id, me.id, cents);
        s.myDeposit = cents;
        ok(`deposit contribution = ${formatMoney(cents)} (shown to their ex)`);
        if (s.other?.joined_at) {
          await sendTo(s.other.id, `${myName} says they paid ${formatMoney(cents)} toward the security deposit. If that doesn't sound right, tell me.`);
        }
        break;
      }

      case 'set_lease_break_fee': {
        if (cents === null || cents <= 0) { fail('fee must be more than 0'); break; }
        if (!s.items.some((i) => i.kind === 'lease')) { fail('add the lease first'); break; }
        const fee = s.items.find((i) => i.kind === 'lease_break_fee');
        if (fee) {
          await setFeeAmount(fee.id, cents);
          fee.amount_cents = cents;
        } else {
          s.items.push(await addItem(me.case_id, me.id, 'Lease-break fee', 'lease_break_fee', cents));
          if (s.other?.joined_at && s.other.intake_done) await setIntakeDone(s.other.id, false);
        }
        ok(`lease-break fee = ${formatMoney(cents)} (shown to both)`);
        if (s.other?.joined_at) {
          await sendTo(s.other.id, `${myName} says the lease-break fee is ${formatMoney(cents)}. If that's not right, tell me. If you both move out, someone will have to cover it.`);
        }
        break;
      }

      case 'set_move_out_window': {
        const earliest = String(input.earliest ?? '');
        const latest = String(input.latest ?? '');
        if (!validDate(earliest) || !validDate(latest)) { fail('dates must be YYYY-MM-DD'); break; }
        if (earliest > latest) { fail('earliest is after latest'); break; }
        await upsertSingleConstraint(me.id, 'move_out_window', { earliest, latest });
        s.myConstraints = s.myConstraints.filter((c) => c.kind !== 'move_out_window');
        s.myConstraints.push({ id: '', participant_id: me.id, kind: 'move_out_window', value: { earliest, latest } });
        changed = true;
        ok(`move-out window = ${earliest} to ${latest}`);
        break;
      }

      case 'set_max_payment': {
        if (cents === null || cents < 0) { fail('cap must be 0 or more'); break; }
        await upsertSingleConstraint(me.id, 'max_payment_cents', { cents });
        await setFlags(me.id, { cap_answered: true });
        s.flags.cap_answered = true;
        changed = true;
        ok(`max total payment = ${formatMoney(cents)}`);
        break;
      }

      case 'no_payment_cap':
        await deleteConstraints(me.id, 'max_payment_cents');
        await setFlags(me.id, { cap_answered: true });
        s.flags.cap_answered = true;
        changed = true;
        ok('no payment cap');
        break;

      case 'add_dealbreaker': {
        if (!item) { fail(`no item called "${String(input.item)}"`); break; }
        const has = s.myConstraints.some((c) => c.kind === 'must_keep_item' && c.value.item_id === item.id);
        if (!has) await addConstraint(me.id, 'must_keep_item', { item_id: item.id });
        if (!has) s.myConstraints.push({ id: '', participant_id: me.id, kind: 'must_keep_item', value: { item_id: item.id } });
        ok(`dealbreaker: must keep ${item.name}`);
        break;
      }

      case 'remove_dealbreaker': {
        if (!item) { fail(`no item called "${String(input.item)}"`); break; }
        await deleteConstraints(me.id, 'must_keep_item', item.id);
        s.myConstraints = s.myConstraints.filter((c) => !(c.kind === 'must_keep_item' && c.value.item_id === item.id));
        changed = true;
        ok(`no longer a dealbreaker: ${item.name}`);
        break;
      }

      case 'add_soft_preference': {
        const text = String(input.text ?? '').trim().slice(0, 200);
        if (!text) { fail('empty'); break; }
        await addConstraint(me.id, 'other', { text });
        s.myConstraints.push({ id: '', participant_id: me.id, kind: 'other', value: { text } });
        ok(`soft preference noted: ${text}`);
        break;
      }

      case 'remove_soft_preference': {
        const prefs = s.myConstraints.flatMap((c) => (c.kind === 'other' ? [c.value.text] : []));
        const match = matchSoftPreference(prefs, String(input.text ?? ''));
        if (!match) {
          fail(prefs.length ? `no single match; their soft preferences are: ${prefs.map((p) => `"${p}"`).join(', ')}` : 'they have no soft preferences');
          break;
        }
        await deleteSoftPreference(me.id, match);
        s.myConstraints = s.myConstraints.filter((c) => !(c.kind === 'other' && c.value.text === match));
        changed = true;
        ok(`dropped soft preference: ${match}`);
        break;
      }

      case 'done_with_limits':
        await setFlags(me.id, { limits_answered: true });
        s.flags.limits_answered = true;
        ok('limits question answered');
        break;

      case 'finish_intake': {
        const missing = missingSteps(s);
        if (missing.length) { fail(`not done yet, still missing: ${missing.map((m) => (m.step === 'values' ? `${m.item.name} (${m.outcomes.join(', ')})` : m.step)).join('; ')}`); break; }
        await setIntakeDone(me.id, true);
        out.finished = true;
        ok('intake complete');
        break;
      }

      case 'try_again': {
        if (!changed && !s.flags.changed_since_ask) { fail('nothing has changed yet, so a new search would give the same result'); break; }
        out.tryAgain = true;
        ok('will look for a new deal');
        break;
      }

      default:
        fail('unknown tool');
    }
  }

  if (changed && s.me.status === 'needs_relaxation' && !out.tryAgain) {
    await setFlags(me.id, { changed_since_ask: true });
    s.flags.changed_since_ask = true;
  }
  return out;
}
