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
import rawTitles from '../data/titles.json';
import rawTopics from '../data/topics.json';
import { dataset } from './dataset';

const titles = rawTitles as Record<string, string | string[]>;

export function titleFor(q: Question): string {
  const t = titles[q.text];
  return typeof t === 'string' && t ? t : q.text;
}

/** Sant när titeln säger något frågetexten inte redan säger. */
export const hasTitle = (q: Question): boolean => titleFor(q) !== q.text;

export interface Topic { id: string; label: string; keywords: string[]; }

export const topics: Topic[] = (rawTopics as { topics: Topic[] }).topics;

const haystackFor = (q: Question): string =>
  [titleFor(q), q.text, q.base_label, ...q.options.map((o) => o.label)]
    .join(' ')
    .toLowerCase();

const topicsByQuestion = new Map<string, string[]>();
const questionsByTopic = new Map<string, Question[]>();

for (const q of dataset.questions) {
  const hay = haystackFor(q);
  const matched = topics.filter((t) => t.keywords.some((k) => hay.includes(k.toLowerCase())));
  topicsByQuestion.set(q.id, matched.map((t) => t.id));
  for (const t of matched) questionsByTopic.set(t.id, [...(questionsByTopic.get(t.id) ?? []), q]);
}

export const topicsFor = (q: Question): Topic[] =>
  (topicsByQuestion.get(q.id) ?? []).map((id) => topics.find((t) => t.id === id)!).filter(Boolean);

export const questionsInTopic = (topicId: string): Question[] => questionsByTopic.get(topicId) ?? [];

/** Ämnen som faktiskt har frågor, i filens ordning. */
export const activeTopics = (): (Topic & { count: number })[] =>
  topics
    .map((t) => ({ ...t, count: questionsInTopic(t.id).length }))
    .filter((t) => t.count > 0);
