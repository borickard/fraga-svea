/**
 * Värdena lagras rått som andelar 0–1. All formatering sker här, aldrig i datan.
 * Svensk typografi: mellanslag före procenttecken och som tusentalsavgränsare.
 * Det som lämnar appen hamnar i en artikel.
 */
const NBSP = ' ';

export function formatPct(pct: number | null): string {
  if (pct === null) return 'ingen bas';
  return `${Math.round(pct * 100)}${NBSP}%`;
}

export function formatN(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}
