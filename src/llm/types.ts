// Provider-neutral LLM interface (owner: Pranav). Everything outside src/llm talks to this, never to a
// vendor SDK, so swapping Claude for Grok or Gemini is one new file in src/llm plus LLM_PROVIDER in .env.
//
// Deliberately small: each call is stateless. The caller sends the system prompt, the plain-text
// conversation so far, and the tools; it gets back the reply text and any tool calls. Tool calls are
// applied by our code and never sent back to the model, so no vendor-specific tool-result format leaks
// into the conversation history we store. (The intake agent keeps its state in Neon and puts a summary
// of it in the system prompt instead.)

/** A function the model may call. inputSchema is JSON Schema: type 'object', every property in `required`, additionalProperties false. */
export interface LlmTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
}

/** One message in the conversation. The first turn must be from the user. */
export interface LlmTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface LlmToolCall {
  name: string;
  input: Record<string, unknown>;
}

/** How hard the model thinks. Low is right for chat and yes/no checks (fast, cheap). */
export type LlmEffort = 'low' | 'medium' | 'high';

export interface ChatRequest {
  system: string;
  turns: LlmTurn[];
  tools?: LlmTool[];
  effort?: LlmEffort;
  maxTokens?: number;
}

export interface ChatResult {
  /** The model's reply text (may be empty if it only called tools). */
  text: string;
  toolCalls: LlmToolCall[];
  /** The provider's safety system declined. Treat as "say something safe and generic". */
  refused: boolean;
  /** The model that actually answered (can differ from the requested one after a fallback). */
  model: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  chat(request: ChatRequest): Promise<ChatResult>;
}
