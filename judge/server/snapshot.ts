// Read-only snapshot of one case for the judge view (owner: Shruti). AGENTS.md section 8.
// This is the ONLY code allowed to read private data, and only because the demo uses fake data.
// Every poll runs inside one READ ONLY transaction, so it can't write even by mistake.
// Use JUDGE_DATABASE_URL for a read-only Postgres role if you have one; else DATABASE_URL.
// Never logs row contents.

import { neon, types } from '@neondatabase/serverless';

export interface Snapshot {
  source: 'live';
  case: { id: string; code: string; status: string } | null;
  participants: { id: string; role: 'A' | 'B'; display_name: string | null }[];
  items: { id: string; name: string; kind: string; amount_cents: number | null }[];
  valuations: { participant_id: string; item_id: string; outcome: string; value_cents: number }[];
  constraints: { id: string; participant_id: string; kind: string; value: unknown }[];
  deposits: { participant_id: string; amount_cents: number }[];
  proposals: { id: string; round: number; allocation: unknown; transfer: unknown; move_out_date: string; status: string; created_at: string }[];
  decisions: { proposal_id: string; participant_id: string; decision: 'accept' | 'reject'; created_at: string }[];
  notes: { proposal_id: string | null; participant_id: string; note: string; created_at: string }[];
  leaks: { id: string; target_participant_id: string | null; reason: string; created_at: string }[];
  /** Oldest first. More than one only if someone replied NO to an earlier one (its proposal is then `superseded`). */
  agreements: { id: string; proposal_id: string; text: string; a_confirmed: boolean; b_confirmed: boolean; created_at: string }[];
}

let sql: ReturnType<typeof neon> | undefined;

function db() {
  const url = process.env.JUDGE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('No DATABASE_URL in .env');
  // Keep dates and timestamps as strings (no timezone surprises); everything else parses as usual.
  const asText = new Set([types.builtins.DATE, types.builtins.TIMESTAMP, types.builtins.TIMESTAMPTZ]);
  sql ??= neon(url, {
    types: {
      getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
        asText.has(oid) ? (v: string) => v : types.getTypeParser(oid, format)) as never,
    },
  });
  return sql;
}

/** The case to show: the one with `code`, or else the one with the most recent activity. */
export async function snapshot(code?: string): Promise<Snapshot> {
  const q = db();
  const [found] = (await q.transaction([
    code
      ? q.query('select id, code, status from cases where code = $1', [code])
      : q.query(
        `select c.id, c.code, c.status from cases c
         left join proposals p on p.case_id = c.id
         group by c.id
         order by greatest(c.created_at, max(p.created_at)) desc nulls last
         limit 1`),
  ], { readOnly: true })) as [{ id: string; code: string; status: string }[]];

  const theCase = found?.[0];
  if (!theCase) {
    return { source: 'live', case: null, participants: [], items: [], valuations: [], constraints: [], deposits: [],
      proposals: [], decisions: [], notes: [], leaks: [], agreements: [] };
  }

  const id = theCase.id;
  const byParticipant = 'join participants p on p.id = t.participant_id where p.case_id = $1';
  const results = await q.transaction([
    q.query('select id, role, display_name from participants where case_id = $1', [id]),
    q.query('select id, name, kind, amount_cents from items where case_id = $1 order by created_at, id', [id]),
    q.query(`select t.participant_id, t.item_id, t.outcome, t.value_cents from valuations t ${byParticipant}`, [id]),
    q.query(`select t.id, t.participant_id, t.kind, t.value from constraints t ${byParticipant}`, [id]),
    q.query('select participant_id, amount_cents from deposit_contributions where case_id = $1', [id]),
    q.query(`select id, round, allocation, transfer, move_out_date, status, created_at from proposals
             where case_id = $1 order by round`, [id]),
    q.query(`select d.proposal_id, d.participant_id, d.decision, d.created_at from decisions d
             join proposals p on p.id = d.proposal_id where p.case_id = $1 order by d.created_at`, [id]),
    q.query(`select proposal_id, participant_id, note, created_at from advocate_notes
             where case_id = $1 order by created_at`, [id]),
    q.query(`select id, target_participant_id, reason, created_at from leak_events
             where case_id = $1 order by created_at`, [id]),
    q.query(`select id, proposal_id, text, a_confirmed, b_confirmed, created_at from agreements
             where case_id = $1 order by created_at`, [id]),
  ], { readOnly: true }) as unknown[][];

  const [participants, items, valuations, constraints, deposits, proposals, decisions, notes, leaks, agreements] = results;
  const json = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
  return {
    source: 'live',
    case: theCase,
    participants: participants as Snapshot['participants'],
    items: (items as Snapshot['items']).map((i) => ({ ...i, amount_cents: i.amount_cents === null ? null : Number(i.amount_cents) })),
    valuations: (valuations as Snapshot['valuations']).map((v) => ({ ...v, value_cents: Number(v.value_cents) })),
    constraints: (constraints as Snapshot['constraints']).map((c) => ({ ...c, value: json(c.value) })),
    deposits: (deposits as Snapshot['deposits']).map((d) => ({ ...d, amount_cents: Number(d.amount_cents) })),
    proposals: (proposals as Snapshot['proposals']).map((p) => ({
      ...p, round: Number(p.round), allocation: json(p.allocation), transfer: json(p.transfer),
    })),
    decisions: decisions as Snapshot['decisions'],
    notes: notes as Snapshot['notes'],
    leaks: leaks as Snapshot['leaks'],
    agreements: agreements as Snapshot['agreements'],
  };
}
