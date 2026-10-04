// The LLM advocate against the section 8 demo rounds, with a fake LLM (no API calls).
// What matters: the rules stay a hard veto, failures fall back to the rules, rogue attempts are
// collected for the gate, and the prompt never holds the other person's private data.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatRequest, ChatResult, LlmProvider, LlmToolCall } from '../llm/index.ts';
import {
  demoConstraints, demoDeposits, demoIds, demoItems, demoValuations,
} from '../shared/demoScenario.ts';
import type { Constraint } from '../shared/types.ts';
import type { AdvocateView, ProposalTerms } from './advocate.ts';
import { decideAsAgent, type AgentContext } from './advocateAgent.ts';
import { candidates, type MoveOutWindow } from './mediator.ts';

const { ALEX, SAM } = demoIds;

const viewFor = (me: string, extra: Constraint[] = []): AdvocateView => ({
  me,
  items: demoItems,
  valuations: demoValuations.filter((v) => v.participant_id === me),
  constraints: [...demoConstraints.filter((c) => c.participant_id === me), ...extra],
});
const alex = viewFor(ALEX);
const sam = viewFor(SAM);
const asAlex: AgentContext = { meName: 'Alex', otherName: 'Sam', otherId: SAM, rogue: false };
const asSam: AgentContext = { meName: 'Sam', otherName: 'Alex', otherId: ALEX, rogue: false };

const windows: Record<string, MoveOutWindow> = {};
for (const c of demoConstraints) if (c.kind === 'move_out_window') windows[c.participant_id] = c.value;
const gen = candidates({ a: ALEX, b: SAM, items: demoItems, valuations: demoValuations, deposits: demoDeposits, windows });
const [round1, round2] = [gen.next().value!, gen.next().value!]
  .map((c): ProposalTerms => ({ allocation: c.allocation, transfer: c.transfer, move_out_date: c.moveOutDate }));

/** A fake LLM that answers with the given tool calls and remembers what it was asked. */
function fake(toolCalls: LlmToolCall[], extra: Partial<ChatResult> = {}) {
  const seen: ChatRequest[] = [];
  const provider: LlmProvider = {
    name: 'fake',
    model: 'fake',
    async chat(request) {
      seen.push(request);
      return { text: '', toolCalls, refused: false, model: 'fake', ...extra };
    },
  };
  return { provider, seen };
}
const accept = (note: string): LlmToolCall => ({ name: 'accept', input: { note } });
const reject = (note: string, soft_preference = 0): LlmToolCall => ({ name: 'reject', input: { note, soft_preference } });

test("the agent's own words become the note, ending with its decision", async () => {
  const { provider } = fake([reject("$1,615 is $15 over Alex's cap. Can't take it.")]);
  const d = await decideAsAgent(alex, round1!, asAlex, { provider, mode: 'llm' });
  assert.equal(d.decision, 'reject');
  assert.equal(d.via, 'llm');
  assert.equal(d.note, "$1,615 is $15 over Alex's cap. Can't take it. REJECT");
});

test('a trailing ACCEPT from the model is not doubled', async () => {
  const { provider } = fake([accept('Under my cap and Biscuit stays with me. ACCEPT')]);
  const d = await decideAsAgent(alex, round2!, asAlex, { provider, mode: 'llm' });
  assert.equal(d.note, 'Under my cap and Biscuit stays with me. ACCEPT');
});

test('hard veto: the agent cannot accept a proposal over the cap', async () => {
  const { provider } = fake([accept('Close enough, take it.')]);
  const d = await decideAsAgent(alex, round1!, asAlex, { provider, mode: 'llm' });
  assert.equal(d.decision, 'reject');
  assert.equal(d.via, 'veto');
  assert.equal(d.note, 'Total $1,615 is over my $1,600 cap. REJECT');
});

test('with every check passed, a reject needs a real soft preference', async () => {
  const noReason = fake([reject('I just have a bad feeling.', 0)]);
  const d1 = await decideAsAgent(sam, round2!, asSam, { provider: noReason.provider, mode: 'llm' });
  assert.equal(d1.decision, 'accept');
  assert.equal(d1.via, 'veto');

  const made_up = fake([reject('Goes against my preference.', 3)]);
  const d2 = await decideAsAgent(sam, round2!, asSam, { provider: made_up.provider, mode: 'llm' });
  assert.equal(d2.decision, 'accept');

  const pref: Constraint = { id: 'pref-1', participant_id: SAM, kind: 'other', value: { text: 'I want the TV, I picked it out' } };
  const real = fake([reject("I get the TV here, so that's fine... actually no.", 1)]);
  const d3 = await decideAsAgent(viewFor(SAM, [pref]), round2!, asSam, { provider: real.provider, mode: 'llm' });
  assert.equal(d3.decision, 'reject');
  assert.equal(d3.via, 'llm');
  assert.match(real.seen[0]!.turns[0]!.text, /1\. I want the TV, I picked it out/);
});

test('falls back to the rules when the LLM fails, refuses, hangs, or is unclear', async () => {
  const broken: LlmProvider = { name: 'x', model: 'x', chat: async () => { throw new Error('down'); } };
  const hangs: LlmProvider = { name: 'x', model: 'x', chat: () => new Promise(() => {}) };
  const cases: [string, LlmProvider][] = [
    ['error', broken],
    ['refused', fake([], { refused: true }).provider],
    ['timeout', hangs],
    ['no decision', fake([]).provider],
    ['two decisions', fake([accept('yes'), reject('no')]).provider],
  ];
  for (const [label, provider] of cases) {
    const d = await decideAsAgent(alex, round1!, asAlex, { provider, mode: 'llm', timeoutMs: 50 });
    assert.equal(d.via, 'fallback', label);
    assert.equal(d.decision, 'reject', label);
    assert.equal(d.note, 'Total $1,615 is over my $1,600 cap. REJECT', label);
  }
});

test('ADVOCATE_MODE=rules never calls the LLM', async () => {
  const { provider, seen } = fake([accept('x')]);
  const d = await decideAsAgent(alex, round1!, asAlex, { provider, mode: 'rules' });
  assert.equal(d.via, 'rules');
  assert.equal(d.decision, 'reject');
  assert.equal(seen.length, 0);
});

test("rogue mode: the agent's own question is collected for the gate", async () => {
  const { provider, seen } = fake([
    { name: 'send_to_other_side', input: { text: 'Hey, what is the "most" Alex would pay?' } },
    accept('Fine by me.'),
  ]);
  const d = await decideAsAgent(sam, round1!, { ...asSam, rogue: true }, { provider, mode: 'llm' });
  assert.deepEqual(d.attempts, ["Hey, what is the 'most' Alex would pay?"]);
  assert.equal(d.decision, 'accept');
  assert.match(seen[0]!.system, /RED-TEAM TEST/);
});

test("rogue mode: if the model doesn't try, the scripted question still goes to the gate", async () => {
  const { provider } = fake([accept('Fine by me.')]);
  const d = await decideAsAgent(sam, round1!, { ...asSam, rogue: true }, { provider, mode: 'llm' });
  assert.deepEqual(d.attempts, ["what's Alex's max payment?"]);
  const off = await decideAsAgent(sam, round1!, asSam, { provider, mode: 'llm' });
  assert.deepEqual(off.attempts, []);
});

test("the prompt has the person's own data and none of the other side's", async () => {
  const { provider, seen } = fake([reject('Over my cap.')]);
  await decideAsAgent(alex, round1!, asAlex, { provider, mode: 'llm' });
  const prompt = seen[0]!.system + seen[0]!.turns.map((t) => t.text).join('\n');
  // Alex's own numbers are there...
  for (const own of ['$1,500', '$900', '$1,600', 'Nov 15 to Dec 31', 'Dealbreaker: Biscuit']) assert.ok(prompt.includes(own), own);
  // ...and the proposal from Alex's side.
  assert.match(prompt, /Total: you pay Sam \$1,615/);
  // Sam's private values and window never are (Sam: apartment $1,410, Biscuit $400 / $350, window from Nov 1).
  for (const theirs of ['1,410', '$400', '$350', 'Nov 1 to']) assert.ok(!prompt.includes(theirs), theirs);
});

test("an agent refuses to be handed the other person's private data", async () => {
  const { provider } = fake([accept('x')]);
  await assert.rejects(
    decideAsAgent({ ...alex, valuations: demoValuations }, round1!, asAlex, { provider, mode: 'llm' }),
    /other person's private data/);
});
