/**
 * Deterministisk sökning över frågetexter, baser och svarsalternativ.
 *
 * Används på två ställen:
 *  - fas 2, sökfältet, helt utan API-anrop
 *  - fas 3, som fallback när modellen inte hittar någon match: de tre
 *    närmaste frågorna föreslås i stället för ett svar
 */
import type { Question } from '../types';
import { dataset } from './dataset';

const STOPWORDS = new Set([
  'och', 'eller', 'att', 'som', 'har', 'hur', 'vad', 'vem', 'vilka', 'vilken',
  'vilket', 'den', 'det', 'de', 'du', 'jag', 'man', 'en', 'ett', 'i', 'på',
  'av', 'för', 'med', 'om', 'till', 'är', 'var', 'kan', 'många', 'mycket',
  'procent', 'andel', 'använder', 'använda',
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/å|ä/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const tokenize = (s: string): string[] => normalize(s).split(' ').filter(Boolean);

interface Indexed { q: Question; tokens: Set<string>; optionTokens: Set<string>; baseTokens: Set<string>; }

const index: Indexed[] = dataset.questions.map((q) => ({
  q,
  tokens: new Set(tokenize(q.text)),
  optionTokens: new Set(q.options.flatMap((o) => tokenize(o.label))),
  baseTokens: new Set(tokenize(q.base_label)),
}));

function hits(needle: string, haystack: Set<string>): number {
  if (haystack.has(needle)) return 1;
  for (const t of haystack) {
    if (t.length >= 4 && (t.startsWith(needle) || needle.startsWith(t))) return 0.7;
    if (needle.length >= 4 && t.includes(needle)) return 0.5;
  }
  return 0;
}

export interface SearchHit { question: Question; score: number; }

export function searchQuestions(query: string, limit = 8): SearchHit[] {
  const all = tokenize(query);
  const terms = all.filter((t) => !STOPWORDS.has(t) && t.length > 1);
  const use = terms.length ? terms : all;
  if (use.length === 0) return [];

  const scored: SearchHit[] = [];
  for (const entry of index) {
    let score = 0;
    for (const t of use) {
      score += hits(t, entry.tokens) * 1.0;
      score += hits(t, entry.optionTokens) * 0.8;
      score += hits(t, entry.baseTokens) * 0.3;
    }
    if (score > 0) scored.push({ question: entry.q, score: score / use.length });
  }

  // Stabil sortering: poäng först, därefter id, så att lika träffar aldrig hoppar.
  scored.sort((a, b) => b.score - a.score || a.question.id.localeCompare(b.question.id));
  return scored.slice(0, limit);
}

/** Teckenbigram, för när inget ord alls överlappar. */
function bigrams(s: string): Set<string> {
  const t = normalize(s).replace(/\s/g, '');
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return (2 * shared) / (a.size + b.size);
}

const bigramIndex = dataset.questions.map((q) => ({ q, grams: bigrams(`${q.text} ${q.base_label}`) }));

/**
 * De tre närmaste frågorna. Visas i stället för ett svar när ingenting matchar.
 *
 * Ordmatchning räcker inte här: frågar någon om padel finns inget gemensamt ord
 * med en enda fråga i undersökningen, och då blir listan tom. Men löftet är tre
 * förslag, alltid. Teckenlikhet fyller på så att listan aldrig är tom när det
 * finns frågor att föreslå — det är fortfarande ett förslag, aldrig ett svar.
 */
export function nearestQuestions(query: string, limit = 3): Question[] {
  const picked = searchQuestions(query, limit).map((h) => h.question);
  if (picked.length >= limit) return picked;

  const have = new Set(picked.map((q) => q.id));
  const grams = bigrams(query);
  const rest = bigramIndex
    .filter((e) => !have.has(e.q.id))
    .map((e) => ({ q: e.q, score: dice(grams, e.grams) }))
    .sort((a, b) => b.score - a.score || a.q.id.localeCompare(b.q.id));

  for (const r of rest) {
    if (picked.length >= limit) break;
    picked.push(r.q);
  }
  return picked;
}

/**
 * Gissar vilket svarsalternativ användaren är ute efter inom en fråga.
 * Ren textmatchning, ingen modell inblandad.
 */
export function bestOption(q: Question, query: string): string | null {
  const terms = tokenize(query).filter((t) => !STOPWORDS.has(t));
  if (!terms.length) return null;
  let best: { label: string; score: number } | null = null;
  for (const o of q.options) {
    const ot = new Set(tokenize(o.label));
    let score = 0;
    for (const t of terms) score += hits(t, ot);
    if (score > 0 && (!best || score > best.score)) best = { label: o.label, score };
  }
  return best ? best.label : null;
}

/** Gissar segmentgrupp ur fritext, för fas 2 och som stöd i fas 3. */
export function bestSegmentGroup(q: Question, query: string): string | null {
  const terms = tokenize(query);
  if (!terms.length) return null;
  let best: { group: string; score: number } | null = null;
  for (const group of q.segment_groups) {
    const gt = new Set(tokenize(group));
    // Segmentetiketterna räknas också: "00-talister" ska peka på GENERATION.
    for (const s of dataset.segments) if (s.group === group) for (const t of tokenize(s.label)) gt.add(t);
    let score = 0;
    for (const t of terms) score += hits(t, gt);
    if (score > 0 && (!best || score > best.score)) best = { group, score };
  }
  return best ? best.group : null;
}
