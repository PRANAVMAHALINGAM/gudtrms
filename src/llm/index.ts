// Picks the LLM provider from .env (owner: Pranav). AGENTS.md section 3: Claude for now.
//
//   LLM_PROVIDER=claude      (default; the only one implemented)
//   LLM_MODEL=...            optional override of the provider's default model
//
// Adding Grok or Gemini later: write src/llm/grok.ts (or gemini.ts) exporting a function that returns
// an LlmProvider using that vendor's official SDK, add a case below, and set LLM_PROVIDER. Nothing
// outside src/llm changes.

import { claudeProvider } from './claude.ts';
import type { LlmEffort, LlmProvider } from './types.ts';

export type { ChatRequest, ChatResult, LlmEffort, LlmProvider, LlmTool, LlmToolCall, LlmTurn } from './types.ts';
export { withUsage, type UsagePurpose } from './usage.ts';

let provider: LlmProvider | undefined;

export function llm(): LlmProvider {
  if (provider) return provider;
  const name = (process.env.LLM_PROVIDER ?? 'claude').trim().toLowerCase();
  const model = process.env.LLM_MODEL?.trim() || undefined;
  switch (name) {
    case 'claude':
      provider = claudeProvider(model);
      break;
    case 'fake':
      // Simulations and tests: no network, no cost, always the same answer.
      // With tools it replies '[agent] ok'; without tools (yes/no checks like the leak filter) it answers VERDICT: NO.
      provider = {
        name: 'fake',
        model: 'fake',
        chat: async (req) =>
          req.tools?.length
            ? { text: '', toolCalls: [{ name: 'reply', input: { text: '[agent] ok' } }], refused: false, model: 'fake' }
            : { text: 'VERDICT: NO', toolCalls: [], refused: false, model: 'fake' },
      };
      break;
    default:
      throw new Error(`LLM_PROVIDER=${name} isn't implemented yet. Supported: claude (and fake, for simulations). See src/llm/index.ts.`);
  }
  return provider;
}

/** The effort to use for everyday chat turns. LLM_EFFORT in .env overrides it. */
export function chatEffort(): LlmEffort {
  const e = process.env.LLM_EFFORT?.trim().toLowerCase();
  return e === 'medium' || e === 'high' ? e : 'low';
}

/**
 * A yes/no question answered by the model, e.g. the leak filter's "does this reveal the other
 * person's private data?". Returns null if the answer wasn't a clear yes or no (or the provider
 * declined), so the caller decides which way to fail. The leak filter should fail closed.
 */
export async function askYesNo(system: string, question: string, effort: LlmEffort = 'low'): Promise<boolean | null> {
  const result = await llm().chat({
    system: `${system}\n\nAnswer with exactly one word: YES or NO.`,
    turns: [{ role: 'user', text: question }],
    effort,
    maxTokens: 4000,
  });
  if (result.refused) return null;
  // The last YES or NO in the answer counts (so 'VERDICT: NO' works too).
  const word = [...result.text.toUpperCase().matchAll(/\b(YES|NO)\b/g)].at(-1)?.[1];
  if (word === 'YES') return true;
  if (word === 'NO') return false;
  return null;
}
