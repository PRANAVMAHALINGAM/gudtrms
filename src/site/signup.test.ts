import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSignup } from './signup.ts';

test('accepts a normal sign-up and splits the name', () => {
  assert.deepEqual(parseSignup({ name: '  Rachel  Green ', phone: '(734) 555-1234', email: 'rachel@example.com' }), {
    ok: true,
    user: { phoneNumber: '+17345551234', firstName: 'Rachel', lastName: 'Green', email: 'rachel@example.com' },
  });
});

test('a single name has no last name', () => {
  const r = parseSignup({ name: 'Ross', phone: '+91 98765 43210', email: 'ross@example.co.uk' });
  assert.equal(r.ok && r.user.lastName, null);
  assert.equal(r.ok && r.user.phoneNumber, '+919876543210');
});

test('points at the field that is wrong', () => {
  assert.equal(field({ name: '', phone: '7345551234', email: 'a@b.co' }), 'name');
  assert.equal(field({ name: 'Sam', phone: '555-1234', email: 'a@b.co' }), 'phone');
  assert.equal(field({ name: 'Sam', phone: '7345551234', email: 'not an email' }), 'email');
  assert.equal(field({ name: 'Sam', phone: '7345551234', email: 'a..b@c.co' }), 'email');
  assert.equal(field(null), 'name');
  assert.equal(field({ name: 42, phone: 7345551234, email: 'a@b.co' }), 'name');
});

function field(body: unknown) {
  const r = parseSignup(body);
  return r.ok ? null : r.field;
}
