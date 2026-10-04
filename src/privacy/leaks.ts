// Leak filter, step 1: number and date matching (owner: Pranav). AGENTS.md section 6, "Leak filter".
// Pure functions, no DB, no LLM. leakFilter.ts loads the sets and decides what to do.

/** Every dollar amount in the text, in cents. Only counts amounts with a $ or a unit, so "round 2" is ignored. */
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  const re = /(\$)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(k|thousand)?\b|\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(k|thousand|dollars?|bucks|usd)\b/gi;
  for (const m of text.matchAll(re)) {
    const [whole, frac, unit] = m[1] ? [m[2]!, m[3], m[4]] : [m[5]!, m[6], m[7]];
    let n = Number(`${whole.replace(/,/g, '')}${frac ? `.${frac}` : ''}`);
    if (unit && /^(k|thousand)$/i.test(unit)) n *= 1000;
    if (Number.isFinite(n)) out.push(Math.round(n * 100));
  }
  return out;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const mmdd = (m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;

/** Every calendar date in the text as 'MM-DD' (year ignored): "Nov 30", "30th of November", "11/30", "2026-11-30". */
export function datesIn(text: string): string[] {
  const out: (string | null)[] = [];
  for (const m of text.matchAll(new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'gi'))) {
    out.push(mmdd(MONTHS[m[1]!.slice(0, 3).toLowerCase()]!, Number(m[2])));
  }
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b`, 'gi'))) {
    out.push(mmdd(MONTHS[m[2]!.slice(0, 3).toLowerCase()]!, Number(m[1])));
  }
  for (const m of text.matchAll(/\b\d{4}-(\d{2})-(\d{2})\b/g)) out.push(mmdd(Number(m[1]), Number(m[2])));
  for (const m of text.matchAll(/(?<![\d-])(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g)) out.push(mmdd(Number(m[1]), Number(m[2])));
  return out.filter((d): d is string => d !== null);
}

/** 'YYYY-MM-DD' -> 'MM-DD'. */
export const monthDay = (iso: string) => iso.slice(5, 10);

export interface NumberSets {
  cents: Set<number>;
  dates: Set<string>;
}

export const emptySets = (): NumberSets => ({ cents: new Set(), dates: new Set() });

export function addText(sets: NumberSets, text: string): void {
  for (const c of amountsIn(text)) sets.cents.add(c);
  for (const d of datesIn(text)) sets.dates.add(d);
}

/**
 * Does the text contain one of the OTHER person's private amounts or dates that isn't also allowed
 * (the recipient's own numbers, shared facts, anything already in a proposal or agreement, anything
 * the recipient said themselves)? Returns what kind of thing matched, never the value itself.
 */
export function findLeak(text: string, forbidden: NumberSets, allowed: NumberSets): 'amount' | 'date' | null {
  if (amountsIn(text).some((c) => c !== 0 && forbidden.cents.has(c) && !allowed.cents.has(c))) return 'amount';
  if (datesIn(text).some((d) => forbidden.dates.has(d) && !allowed.dates.has(d))) return 'date';
  return null;
}
