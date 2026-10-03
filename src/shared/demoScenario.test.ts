// Guards the seed data: if someone edits a number, the demo's fair shares must still hold.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoIds, demoValuations } from './demoScenario.ts';

const fairShare = (participantId: string) =>
  demoValuations
    .filter((v) => v.participant_id === participantId && (v.outcome === 'keep' || v.outcome === 'full'))
    .reduce((sum, v) => sum + v.value_cents, 0) / 2;

test('demo fair shares match AGENTS.md section 8', () => {
  assert.equal(fairShare(demoIds.ALEX), 142500);
  assert.equal(fairShare(demoIds.SAM), 115500);
});
