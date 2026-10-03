// Neon queries for the router (owner: Pranav): cases, participants, opt-outs.
// Only touches routing columns. Private tables (valuations, constraints) are never read here.

import { randomInt } from 'node:crypto';
import { query } from '../db/client.ts';
import type { CaseStatus, Participant, Uuid } from '../shared/types.ts';
import { CODE_ALPHABET, caseCodeOf } from './keywords.ts';

/** A participant row plus the case fields the router needs. */
export interface Membership extends Participant {
  status: CaseStatus;
  code: string;
}

const MEMBERSHIP_COLUMNS = `p.id, p.case_id, p.handle, p.role, p.display_name, p.intake_done,
  p.invite_sent_at, p.joined_at, c.status, c.code`;

/** A random case code that `caseCodeOf` accepts (4 chars, at least one digit). */
export function generateCode(): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (caseCodeOf(code)) return code;
  }
}

/** Every open (not closed) case this handle is in, newest first. Usually zero or one. */
export async function openMemberships(handle: string): Promise<Membership[]> {
  return query<Membership>(
    `select ${MEMBERSHIP_COLUMNS} from participants p join cases c on c.id = p.case_id
     where p.handle = $1 and c.status <> 'closed' order by c.created_at desc`,
    [handle],
  );
}

export async function membershipById(participantId: Uuid): Promise<Membership | undefined> {
  const [row] = await query<Membership>(
    `select ${MEMBERSHIP_COLUMNS} from participants p join cases c on c.id = p.case_id where p.id = $1`,
    [participantId],
  );
  return row;
}

export async function otherParticipant(caseId: Uuid, participantId: Uuid): Promise<Participant | undefined> {
  const [row] = await query<Participant>('select * from participants where case_id = $1 and id <> $2', [
    caseId,
    participantId,
  ]);
  return row;
}

export async function participantByRole(caseId: Uuid, role: 'A' | 'B'): Promise<Participant | undefined> {
  const [row] = await query<Participant>('select * from participants where case_id = $1 and role = $2', [
    caseId,
    role,
  ]);
  return row;
}

/** Opens a case with this handle as A (joined from the start). Retries if the code is taken. */
export async function createCase(handle: string): Promise<Membership> {
  for (let attempt = 0; ; attempt++) {
    try {
      const [created] = await query<{ id: Uuid }>(
        `with c as (insert into cases (code, status) values ($1, 'inviting') returning id)
         insert into participants (case_id, handle, role, joined_at) select id, $2, 'A', now() from c
         returning id`,
        [generateCode(), handle],
      );
      return (await membershipById(created!.id))!;
    } catch (err) {
      const duplicateCode = (err as { code?: string }).code === '23505';
      if (!duplicateCode || attempt >= 5) throw err;
    }
  }
}

/** The open case with this code, if any. */
export async function openCaseByCode(code: string): Promise<{ id: Uuid; status: CaseStatus } | undefined> {
  const [row] = await query<{ id: Uuid; status: CaseStatus }>(
    `select id, status from cases where code = $1 and status <> 'closed'`,
    [code],
  );
  return row;
}

export async function setDisplayName(participantId: Uuid, name: string): Promise<void> {
  await query('update participants set display_name = $2 where id = $1', [participantId, name]);
}

/** Adds B to a case (not joined yet). Returns B's participant id. */
export async function addInvitee(caseId: Uuid, handle: string, name: string | null): Promise<Uuid> {
  const [row] = await query<{ id: Uuid }>(
    `insert into participants (case_id, handle, role, display_name) values ($1, $2, 'B', $3) returning id`,
    [caseId, handle, name],
  );
  return row!.id;
}

/** Records that the one invite went out. Never cleared, so it's never re-sent. */
export async function markInviteSent(participantId: Uuid): Promise<void> {
  await query('update participants set invite_sent_at = now() where id = $1 and invite_sent_at is null', [
    participantId,
  ]);
}

/**
 * Marks B as joined (from `handle`, which may differ from the number A gave if they used the code)
 * and moves the case from inviting to intake.
 */
export async function joinCase(participantId: Uuid, handle: string): Promise<void> {
  await query(
    `with p as (update participants set joined_at = now(), handle = $2 where id = $1 returning case_id)
     update cases set status = 'intake' where id = (select case_id from p) and status = 'inviting'`,
    [participantId, handle],
  );
}

export async function closeCase(caseId: Uuid): Promise<void> {
  await query(`update cases set status = 'closed' where id = $1`, [caseId]);
}

export async function isOptedOut(handle: string): Promise<boolean> {
  const rows = await query('select 1 from opt_outs where handle = $1', [handle]);
  return rows.length > 0;
}

export async function addOptOut(handle: string): Promise<void> {
  await query('insert into opt_outs (handle) values ($1) on conflict do nothing', [handle]);
}

/** Someone who opted out texted START (or a case code) themselves, so they're opting back in. */
export async function removeOptOut(handle: string): Promise<void> {
  await query('delete from opt_outs where handle = $1', [handle]);
}
