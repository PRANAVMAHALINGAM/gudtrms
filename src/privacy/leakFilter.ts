// Leak filter (owner: Pranav). AGENTS.md section 6, "Leak filter"; privacy rule 5.
//   1. Number/date match (code): block any dollar amount or date that is one of the OTHER person's private
//      values, unless it's also allowed (the recipient's own numbers, shared facts, anything already in a
//      proposal or agreement of this case, anything the recipient said themselves).
//   2. LLM yes/no (agent replies only): does the message claim or hint anything about the other person's
//      private data? The checker sees only the outgoing message, never the other person's data, so no
//      prompt ever holds both people's private data (rule 1). An unclear answer counts as a leak.
//   3. Every block goes to leak_events with a reason. Never the blocked text, never the matched value.

import { query } from '../db/client.ts';
import { llm, withUsage } from '../llm/index.ts';
import type { Constraint, Proposal, Uuid } from '../shared/types.ts';
import { addText, emptySets, findLeak, monthDay, type NumberSets } from './leaks.ts';

export interface Recipient {
  id: Uuid;
  case_id: Uuid;
  role: 'A' | 'B';
  display_name: string | null;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

/** The other person's private amounts/dates (forbidden) and what the recipient may see anyway (allowed). */
async function numberSets(r: Recipient): Promise<{ forbidden: NumberSets; allowed: NumberSets }> {
  const [vals, cons, deposits, fees, proposals, agreements, said] = await Promise.all([
    query<{ participant_id: Uuid; value_cents: number }>(
      'select v.participant_id, v.value_cents from valuations v join participants p on p.id = v.participant_id where p.case_id = $1',
      [r.case_id]),
    query<Constraint>(
      'select c.id, c.participant_id, c.kind, c.value from constraints c join participants p on p.id = c.participant_id where p.case_id = $1',
      [r.case_id]),
    query<{ amount_cents: number }>('select amount_cents from deposit_contributions where case_id = $1', [r.case_id]),
    query<{ amount_cents: number | null }>('select amount_cents from items where case_id = $1 and amount_cents is not null', [r.case_id]),
    query<Pick<Proposal, 'transfer' | 'move_out_date'>>('select transfer, move_out_date from proposals where case_id = $1', [r.case_id]),
    query<{ text: string }>('select text from agreements where case_id = $1', [r.case_id]),
    query<{ text: string }>(`select text from chat_messages where participant_id = $1 and role = 'user'`, [r.id]),
  ]);

  const forbidden = emptySets();
  const allowed = emptySets();
  const side = (pid: Uuid) => (pid === r.id ? allowed : forbidden);

  for (const v of vals) side(v.participant_id).cents.add(Math.abs(v.value_cents));
  for (const c of cons) {
    if (c.kind === 'max_payment_cents') side(c.participant_id).cents.add(c.value.cents);
    if (c.kind === 'move_out_window') {
      side(c.participant_id).dates.add(monthDay(c.value.earliest));
      side(c.participant_id).dates.add(monthDay(c.value.latest));
    }
  }
  // Shared facts and everything that already crossed by design.
  for (const d of deposits) allowed.cents.add(d.amount_cents);
  for (const f of fees) if (f.amount_cents) allowed.cents.add(f.amount_cents);
  for (const p of proposals) {
    for (const c of [p.transfer.buyout_cents, p.transfer.deposit_cents, p.transfer.total_cents]) allowed.cents.add(Math.abs(c));
    allowed.dates.add(monthDay(p.move_out_date));
  }
  for (const a of agreements) addText(allowed, a.text);
  for (const m of said) addText(allowed, m.text);
  return { forbidden, allowed };
}

/**
 * The LLM leak checker's prompt. It holds the outgoing message, the recipient's OWN answers (so a recap of
 * them reads as fine), and shared facts. Never the ex's data (rule 1). Exported so it can be inspected.
 */
export async function buildCheckerPrompt(r: Recipient, exName: string, text: string): Promise<{ system: string; question: string }> {
  const me = r.display_name ?? 'the recipient';
  const [agreements, vals, cons, flagRows] = await Promise.all([
    query<{ text: string }>('select text from agreements where case_id = $1 order by created_at desc limit 1', [r.case_id]),
    query<{ name: string; kind: string; outcome: string; value_cents: number }>(
      'select i.name, i.kind, v.outcome, v.value_cents from valuations v join items i on i.id = v.item_id where v.participant_id = $1',
      [r.id]),
    query<Constraint>('select id, participant_id, kind, value from constraints where participant_id = $1', [r.id]),
    query<{ flags: { cap_answered?: boolean; limits_answered?: boolean } }>('select flags from chat_state where participant_id = $1', [r.id]),
  ]);
  const flags = flagRows[0]?.flags ?? {};
  const money = (c: number) => `$${(Math.abs(c) / 100).toLocaleString('en-US')}`;
  const what = (v: { name: string; kind: string; outcome: string }) =>
    v.outcome === 'full' ? `${v.name} living with ${me} full-time`
      : v.outcome === 'primary' ? `${v.name} living with ${me}, with ${exName} every other weekend`
        : v.outcome === 'visits' ? `${v.name} living with ${exName}, with ${me} every other weekend`
          : v.outcome === 'pay' ? `${me} covering the lease-break fee`
            : v.kind === 'lease' ? `${me} staying in the apartment` : `${me} keeping the ${v.name}`;
  const own = [
    ...vals.map((v) => `${what(v)}: ${money(v.value_cents)}`),
    ...cons.flatMap((c) =>
      c.kind === 'max_payment_cents' ? [`the most ${me} could pay: ${money(c.value.cents)}`]
        : c.kind === 'move_out_window' ? [`${me}'s move-out window: ${c.value.earliest} to ${c.value.latest}`]
          : c.kind === 'other' ? [`${me}'s preference: ${c.value.text}`] : [`one of ${me}'s dealbreakers`]),
    ...(flags.cap_answered && !cons.some((c) => c.kind === 'max_payment_cents') ? [`${me} has no payment limit`] : []),
    ...(flags.limits_answered && !cons.some((c) => c.kind === 'must_keep_item') ? [`${me} has no dealbreakers`] : []),
  ];

  const system = [
    `You check text messages before gudtrms sends them. gudtrms helps ${me} and ${exName} split up their shared stuff; each talks to their own private agent.`,
    `The message below is going to ${me}. Block it only if it reveals or guesses ${exName}'s PRIVATE information:`,
    `what ${exName} thinks things are worth, how much ${exName} could pay, ${exName}'s move-out dates, ${exName}'s dealbreakers or preferences, ` +
      `what ${exName} told their agent, or why a deal came out the way it did because of ${exName}'s limits.`,
    '',
    `Everything else is fine. In particular, these are fine:`,
    `- ${me}'s own answers said back to ${me}, including ones that describe an arrangement involving ${exName} (that is ${me}'s answer, not ${exName}'s wish)`,
    `- how much ${exName} paid toward the security deposit, and the lease-break fee (shared with both on purpose)`,
    '- item names, the terms of the agreement, and process updates ("they joined", "they haven\'t confirmed yet", "I can\'t promise anything")',
    '',
    `${me}'s own answers so far:`,
    ...(own.length ? own.map((o) => `- ${o}`) : ['- none yet']),
    ...(agreements[0] ? ['', 'Agreement already sent to both:', agreements[0].text] : []),
    '',
    'Examples:',
    `- "Got it: ${money(35000)} if Biscuit lives with you and ${exName} has him every other weekend." -> NO (${me}'s own answer)`,
    `- "${exName} says they paid ${money(75000)} toward the deposit. Does that sound right?" -> NO (shared fact)`,
    `- "${exName} hasn't confirmed yet. I'll let you know." -> NO (process update)`,
    `- "${exName} can't go above ${money(160000)}." -> YES (${exName}'s limit)`,
    `- "${exName} really wants to keep Biscuit." -> YES (${exName}'s preference)`,
    `- "I doubt ${exName} will budge on the couch." -> YES (guess about ${exName})`,
  ].join('\n');
  const question = `Message to ${me}:\n"""\n${text}\n"""\nDoes it reveal or guess ${exName}'s private information?`;
  return { system, question };
}

async function llmSaysLeak(r: Recipient, exName: string, text: string): Promise<boolean> {
  if ((process.env.LEAK_LLM_CHECK ?? 'on').trim().toLowerCase() === 'off') return false;
  try {
    const { system, question } = await buildCheckerPrompt(r, exName, text);
    // A sentence or two of reasoning before the verdict makes it far more accurate than a bare YES/NO.
    const result = await withUsage({ caseId: r.case_id, purpose: 'leak_check' }, () => llm().chat({
      system: `${system}\n\nThink it through in one or two sentences, then end with a final line: VERDICT: YES (it leaks) or VERDICT: NO.`,
      turns: [{ role: 'user', text: question }],
      effort: process.env.LEAK_LLM_EFFORT === 'low' ? 'low' : 'medium',
      maxTokens: 4000,
    }));
    const verdicts = [...result.text.matchAll(/VERDICT:\s*(YES|NO)\b/gi)];
    const last = verdicts.at(-1)?.[1]?.toUpperCase();
    return result.refused || last !== 'NO'; // yes, refused, or unclear: block (fail closed)
  } catch (err) {
    console.error('[leak filter] LLM check failed, blocking to be safe:', err instanceof Error ? err.message : err);
    return true;
  }
}

/** Checks one outbound message. `llm` adds the yes/no check (for LLM-written replies). */
export async function checkOutbound(r: Recipient, text: string, opts: { llm: boolean }): Promise<Verdict> {
  const [other] = await query<{ role: string; display_name: string | null }>(
    'select role, display_name from participants where case_id = $1 and id <> $2', [r.case_id, r.id]);
  const exName = other?.display_name ?? 'their ex';

  const { forbidden, allowed } = await numberSets(r);
  const hit = findLeak(text, forbidden, allowed);
  if (hit) return { ok: false, reason: `BLOCKED: message to ${r.role} had one of ${other?.role ?? 'the other side'}'s private ${hit === 'amount' ? 'amounts' : 'dates'} (number check)` };

  if (opts.llm && (await llmSaysLeak(r, exName, text))) {
    return { ok: false, reason: `BLOCKED: message to ${r.role} said something about ${other?.role ?? 'the other side'}'s private data (LLM check)` };
  }
  return { ok: true };
}

/**
 * Records a block for the judge view and the team. The reason only, never the message.
 * LEAK_DEBUG=1 also prints the blocked text to the console: for tuning on fake data ONLY (privacy rule 6).
 */
export async function logLeak(r: Recipient, reason: string, text?: string): Promise<void> {
  if (process.env.LEAK_DEBUG === '1' && text) console.log(`[leak filter debug] ${reason}\n  ${text.replace(/\n/g, ' / ')}`);
  await query('insert into leak_events (case_id, target_participant_id, reason) values ($1, $2, $3)', [r.case_id, r.id, reason]);
}
