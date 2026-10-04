import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Item } from '../shared/types.ts';
import { matchSoftPreference, similarItem } from './tools.ts';

const item = (name: string, kind: Item['kind']): Item => ({ id: name, case_id: 'c', name, kind, added_by: null, amount_cents: null });
const list = [item('Internet contract', 'subscription'), item('Couch', 'item'), item('TV', 'item')];

test("the ex's agent doesn't add the same thing twice under a slightly different name", () => {
  assert.equal(similarItem(list, 'internet', 'subscription')?.name, 'Internet contract');
  assert.equal(similarItem(list, 'the couch', 'item')?.name, 'Couch');
  assert.equal(similarItem(list, 'TV stand', 'item')?.name, 'TV'); // flagged, so the agent picks a more specific name
});

test('different kinds and unrelated names are new items', () => {
  assert.equal(similarItem(list, 'Internet router', 'item'), undefined);
  assert.equal(similarItem(list, 'Bookshelf', 'item'), undefined);
  assert.equal(similarItem(list, 'Netflix', 'subscription'), undefined);
});

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
