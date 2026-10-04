// `npm run sim:intake`: plays Alex and Sam through the REAL chat agent (Claude, costs a few cents),
// telling it the section 8 demo numbers in plain language. Then checks that:
//   - every value, the deposit, window, cap and dealbreaker landed in Neon exactly as in the demo
//   - each agent only wrote its own person's rows
//   - when both finished, negotiate() ran by itself and the section 5 agreement ($640 + $750 = $1,390) went out
// Uses fake handles +1555030xxxx and deletes its own rows before and after.

import assert from 'node:assert/strict';
import { closePool, query } from '../src/db/client.ts';
import { captureOutbound } from '../src/messaging/index.ts';
import { route } from '../src/router/index.ts';

process.env.DEMO_PACING_MS = '0';
const FAKE = '+1555030';
const ALEX = `${FAKE}0001`;
const SAM = `${FAKE}0002`;
const names: Record<string, string> = { [ALEX]: 'Alex', [SAM]: 'Sam' };

let outbox: { to: string; text: string }[] = [];
captureOutbound((to, text) => {
  outbox.push({ to, text });
});

async function cleanup() {
  await query(`delete from cases where id in (select case_id from participants where handle like $1)`, [`${FAKE}%`]);
}

async function say(from: string, text: string) {
  outbox = [];
  const started = Date.now();
  await route(from, text);
  console.log(`\n${names[from]} > ${text}   (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  for (const m of outbox) console.log(`  -> ${names[m.to] ?? m.to}: ${m.text.replace(/\n+/g, ' / ')}`);
  return outbox;
}

async function intakeDone(handle: string) {
  const [row] = await query<{ intake_done: boolean }>('select intake_done from participants where handle = $1', [handle]);
  return row?.intake_done ?? false;
}

/** Sends the script, then keeps confirming until the agent finishes intake (or gives up). */
async function play(handle: string, script: string[]) {
  for (const line of script) await say(handle, line);
  for (let i = 0; i < 4 && !(await intakeDone(handle)); i++) await say(handle, "Yes, that's all right. That's everything.");
  assert.ok(await intakeDone(handle), `${names[handle]}'s intake should be done`);
}

await cleanup();
try {
  await say(ALEX, 'start');
  await say(ALEX, 'Alex');
  await say(ALEX, 'Sam 555 030 0002');
  await say(SAM, 'JOIN');

  await play(ALEX, [
    'We share a couch, a TV, the apartment lease, our dog Biscuit, and our Spotify account. That is everything.',
    'Staying in the apartment is worth $1,500 to me.',
    'Biscuit full-time with me: $900. With me and Sam gets every other weekend: $800. With Sam and I get every other weekend: $300.',
    'Couch $200, TV $250, Spotify $0, I do not care about it.',
    'I paid $750 of the security deposit.',
    'I could be out any time from Nov 15 to Dec 31.',
    'The most I could pay Sam in total is $1,600.',
    'Biscuit has to live with me. Nothing else.',
  ]);
  await play(SAM, [
    "Same stuff: the couch, the TV, the lease, Biscuit and Spotify. That's all.",
    'Staying in the apartment is worth $1,410 to me.',
    'Biscuit full-time with me $400, with me and Alex every other weekend $350, with Alex and me every other weekend $250.',
    'Couch is worth $300 to me, TV $200, Spotify $0.',
    'I paid $750 of the deposit.',
    'I can move out between Nov 1 and Nov 30.',
    "No limit on what I'd pay. No dealbreakers.",
  ]);

  // What landed in Neon, per person, exactly as section 8.
  const rows = await query<{ who: string; item: string; kind: string; outcome: string; value_cents: number }>(
    `select p.display_name as who, i.name as item, i.kind, v.outcome, v.value_cents
     from valuations v join participants p on p.id = v.participant_id join items i on i.id = v.item_id
     where p.handle like $1`,
    [`${FAKE}%`],
  );
  const value = (who: string, kind: string, outcome: string, nameHint?: string) =>
    rows.find((r) => r.who === who && r.kind === kind && r.outcome === outcome && (!nameHint || r.item.toLowerCase().includes(nameHint)))?.value_cents;
  const expected: [string, string, string, string | undefined, number][] = [
    ['Alex', 'lease', 'keep', undefined, 150000], ['Sam', 'lease', 'keep', undefined, 141000],
    ['Alex', 'pet', 'full', undefined, 90000], ['Sam', 'pet', 'full', undefined, 40000],
    ['Alex', 'pet', 'primary', undefined, 80000], ['Sam', 'pet', 'primary', undefined, 35000],
    ['Alex', 'pet', 'visits', undefined, 30000], ['Sam', 'pet', 'visits', undefined, 25000],
    ['Alex', 'item', 'keep', 'couch', 20000], ['Sam', 'item', 'keep', 'couch', 30000],
    ['Alex', 'item', 'keep', 'tv', 25000], ['Sam', 'item', 'keep', 'tv', 20000],
    ['Alex', 'subscription', 'keep', undefined, 0], ['Sam', 'subscription', 'keep', undefined, 0],
  ];
  for (const [who, kind, outcome, hint, cents] of expected) {
    assert.equal(value(who, kind, outcome, hint), cents, `${who} ${kind}${hint ? ` ${hint}` : ''} ${outcome}`);
  }
  const [countRow] = await query<{ n: number }>(
    `select count(*)::int as n from items where case_id = (select case_id from participants where handle = $1)`, [ALEX]);
  assert.equal(countRow?.n, 5, 'no duplicate items');

  const constraints = await query<{ who: string; kind: string; value: Record<string, unknown> }>(
    `select p.display_name as who, c.kind, c.value from constraints c join participants p on p.id = c.participant_id
     where p.handle like $1`, [`${FAKE}%`]);
  const c = (who: string, kind: string) => constraints.filter((x) => x.who === who && x.kind === kind);
  assert.deepEqual(c('Alex', 'move_out_window')[0]?.value, { earliest: '2026-11-15', latest: '2026-12-31' });
  assert.deepEqual(c('Sam', 'move_out_window')[0]?.value, { earliest: '2026-11-01', latest: '2026-11-30' });
  assert.deepEqual(c('Alex', 'max_payment_cents').map((x) => x.value), [{ cents: 160000 }]);
  assert.equal(c('Sam', 'max_payment_cents').length, 0, 'Sam has no cap');
  assert.equal(c('Alex', 'must_keep_item').length, 1, "Alex's Biscuit dealbreaker");
  assert.equal(c('Sam', 'must_keep_item').length, 0);

  // Both done, so the negotiation ran by itself and the agreement went out.
  const [cs] = await query<{ status: string; text: string | null }>(
    `select c.status, (select text from agreements a where a.case_id = c.id order by created_at desc limit 1) as text
     from cases c join participants p on p.case_id = c.id where p.handle = $1`, [ALEX]);
  assert.equal(cs!.status, 'awaiting_confirmation');
  assert.ok(cs!.text?.includes('Alex pays Sam $640 as a buyout.'), 'round 2 buyout');
  assert.ok(cs!.text?.includes('Total: Alex pays Sam $1,390.'));
  console.log(`\n${cs!.text}`);

  // NO -> Alex changes something -> the chat agent updates the cap and searches again -> a different deal.
  const statusOf = async () =>
    (await query<{ status: string }>(
      'select c.status from cases c join participants p on p.case_id = c.id where p.handle = $1', [ALEX]))[0]!.status;
  await say(ALEX, 'NO');
  assert.equal(await statusOf(), 'needs_relaxation');
  await say(ALEX, "I'd like to keep the TV too. I could go up to $1,700 in total.");
  for (let i = 0; i < 3 && (await statusOf()) !== 'awaiting_confirmation'; i++) {
    await say(ALEX, 'Yes, go ahead and look for a new deal with that.');
  }
  assert.equal(await statusOf(), 'awaiting_confirmation', 'a new agreement went out');
  const [caps] = await query<{ n: number }>(
    `select count(*)::int as n from constraints c join participants p on p.id = c.participant_id
     where p.handle = $1 and c.kind = 'max_payment_cents'`, [ALEX]);
  assert.equal(caps!.n, 1, 'the cap row was updated, not duplicated');
  const [next] = await query<{ text: string }>(
    `select a.text from agreements a join participants p on p.case_id = a.case_id
     where p.handle = $1 order by a.created_at desc limit 1`, [ALEX]);
  assert.ok(next!.text.includes('Alex pays Sam $865 as a buyout.'), "the round-1 deal now fits Alex's new cap");
  assert.ok(next!.text.includes('Total: Alex pays Sam $1,615.'));
  console.log('\nAll intake checks passed: demo recorded exactly, deal landed, and NO -> raise cap -> new deal works.');
} finally {
  await cleanup();
  await closePool();
}
