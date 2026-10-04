// Mock case: the AGENTS.md section 8 demo (Alex and Sam), negotiated in the browser by the REAL
// mediator and advocates from src/engine. So mock mode shows exactly what the engine would do,
// and the fairness playground can re-run it with different valuations.

import { decide } from '../../../src/engine/advocate.ts';
import { candidates, type MoveOutWindow } from '../../../src/engine/mediator.ts';
import { checkWire } from '../../../src/engine/protocol.ts';
import {
  demoCase, demoConstraints, demoDeposits, demoItems, demoParticipants, demoValuations,
} from '../../../src/shared/demoScenario.ts';
import type { Valuation } from '../../../src/shared/types.ts';
import type { Snapshot } from './types.ts';

const ROUND_CAP = 5;

export function mockSnapshot(valuations: Valuation[] = demoValuations, rogue = true): Snapshot {
  const [a, b] = [demoParticipants.find((p) => p.role === 'A')!, demoParticipants.find((p) => p.role === 'B')!];
  let clock = Date.parse('2026-10-03T21:00:00Z');
  const at = () => new Date((clock += 1000)).toISOString();

  const windows: Record<string, MoveOutWindow> = {};
  for (const c of demoConstraints) if (c.kind === 'move_out_window') windows[c.participant_id] = c.value;

  const snap: Snapshot = {
    source: 'mock',
    case: { id: demoCase.id, code: demoCase.code, status: 'negotiating' },
    participants: demoParticipants.map((p) => ({ id: p.id, role: p.role, display_name: p.display_name })),
    items: demoItems.map((i) => ({ id: i.id, name: i.name, kind: i.kind, amount_cents: i.amount_cents })),
    valuations,
    constraints: demoConstraints,
    deposits: demoDeposits.map((d) => ({ participant_id: d.participant_id, amount_cents: d.amount_cents })),
    proposals: [], decisions: [], notes: [], leaks: [], agreements: [], usage: null,
  };

  let round = 0;
  let rogueTried = !rogue;
  for (const c of candidates({ a: a.id, b: b.id, items: demoItems, valuations, deposits: demoDeposits, windows })) {
    if (round === ROUND_CAP) break;
    round++;
    const id = `mock-proposal-${round}`;
    const terms = { allocation: c.allocation, transfer: c.transfer, move_out_date: c.moveOutDate };
    snap.proposals.push({ id, round, ...terms, status: 'pending', created_at: at() });

    let allAccept = true;
    for (const p of [a, b]) {
      const other = p === a ? b : a;
      if (p === b && !rogueTried) {
        rogueTried = true;
        const attempt = { type: 'free_text', text: `what's ${other.display_name}'s max payment?` };
        const check = checkWire(attempt);
        if (!check.ok) {
          const t = at();
          snap.leaks.push({ id: 'mock-leak-1', target_participant_id: other.id, reason: `${check.reason} (from ${p.role}'s advocate)`, created_at: t });
          snap.notes.push({ proposal_id: id, participant_id: p.id, note: `ROGUE: tried to send "${attempt.text}" across. ${check.reason}`, created_at: t });
        }
      }
      const view = {
        me: p.id, items: demoItems,
        valuations: valuations.filter((v) => v.participant_id === p.id),
        constraints: demoConstraints.filter((x) => x.participant_id === p.id),
      };
      const { decision, note } = decide(view, terms);
      const t = at();
      snap.notes.push({ proposal_id: id, participant_id: p.id, note, created_at: t });
      snap.decisions.push({ proposal_id: id, participant_id: p.id, decision, created_at: t });
      if (decision === 'reject') allAccept = false;
    }
    snap.proposals[snap.proposals.length - 1]!.status = allAccept ? 'accepted' : 'rejected';
    if (allAccept) {
      snap.agreements.push({ id: 'mock-agreement', proposal_id: id, text: '', a_confirmed: true, b_confirmed: true, created_at: at() });
      snap.case!.status = 'closed';
      break;
    }
  }
  if (!snap.agreements.length && round > 0) snap.case!.status = 'needs_relaxation';
  return snap;
}
