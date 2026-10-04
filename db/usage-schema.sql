-- Claude token usage and cost (src/llm/usage.ts). One row per Claude call.
-- Additive and idempotent: `npm run db:migrate` adds it to an existing database without touching data,
-- and `npm run db:reset` runs this after schema.sql.
-- NOT private: token counts and cost only, never message text. The judge view shows a case's total.

create table if not exists llm_usage (
  id                  uuid primary key default gen_random_uuid(),
  case_id             uuid references cases(id) on delete cascade,  -- null: a call outside any case (e.g. llm:check)
  purpose             text not null check (purpose in ('chat', 'leak_check', 'advocate', 'other')),
  model               text not null,          -- the model that answered
  input_tokens        integer not null,       -- uncached input
  output_tokens       integer not null,       -- includes thinking (billed as output)
  cache_write_tokens  integer not null,
  cache_read_tokens   integer not null,
  cost_usd            double precision,       -- null if the model isn't in the price table in usage.ts
  created_at          timestamptz not null default now()
);
create index if not exists llm_usage_case_idx on llm_usage (case_id, created_at);
