/**
 * Datasetet, en årgång per fil.
 *
 * Varje årgång är en egen, orörd spegling av sin tabellbilaga. De blandas
 * aldrig: en fråga hör till ett år, och ett svar hämtas alltid ur det år
 * användaren valt. Att jämföra år kräver en granskad koppling mellan
 * frågorna, inte en gissning på att texten råkar vara lika — se README.
 */
import d2025 from '../data/dataset-2025.json';
import d2026 from '../data/dataset-2026.json';
import type { Dataset, Question, Segment } from '../types';

export const TOTAL_GROUP = 'TOTALT';

const datasets: Dataset[] = [d2026, d2025] as unknown as Dataset[];

/** Nyast först. Ordningen styr årsväljaren. */
export const YEARS: number[] = datasets.map((d) => d.meta.year);
export const DEFAULT_YEAR = YEARS[0];

const byYear = new Map<number, Dataset>(datasets.map((d) => [d.meta.year, d]));

export function datasetFor(year: number): Dataset {
  return byYear.get(year) ?? datasets[0];
}

/** Bygger en uppslagning per årgång, en gång, vid första användning. */
function perYear<T>(build: (d: Dataset) => T): (year: number) => T {
  const cache = new Map<number, T>();
  return (year: number) => {
    const key = byYear.has(year) ? year : DEFAULT_YEAR;
    let v = cache.get(key);
    if (v === undefined) { v = build(datasetFor(key)); cache.set(key, v); }
    return v;
  };
}

const segmentIndex = perYear((d) => new Map(d.segments.map((s) => [s.id, s])));
const questionIndex = perYear((d) => new Map(d.questions.map((q) => [q.id, q])));

export const getSegment = (year: number, id: string): Segment | undefined => segmentIndex(year).get(id);
export const getQuestion = (year: number, id: string): Question | undefined => questionIndex(year).get(id);

/** Segment i en grupp, i arkets ordning. */
export const segmentsInGroup = (year: number, group: string): Segment[] =>
  datasetFor(year).segments.filter((s) => s.group === group);

/**
 * Bilagan innehåller frågor med identisk frågetext OCH identisk bas som ändå
 * är olika tabeller — typiskt en Netto-sammanställning och en detaljerad
 * uppdelning av samma fråga. De skiljs bara åt av svarsalternativen.
 */
const ambiguousIds = perYear((d) => {
  const byKey = new Map<string, string[]>();
  for (const q of d.questions) {
    const key = `${q.text}||${q.base_label}`;
    byKey.set(key, [...(byKey.get(key) ?? []), q.id]);
  }
  const out = new Set<string>();
  for (const ids of byKey.values()) if (ids.length > 1) for (const id of ids) out.add(id);
  return out;
});

export const isAmbiguous = (year: number, id: string): boolean => ambiguousIds(year).has(id);

/** Kort lista av svarsalternativ, för att skilja annars identiska frågor åt. */
export function optionPreview(q: Question, max = 3): string {
  const shown = q.options.slice(0, max).map((o) => o.label);
  const rest = q.options.length - shown.length;
  return shown.join(' · ') + (rest > 0 ? ` · +${rest} till` : '');
}

/**
 * Frågeindexet är det enda språkmodellen får se. Inga värden, bara metadata.
 */
export interface IndexEntry {
  id: string;
  text: string;
  base_label: string;
  segment_groups: string[];
  options: string[];
}

export function buildQuestionIndex(year: number): IndexEntry[] {
  return datasetFor(year).questions.map((q) => ({
    id: q.id,
    text: q.text,
    base_label: q.base_label,
    segment_groups: q.segment_groups,
    options: q.options.map((o) => o.label),
  }));
}
