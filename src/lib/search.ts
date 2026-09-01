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
import { titleFor } from './labels';
import { synonymsFor } from './synonyms';

const STOPWORDS = new Set([
  'och', 'eller', 'att', 'som', 'har', 'hur', 'vad', 'vem', 'vilka', 'vilken',
  'vilket', 'den', 'det', 'de', 'du', 'jag', 'en', 'ett', 'i', 'på',
  'av', 'för', 'med', 'om', 'till', 'är', 'var', 'kan', 'många', 'mycket',
  'procent', 'andel', 'senaste', 'månaderna', 'följande', 'något', 'någon',
  // Böjningar av "använda" bär ingen information: nästan varje fråga i
  // undersökningen innehåller någon av dem.
  'använder', 'använda', 'använt', 'använts', 'använde', 'användt',
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

interface OptionTokens { tokens: Set<string>; brevity: number; }
interface Indexed {
  q: Question;
  tokens: Set<string>;
  /** Frågetexten som ordlista, för fras- och täckningsbedömning. */
  sequence: string[];
  contentCount: number;
  options: OptionTokens[];
  optionTokens: Set<string>;
  baseTokens: Set<string>;
}

/**
 * Ett ord som dyker upp i "Ja, ChatGPT" säger något. Samma ord inne i
 * "E-vårdtjänster/e-tjänster för sjukvården (logga in på 1177.se, digitala
 * vårdbesök, söka info online vid sjukdom etc.)" säger nästan ingenting —
 * långa uppräkningar råkar innehålla allt. Dämpa efter etikettens längd.
 */
const brevityOf = (tokenCount: number): number => 1 / (1 + Math.log(1 + Math.max(0, tokenCount - 3) / 4));

const index: Indexed[] = dataset.questions.map((q) => {
  const options = q.options.map((o) => {
    const t = tokenize(o.label);
    return { tokens: new Set(t), brevity: brevityOf(t.length) };
  });
  // Titeln indexeras tillsammans med frågetexten. Flera frågor i bilagan
  // heter bara "Youtube" eller "Har du tidigare använt …?" och går annars
  // inte att hitta på det de faktiskt handlar om.
  const sequence = tokenize(`${titleFor(q)} ${q.text}`);
  // Synonymerna indexeras men syns aldrig. Ingen skriver "mikrootrohet" i ett
  // sökfält; många skriver "svartsjuka".
  const synonyms = new Set(synonymsFor(q).flatMap(tokenize));
  return {
    q,
    tokens: new Set([...sequence, ...synonyms]),
    sequence,
    contentCount: Math.max(1, sequence.filter((t) => !STOPWORDS.has(t)).length),
    options,
    optionTokens: new Set(q.options.flatMap((o) => tokenize(o.label))),
    baseTokens: new Set(tokenize(q.base_label)),
  };
});

/**
 * Hur särskiljande ett ord är. "Chatgpt" och "arbetslös" pekar ut en enda
 * fråga; "verktyg", "sociala" och "internet" finns i halva undersökningen.
 * Utan den viktningen vinner alltid den fråga som råkar innehålla flest
 * vanliga ord, vilket är fel fråga.
 */
const documentFrequency = new Map<string, number>();
for (const entry of index) {
  const seen = new Set([...entry.tokens, ...entry.optionTokens, ...entry.baseTokens]);
  for (const t of seen) documentFrequency.set(t, (documentFrequency.get(t) ?? 0) + 1);
}

function weight(term: string): number {
  let df = documentFrequency.get(term) ?? 0;
  if (df === 0) {
    // Okänt ord kan ändå matcha via prefix eller ordstam. Ge det den lägsta
    // frekvensen bland de ord det liknar, annars vore det viktlöst.
    for (const [t, n] of documentFrequency) {
      if (t.length >= 4 && (t.startsWith(term) || term.startsWith(t))) df = df === 0 ? n : Math.min(df, n);
    }
  }
  if (df === 0) df = 1;
  return Math.log(1 + index.length / df);
}

/** Längden på ordens gemensamma inledning. */
function sharedPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

function hits(needle: string, haystack: Set<string>): number {
  if (haystack.has(needle)) return 1;
  let best = 0;
  for (const t of haystack) {
    if (t.length >= 4 && (t.startsWith(needle) || needle.startsWith(t))) best = Math.max(best, 0.7);
    // Svensk böjning: "e-handlar" mot "e-handlat", "bluffannons" mot
    // "bluffannonser". Ingen stemmer, bara gemensam ordstam.
    else if (t.length >= 5 && needle.length >= 5 && sharedPrefix(t, needle) >= Math.min(t.length, needle.length) - 1) {
      best = Math.max(best, 0.6);
    }
    else if (needle.length >= 5 && t.includes(needle)) best = Math.max(best, 0.5);
  }
  return best;
}

export interface SearchHit { question: Question; score: number; }

export function searchQuestions(query: string, limit = 8): SearchHit[] {
  const all = tokenize(query);
  const terms = all.filter((t) => !STOPWORDS.has(t) && t.length > 1);
  const use = terms.length ? terms : all;
  if (use.length === 0) return [];

  const weights = new Map(use.map((t) => [t, weight(t)]));
  const totalWeight = [...weights.values()].reduce((a, b) => a + b, 0) || 1;

  const scored: SearchHit[] = [];
  for (const entry of index) {
    // Frågetexten väger tyngst, men ett namngivet verktyg som "ChatGPT" finns
    // bara bland svarsalternativen — därför får de inte vara försumbara.
    let score = 0;
    const matched = new Set<string>();
    for (const t of use) {
      const w = weights.get(t) ?? 1;
      let optionHit = 0;
      for (const o of entry.options) optionHit = Math.max(optionHit, hits(t, o.tokens) * o.brevity);
      const best = Math.max(
        hits(t, entry.tokens) * 1.0,
        optionHit * 0.85,
        hits(t, entry.baseTokens) * 0.5,
      );
      if (hits(t, entry.tokens) > 0) matched.add(t);
      score += best * w;
    }
    if (score <= 0) continue;
    let final = score / totalWeight;

    // Täckning. "Sociala medier" matchar både "Vilka sociala nätverksplatser/
    // sociala medier har du använt…" och "Brukar du kolla upp dina ex på nätet,
    // alltså googla dem eller kolla på deras sociala medier?" — båda innehåller
    // orden, båda får full poäng, och utan det här avgörs ordningen av
    // bokstavsordning på id. Frågan som HANDLAR om ämnet har en större del av
    // sin egen text täckt av sökningen än frågan som råkar nämna det på slutet.
    let covered = 0;
    for (const t of new Set(entry.sequence)) if (!STOPWORDS.has(t) && matched.has(t)) covered++;
    final *= 1 + 0.6 * (covered / entry.contentCount);

    // Fras. Står sökorden intill varandra i frågetexten är det starkare
    // belägg än att de finns utspridda i den.
    if (use.length > 1) {
      for (let i = 0; i + use.length <= entry.sequence.length; i++) {
        if (use.every((t, k) => entry.sequence[i + k] === t)) { final *= 1.35; break; }
      }
    }

    scored.push({ question: entry.q, score: final });
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
 *
 * Två saker gör den försiktig med flit. Ord som redan finns i frågetexten
 * räknas inte: skriver någon "hur många har sett bluffannonser på sociala
 * medier" så handlar "sociala medier" om frågan, inte om alternativet — utan
 * den regeln väljs "Använder inte sociala medier", alltså raka motsatsen till
 * det som efterfrågas. Och en svag träff ger null i stället för en gissning,
 * så att första alternativet används.
 */
const OPTION_MIN_SCORE = 0.75;

export function bestOption(q: Question, query: string): string | null {
  const questionTokens = new Set(tokenize(q.text));
  const terms = tokenize(query)
    .filter((t) => !STOPWORDS.has(t) && t.length > 1)
    .filter((t) => hits(t, questionTokens) === 0);
  if (!terms.length) return null;

  let best: { label: string; score: number } | null = null;
  for (const o of q.options) {
    const ot = new Set(tokenize(o.label));
    let score = 0;
    for (const t of terms) score += hits(t, ot) * weight(t);
    if (!best || score > best.score) best = { label: o.label, score };
  }
  return best && best.score >= OPTION_MIN_SCORE ? best.label : null;
}

/** Gissar segmentgrupp ur fritext, för fas 2 och som stöd i fas 3. */
const SEGMENT_MIN_SCORE = 0.9;

/**
 * Gissar segmentgrupp ur fritext, för fas 2 och som stöd i fas 3.
 *
 * Försiktig av samma skäl som bestOption. Ord som redan står i frågetexten
 * räknas inte, och stoppord räknas inte alls: annars valde "hur många
 * använder chatgpt" gruppen ANVÄNDER ENHET REGELBUNDET, bara för att ordet
 * "använder" råkar ingå i gruppnamnet. En nedbrytning som användaren inte
 * bett om är värre än ingen nedbrytning — totalen är rätt svar på en fråga
 * utan segment.
 */
export function bestSegmentGroup(q: Question, query: string): string | null {
  const questionTokens = new Set(tokenize(q.text));
  const terms = tokenize(query)
    .filter((t) => !STOPWORDS.has(t) && t.length > 1)
    .filter((t) => hits(t, questionTokens) === 0);
  if (!terms.length) return null;

  let best: { group: string; score: number } | null = null;
  for (const group of q.segment_groups) {
    const gt = new Set(tokenize(group));
    // Segmentetiketterna räknas också: "00-talister" ska peka på GENERATION.
    for (const s of dataset.segments) if (s.group === group) for (const t of tokenize(s.label)) gt.add(t);
    let score = 0;
    for (const t of terms) score += hits(t, gt) * weight(t);
    if (!best || score > best.score) best = { group, score };
  }
  return best && best.score >= SEGMENT_MIN_SCORE ? best.group : null;
}
