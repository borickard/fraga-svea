import type { OptionShape } from './query';

/**
 * Läsanvisningarna under en graf.
 *
 * Delas av svarskortet och dashboardens moduler. De är inte dekor utan
 * projektets grundregler i textform — basen, vad som får läggas ihop, vad
 * Netto betyder, när en siffra vilar på för få svar. Två kopior av dem hade
 * glidit isär vid första ändringen, och då hade den ena börjat ljuga.
 */
export interface NoteInput {
  shape: OptionShape | null;
  /** Visas x-axeln som frågans svarsalternativ? Bara då betyder summan något. */
  showsSum: boolean;
  hasNettoRow: boolean;
  hasSmallBase: boolean;
  weighted: boolean;
}

export function readingNotes({ shape, showsSum, hasNettoRow, hasSmallBase, weighted }: NoteInput): string[] {
  const notes: string[] = [];
  const sum = Boolean(shape) && showsSum;
  if (shape && sum) {
    const pct = Math.round(shape.sum * 100);
    notes.push(shape.exclusive
      ? `Ett svar per person — alternativen utesluter varandra och summerar till ${pct} %`
      : `Alternativen kan inte läggas ihop — de summerar till ${pct} %`);
  }
  if (hasNettoRow) {
    notes.push(sum
      ? 'Netto-rader är bilagans egna sammanfattningar och ingår inte i summan'
      : 'Netto-rader är bilagans egna sammanfattningar av flera alternativ');
  }
  if (hasSmallBase) {
    notes.push(weighted
      ? '° färre än 100 viktade intervjuer — tolka med försiktighet'
      : '° färre än 100 intervjuer — tolka med försiktighet');
  }
  return notes;
}
