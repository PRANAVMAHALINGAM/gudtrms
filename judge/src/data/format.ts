export function money(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = abs % 100;
  return `${cents < 0 ? '-' : ''}$${dollars}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-11-30' -> 'Nov 30' (no Date object, so no timezone shift). */
export function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

export const nameOf = (p: { display_name: string | null; role: string } | undefined) =>
  p?.display_name ?? (p?.role === 'A' ? 'Person A' : 'Person B');
