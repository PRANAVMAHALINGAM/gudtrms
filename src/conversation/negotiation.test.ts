import assert from 'node:assert/strict';
import { test } from 'node:test';
import { relaxationText } from './negotiation.ts';

test('relaxation asks are private, specific, and say it is fine to decline', () => {
  const cap = relaxationText({ kind: 'max_payment', suggestedCents: 161500 });
  assert.equal(cap, 'Nothing fits yet. Would you go up to $1,615 in total? Totally fine to say no. Nobody will know you were asked.');
  assert.match(relaxationText({ kind: 'move_out_window', suggestedLatest: '2026-12-14' }), /as late as Dec 14\?/);
  assert.match(relaxationText({ kind: 'must_keep', itemId: 'x' }, 'Biscuit'), /end up with Biscuit/);
});

test('whoever has nothing to relax still hears something, so neither side is singled out', () => {
  const text = relaxationText(null);
  assert.match(text, /Nothing fits yet/);
  assert.doesNotMatch(text, /\$|\d/, 'no numbers at all');
});
