/**
 * Andelar uttryckta i antal människor.
 *
 * "66 procent" säger ingenting om hur stort ett problem är. "280 000
 * tolvåringar" gör det. Omräkningen kräver två saker som bilagan inte har:
 * Sveriges folkmängd, och ett svar på hur många personer varje BAS motsvarar.
 *
 * Basen är det svåra. Bilagans baser är sällan "alla svenskar i åldern X" —
 * 35 av 84 frågor vilar på Internetanvändare 8+ år, som är en delmängd, och
 * några vilar på delmängder av den. Varje bas härleds därför uttryckligen i
 * bases.json, och en bas utan härledning ger inget antal alls.
 *
 * Fördelningen inom basen kommer från undersökningens egna vikter, inte från
 * SCB. Det är med flit: vikterna är redan kalibrerade mot befolkningen OCH
 * mot basens avgränsning. Jämfört med SCB:s faktiska åldersfördelning ligger
 * de inom 0,6 procentenheter i varje åldersband utom 76+, som ligger 1,9
 * lågt — precis vad man väntar sig när basen är internetanvändare och de
 * äldsta har lägst täckning. Att i stället räkna med SCB:s andelar hade
 * raderat den skillnaden och övervärderat de äldsta.
 */
import type { Question, SegmentValue } from '../types';
import { datasetFor } from './dataset';
import pop from '../data/population.json';
import rawBases from '../data/bases.json';

interface Befolkning {
  kalla: string;
  url: string;
  ar: number;
  hamtad: string;
  totalt: number;
  man: number[];
  kvinna: number[];
}
const befolkning = pop as unknown as Befolkning;

export const POPULATION_SOURCE = `${befolkning.kalla}, ${befolkning.ar}-12-31`;
export const POPULATION_YEAR = befolkning.ar;

interface BasRegel {
  bas: string;
  typ: 'befolkning' | 'andel';
  fran?: number;
  till?: number;
  /** Åldrar under gränsen räknas med full täckning. */
  penetration?: { under: number; andel: number };
  av?: string;
  fraga?: string;
  alternativ?: string;
}
const regler = (rawBases as unknown as { baser: BasRegel[] }).baser;

/** Folkmängd i ett åldersspann. 100 rymmer även äldre. */
export function people(from: number, to = 100): number {
  let sum = 0;
  for (let a = Math.max(0, from); a <= Math.min(100, to); a++) {
    sum += (befolkning.man[a] ?? 0) + (befolkning.kvinna[a] ?? 0);
  }
  return sum;
}

/**
 * Andelen internetanvändare 16 år och äldre, hämtad ur bilagan.
 *
 * Penetrationsstudien täcker bara 16+. För yngre finns ingen uppgift, och
 * bases.json säger därför uttryckligen att 8–15-åringar räknas med full
 * täckning. Antagandet flyttar totalen under en halv procent, eftersom
 * åldersgruppen är liten — men det är ett antagande och inte en mätning.
 */
function netAccess(year: number): number | null {
  const q = datasetFor(year).questions.find(
    (x) => x.base_label === 'Samtliga 16+ år' && /^hur ofta använder du internet/i.test(x.text),
  );
  const o = q?.options.find((x) => /^netto\s*-\s*internetanvändare/i.test(x.label));
  return o?.values['totalt']?.pct ?? null;
}

/** Andelen ur en namngiven fråga i bilagan, för de härledda baserna. */
function shareFrom(year: number, questionText: string, option: string): number | null {
  const q = datasetFor(year).questions.find((x) => x.text.trim() === questionText);
  return q?.options.find((o) => o.label === option)?.values['totalt']?.pct ?? null;
}

export interface BaseSize {
  people: number;
  /** Hur talet räknades fram, i klartext. Visas för den som vill granska. */
  derivation: string;
}

const cache = new Map<string, BaseSize | null>();

export function baseSize(year: number, baseLabel: string): BaseSize | null {
  const key = `${year}|${baseLabel}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const result = compute(year, baseLabel, 0);
  cache.set(key, result);
  return result;
}

function compute(year: number, baseLabel: string, depth: number): BaseSize | null {
  if (depth > 3) return null;
  const regel = regler.find((r) => r.bas === baseLabel);
  if (!regel) return null;

  if (regel.typ === 'befolkning') {
    const from = regel.fran ?? 0;
    const to = regel.till ?? 100;
    const full = regel.penetration;
    const net = netAccess(year);

    // Åldrar under penetrationsgränsen räknas med full täckning; resten
    // multipliceras med bilagans egen andel internetanvändare.
    if (/^internetanvändare/i.test(baseLabel)) {
      if (net === null) return null;
      if (full) {
        const young = people(from, Math.min(to, full.under - 1)) * full.andel;
        const rest = people(Math.max(from, full.under), to) * net;
        return {
          people: young + rest,
          derivation: `SCB ${from}–${full.under - 1} år (full täckning) + ${full.under}+ år × ${pct(net)} internetanvändare`,
        };
      }
      return {
        people: people(from, to) * net,
        derivation: `SCB ${spanText(from, to)} × ${pct(net)} internetanvändare`,
      };
    }
    return {
      people: people(from, to),
      derivation: `SCB ${spanText(from, to)}`,
    };
  }

  const parent = regel.av ? compute(year, regel.av, depth + 1) : null;
  const share = regel.fraga && regel.alternativ ? shareFrom(year, regel.fraga, regel.alternativ) : null;
  if (!parent || share === null) return null;
  return {
    people: parent.people * share,
    derivation: `${regel.av} (${format(parent.people)}) × ${pct(share)}`,
  };
}

const spanText = (from: number, to: number) => (to >= 100 ? `${from} år och äldre` : `${from}–${to} år`);
const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')} %`;

/**
 * Avrundning efter storlek.
 *
 * Ett tal som "275 817" påstår sex siffrors precision om en skattning vars
 * osäkerhetsintervall är sjuttio tusen brett. Avrundningen gör anspråket
 * ärligt redan innan intervallet lästs.
 */
export function roundPeople(n: number): number {
  const abs = Math.abs(n);
  const step = abs >= 1_000_000 ? 100_000
    : abs >= 100_000 ? 10_000
    : abs >= 10_000 ? 1_000
    : abs >= 1_000 ? 100
    : 10;
  return Math.round(n / step) * step;
}

export function format(n: number): string {
  const r = roundPeople(n);
  if (Math.abs(r) >= 1_000_000) {
    const m = r / 1_000_000;
    return `${m.toFixed(1).replace('.', ',')} miljoner`;
  }
  return r.toLocaleString('sv-SE').replace(/ /g, ' ');
}

export interface Headcount {
  /** Punktskattning, oavrundad. */
  people: number;
  low: number;
  high: number;
  /** Hur många personer segmentet omfattar i basen. */
  segment: number;
  derivation: string;
}

const Z_95 = 1.96;

/**
 * Hur många personer en cell motsvarar.
 *
 * Segmentets storlek inom basen läses ur vikterna: andelen av basens samlade
 * viktade intervjuer. Intervallet är ett vanligt 95-procentsintervall för en
 * andel. Eftersom n är viktade intervjuer och inte antalet genomförda
 * överskattar det precisionen, så intervallet är smalare än verkligheten —
 * det står i gränssnittet.
 */
export function headcount(
  year: number, question: Question, segmentId: string, group: string,
): Headcount | null {
  const base = baseSize(year, question.base_label);
  if (!base) return null;

  const primary = question.options[0];
  if (!primary) return null;

  let segment: number;
  if (segmentId === 'totalt') {
    segment = base.people;
  } else {
    const ids = datasetFor(year).segments.filter((s) => s.group === group).map((s) => s.id);
    const total = ids.reduce((a, id) => a + (primary.values[id]?.n ?? 0), 0);
    const here = primary.values[segmentId]?.n ?? 0;
    if (!total || !here) return null;
    segment = base.people * (here / total);
  }

  return { people: 0, low: 0, high: 0, segment, derivation: base.derivation };
}

/** Antalet personer bakom ett enskilt värde. */
export function countFor(
  year: number, question: Question, segmentId: string, group: string, value: SegmentValue,
): Headcount | null {
  if (value.pct === null) return null;
  const h = headcount(year, question, segmentId, group);
  if (!h) return null;
  const se = Math.sqrt((value.pct * (1 - value.pct)) / Math.max(1, value.n));
  return {
    ...h,
    people: value.pct * h.segment,
    low: Math.max(0, (value.pct - Z_95 * se) * h.segment),
    high: Math.min(h.segment, (value.pct + Z_95 * se) * h.segment),
  };
}
