import assert from 'node:assert/strict';
import { test } from 'node:test';
import { costUsd, summarize, usageTags, withUsage } from './usage.ts';

const none = { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 };
const close = (actual: number | null, expected: number) => assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);

test('Sonnet 5.5 costs $2 in, $10 out, $2.50 / $4 cache writes, $0.20 cache reads per million tokens', () => {
  close(costUsd('claude-sonnet-5-5', { ...none, input: 1_000_000 }), 2);
  close(costUsd('claude-sonnet-5-5', { ...none, output: 1_000_000 }), 10);
  close(costUsd('claude-sonnet-5-5', { ...none, cacheWrite5m: 1_000_000 }), 2.5);
  close(costUsd('claude-sonnet-5-5', { ...none, cacheWrite1h: 1_000_000 }), 4);
  close(costUsd('claude-sonnet-5-5', { ...none, cacheRead: 1_000_000 }), 0.2);
  // A typical chat-agent turn: 400 new input, 3,000 cached, 250 out (thinking included).
  close(costUsd('claude-sonnet-5-5', { ...none, input: 400, cacheRead: 3000, output: 250 }), 0.0008 + 0.0006 + 0.0025);
});

test('an unknown model records tokens but no cost', () => {
  assert.equal(costUsd('claude-something-new', { ...none, input: 100 }), null);
  assert.equal(summarize('claude-something-new', { input_tokens: 100, output_tokens: 5 }).cost, null);
});

test('cache writes split by TTL; a 1-hour write costs double input', () => {
  const { tokens, cost } = summarize('claude-sonnet-5-5', {
    input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0,
    cache_creation_input_tokens: 3_000_000, cache_creation: { ephemeral_5m_input_tokens: 2_000_000, ephemeral_1h_input_tokens: 1_000_000 },
  });
  assert.deepEqual(tokens, { ...none, cacheWrite5m: 2_000_000, cacheWrite1h: 1_000_000 });
  close(cost, 2 * 2.5 + 4);
});

test('with a fallback, every attempt is summed at its own model price', () => {
  const { tokens, cost } = summarize('claude-opus-5-5', {
    input_tokens: 1_000_000, output_tokens: 0, // top level = only the attempt that answered
    iterations: [
      { model: 'claude-sonnet-5-5', input_tokens: 1_000_000, output_tokens: 0 }, // declined
      { model: 'claude-opus-5-5', input_tokens: 1_000_000, output_tokens: 0 },   // fallback answered
    ],
  });
  assert.equal(tokens.input, 2_000_000);
  close(cost, 2 + 4);
});

test('calls are tagged with the innermost case and purpose', async () => {
  assert.deepEqual(usageTags(), {});
  await withUsage({ caseId: 'case-1', purpose: 'chat' }, async () => {
    assert.deepEqual(usageTags(), { caseId: 'case-1', purpose: 'chat' });
    await withUsage({ purpose: 'leak_check' }, async () => {
      await Promise.resolve(); // survives awaits
      assert.deepEqual(usageTags(), { caseId: 'case-1', purpose: 'leak_check' });
    });
    assert.equal(usageTags().purpose, 'chat');
  });
  assert.deepEqual(usageTags(), {});
});
