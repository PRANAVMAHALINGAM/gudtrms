// Outbound path (owner: Pranav). Every message to a human goes through here, and through the leak
// filter first (privacy rule 5, AGENTS.md section 6).
//
//   sendTo(participantId, text)          fixed-template text (agreement, asks, notices): number check.
//   sendAgentReply(participantId, text)  LLM-written text: number check + LLM yes/no check.
//
// A blocked message is never sent or stored; leak_events gets the reason only.
// Keep sendTo's name and signature; the engine side may import it.

import type { SendTo } from '../shared/contract.ts';
import { query } from '../db/client.ts';
import { sendToHandle } from '../messaging/index.ts';
import type { Uuid } from '../shared/types.ts';
import { checkOutbound, logLeak, type Recipient } from './leakFilter.ts';

/** What a person gets instead of a fixed message that was blocked. No numbers, nothing about the other side. */
export const BLOCKED_FALLBACK = "Sorry, I hit a snag with that message. I'll follow up shortly.";

async function recipient(participantId: Uuid): Promise<Recipient & { handle: string }> {
  const [row] = await query<Recipient & { handle: string }>(
    'select id, case_id, role, display_name, handle from participants where id = $1', [participantId]);
  if (!row) throw new Error(`sendTo: no participant ${participantId}`);
  return row;
}

async function deliver(r: Recipient & { handle: string }, text: string): Promise<void> {
  await sendToHandle(r.handle, text);
  // Their own thread, so their chat agent sees what they were told (private, never logged to the console).
  await query(`insert into chat_messages (participant_id, role, text) values ($1, 'assistant', $2)`, [r.id, text]);
}

export const sendTo: SendTo = async (participantId, text) => {
  const r = await recipient(participantId);
  const verdict = await checkOutbound(r, text, { llm: false });
  if (!verdict.ok) {
    await logLeak(r, verdict.reason, text);
    await deliver(r, BLOCKED_FALLBACK);
    return;
  }
  await deliver(r, text);
};

/** For LLM-written replies. Returns false (and sends nothing) if blocked, so the caller can rewrite it. */
export async function sendAgentReply(participantId: Uuid, text: string): Promise<boolean> {
  const r = await recipient(participantId);
  const verdict = await checkOutbound(r, text, { llm: true });
  if (!verdict.ok) {
    await logLeak(r, verdict.reason, text);
    return false;
  }
  await deliver(r, text);
  return true;
}
