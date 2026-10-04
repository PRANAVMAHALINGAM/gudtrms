import assert from 'node:assert/strict';
import { test } from 'node:test';
import { amountsIn, datesIn, emptySets, findLeak, type NumberSets } from './leaks.ts';

test('dollar amounts in the ways people write them', () => {
  assert.deepEqual(amountsIn('$1,500'), [150000]);
  assert.deepEqual(amountsIn('1500 dollars'), [150000]);
  assert.deepEqual(amountsIn('1.5k'), [150000]);
  assert.deepEqual(amountsIn('$1.5k'), [150000]);
  assert.deepEqual(amountsIn('300 bucks and $12.50'), [30000, 1250]);
  assert.deepEqual(amountsIn('round 2, item 3, 50% of it'), [], 'bare small numbers are not money');
});

test('dates in the ways people write them', () => {
  assert.deepEqual(datesIn('by Nov 30'), ['11-30']);
  assert.deepEqual(datesIn('the 30th of November'), ['11-30']);
  assert.deepEqual(datesIn('December 31st'), ['12-31']);
  assert.deepEqual(datesIn('11/30 or 2026-12-31'), ['12-31', '11-30']);
  assert.deepEqual(datesIn('you may want to'), []);
});

// Sam is the recipient; Alex's private numbers are forbidden.
const alexPrivate: NumberSets = {
  cents: new Set([150000, 90000, 80000, 30000, 20000, 25000, 160000]),
  dates: new Set(['11-15', '12-31']),
};
const allowedForSam = (): NumberSets => {
  const s = emptySets();
  // Sam's own values, the deposits, and the agreement's numbers.
  for (const c of [141000, 40000, 35000, 25000, 30000, 20000, 75000, 64000, 139000, 161500, 86500]) s.cents.add(c);
  for (const d of ['11-01', '11-30']) s.dates.add(d);
  return s;
};

test("the other person's private numbers are blocked", () => {
  assert.equal(findLeak('Alex could go up to $1,600.', alexPrivate, allowedForSam()), 'amount');
  assert.equal(findLeak('They value the apartment at 1.5k', alexPrivate, allowedForSam()), 'amount');
  assert.equal(findLeak("They can't stay past December 31st.", alexPrivate, allowedForSam()), 'date');
  assert.equal(findLeak('Biscuit full-time is worth $900 to them', alexPrivate, allowedForSam()), 'amount');
});

test('own numbers, shared facts and agreement terms go through', () => {
  assert.equal(findLeak('Alex pays Sam $640 as a buyout. Total: $1,390. Out by Nov 30.', alexPrivate, allowedForSam()), null);
  assert.equal(findLeak('You said the couch is worth $300 to you.', alexPrivate, allowedForSam()), null, '$300 is Sam\'s own too');
  assert.equal(findLeak('Would you go up to $1,615 in total?', alexPrivate, allowedForSam()), null);
  assert.equal(findLeak('Spotify is $0 to you', alexPrivate, allowedForSam()), null, '$0 never counts');
  assert.equal(findLeak('Round 2 is ready.', alexPrivate, allowedForSam()), null);
});
