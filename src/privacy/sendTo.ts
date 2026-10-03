// Outbound path (owner: Pranav). Every message to a human goes through sendTo.
//
// STUB: prints instead of sending, and there's no leak filter yet.
// Pranav: replace with leak filter + Photon send (AGENTS.md section 6).
// Keep the export name and signature; the engine side may import it.

import type { SendTo } from '../shared/contract.ts';

export const sendTo: SendTo = async (participantId, text) => {
  console.log(`[to ${participantId}] ${text}`);
};
