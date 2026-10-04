// Outbound path (owner: Pranav). Every message to a human goes through sendTo.
//
// TODO (build plan hours 14 to 18): run the leak filter before sending (AGENTS.md section 6).
// Keep the export name and signature; the engine side may import it.

import type { SendTo } from '../shared/contract.ts';
import { query } from '../db/client.ts';
import { sendToHandle } from '../messaging/index.ts';

export const sendTo: SendTo = async (participantId, text) => {
  const [row] = await query<{ handle: string }>('select handle from participants where id = $1', [participantId]);
  if (!row) throw new Error(`sendTo: no participant ${participantId}`);
  await sendToHandle(row.handle, text);
  // Their own thread, so their chat agent sees what they were told (private, never logged to the console).
  await query(`insert into chat_messages (participant_id, role, text) values ($1, 'assistant', $2)`, [participantId, text]);
};
