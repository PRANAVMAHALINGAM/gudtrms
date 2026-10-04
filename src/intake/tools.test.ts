import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchSoftPreference } from './tools.ts';

const prefs = ["I'd really like the TV", 'No pet handoffs with them', 'Keep the plants'];

test('soft preferences match by text, part of it, or the one best keyword', () => {
  assert.equal(matchSoftPreference(prefs, 'Keep the plants'), 'Keep the plants');
  assert.equal(matchSoftPreference(prefs, 'handoffs'), 'No pet handoffs with them');
  assert.equal(matchSoftPreference(prefs, "the TV thing doesn't matter anymore"), "I'd really like the TV");
});

test('no guess when nothing or several match', () => {
  assert.equal(matchSoftPreference(prefs, 'the couch'), undefined);
  assert.equal(matchSoftPreference(prefs, ''), undefined);
  assert.equal(matchSoftPreference(['Keep the TV', 'TV stand too'], 'tv'), undefined);
});
