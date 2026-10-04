// Claude provider (Anthropic SDK). The only file that imports @anthropic-ai/sdk.
// Auth: ANTHROPIC_API_KEY in .env (or an `ant auth login` profile, which the SDK finds on its own).

import Anthropic from '@anthropic-ai/sdk';
import type { ChatRequest, ChatResult, LlmProvider, LlmToolCall } from './types.ts';
import { recordUsage, type UsageLike } from './usage.ts';

// Team decision: Sonnet 5.5 at low effort (fast and cheap enough for iMessage chat). LLM_MODEL overrides it.
export const CLAUDE_DEFAULT_MODEL = 'claude-sonnet-5-5';

export function claudeProvider(model: string = CLAUDE_DEFAULT_MODEL): LlmProvider {
  const client = new Anthropic();

  return {
    name: 'claude',
    model,
    async chat(request: ChatRequest): Promise<ChatResult> {
      const response = await client.beta.messages.create({
        model,
        max_tokens: request.maxTokens ?? 16000,
        // If a safety classifier declines, retry server-side on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // Caches the system prompt and tools across turns of the same conversation.
        cache_control: { type: 'ephemeral' },
        system: request.system,
        output_config: { effort: request.effort ?? 'low' },
        messages: request.turns.map((t) => ({ role: t.role, content: t.text })),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema,
                strict: true, // tool inputs always match the schema
              })),
            }
          : {}),
      });
      // Tokens and cost, tagged with the case this call is for (src/llm/usage.ts). Never throws.
      await recordUsage(response.model, response.usage as UsageLike);

      if (response.stop_reason === 'refusal') {
        return { text: '', toolCalls: [], refused: true, model: response.model };
      }
      const text = response.content
        .flatMap((b) => (b.type === 'text' ? [b.text] : []))
        .join('\n')
        .trim();
      const toolCalls: LlmToolCall[] = response.content.flatMap((b) =>
        b.type === 'tool_use' ? [{ name: b.name, input: b.input as Record<string, unknown> }] : [],
      );
      return { text, toolCalls, refused: false, model: response.model };
    },
  };
}
