// Router (owner: Pranav). Every inbound message lands here as (handle, text).
// Maps the handle to a participant and case, then routes by keyword + case state (AGENTS.md section 6):
//
//   STOP           always: opt out, close their open case, tell the other side only that it ended
//   start          no open case: open one, ask A's name, then the ex's name + number, send the one invite
//   JOIN / code    invited (or has the code) and not joined yet: join, case -> intake
//   YES            awaiting_confirmation and the agreement was sent: confirm
//   anything else  that person's agent (intake / relaxation)
//
// Never log message text (privacy rule 6).

import { confirmAgreement } from '../conversation/confirm.ts';
import { handleAgentMessage, startIntake } from '../intake/index.ts';
import { sendToHandle } from '../messaging/index.ts';
import { sendTo } from '../privacy/sendTo.ts';
import type { Uuid } from '../shared/types.ts';
import {
  addInvitee, addOptOut, closeCase, createCase, isOptedOut, joinCase, markInviteSent, membershipById,
  openCaseByCode, openMemberships, otherParticipant, participantByRole, removeOptOut, setDisplayName,
  type Membership,
} from './cases.ts';
import { caseCodeOf, keywordOf, parseFirstName, parseNameAndPhone, type Keyword } from './keywords.ts';
import * as msg from './messages.ts';

export async function route(handle: string, text: string): Promise<void> {
  const keyword = keywordOf(text);
  if (keyword === 'stop') return stop(handle);

  const [me] = await openMemberships(handle);
  if (!me) return noOpenCase(handle, text, keyword);

  if (me.joined_at === null) return invited(me, handle, text, keyword);
  if (me.role === 'A' && me.status === 'inviting') return setUpCase(me, text);
  if (keyword === 'yes' && me.status === 'awaiting_confirmation' && (await confirmAgreement(me))) return;
  return handleAgentMessage(me, text);
}

async function stop(handle: string): Promise<void> {
  await addOptOut(handle);
  for (const me of await openMemberships(handle)) {
    await closeCase(me.case_id);
    const other = await otherParticipant(me.case_id, me.id);
    // Never message someone who hasn't joined: they only ever get the one invite.
    if (other?.joined_at) await sendTo(other.id, me.joined_at ? msg.CASE_ENDED : msg.THEY_DIDNT_JOIN);
  }
  await sendToHandle(handle, msg.STOPPED);
}

async function noOpenCase(handle: string, text: string, keyword: Keyword | null): Promise<void> {
  const optedOut = await isOptedOut(handle);

  if (keyword === 'start') {
    if (optedOut) await removeOptOut(handle); // they came back on their own
    const me = await createCase(handle);
    await sendTo(me.id, msg.startIntro(me.code));
    return;
  }

  const code = caseCodeOf(text);
  if (code && (await joinByCode(handle, code))) {
    if (optedOut) await removeOptOut(handle);
    return;
  }

  // Someone who said STOP gets no replies unless they START again.
  if (!optedOut) await sendToHandle(handle, msg.HELP);
}

/** B texted a case code instead of replying to the invite (e.g. A forwarded it). */
async function joinByCode(handle: string, code: string): Promise<boolean> {
  const found = await openCaseByCode(code);
  if (!found || found.status !== 'inviting') return false;
  const ex = await participantByRole(found.id, 'B');
  if (ex?.joined_at) return false;
  const exId = ex ? ex.id : await addInvitee(found.id, handle, null);
  await joinCase(exId, handle);
  await afterJoin(exId);
  return true;
}

async function invited(me: Membership, handle: string, text: string, keyword: Keyword | null): Promise<void> {
  if (keyword === 'join' || caseCodeOf(text) === me.code) {
    await joinCase(me.id, handle);
    await afterJoin(me.id);
    return;
  }
  await sendTo(me.id, msg.INVITED_REPLY);
}

/** B is in: tell A, and start intake for both. */
async function afterJoin(exId: Uuid): Promise<void> {
  const ex = await membershipById(exId);
  if (!ex) return;
  const starter = await otherParticipant(ex.case_id, ex.id);
  if (starter) {
    await sendTo(starter.id, msg.joinedToA(ex.display_name));
    const starterMembership = await membershipById(starter.id);
    if (starterMembership) await startIntake(starterMembership);
  }
  await startIntake(ex);
}

/** A's setup chat while the case is `inviting`: their name, then the ex's name + number, then the invite. */
async function setUpCase(me: Membership, text: string): Promise<void> {
  if (!me.display_name) {
    const name = parseFirstName(text);
    if (!name) return sendTo(me.id, msg.ASK_NAME_AGAIN);
    await setDisplayName(me.id, name);
    return sendTo(me.id, msg.askEx(name));
  }

  const existing = await participantByRole(me.case_id, 'B');
  if (existing) return sendTo(me.id, msg.stillWaiting(existing.display_name));

  const { name, phone } = parseNameAndPhone(text);
  if (!phone) return sendTo(me.id, name ? msg.ASK_EX_PHONE : msg.askEx(me.display_name));

  // One message for every reason, so A can't use this to learn whether someone opted out.
  const blocked = phone === me.handle || (await isOptedOut(phone)) || (await openMemberships(phone)).length > 0;
  if (blocked) return sendTo(me.id, msg.CANT_INVITE);

  const exId = await addInvitee(me.case_id, phone, name);
  try {
    // The fixed invite is the only message that skips sendTo (B isn't a participant who joined yet).
    await sendToHandle(phone, msg.invite(me.display_name));
  } catch (err) {
    console.error(`[router] invite to ${phone} failed:`, err instanceof Error ? err.message : err);
    return sendTo(me.id, msg.inviteFailed(me.code));
  }
  await markInviteSent(exId);
  await sendTo(me.id, msg.inviteSent(name ?? 'them'));
}
