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
