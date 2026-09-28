/**
 * Redaktionella etiketter: korta titlar och ämnen.
 *
 * Båda ligger i handskrivna filer som går att redigera utan att röra koden,
 * eftersom det är redaktionella beslut och inte tekniska. De styr bara vägen
 * fram till en fråga — vilket värde som slås upp påverkas aldrig.
 *
 * Titeln ersätter aldrig frågans formulering. Svarskortet och den nedladdade
 * bilden visar alltid frågan ordagrant; titeln är en ingång till den.
 */
import type { Question } from '../types';
import { titleFor } from './concepts';
import rawTopics from '../data/topics.json';
import rawExamples from '../data/examples.json';
import { datasetFor, DEFAULT_YEAR, YEARS } from './dataset';

export { titleFor, hasTitle } from './concepts';
export interface Topic {
  id: string;
  label: string;
  keywords: string[];
  /**
   * Kapitel i rapporten, eller null när ämnet bara finns i tabellbilagan.
   * Det är den senare kategorin verktyget existerar för: siffrorna finns,
   * men rapporten redovisar dem inte.
   */
  chapter: number | null;
}

export const topics: Topic[] = (rawTopics as { topics: Topic[] }).topics;

const haystackFor = (q: Question): string =>
  [titleFor(q), q.text, q.base_label, ...q.options.map((o) => o.label)]
    .join(' ')
    .toLowerCase();

// Ämnestillhörighet beräknas per årgång: frågorna skiljer sig mellan åren.
const topicsByQuestion = new Map<string, string[]>();
const questionsByTopic = new Map<string, Question[]>();

for (const year of YEARS) {
  for (const q of datasetFor(year).questions) {
    const hay = haystackFor(q);
    const matched = topics.filter((t) => t.keywords.some((k) => hay.includes(k.toLowerCase())));
    topicsByQuestion.set(`${year}:${q.id}`, matched.map((t) => t.id));
    for (const t of matched) questionsByTopic.set(`${year}:${t.id}`, [...(questionsByTopic.get(`${year}:${t.id}`) ?? []), q]);
  }
}

export const topicsFor = (q: Question, year: number = DEFAULT_YEAR): Topic[] =>
  (topicsByQuestion.get(`${year}:${q.id}`) ?? []).map((id) => topics.find((t) => t.id === id)!).filter(Boolean);

export const questionsInTopic = (year: number, topicId: string): Question[] =>
  questionsByTopic.get(`${year}:${topicId}`) ?? [];

/** Ämnen som faktiskt har frågor det valda året, i filens ordning. */
export const activeTopics = (year: number): (Topic & { count: number })[] =>
  topics
    .map((t) => ({ ...t, count: questionsInTopic(year, t.id).length }))
    .filter((t) => t.count > 0);

export interface Example { topic: string; text: string; }

const examples = (rawExamples as { examples: Example[] }).examples;

/**
 * Exempelfrågor, ordagrant ur rapportens avsnittsrubriker. Utan dem är
 * sökfältet en tom ruta och det är oklart vad man kan fråga om.
 * Utan valt ämne visas en fråga från vart och ett av rapportens kapitel.
 */
export function examplesFor(topicId: string | null, limit = 4): Example[] {
  if (topicId) return examples.filter((e) => e.topic === topicId).slice(0, limit);
  const perTopic = new Map<string, Example>();
  for (const e of examples) if (!perTopic.has(e.topic)) perTopic.set(e.topic, e);
  return [...perTopic.values()].slice(0, limit);
}
