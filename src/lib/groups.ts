/**
 * Tabellbilagan splittrar upp en och samma fråga på tre sätt. Alla tre är
 * filter inuti frågan, inte olika frågor:
 *
 *  1. Bas. "Hur ofta använder du internet?" finns på Samtliga 16+ år, -64 år
 *     och 65+ år. Det är åldersfilter, inte tre frågor.
 *  2. Frekvens. "Vilka sociala medier har du använt minst någon gång / minst
 *     varje vecka / dagligen" är tre tabeller men en fråga om hur ofta.
 *  3. Netto mot detalj. Samma fråga och samma bas i två tabeller, den ena med
 *     sammanfattande Netto-rader, den andra med varje verktyg för sig.
 *
 * Datasetet speglar arket troget — en post per tabell — och grupperingen sker
 * här, i presentationslagret. Det är därför parsern förblir verifierbar mot
 * cellerna medan gränssnittet visar en fråga.
 */
import type { Question, QuestionOption } from '../types';
import { dataset } from './dataset';
import { titleFor } from './labels';
import rawClusters from '../data/clusters.json';

/**
 * Frekvensfraser som bilagan varierar på. Ordningen spelar roll: de mest
 * specifika först, annars äter den korta varianten den långa.
 */
const FREQUENCY_PATTERNS: [RegExp, string][] = [
  [/\s*minst\s+n[åa]gon\s+g[åa]ng\s+(?:under\s+)?de\s+senaste\s+12\s+m[åa]naderna/i, 'Minst någon gång'],
  [/\s*minst\s+n[åa]gon\s+g[åa]ng/i, 'Minst någon gång'],
  [/\s*minst\s+varje\s+vecka/i, 'Varje vecka'],
  [/\s*dagligen/i, 'Dagligen'],
  [/\s*(?:under\s+)?de\s+senaste\s+12\s+m[åa]naderna/i, ''],
];

/** Ordningen frekvenserna visas i, från bredast till smalast. */
const FREQUENCY_ORDER = ['Minst någon gång', 'Varje vecka', 'Dagligen'];

interface Stemmed { stem: string; frequency: string | null; }

function stemOf(text: string): Stemmed {
  let t = text;
  let frequency: string | null = null;
  for (const [re, name] of FREQUENCY_PATTERNS) {
    if (re.test(t)) {
      if (name && !frequency) frequency = name;
      t = t.replace(re, ' ');
    }
  }
  return { stem: t.replace(/\s+/g, ' ').replace(/\s+\?/, '?').trim(), frequency };
}

/** Titeln utan frekvenssuffix — gruppens rubrik. */
function groupTitleOf(q: Question): string {
  return titleFor(q)
    .replace(/\s*[–-]\s*(minst\s+n[åa]gon\s+g[åa]ng|n[åa]gon\s+g[åa]ng|varje\s+vecka|dagligen|hur\s+ofta)\s*$/i, '')
    .trim();
}

export interface Variant {
  question: Question;
  base: string;
  frequency: string | null;
  /** Värdet på klustrets extra axel, t.ex. plattformen. */
  object: string | null;
}

export interface QuestionGroup {
  id: string;
  title: string;
  /** Frågetexten för den variant som visas först. Alltid ordagrann ur arket. */
  sampleText: string;
  variants: Variant[];
  bases: string[];
  frequencies: string[];
  /** Klustrets extra axel. Tom lista när frågan inte ingår i något kluster. */
  objects: string[];
  objectLabel: string | null;
}

interface ClusterMember { text: string; label?: string; }
interface Cluster {
  id: string;
  label: string;
  dimension: 'objekt' | 'frekvens';
  dimensionLabel?: string;
  members: ClusterMember[];
}
const clusters = (rawClusters as { clusters: Cluster[] }).clusters;

const groups: QuestionGroup[] = [];
const groupByQuestionId = new Map<string, QuestionGroup>();

function build(id: string, title: string, variants: Variant[]): QuestionGroup {
  const uniq = (xs: (string | null)[]) => {
    const out: string[] = [];
    for (const x of xs) if (x && !out.includes(x)) out.push(x);
    return out;
  };
  return {
    id,
    title,
    sampleText: variants[0].question.text,
    variants,
    bases: uniq(variants.map((v) => v.base)),
    frequencies: FREQUENCY_ORDER.filter((f) => variants.some((v) => v.frequency === f)),
    objects: uniq(variants.map((v) => v.object)),
    objectLabel: null,
  };
}

{
  const byStem = new Map<string, Variant[]>();
  for (const q of dataset.questions) {
    const { stem, frequency } = stemOf(q.text);
    const key = `${groupTitleOf(q)}||${stem}`;
    byStem.set(key, [...(byStem.get(key) ?? []), { question: q, base: q.base_label, frequency, object: null }]);
  }

  const draft = [...byStem].map(([key, variants]) => build(key, groupTitleOf(variants[0].question), variants));

  // Kluster: slå ihop de deklarerade frågorna till en post med en extra axel.
  const consumed = new Set<QuestionGroup>();
  const merged = new Map<string, QuestionGroup>();

  for (const cluster of clusters) {
    const variants: Variant[] = [];
    for (const member of cluster.members) {
      const g = draft.find((x) => !consumed.has(x) && x.variants.some((v) => v.question.text === member.text));
      if (!g) continue;
      consumed.add(g);
      for (const v of g.variants) {
        variants.push(
          cluster.dimension === 'objekt'
            ? { ...v, object: member.label ?? member.text }
            : { ...v, frequency: v.frequency ?? member.label ?? null },
        );
      }
    }
    if (!variants.length) continue;
    const group = build(cluster.id, cluster.label, variants);
    group.objectLabel = cluster.dimension === 'objekt' ? (cluster.dimensionLabel ?? 'Val') : null;
    merged.set(cluster.id, group);
  }

  // Behåll arkets ordning: klustret hamnar där dess första medlem låg.
  const placedClusters = new Set<string>();
  for (const g of draft) {
    if (!consumed.has(g)) { groups.push(g); continue; }
    const cluster = clusters.find((c) => c.members.some((m) => g.variants.some((v) => v.question.text === m.text)));
    if (cluster && merged.has(cluster.id) && !placedClusters.has(cluster.id)) {
      placedClusters.add(cluster.id);
      groups.push(merged.get(cluster.id)!);
    }
  }

  for (const g of groups) for (const v of g.variants) groupByQuestionId.set(v.question.id, g);
}

export const allGroups = (): QuestionGroup[] => groups;
export const groupOf = (questionId: string): QuestionGroup | undefined => groupByQuestionId.get(questionId);

/**
 * Slår ihop varianter som delar både bas och frekvens.
 *
 * Det gäller ett enda fall i 2025 års bilaga: AI-verktygsfrågan finns som en
 * Netto-tabell och en detaljerad tabell på samma bas, med samma n. De är i
 * praktiken en tabell som delats i två, så alternativen läggs ihop och
 * journalisten får välja mellan "Netto – Har använt AI-verktyg" och
 * "Ja, ChatGPT" i samma lista.
 *
 * Sammanslagningen sker bara när bas OCH n är identiska. Skiljer sig n är det
 * inte samma population och tabellerna hålls isär.
 */
function merge(members: Question[]): Question {
  if (members.length === 1) return members[0];

  const first = members[0];
  const nOf = (q: Question) => q.options[0]?.values['totalt']?.n ?? -1;
  const same = members.filter((m) => m.base_label === first.base_label && nOf(m) === nOf(first));
  if (same.length === 1) return first;

  const options: QuestionOption[] = [];
  const seen = new Set<string>();
  for (const m of same) {
    for (const o of m.options) {
      if (seen.has(o.label)) continue;
      seen.add(o.label);
      options.push(o);
    }
  }
  return { ...first, options };
}

export interface Selection {
  base?: string | null;
  frequency?: string | null;
  object?: string | null;
}

/** Plockar ut den variant som matchar valen, med sammanslagna alternativ. */
export function resolve(group: QuestionGroup, sel: Selection = {}): Question {
  let candidates = group.variants;

  if (sel.base) {
    const byBase = candidates.filter((v) => v.base === sel.base);
    if (byBase.length) candidates = byBase;
  }
  if (sel.frequency) {
    const byFreq = candidates.filter((v) => v.frequency === sel.frequency);
    if (byFreq.length) candidates = byFreq;
  }
  if (sel.object) {
    const byObject = candidates.filter((v) => v.object === sel.object);
    if (byObject.length) candidates = byObject;
  }
  return merge(candidates.map((v) => v.question));
}

/** Vilken bas och frekvens en given fråga motsvarar inom sin grupp. */
export function selectionFor(questionId: string): Selection {
  const g = groupByQuestionId.get(questionId);
  const v = g?.variants.find((x) => x.question.id === questionId);
  return { base: v?.base ?? null, frequency: v?.frequency ?? null, object: v?.object ?? null };
}

/**
 * Vilka val som faktiskt finns givet de andra valen.
 *
 * Klustret "Enskilda plattformar" har 22 objekt, men bara Linkedin finns på
 * basen Förvärvsarbetar. Utan den här filtreringen erbjuder gränssnittet en
 * bas som inte gäller den valda plattformen.
 */
export function axesFor(group: QuestionGroup, sel: Selection = {}) {
  const uniq = (xs: (string | null)[]) => {
    const out: string[] = [];
    for (const x of xs) if (x && !out.includes(x)) out.push(x);
    return out;
  };
  const forObject = sel.object
    ? group.variants.filter((v) => v.object === sel.object)
    : group.variants;
  return {
    bases: uniq(forObject.map((v) => v.base)),
    frequencies: FREQUENCY_ORDER.filter((f) => forObject.some((v) => v.frequency === f)),
    objects: group.objects,
  };
}

/**
 * Vilket objekt i klustret användaren skrev om. "Tiktok" ska öppna klustret
 * med Tiktok vald, inte med den första plattformen i listan.
 */
export function bestObject(group: QuestionGroup, query: string): string | null {
  if (group.objects.length < 2) return null;
  const q = query.toLowerCase();
  let best: { object: string; at: number } | null = null;
  for (const o of group.objects) {
    const at = q.indexOf(o.toLowerCase().split(" (")[0]);
    if (at >= 0 && (!best || at < best.at)) best = { object: o, at };
  }
  return best ? best.object : null;
}
