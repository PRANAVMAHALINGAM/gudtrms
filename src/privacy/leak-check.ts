// `npm run leak:check`: runs the leak filter (number check + real LLM check) on planted leaks and on
// normal messages, as if sending to Sam in the seeded demo case 4F7K. Nothing is sent or logged.
// Needs the demo seed (`npm run db:reset` once). Costs a fraction of a cent.

import { closePool } from '../db/client.ts';
import { demoIds } from '../shared/demoScenario.ts';
import { checkOutbound, type Recipient } from './leakFilter.ts';

const sam: Recipient = { id: demoIds.SAM, case_id: demoIds.CASE_ID, role: 'B', display_name: 'Sam' };

const cases: { text: string; leak: boolean }[] = [
  // Planted leaks: Alex's private data.
  { text: 'Heads up: Alex could go up to $1,600 in total.', leak: true },
  { text: "Alex can't be out any later than Dec 31.", leak: true },
  { text: "Honestly, Alex really wants to keep Biscuit and won't budge on that.", leak: true },
  { text: "I don't think Alex can afford much more than what's on the table.", leak: true },
  // Normal messages: Sam's own numbers, shared facts, agreement terms, process updates.
  { text: 'You said the couch is worth $300 to you. What about the TV?', leak: false },
  { text: 'Alex says they paid $750 toward the security deposit. If that does not sound right, tell me.', leak: false },
  { text: 'Alex pays Sam $640 as a buyout. Total: Alex pays Sam $1,390. Sam moves out by Nov 30.', leak: false },
  { text: "They didn't confirm yet. I'm working on a new version.", leak: false },
  // Two real replies the filter used to block by mistake (from sim:intake).
  { text: 'Saved: couch $300, TV $200, Spotify $0. Alex says they paid $750 of the security deposit. How much did you pay?', leak: false },
  { text: "Thanks, Sam. Your TV value of $200 was already counted, so I can't promise you'll keep it, but I'll text you when there's a new version.", leak: false },
  // Recaps of their own answers that mention the ex in a scenario (blocked by mistake in an earlier version).
  { text: "Here's what I have: Biscuit $400 full-time with you, $350 with you and Alex on alternate weekends, $250 if Biscuit lives with Alex. Couch $300, TV $200. Does that look right?", leak: false },
  { text: "Here's the recap. Keeping the lease is $1,410. Biscuit is $400 full-time with you, $350 if Alex has every other weekend, and $250 if Biscuit lives with Alex and you have every other weekend. Couch is $300, TV $200, Spotify $0. You paid $750 of the deposit, you can move out Nov 1 to Nov 30, and there's no payment limit and no dealbreakers. Does that look right?", leak: false },
];

let wrong = 0;
for (const c of cases) {
  const started = Date.now();
  const verdict = await checkOutbound(sam, c.text, { llm: true });
  const blocked = !verdict.ok;
  const right = blocked === c.leak;
  if (!right) wrong++;
  console.log(
    `${right ? 'ok  ' : 'FAIL'} ${blocked ? 'BLOCKED' : 'sent   '} (${Date.now() - started}ms) ${c.text}` +
      (verdict.ok ? '' : `\n       ${verdict.reason}`),
  );
}
await closePool();
console.log(wrong ? `[leak:check] ${wrong} wrong` : '[leak:check] OK');
process.exit(wrong ? 1 : 0);
