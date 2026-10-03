// The only two function boundaries between the conversation side (Pranav)
// and the negotiation side (Shruti). Everything else is shared through Neon tables.
// Changing this file? Tell your teammate first and log it in docs/CHANGELOG.md.

import type { Cents, IsoDate, Uuid } from './types.ts';

export type NegotiationResult =
  | { status: 'agreed'; proposalId: Uuid }
  | { status: 'needs_relaxation'; asks: Record<Uuid, RelaxAsk | null> };

/** What one person's advocate wants to privately ask its own human to relax. */
export type RelaxAsk =
  | { kind: 'max_payment'; suggestedCents: Cents }
  | { kind: 'move_out_window'; suggestedLatest: IsoDate }
  | { kind: 'must_keep'; itemId: Uuid };

/**
 * Shruti implements (src/engine). Pranav calls it once both participants have
 * intake_done = true, and again after someone relaxes a constraint.
 */
export type Negotiate = (caseId: Uuid) => Promise<NegotiationResult>;

/**
 * Pranav implements (src/privacy). Every outbound message goes through it,
 * and it runs the leak filter before sending.
 */
export type SendTo = (participantId: Uuid, text: string) => Promise<void>;
