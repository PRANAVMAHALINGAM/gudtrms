// The wire between the two sides (owner: Shruti). AGENTS.md section 4, privacy rules 2 and 3.
// An advocate's only message to the other side is ACCEPT or REJECT. Anything else (free text,
// questions, counter-proposals) is refused here, whatever its content. Checked at runtime,
// because a rogue or buggy advocate won't respect the TypeScript types.

import type { Decision } from '../shared/types.ts';

export type WireMessage = { type: Decision };

export type WireCheck =
  | { ok: true; decision: Decision }
  | { ok: false; reason: string };

export function checkWire(message: unknown): WireCheck {
  const type = typeof message === 'object' && message !== null ? (message as { type?: unknown }).type : undefined;
  const keys = typeof message === 'object' && message !== null ? Object.keys(message) : [];
  if ((type === 'accept' || type === 'reject') && keys.length === 1) return { ok: true, decision: type };
  // The reason names the message type only. Never put the message content in it.
  const label = typeof type === 'string' && /^[a-z_]{1,32}$/.test(type) ? type : 'unknown';
  return { ok: false, reason: `BLOCKED: ${label === 'free_text' ? 'free text' : `message type "${label}"`} not allowed` };
}
