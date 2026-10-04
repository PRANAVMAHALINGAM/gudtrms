import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDate, formatMoney, renderAgreement } from './agreement.ts';

test('money and dates are formatted like the AGENTS.md examples', () => {
  assert.equal(formatMoney(139000), '$1,390');
  assert.equal(formatMoney(-64000), '$640');
  assert.equal(formatMoney(12345), '$123.45');
  assert.equal(formatDate('2026-11-30'), 'Nov 30');
  assert.equal(formatDate('2026-12-01'), 'Dec 1');
});

test('the demo round-2 deal renders exactly as the section 5 example', () => {
  const text = renderAgreement({
    code: '4F7K',
    people: [
      { id: 'alex', role: 'A', display_name: 'Alex' },
      { id: 'sam', role: 'B', display_name: 'Sam' },
    ],
    items: [
      { id: 'apt', name: 'Apartment (lease)', kind: 'lease', amount_cents: null },
      { id: 'biscuit', name: 'Biscuit', kind: 'pet', amount_cents: null },
      { id: 'couch', name: 'Couch', kind: 'item', amount_cents: null },
      { id: 'tv', name: 'TV', kind: 'item', amount_cents: null },
      { id: 'spotify', name: 'Spotify', kind: 'subscription', amount_cents: null },
    ],
    proposal: {
      allocation: {
        apt: { to: 'alex', weekends: null },
        biscuit: { to: 'alex', weekends: 'sam' },
        couch: { to: 'sam', weekends: null },
        tv: { to: 'sam', weekends: null },
        spotify: { to: null, weekends: null },
      },
      transfer: { from: 'alex', to: 'sam', buyout_cents: 64000, deposit_cents: 75000, total_cents: 139000, deposit_split: null },
      move_out_date: '2026-11-30',
    },
  });
  assert.equal(
    text,
    [
      'gudtrms agreement · Case 4F7K',
      '',
      '- Alex keeps the apartment and the lease. Sam moves out by Nov 30.',
      '- Alex pays Sam $640 as a buyout.',
      "- The deposit stays with the landlord under Alex's lease, so Alex pays Sam back Sam's $750 share.",
      '- Total: Alex pays Sam $1,390.',
      '- Sam keeps the couch and the TV.',
      '- Biscuit lives with Alex. Sam has Biscuit every other weekend.',
      '- Spotify gets cancelled.',
      '',
      'Reply YES to confirm.',
    ].join('\n'),
  );
});

test('both moving out: fee, buyout, deposit split, no total line', () => {
  const text = renderAgreement({
    code: '9QJ2',
    people: [
      { id: 'riley', role: 'A', display_name: 'Riley' },
      { id: 'jordan', role: 'B', display_name: 'Jordan' },
    ],
    items: [
      { id: 'apt', name: 'Apartment (lease)', kind: 'lease', amount_cents: null },
      { id: 'fee', name: 'Lease-break fee', kind: 'lease_break_fee', amount_cents: 60000 },
      { id: 'couch', name: 'Couch', kind: 'item', amount_cents: null },
      { id: 'tv', name: 'TV', kind: 'item', amount_cents: null },
      { id: 'shelf', name: 'Bookshelf', kind: 'item', amount_cents: null },
      { id: 'net', name: 'Internet', kind: 'subscription', amount_cents: null },
    ],
    proposal: {
      allocation: {
        apt: { to: null, weekends: null },
        fee: { to: 'riley', weekends: null },
        couch: { to: 'jordan', weekends: null },
        tv: { to: 'riley', weekends: null },
        shelf: { to: 'riley', weekends: null },
        net: { to: 'jordan', weekends: null },
      },
      // Buyout runs against the from -> to direction here: Jordan pays Riley.
      transfer: {
        from: 'riley', to: 'jordan', buyout_cents: -22000, deposit_cents: 0, total_cents: 22000,
        deposit_split: { riley: 0.4, jordan: 0.6 },
      },
      move_out_date: '2026-12-15',
    },
  });
  assert.equal(
    text,
    [
      'gudtrms agreement · Case 9QJ2',
      '',
      '- You both move out by Dec 15.',
      '- Riley pays the landlord the $600 lease-break fee.',
      '- Jordan pays Riley $220 as a buyout.',
      '- Security deposit: when the landlord returns it, Jordan gets 60% and Riley gets 40% (any deductions are shared the same way). Whoever receives it sends the other their share.',
      '- Riley keeps the TV and the bookshelf.',
      '- Jordan keeps the couch.',
      '- Jordan keeps Internet and takes over the bill from Dec 15.',
      '',
      'Reply YES to confirm.',
    ].join('\n'),
  );
});
