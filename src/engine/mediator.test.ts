// Mediator vs. the checked numbers in AGENTS.md section 8, plus the both-move-out path.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  demoConstraints, demoDeposits, demoIds, demoItems, demoParticipants, demoValuations,
} from '../shared/demoScenario.ts';
import type { Item, Valuation } from '../shared/types.ts';
import { candidates, type MediatorInput, type MoveOutWindow } from './mediator.ts';

const { ALEX, SAM, APT, BISCUIT, COUCH, TV, SPOTIFY } = demoIds;

// Only what the mediator may see: no caps, no dealbreakers.
const windows: Record<string, MoveOutWindow> = {};
for (const c of demoConstraints) if (c.kind === 'move_out_window') windows[c.participant_id] = c.value;

const demo: MediatorInput = {
  a: demoParticipants.find((p) => p.role === 'A')!.id,
  b: demoParticipants.find((p) => p.role === 'B')!.id,
  items: demoItems,
  valuations: demoValuations,
  deposits: demoDeposits,
  windows,
};

const take = <T>(gen: Generator<T>, n: number): T[] => {
  const out: T[] = [];
  for (const x of gen) {
    if (out.length === n) break;
    out.push(x);
  }
  return out;
};

test('round 1: best total value, $865 buyout + $750 deposit = $1,615', () => {
  const [round1] = take(candidates(demo), 1);
  assert.deepEqual(round1!.allocation, {
    [APT]: { to: ALEX, weekends: null },
    [BISCUIT]: { to: ALEX, weekends: SAM },
    [COUCH]: { to: SAM, weekends: null },
    [TV]: { to: ALEX, weekends: null },
    [SPOTIFY]: { to: null, weekends: null },
  });
  assert.deepEqual(round1!.transfer, {
    from: ALEX, to: SAM, buyout_cents: 86500, deposit_cents: 75000, total_cents: 161500, deposit_split: null,
  });
  assert.equal(round1!.moveOutDate, '2026-11-30');
  assert.deepEqual(round1!.math.fairShare, { [ALEX]: 142500, [SAM]: 115500 });
  assert.equal(round1!.math.totalValue, 310000);
});

test('round 2: TV moves to Sam, $640 buyout + $750 deposit = $1,390, surplus $470', () => {
  const [, round2] = take(candidates(demo), 2);
  assert.deepEqual(round2!.allocation, {
    [APT]: { to: ALEX, weekends: null },
    [BISCUIT]: { to: ALEX, weekends: SAM },
    [COUCH]: { to: SAM, weekends: null },
    [TV]: { to: SAM, weekends: null },
    [SPOTIFY]: { to: null, weekends: null },
  });
  assert.deepEqual(round2!.transfer, {
    from: ALEX, to: SAM, buyout_cents: 64000, deposit_cents: 75000, total_cents: 139000, deposit_split: null,
  });
  assert.equal(round2!.moveOutDate, '2026-11-30');
  assert.deepEqual(round2!.math.received, { [ALEX]: 230000, [SAM]: 75000 });
  assert.equal(round2!.math.surplus, 47000);
  assert.equal(round2!.math.totalValue, 305000);
});

test('later rounds never offer a $0 Spotify swap, and keep going down in total value', () => {
  const rounds = take(candidates(demo), 5);
  assert.equal(rounds.length, 5);
  for (const r of rounds) assert.deepEqual(r.allocation[SPOTIFY], { to: null, weekends: null });
  // Round 3 is the next-smallest loss: the apartment goes to Sam (-$90).
  assert.equal(rounds[2]!.allocation[APT]!.to, SAM);
  for (let i = 1; i < rounds.length; i++) {
    assert.ok(rounds[i]!.math.totalValue <= rounds[i - 1]!.math.totalValue);
  }
});

test('Knaster: both people end the same amount above their fair share (deposit excluded)', () => {
  for (const r of take(candidates(demo), 5)) {
    const toSam = r.transfer.from === ALEX ? r.transfer.buyout_cents : -r.transfer.buyout_cents;
    const alexAbove = r.math.received[ALEX]! - toSam - r.math.fairShare[ALEX]!;
    const samAbove = r.math.received[SAM]! + toSam - r.math.fairShare[SAM]!;
    assert.ok(Math.abs(alexAbove - samAbove) <= 1, `${alexAbove} vs ${samAbove}`);
    assert.ok(Math.abs(alexAbove - r.math.surplus / 2) <= 1);
  }
});

test('no overlap in move-out windows: no candidates', () => {
  const noOverlap = {
    ...demo,
    windows: { ...windows, [SAM]: { earliest: '2026-10-01', latest: '2026-11-10' } },
  };
  assert.equal(take(candidates(noOverlap), 1).length, 0);
});

test('both move out: fee goes to whoever minds it least, deposit refund split by contribution', () => {
  const A = 'a', B = 'b', LEASE = 'lease', FEE = 'fee', COUCH2 = 'couch';
  const item = (id: string, kind: Item['kind'], amount_cents: number | null = null): Item =>
    ({ id, case_id: 'c', name: id, kind, added_by: A, amount_cents });
  const v = (participant_id: string, item_id: string, outcome: Valuation['outcome'], dollars: number): Valuation =>
    ({ participant_id, item_id, outcome, value_cents: dollars * 100 });

  const [best] = take(candidates({
    a: A,
    b: B,
    items: [item(LEASE, 'lease'), item(FEE, 'lease_break_fee', 60000), item(COUCH2, 'item')],
    // Neither wants to stay. B would take on the $600 fee for $300; A gave no number, so it defaults to -$600.
    valuations: [
      v(A, LEASE, 'keep', -500), v(B, LEASE, 'keep', -450),
      v(B, FEE, 'pay', -300),
      v(A, COUCH2, 'keep', 300), v(B, COUCH2, 'keep', 100),
    ],
    deposits: [
      { case_id: 'c', participant_id: A, amount_cents: 60000 },
      { case_id: 'c', participant_id: B, amount_cents: 40000 },
    ],
    windows: {
      [A]: { earliest: '2026-12-01', latest: '2026-12-31' },
      [B]: { earliest: '2026-11-15', latest: '2026-12-15' },
    },
  }), 1);

  assert.deepEqual(best!.allocation, {
    [LEASE]: { to: null, weekends: null },
    [FEE]: { to: B, weekends: null },
    [COUCH2]: { to: A, weekends: null },
  });
  // F_A = (-500 + 300) / 2 = -100, F_B = (-450 + 100) / 2 = -175.
  // E_A = 300 - (-100) = 400, E_B = -300 - (-175) = -125, buyout = (400 + 125) / 2 = $262.50.
  assert.deepEqual(best!.transfer, {
    from: A, to: B, buyout_cents: 26250, deposit_cents: 0, total_cents: 26250,
    deposit_split: { [A]: 0.6, [B]: 0.4 },
  });
  assert.equal(best!.moveOutDate, '2026-12-15');
});
