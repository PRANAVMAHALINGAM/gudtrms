-- Chat agent tables (owner: Pranav). AGENTS.md section 6, "Chat agent".
-- Additive and idempotent: `npm run db:migrate` adds them to an existing database without touching data,
-- and `npm run db:reset` runs this after schema.sql.

-- PRIVATE. One person's own thread with gudtrms: what they texted and what we sent them.
-- Read only by that person's chat agent. Never by the other person's agents or the judge view.
create table if not exists chat_messages (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references participants(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  text            text not null,
  created_at      timestamptz not null default now()
);
create index if not exists chat_messages_participant_idx on chat_messages (participant_id, created_at);

-- PRIVATE. Progress the chat agent can't read off the data rows, e.g. "said they have no payment cap"
-- (no cap = no constraints row, which looks the same as "not asked yet").
create table if not exists chat_state (
  participant_id  uuid primary key references participants(id) on delete cascade,
  flags           jsonb not null default '{}'
);
