// Row and value types shared by both halves. Mirrors db/schema.sql and AGENTS.md section 7.
// Changing this file? Tell your teammate first and log it in docs/CHANGELOG.md.

export type Uuid = string;
export type Cents = number;
/** Calendar date as YYYY-MM-DD. */
export type IsoDate = string;

export type CaseStatus =
  | 'inviting'
  | 'intake'
  | 'negotiating'
  | 'needs_relaxation'
  | 'awaiting_confirmation'
  | 'closed';

export type Role = 'A' | 'B';

export type ItemKind = 'item' | 'lease' | 'pet' | 'subscription' | 'lease_break_fee';

/**
 * What a valuation is for.
 * - keep:    item / lease / subscription. For the lease, the value of staying vs. both moving out.
 * - full:    pet lives with me full-time
 * - primary: pet lives with me, ex has it every other weekend
 * - visits:  pet lives with ex, I have it every other weekend
 * - pay:     lease_break_fee, what taking on the whole fee costs me (negative)
 */
export type Outcome = 'keep' | 'full' | 'primary' | 'visits' | 'pay';

export interface Case {
  id: Uuid;
  code: string;
  status: CaseStatus;
  created_at: string;
}

export interface Participant {
  id: Uuid;
  case_id: Uuid;
  handle: string;
  role: Role;
  display_name: string | null;
  intake_done: boolean;
  invite_sent_at: string | null;
  joined_at: string | null;
}

export interface Item {
  id: Uuid;
  case_id: Uuid;
  name: string;
  kind: ItemKind;
  added_by: Uuid | null;
  /** Only for lease_break_fee. */
  amount_cents: Cents | null;
}

/** PRIVATE. */
export interface Valuation {
  participant_id: Uuid;
  item_id: Uuid;
  outcome: Outcome;
  value_cents: Cents;
}

/** Not private: shown to the other person to confirm. */
export interface DepositContribution {
  case_id: Uuid;
  participant_id: Uuid;
  amount_cents: Cents;
}

/** PRIVATE, advocate only. The mediator may read move_out_window, nothing else. */
export type Constraint =
  | { id: Uuid; participant_id: Uuid; kind: 'max_payment_cents'; value: { cents: Cents } }
  | { id: Uuid; participant_id: Uuid; kind: 'must_keep_item'; value: { item_id: Uuid } }
  | { id: Uuid; participant_id: Uuid; kind: 'move_out_window'; value: { earliest: IsoDate; latest: IsoDate } }
  | { id: Uuid; participant_id: Uuid; kind: 'other'; value: { text: string } };

/**
 * Who gets each item, keyed by item id.
 * - item / subscription: to = keeper. Subscription with to = null is cancelled.
 * - lease: to = who stays. to = null means both move out.
 * - pet: to = who the pet lives with; weekends = the other person if shared, else null.
 * - lease_break_fee: to = who pays the landlord. Only present when both move out.
 */
export type Allocation = Record<Uuid, { to: Uuid | null; weekends: Uuid | null }>;

/**
 * Money owed, netted into one direction (from -> to).
 * buyout_cents and deposit_cents are signed relative to from -> to (negative = the other way);
 * total_cents = buyout_cents + deposit_cents and is always >= 0.
 * from / to are null when nobody owes anything.
 */
export interface Transfer {
  from: Uuid | null;
  to: Uuid | null;
  buyout_cents: Cents;
  /** Deposit payback when one person stays. 0 when both move out. */
  deposit_cents: Cents;
  total_cents: Cents;
  /** Share of the landlord's refund per participant (0 to 1) when both move out, else null. */
  deposit_split: Record<Uuid, number> | null;
}

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'superseded';

export interface Proposal {
  id: Uuid;
  case_id: Uuid;
  round: number;
  allocation: Allocation;
  transfer: Transfer;
  move_out_date: IsoDate;
  status: ProposalStatus;
}

export type Decision = 'accept' | 'reject';
