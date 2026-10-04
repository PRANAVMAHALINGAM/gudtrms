// Pure text parsing for the router (owner: Pranav). No DB, no sending, so it's easy to test.
// Whether a keyword actually counts depends on case state; that's decided in ./index.ts.

import { normalizePhone } from '../messaging/phone.ts';

export type Keyword = 'start' | 'join' | 'stop' | 'yes' | 'no';

/**
 * Case codes are 4 characters from an alphabet without look-alikes (no 0/O, 1/I/L),
 * and always contain a digit so a code can never spell a keyword like JOIN or STOP.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_PATTERN = /^(?=.*[2-9])[2-9A-HJKMNP-Z]{4}$/;

/** Lowercases and strips punctuation/emoji at the edges: "Yes!" -> "yes", " STOP. " -> "stop". */
function bare(text: string): string {
  return text.trim().toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

/** The keyword this whole message is, if any. "yes please" is not YES; only the bare word counts. */
export function keywordOf(text: string): Keyword | null {
  switch (bare(text)) {
    case 'start':
      return 'start';
    case 'join':
      return 'join';
    case 'stop':
    case 'unsubscribe':
      return 'stop';
    case 'yes':
    case 'y':
      return 'yes';
    case 'no':
    case 'n':
    case 'nope':
    case 'nah':
      return 'no';
    default:
      return null;
  }
}

/** The case code this message is, if the whole message looks like one ("4f7k", "#4F7K", "4F 7K"). */
export function caseCodeOf(text: string): string | null {
  const candidate = text.trim().toUpperCase().replace(/^#/, '').replace(/[\s-]/g, '');
  return CODE_PATTERN.test(candidate) ? candidate : null;
}

/** A first name from free text: "it's Alex" -> "Alex". Null if it doesn't look like a name. */
export function parseFirstName(text: string): string | null {
  const cleaned = text
    .trim()
    .replace(/^(hi|hey|hello)[,!.\s]+/i, '')
    .replace(/^(i'?m|i am|it'?s|my name is|name is|this is)\s+/i, '')
    .replace(/[.!]+$/, '')
    .trim();
  const first = cleaned.split(/\s+/)[0] ?? '';
  if (!/^[\p{L}][\p{L}'-]{0,29}$/u.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * The ex's first name and phone number from one message: "Sam 734 555 1234", "sam, +1 (734) 555-1234".
 * Returns whatever it found; the caller asks again for anything missing.
 */
export function parseNameAndPhone(text: string): { name: string | null; phone: string | null } {
  const phoneMatch = text.match(/\+?[\d][\d\s().-]{6,}\d/);
  const phone = phoneMatch ? normalizePhone(phoneMatch[0]) : null;
  const rest = phoneMatch ? text.replace(phoneMatch[0], ' ') : text;
  const name = parseFirstName(rest.replace(/[,;:]/g, ' '));
  return { name, phone };
}
