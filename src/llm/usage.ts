// Token usage and cost of every Claude call, per case (added by Shruti; src/llm is Pranav's).
// One llm_usage row per call: case, what it was for, model, token counts, cost. Never message text,
// so it holds nothing private. `npm run usage` prints it; the judge view shows a case's total.
//
// Which case a call belongs to travels with the async work (AsyncLocalStorage): the router and
// negotiate() say "this is case X, for the chat agent / the advocates" once, and every Claude call
// made underneath is tagged, without passing ids through every function in between.

import { AsyncLocalStorage } from 'node:async_hooks';
import { query } from '../db/client.ts';

export type UsagePurpose = 'chat' | 'leak_check' | 'advocate' | 'other';

interface UsageContext {
  caseId?: string;
  purpose?: UsagePurpose;
}

const context = new AsyncLocalStorage<UsageContext>();

/** Runs `fn` with these tags on every Claude call it makes. Inner tags override outer ones. */
export function withUsage<T>(tags: UsageContext, fn: () => Promise<T>): Promise<T> {
  return context.run({ ...context.getStore(), ...tags }, fn);
}

/** The tags a Claude call made right now would get. */
export const usageTags = (): UsageContext => context.getStore() ?? {};

export interface Tokens {
  input: number;
  output: number; // includes thinking: it's billed as output
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

/**
 * US dollars per million tokens, Claude API list prices (checked 2026-10-04). Cache writes are 1.25x
 * input for the 5-minute TTL (what we use) and 2x for 1 hour. A fallback model that answers a
 * refused request bills at its own rates, so the models it can fall back to are here too.
 */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
};

/** Cost in US dollars, or null for a model we have no price for (its tokens are still recorded). */
export function costUsd(model: string, t: Tokens): number | null {
  const p = PRICES[model] ?? Object.entries(PRICES).find(([id]) => model.startsWith(`${id}-`))?.[1];
  if (!p) return null;
  const perToken = (dollarsPerMillion: number) => dollarsPerMillion / 1_000_000;
  return t.input * perToken(p.input)
    + t.output * perToken(p.output)
    + t.cacheWrite5m * perToken(p.input * 1.25)
    + t.cacheWrite1h * perToken(p.input * 2)
    + t.cacheRead * perToken(p.cacheRead);
}

/** The usage fields we read, from a Messages API response or one of its `usage.iterations` entries. */
export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
  model?: string | null;
  iterations?: UsageLike[] | null;
}

function tokensOf(u: UsageLike): Tokens {
  const write = u.cache_creation_input_tokens ?? 0;
  const write1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  return {
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheWrite5m: Math.max(0, write - write1h),
    cacheWrite1h: write1h,
    cacheRead: u.cache_read_input_tokens ?? 0,
  };
}

/**
 * Totals for one call. With a server-side fallback, `usage.iterations` has one entry per attempt
 * (the declined one and the fallback that answered), each billed at its own model's rates, while the
 * top-level numbers cover only the attempt that answered. So sum the iterations when there are any.
 */
export function summarize(model: string, usage: UsageLike): { tokens: Tokens; cost: number | null } {
  const attempts = usage.iterations?.length ? usage.iterations : [usage];
  const tokens: Tokens = { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 };
  let cost: number | null = 0;
  for (const attempt of attempts) {
    const t = tokensOf(attempt);
    for (const k of Object.keys(tokens) as (keyof Tokens)[]) tokens[k] += t[k];
    const c = costUsd(attempt.model ?? model, t);
    cost = c === null || cost === null ? null : cost + c;
  }
  return { tokens, cost };
}

/** Records one call. Never throws: a reply must go out even if the usage row can't be written. */
export async function recordUsage(model: string, usage: UsageLike): Promise<void> {
  try {
    const tags = usageTags();
    const { tokens: t, cost } = summarize(model, usage);
    await query(
      `insert into llm_usage (case_id, purpose, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tags.caseId ?? null, tags.purpose ?? 'other', model, t.input, t.output, t.cacheWrite5m + t.cacheWrite1h, t.cacheRead, cost],
    );
  } catch (err) {
    // E.g. no llm_usage table yet (run `npm run db:migrate`). The error only, never the conversation.
    console.error('[usage] could not record a Claude call:', err instanceof Error ? err.message : err);
  }
}
