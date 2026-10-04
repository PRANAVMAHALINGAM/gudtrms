// YES confirmation of the agreement (owner: Pranav). AGENTS.md section 5, step 7.
//
// The agreement writer inserts the `agreements` row only after sending the text to both people,
// so "a row exists" means "the agreement has been sent to this person".

import { query } from '../db/client.ts';
import { sendTo } from '../privacy/sendTo.ts';
import type { Membership } from '../router/cases.ts';
import { otherParticipant } from '../router/cases.ts';
import type { Uuid } from '../shared/types.ts';

/** Records this person's YES. Returns false if no agreement has been sent yet (then YES is just chat). */
export async function confirmAgreement(me: Membership): Promise<boolean> {
  const column = me.role === 'A' ? 'a_confirmed' : 'b_confirmed';
  const [agreement] = await query<{ a_confirmed: boolean; b_confirmed: boolean }>(
    `update agreements set ${column} = true
     where id = (select id from agreements where case_id = $1 order by created_at desc limit 1)
     returning a_confirmed, b_confirmed`,
    [me.case_id],
  );
  if (!agreement) return false;

  if (agreement.a_confirmed && agreement.b_confirmed) {
    // Only one of the two YES handlers gets to close the case and announce it.
    const closed = await query<{ id: Uuid }>(
      `update cases set status = 'closed' where id = $1 and status = 'awaiting_confirmation' returning id`,
      [me.case_id],
    );
    if (closed.length > 0) {
      const other = await otherParticipant(me.case_id, me.id);
      const done = "You've both confirmed. Your agreement is final and the case is closed. Good luck with the move.";
      await sendTo(me.id, done);
      if (other) await sendTo(other.id, done);
    }
  } else {
    await sendTo(me.id, "Got it, you've confirmed. Waiting on the other person.");
  }
  return true;
}
