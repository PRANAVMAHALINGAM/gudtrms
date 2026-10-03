import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './phone.ts';

test('US numbers in common formats become E.164', () => {
  assert.equal(normalizePhone('(555) 010-0002'), '+15550100002');
  assert.equal(normalizePhone('555.010.0002'), '+15550100002');
  assert.equal(normalizePhone('1 555 010 0002'), '+15550100002');
  assert.equal(normalizePhone('+1 555 010 0002'), '+15550100002');
});

test('international numbers with + are kept', () => {
  assert.equal(normalizePhone('+44 20 7946 0958'), '+442079460958');
});

test('things that are not phone numbers return null', () => {
  assert.equal(normalizePhone('sam'), null);
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('+1'), null);
});
