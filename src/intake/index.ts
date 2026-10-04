// Intake agent (owner: Pranav). STUB until the LLM intake is built (AGENTS.md section 5, step 4).
// The router calls these two functions; keep the signatures when the real agent lands.

import { sendTo } from '../privacy/sendTo.ts';
import type { Membership } from '../router/cases.ts';

/** Called once per person when the case moves to intake (B joined). */
export async function startIntake(me: Membership): Promise<void> {
  await sendTo(
    me.id,
    'Everything you tell me stays private. Your ex never sees it. ' +
      "(gudtrms intake isn't built yet, so that's all for now.)",
  );
}

/** Every message that isn't a keyword for the current state: intake answers, relaxation replies, chat. */
export async function handleAgentMessage(me: Membership, _text: string): Promise<void> {
  if (me.status === 'awaiting_confirmation') {
    await sendTo(me.id, 'Reply YES to confirm the agreement.');
    return;
  }
  await sendTo(me.id, "Got it. (gudtrms intake isn't built yet.)");
}
