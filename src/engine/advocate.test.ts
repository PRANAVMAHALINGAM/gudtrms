// Advocates vs. the demo rounds in AGENTS.md section 8: Alex rejects round 1 (over cap), both accept round 2.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  demoConstraints, demoDeposits, demoIds, demoItems, demoValuations,
} from '../shared/demoScenario.ts';
import { decide, relaxAsk, type AdvocateView, type ProposalTerms } from './advocate.ts';
import { candidates, type MoveOutWindow } from './mediator.ts';

const { ALEX, SAM, BISCUIT } = demoIds;

const viewFor = (me: string): AdvocateView => ({
  me,
  items: demoItems,
  valuations: demoValuations.filter((v) => v.participant_id === me),
  constraints: demoConstraints.filter((c) => c.participant_id === me),
});
const alex = viewFor(ALEX);
const sam = viewFor(SAM);

const windows: Record<string, MoveOutWindow> = {};
for (const c of demoConstraints) if (c.kind === 'move_out_window') windows[c.participant_id] = c.value;

const [round1, round2] = [...take(candidates({
  a: ALEX, b: SAM, items: demoItems, valuations: demoValuations, deposits: demoDeposits, windows,
}), 2)].map((c): ProposalTerms => ({ allocation: c.allocation, transfer: c.transfer, move_out_date: c.moveOutDate }));

function* take<T>(gen: Generator<T>, n: number): Generator<T> {
  for (const x of gen) {
    if (n-- <= 0) return;
    yield x;
  }
}

test('round 1: Alex rejects (over the $1,600 cap), Sam accepts', () => {
  const a = decide(alex, round1!);
  assert.equal(a.decision, 'reject');
  assert.equal(a.note, 'Total $1,615 is over my $1,600 cap. REJECT');

  const s = decide(sam, round1!);
  assert.equal(s.decision, 'accept');
  assert.equal(s.note, 'Nov 30 is inside my window. I get $1,415, above my $1,155 fair share. ACCEPT');
});

test('round 2: both accept', () => {
  const a = decide(alex, round2!);
  assert.equal(a.decision, 'accept');
  assert.equal(a.note,
    'Total $1,390 is under my $1,600 cap. Biscuit stays with me. Nov 30 is inside my window. '
    + 'I get $1,660, above my $1,425 fair share. ACCEPT');

  const s = decide(sam, round2!);
  assert.equal(s.decision, 'accept');
  assert.equal(s.note, 'Nov 30 is inside my window. I get $1,390, above my $1,155 fair share. ACCEPT');
});

test("dealbreaker: Alex rejects if Biscuit doesn't live with Alex", () => {
  const terms: ProposalTerms = {
    ...round2!,
    allocation: { ...round2!.allocation, [BISCUIT]: { to: SAM, weekends: ALEX } },
  };
  const a = decide(alex, terms);
  assert.equal(a.decision, 'reject');
  assert.match(a.note, /^Biscuit doesn't stay with me\./);
});

test('move-out date outside the window is a reject', () => {
  const s = decide(sam, { ...round2!, move_out_date: '2026-12-15' });
  assert.equal(s.decision, 'reject');
  assert.equal(s.note, 'Dec 15 is outside my window. REJECT');
});

test('relaxation: Alex is asked to go up to $1,615; Sam has nothing to relax', () => {
  assert.deepEqual(relaxAsk(alex, [round1!]), { kind: 'max_payment', suggestedCents: 161500 });
  assert.equal(relaxAsk(sam, [round1!]), null);
});

test("an advocate refuses to be handed the other person's private data", () => {
  assert.throws(() => decide({ ...alex, valuations: demoValuations }, round1!), /other person's private data/);
});
