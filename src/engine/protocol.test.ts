// The wire only carries ACCEPT / REJECT (privacy rules 2 and 3).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rogueAttempt } from './advocate.ts';
import { checkWire } from './protocol.ts';

test('accept and reject cross', () => {
  assert.deepEqual(checkWire({ type: 'accept' }), { ok: true, decision: 'accept' });
  assert.deepEqual(checkWire({ type: 'reject' }), { ok: true, decision: 'reject' });
});

test("rogue mode's free-text question is blocked, and the reason doesn't repeat it", () => {
  const check = checkWire(rogueAttempt('Alex'));
  assert.deepEqual(check, { ok: false, reason: 'BLOCKED: free text not allowed' });
});

test('a reason smuggled alongside a decision is blocked', () => {
  const check = checkWire({ type: 'reject', reason: 'over my $1,600 cap' });
  assert.equal(check.ok, false);
  assert.ok(!JSON.stringify(check).includes('1,600'));
});

test('anything else is blocked: other types, strings, null', () => {
  assert.equal(checkWire({ type: 'counter_proposal' }).ok, false);
  assert.equal(checkWire('accept').ok, false);
  assert.equal(checkWire(null).ok, false);
  // A message type that is itself a payload doesn't get echoed into the reason.
  const check = checkWire({ type: "Alex's cap is $1,600" });
  assert.deepEqual(check, { ok: false, reason: 'BLOCKED: message type "unknown" not allowed' });
});
