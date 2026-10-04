// `npm run advocate:check`: runs both LLM advocates on the section 8 demo rounds (fake data, no
// database) and prints what each decided, its note, and whether the LLM, the veto, or the fallback
// decided. Use it after changing the advocate prompt. A handful of small LLM calls.
// Expected: round 1 Alex REJECT, Sam ACCEPT; round 2 both ACCEPT; Sam's rogue question collected.

import { demoConstraints, demoDeposits, demoIds, demoItems, demoValuations } from '../shared/demoScenario.ts';
import type { AdvocateView, ProposalTerms } from './advocate.ts';
import { decideAsAgent, type AgentDecision } from './advocateAgent.ts';
import { candidates, type MoveOutWindow } from './mediator.ts';

const { ALEX, SAM } = demoIds;
const view = (me: string): AdvocateView => ({
  me,
  items: demoItems,
  valuations: demoValuations.filter((v) => v.participant_id === me),
  constraints: demoConstraints.filter((c) => c.participant_id === me),
});
const windows: Record<string, MoveOutWindow> = {};
for (const c of demoConstraints) if (c.kind === 'move_out_window') windows[c.participant_id] = c.value;
const gen = candidates({ a: ALEX, b: SAM, items: demoItems, valuations: demoValuations, deposits: demoDeposits, windows });
const rounds = [gen.next().value!, gen.next().value!]
  .map((c): ProposalTerms => ({ allocation: c.allocation, transfer: c.transfer, move_out_date: c.moveOutDate }));
const expected = [['reject', 'accept'], ['accept', 'accept']];

let ok = true;
for (const [r, terms] of rounds.entries()) {
  const started = Date.now();
  const [alex, sam] = await Promise.all([
    decideAsAgent(view(ALEX), terms, { meName: 'Alex', otherName: 'Sam', otherId: SAM, rogue: false }, { mode: 'llm' }),
    decideAsAgent(view(SAM), terms, { meName: 'Sam', otherName: 'Alex', otherId: ALEX, rogue: r === 0 }, { mode: 'llm' }),
  ]);
  console.log(`Round ${r + 1} (${Date.now() - started}ms)`);
  for (const [name, d, want] of [['Alex', alex, expected[r]![0]], ['Sam', sam, expected[r]![1]]] as [string, AgentDecision, string][]) {
    for (const a of d.attempts) console.log(`  ${name} tried to send: "${a}"`);
    console.log(`  ${name} [${d.via}] ${d.note}`);
    if (d.decision !== want) { ok = false; console.log(`  !! expected ${want.toUpperCase()}`); }
    if (d.via === 'fallback') ok = false;
  }
}
console.log(ok ? '[advocate:check] OK' : '[advocate:check] something looks off, see above');
process.exit(ok ? 0 : 1);
