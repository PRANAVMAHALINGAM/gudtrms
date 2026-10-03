// The demo scenario from AGENTS.md section 8, as data. Fixed ids so tests, the seed,
// and the judge view can refer to the same rows. All money in cents.
// Expected result: round 1 ($865 buyout + $750 deposit = $1,615) -> Alex REJECTS (cap $1,600);
//                  round 2 (TV moves to Sam, $640 + $750 = $1,390) -> both ACCEPT. Move-out Nov 30.
// If you change a number here, recheck the rounds.

import type { Case, Constraint, DepositContribution, Item, Participant, Valuation } from './types.ts';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

const CASE_ID = id(1);
const ALEX = id(11);
const SAM = id(12);
const APT = id(21);
const BISCUIT = id(22);
const COUCH = id(23);
const TV = id(24);
const SPOTIFY = id(25);

export const demoIds = { CASE_ID, ALEX, SAM, APT, BISCUIT, COUCH, TV, SPOTIFY } as const;

export const demoCase: Case = {
  id: CASE_ID,
  code: '4F7K',
  status: 'intake', // both have finished intake, so negotiate() can start
  created_at: '2026-10-03T12:00:00Z',
};

export const demoParticipants: Participant[] = [
  { id: ALEX, case_id: CASE_ID, handle: '+15550100001', role: 'A', display_name: 'Alex',
    intake_done: true, invite_sent_at: null, joined_at: '2026-10-03T12:00:00Z' },
  { id: SAM, case_id: CASE_ID, handle: '+15550100002', role: 'B', display_name: 'Sam',
    intake_done: true, invite_sent_at: '2026-10-03T12:01:00Z', joined_at: '2026-10-03T12:05:00Z' },
];

export const demoItems: Item[] = [
  { id: APT, case_id: CASE_ID, name: 'Apartment (lease)', kind: 'lease', added_by: ALEX, amount_cents: null },
  { id: BISCUIT, case_id: CASE_ID, name: 'Biscuit', kind: 'pet', added_by: ALEX, amount_cents: null },
  { id: COUCH, case_id: CASE_ID, name: 'Couch', kind: 'item', added_by: SAM, amount_cents: null },
  { id: TV, case_id: CASE_ID, name: 'TV', kind: 'item', added_by: SAM, amount_cents: null },
  { id: SPOTIFY, case_id: CASE_ID, name: 'Spotify', kind: 'subscription', added_by: ALEX, amount_cents: null },
];

const v = (participant_id: string, item_id: string, outcome: Valuation['outcome'], dollars: number): Valuation =>
  ({ participant_id, item_id, outcome, value_cents: dollars * 100 });

export const demoValuations: Valuation[] = [
  v(ALEX, APT, 'keep', 1500),       v(SAM, APT, 'keep', 1410),
  v(ALEX, BISCUIT, 'full', 900),    v(SAM, BISCUIT, 'full', 400),
  v(ALEX, BISCUIT, 'primary', 800), v(SAM, BISCUIT, 'primary', 350),
  v(ALEX, BISCUIT, 'visits', 300),  v(SAM, BISCUIT, 'visits', 250),
  v(ALEX, COUCH, 'keep', 200),      v(SAM, COUCH, 'keep', 300),
  v(ALEX, TV, 'keep', 250),         v(SAM, TV, 'keep', 200),
  v(ALEX, SPOTIFY, 'keep', 0),      v(SAM, SPOTIFY, 'keep', 0),
];

export const demoDeposits: DepositContribution[] = [
  { case_id: CASE_ID, participant_id: ALEX, amount_cents: 75000 },
  { case_id: CASE_ID, participant_id: SAM, amount_cents: 75000 },
];

export const demoConstraints: Constraint[] = [
  { id: id(31), participant_id: ALEX, kind: 'move_out_window', value: { earliest: '2026-11-15', latest: '2026-12-31' } },
  { id: id(32), participant_id: SAM, kind: 'move_out_window', value: { earliest: '2026-11-01', latest: '2026-11-30' } },
  { id: id(33), participant_id: ALEX, kind: 'max_payment_cents', value: { cents: 160000 } },
  { id: id(34), participant_id: ALEX, kind: 'must_keep_item', value: { item_id: BISCUIT } },
];
