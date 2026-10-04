-- gudtrms schema. Source of truth for the design: AGENTS.md section 7.
-- `npm run db:reset` runs this file and then loads the demo seed.
-- WARNING: it drops every table first. Point DATABASE_URL at your own Neon branch.

drop table if exists llm_usage, chat_state, chat_messages, advocate_notes, leak_events, agreements, decisions, proposals,
  constraints, deposit_contributions, valuations, items, opt_outs, participants, cases cascade;

create table cases (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  status      text not null default 'inviting'
              check (status in ('inviting', 'intake', 'negotiating', 'needs_relaxation',
                                'awaiting_confirmation', 'closed')),
  created_at  timestamptz not null default now()
);

create table participants (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references cases(id) on delete cascade,
  handle          text not null,                 -- phone number (E.164) / iMessage ID
  role            text not null check (role in ('A', 'B')),
  display_name    text,
  intake_done     boolean not null default false,
  invite_sent_at  timestamptz,                   -- set once, never re-sent
  joined_at       timestamptz,                   -- null until B replies JOIN
  unique (case_id, role)
);
create index participants_handle_idx on participants (handle);

-- Anyone who replied STOP. Checked before every invite, across all cases.
create table opt_outs (
  handle      text primary key,
  created_at  timestamptz not null default now()
);

-- Item names are visible to both people.
create table items (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references cases(id) on delete cascade,
  name          text not null,
  kind          text not null check (kind in ('item', 'lease', 'pet', 'subscription', 'lease_break_fee')),
  added_by      uuid references participants(id),
  amount_cents  int,                             -- only for lease_break_fee (a fact both confirm)
  created_at    timestamptz not null default now()
);

-- PRIVATE.
create table valuations (
  participant_id  uuid not null references participants(id) on delete cascade,
  item_id         uuid not null references items(id) on delete cascade,
  outcome         text not null check (outcome in ('keep', 'full', 'primary', 'visits', 'pay')),
  value_cents     int not null,                  -- lease / subscription / fee may be negative
  primary key (participant_id, item_id, outcome)
);

-- NOT private: shown to the other person to confirm.
create table deposit_contributions (
  case_id         uuid not null references cases(id) on delete cascade,
  participant_id  uuid not null references participants(id) on delete cascade,
  amount_cents    int not null check (amount_cents >= 0),
  primary key (case_id, participant_id)
);

-- PRIVATE, advocate only (the mediator may read move_out_window, nothing else).
create table constraints (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references participants(id) on delete cascade,
  kind            text not null check (kind in ('max_payment_cents', 'must_keep_item', 'move_out_window', 'other')),
  value           jsonb not null
);

create table proposals (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references cases(id) on delete cascade,
  round          int not null,
  allocation     jsonb not null,                 -- see Allocation in src/shared/types.ts
  transfer       jsonb not null,                 -- see Transfer in src/shared/types.ts
  move_out_date  date not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'accepted', 'rejected', 'superseded')),
  created_at     timestamptz not null default now()
);

-- No reason column, on purpose.
create table decisions (
  proposal_id     uuid not null references proposals(id) on delete cascade,
  participant_id  uuid not null references participants(id) on delete cascade,
  decision        text not null check (decision in ('accept', 'reject')),
  created_at      timestamptz not null default now(),
  primary key (proposal_id, participant_id)
);

create table agreements (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references cases(id) on delete cascade,
  proposal_id  uuid not null references proposals(id),
  text         text not null,
  a_confirmed  boolean not null default false,
  b_confirmed  boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Never store the blocked content.
create table leak_events (
  id                     uuid primary key default gen_random_uuid(),
  case_id                uuid not null references cases(id) on delete cascade,
  target_participant_id  uuid references participants(id),
  reason                 text not null,
  created_at             timestamptz not null default now()
);

-- PRIVATE. One line per advocate decision. Read ONLY by the judge view.
create table advocate_notes (
  id              uuid primary key default gen_random_uuid(),
  case_id         uuid not null references cases(id) on delete cascade,
  proposal_id     uuid references proposals(id) on delete cascade,
  participant_id  uuid not null references participants(id) on delete cascade,
  note            text not null,
  created_at      timestamptz not null default now()
);
