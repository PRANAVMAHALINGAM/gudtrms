// YES confirmation of the agreement (owner: Pranav). AGENTS.md section 5, step 7.
//
// The agreement writer inserts the `agreements` row only after sending the text to both people,
// so "a row exists" means "the agreement has been sent to this person".

import { query } from '../db/client.ts';
import { sendTo } from '../privacy/sendTo.ts';
import type { Membership } from '../router/cases.ts';
import { otherParticipant } from '../router/cases.ts';
import type { Uuid } from '../shared/types.ts';

export const DECLINED_TO_ME =
  "Okay, nothing is agreed and nothing is final. What doesn't work for you? Tell me in your own words " +
  "and I'll try a new version. Your ex won't see what you say.";
export const DECLINED_TO_OTHER =
  "They didn't confirm yet. I'm working on a new version, and you'll confirm that one when it's ready.";

/**
 * NO to the agreement (AGENTS.md section 10, decided: back to the table). The deal is superseded and
 * the case goes to needs_relaxation, so this person's next messages go to their agent, which updates
 * their values or limits and runs the negotiation again. A new agreement gets a new row, so both
 * YESes start over. The other person only hears that it wasn't confirmed, never why (privacy rule 7).
 * Returns false if no agreement has been sent yet (then NO is just chat).
 */
export async function declineAgreement(me: Membership): Promise<boolean> {
  const [agreement] = await query<{ proposal_id: Uuid }>(
    'select proposal_id from agreements where case_id = $1 order by created_at desc limit 1',
    [me.case_id],
  );
  if (!agreement) return false;

  // Only the first NO flips the case; if both say NO at once, the second just gets their own question.
  const reopened = await query<{ id: Uuid }>(
    `update cases set status = 'needs_relaxation' where id = $1 and status = 'awaiting_confirmation' returning id`,
    [me.case_id],
  );
  if (reopened.length > 0) {
    await query(`update proposals set status = 'superseded' where id = $1`, [agreement.proposal_id]);
    const other = await otherParticipant(me.case_id, me.id);
    if (other) await sendTo(other.id, DECLINED_TO_OTHER);
  }
  await sendTo(me.id, DECLINED_TO_ME);
  return true;
}

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
