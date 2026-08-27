import raw from '../data/dataset.json';
import type { Dataset, Question, Segment } from '../types';

export const dataset = raw as unknown as Dataset;

export const TOTAL_GROUP = 'TOTALT';

const segmentById = new Map<string, Segment>(dataset.segments.map((s) => [s.id, s]));
const questionById = new Map<string, Question>(dataset.questions.map((q) => [q.id, q]));

export const getSegment = (id: string): Segment | undefined => segmentById.get(id);
export const getQuestion = (id: string): Question | undefined => questionById.get(id);

/** Segment i en grupp, i arkets ordning. */
export function segmentsInGroup(group: string): Segment[] {
  return dataset.segments.filter((s) => s.group === group);
}

/** Grupper som just den här frågan faktiskt är nedbruten på. */
export function groupsForQuestion(q: Question): string[] {
  return q.segment_groups;
}

/**
 * Bilagan innehåller frågor med identisk frågetext OCH identisk bas som ändå
 * är olika tabeller — typiskt en Netto-sammanställning och en detaljerad
 * uppdelning av samma fråga. De skiljs bara åt av svarsalternativen, så de
 * måste märkas ut där de listas. Annars ser journalisten två likadana rader.
 */
const ambiguous = new Set<string>();
{
  const byKey = new Map<string, string[]>();
  for (const q of dataset.questions) {
    const key = `${q.text}||${q.base_label}`;
    byKey.set(key, [...(byKey.get(key) ?? []), q.id]);
  }
  for (const ids of byKey.values()) if (ids.length > 1) for (const id of ids) ambiguous.add(id);
}

export const isAmbiguous = (id: string): boolean => ambiguous.has(id);

/** Kort lista av svarsalternativ, för att skilja annars identiska frågor åt. */
export function optionPreview(q: Question, max = 3): string {
  const shown = q.options.slice(0, max).map((o) => o.label);
  const rest = q.options.length - shown.length;
  return shown.join(' · ') + (rest > 0 ? ` · +${rest} till` : '');
}

/**
 * Frågeindexet är det enda språkmodellen får se. Inga värden, bara metadata.
 * Byggs här så att både klienten och serverless-funktionen använder samma form.
 */
export interface IndexEntry {
  id: string;
  text: string;
  base_label: string;
  segment_groups: string[];
  options: string[];
}

export function buildQuestionIndex(d: Dataset = dataset): IndexEntry[] {
  return d.questions.map((q) => ({
    id: q.id,
    text: q.text,
    base_label: q.base_label,
    segment_groups: q.segment_groups,
    options: q.options.map((o) => o.label),
  }));
}
