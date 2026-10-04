// Checks the landing page's sign-up form (owner: Pranav). Pure, so it's easy to test.

import { normalizePhone } from '../messaging/phone.ts';
import type { NewSharedUser } from './photon.ts';

// Photon's own email pattern, so anything we accept, Photon accepts too.
const EMAIL = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export type SignupField = 'name' | 'phone' | 'email';
export type SignupResult = { ok: true; user: NewSharedUser } | { ok: false; field: SignupField; message: string };

export function parseSignup(body: unknown): SignupResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

  const name = text(b.name);
  if (!name) return { ok: false, field: 'name', message: 'What should we call you?' };
  if (name.length > 80) return { ok: false, field: 'name', message: 'That name is a bit long. Try just your first name.' };

  const phoneNumber = normalizePhone(text(b.phone));
  if (!phoneNumber) {
    return { ok: false, field: 'phone', message: 'That number doesn’t look right. US numbers need 10 digits; others start with +.' };
  }

  const email = text(b.email);
  if (email.length > 254 || !EMAIL.test(email)) {
    return { ok: false, field: 'email', message: 'That email doesn’t look right.' };
  }

  const [firstName = name, ...rest] = name.split(' ');
  return { ok: true, user: { phoneNumber, firstName, lastName: rest.join(' ') || null, email } };
}
