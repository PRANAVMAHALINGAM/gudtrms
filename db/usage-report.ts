// `npm run usage -- 4F7K`: what one case cost in Claude calls, split by chat agents, leak filter, and
// advocates. With no code: every case with usage today, newest first. Reads llm_usage (src/llm/usage.ts).

import { closePool, query } from '../src/db/client.ts';

const code = (process.argv[2] ?? '').trim().toUpperCase();

interface Row { code: string | null; purpose: string; calls: number; tokens: number; cost: number | null; unpriced: number }

const rows = await query<Row>(
  `select c.code, u.purpose, count(*)::int as calls,
          sum(u.input_tokens + u.output_tokens + u.cache_write_tokens + u.cache_read_tokens)::int as tokens,
          sum(u.cost_usd) as cost, count(*) filter (where u.cost_usd is null)::int as unpriced
   from llm_usage u left join cases c on c.id = u.case_id
   where ${code ? 'c.code = $1' : `u.created_at >= date_trunc('day', now())`}
   group by c.code, u.purpose
   order by max(u.created_at) desc, u.purpose`,
  code ? [code] : [],
);

const LABEL: Record<string, string> = { chat: 'Chat agents', leak_check: 'Leak filter', advocate: 'Advocates', other: 'Other' };
const money = (n: number) => `$${n.toFixed(n >= 0.1 ? 2 : 4)}`;

if (!rows.length) console.log(code ? `No Claude calls recorded for case ${code}.` : 'No Claude calls recorded today.');
for (const caseCode of [...new Set(rows.map((r) => r.code))]) {
  const mine = rows.filter((r) => r.code === caseCode);
  const total = mine.reduce((t, r) => t + Number(r.cost ?? 0), 0);
  const calls = mine.reduce((t, r) => t + r.calls, 0);
  console.log(`\n${caseCode ? `Case ${caseCode}` : 'Outside any case'}: ${money(total)} · ${calls} Claude calls`);
  for (const r of mine) {
    const note = r.unpriced ? ` (${r.unpriced} calls on a model with no price in usage.ts)` : '';
    console.log(`  ${(LABEL[r.purpose] ?? r.purpose).padEnd(12)} ${money(Number(r.cost ?? 0)).padStart(8)}  ${String(r.calls).padStart(4)} calls  ${r.tokens.toLocaleString('en-US')} tokens${note}`);
  }
}
await closePool();
