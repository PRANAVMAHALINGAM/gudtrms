// `npm run sim:router`: plays both people through the router against Neon, with no phones.
// Uses fake handles +1555020xxxx and deletes its own rows before and after. Never touches the demo seed.
// Prints the conversation and fails loudly if a reply isn't what AGENTS.md sections 5-6 expect.

import assert from 'node:assert/strict';

// The chat agent's replies come from a fake LLM here: free, offline, and always '[agent] ok'.
process.env.LLM_PROVIDER = 'fake';
import { closePool, query } from '../src/db/client.ts';
import { captureOutbound } from '../src/messaging/index.ts';
import { route } from '../src/router/index.ts';

const FAKE = '+1555020';
const names: Record<string, string> = {};
const h = (n: number, name: string) => {
  const handle = `${FAKE}${String(n).padStart(4, '0')}`;
  names[handle] = name;
  return handle;
};

let outbox: { to: string; text: string }[] = [];
const unreachable = new Set<string>();
captureOutbound((to, text) => {
  if (unreachable.has(to)) throw new Error('Target not allowed for this project');
  outbox.push({ to, text });
});

async function cleanup() {
  await query(`delete from cases where id in (select case_id from participants where handle like $1)`, [`${FAKE}%`]);
  await query(`delete from opt_outs where handle like $1`, [`${FAKE}%`]);
}

/** Sends `text` from `from`, prints the exchange, returns what went out. */
async function say(from: string, text: string) {
  outbox = [];
  await route(from, text);
  console.log(`\n${names[from]} > ${text}`);
  for (const m of outbox) console.log(`  -> ${names[m.to] ?? m.to}: ${m.text.replace(/\n+/g, ' ')}`);
  return outbox;
}

function expectTo(out: { to: string; text: string }[], to: string, fragment: string) {
  assert.ok(
    out.some((m) => m.to === to && m.text.includes(fragment)),
    `expected ${names[to]} to get "${fragment}", got ${JSON.stringify(out)}`,
  );
}

async function caseOf(handle: string) {
  const [row] = await query<{ id: string; code: string; status: string }>(
    `select c.id, c.code, c.status from cases c join participants p on p.case_id = c.id
     where p.handle = $1 order by c.created_at desc limit 1`,
    [handle],
  );
  return row!;
}

await cleanup();
try {
  console.log('=== 1. Happy path: start, invite, JOIN, agreement, YES x2');
  const alex = h(1, 'Alex');
  const sam = h(2, 'Sam');
  expectTo(await say(alex, 'hi'), alex, 'Text START');
  expectTo(await say(alex, 'start'), alex, 'case code');
  expectTo(await say(alex, "it's alex"), alex, "ex's first name and phone number");
  let out = await say(alex, 'Sam 555 020 0002');
  expectTo(out, sam, 'Alex started a gudtrms case');
  expectTo(out, alex, 'Invite sent to Sam');
  expectTo(await say(alex, 'did they reply?'), alex, 'Still waiting on Sam');
  expectTo(await say(alex, 'yes'), alex, 'Still waiting'); // YES is just chat here
  out = await say(sam, 'JOIN');
  expectTo(out, alex, 'Sam joined');
  expectTo(out, sam, 'stays private');
  assert.equal((await caseOf(alex)).status, 'intake');
  expectTo(await say(sam, 'yes'), sam, '[agent]'); // no agreement yet, so YES goes to the agent

  // Pretend negotiate() agreed and the agreement writer sent the text to both.
  const c1 = await caseOf(alex);
  const [proposal] = await query<{ id: string }>(
    `insert into proposals (case_id, round, allocation, transfer, move_out_date, status)
     values ($1, 1, '{}', '{}', '2026-11-30', 'accepted') returning id`,
    [c1.id],
  );
  await query(`insert into agreements (case_id, proposal_id, text) values ($1, $2, 'test agreement')`, [
    c1.id,
    proposal!.id,
  ]);
  await query(`update cases set status = 'awaiting_confirmation' where id = $1`, [c1.id]);
  expectTo(await say(alex, 'what happens now'), alex, '[agent]');
  expectTo(await say(alex, 'Yes!'), alex, 'Waiting on the other person');
  out = await say(sam, 'yes');
  expectTo(out, alex, 'both confirmed');
  expectTo(out, sam, 'both confirmed');
  assert.equal((await caseOf(alex)).status, 'closed');

  console.log('\n=== 2. STOP before joining, then the opt-out list');
  const riley = h(3, 'Riley');
  const jordan = h(4, 'Jordan');
  const casey = h(5, 'Casey');
  await say(riley, 'start');
  await say(riley, 'Riley');
  await say(riley, 'jordan 555-020-0004');
  out = await say(jordan, 'STOP');
  expectTo(out, jordan, "won't message you again");
  expectTo(out, riley, "didn't join");
  assert.equal((await caseOf(riley)).status, 'closed');
  out = await say(jordan, 'hello?');
  assert.equal(out.length, 0, 'opted-out handle gets no reply');
  await say(casey, 'start');
  await say(casey, 'Casey');
  out = await say(casey, 'Jordan 5550200004');
  expectTo(out, casey, "can't send an invite");
  assert.ok(!out.some((m) => m.to === jordan), 'never invites an opted-out number');
  expectTo(await say(jordan, 'start'), jordan, 'case code'); // they opted back in themselves

  console.log('\n=== 3. Joining with the case code, and STOP after joining');
  const taylor = h(6, 'Taylor');
  const morgan = h(7, 'Morgan');
  await say(taylor, 'start');
  await say(taylor, 'Taylor');
  const code = (await caseOf(taylor)).code;
  out = await say(morgan, code.toLowerCase());
  expectTo(out, taylor, 'joined');
  expectTo(out, morgan, 'stays private');
  out = await say(morgan, 'stop');
  expectTo(out, taylor, 'other person ended this case');

  console.log('\n=== 4. Invite fails (number not reachable on our line)');
  const pat = h(8, 'Pat');
  const lee = h(9, 'Lee');
  unreachable.add(lee);
  await say(pat, 'start');
  await say(pat, 'Pat');
  out = await say(pat, 'Lee 555 020 0009');
  expectTo(out, pat, "couldn't reach that number");
  unreachable.delete(lee);
  out = await say(lee, (await caseOf(pat)).code);
  expectTo(out, pat, 'Lee joined');

  console.log('\n=== 5. NO to the agreement: back to the table');
  const drew = h(10, 'Drew');
  const kai = h(11, 'Kai');
  await say(drew, 'start');
  await say(drew, 'Drew');
  await say(drew, 'Kai 555 020 0011');
  await say(kai, 'JOIN');
  const c5 = await caseOf(drew);
  const [p5] = await query<{ id: string }>(
    `insert into proposals (case_id, round, allocation, transfer, move_out_date, status)
     values ($1, 1, '{}', '{}', '2026-11-30', 'accepted') returning id`,
    [c5.id],
  );
  await query(`insert into agreements (case_id, proposal_id, text) values ($1, $2, 'test agreement')`, [c5.id, p5!.id]);
  await query(`update cases set status = 'awaiting_confirmation' where id = $1`, [c5.id]);
  expectTo(await say(kai, 'yes'), kai, 'Waiting on the other person');
  out = await say(drew, 'no');
  expectTo(out, drew, "What doesn't work for you?");
  expectTo(out, kai, "didn't confirm yet");
  assert.ok(!out.some((m) => m.to === kai && m.text.includes('Drew')), 'the other side never hears why');
  assert.equal((await caseOf(drew)).status, 'needs_relaxation');
  const [superseded] = await query<{ status: string }>('select status from proposals where id = $1', [p5!.id]);
  assert.equal(superseded!.status, 'superseded');
  expectTo(await say(kai, 'yes'), kai, '[agent]'); // no agreement out right now, so YES is just chat

  console.log('\nAll router checks passed.');
} finally {
  await cleanup();
  await closePool();
}
