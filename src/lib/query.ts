/**
 * Deterministisk exekvering av en query mot datasetet.
 *
 * Det här är den enda vägen från fråga till siffra. Språkmodellen får aldrig
 * producera ett värde — den får på sin höjd peka ut vilken fråga, vilka
 * svarsalternativ och vilka segment som ska slås upp. Uppslagningen sker här,
 * i klienten, mot den statiska JSON:en.
 */
import type { Question, QuestionOption, SegmentValue } from '../types';

/** Bilagans egna sammanräkningar heter "Netto - ..." respektive "Netto – ...". */
export const isNetto = (label: string): boolean => /^\s*netto\b/i.test(label);

/**
 * Hur frågans svarsalternativ förhåller sig till varandra, avläst ur datan.
 *
 * Bilagan blandar tre former utan att säga vilken som gäller:
 *
 *  - Uteslutande. "Hur ofta använder du internet?" — varje person hamnar i
 *    exakt en kategori, och kolumnen summerar till 100 %. "Varje vecka 2 %"
 *    betyder *varje vecka men inte dagligen*.
 *  - Flerval. "Vilka sociala medier har du använt?" — en person kryssar
 *    flera, och kolumnen summerar till långt över 100 %.
 *  - Nästlade. "Flashback" — "använt minst varje vecka" är en delmängd av
 *    "andel användare", och kolumnen summerar till strax över 100 %.
 *
 * Skillnaden avgör om staplarna får läggas ihop, och den syns ingenstans i
 * gränssnittet. Summan är ett aritmetiskt faktum om kolumnen, inte en gissning
 * om enkätens konstruktion — därför får den stå på kortet.
 */
const EXCLUSIVE_BAND = 0.01;

export interface OptionShape {
  /** Summan av de icke-netto-alternativens totalvärden, som andel. */
  sum: number;
  /** Summerar till 100 %: varje person räknas en gång. */
  exclusive: boolean;
}

export function optionShape(question: Question): OptionShape | null {
  let sum = 0;
  let seen = 0;
  for (const o of question.options) {
    if (isNetto(o.label)) continue;
    const pct = o.values['totalt']?.pct;
    if (pct === null || pct === undefined) continue;
    sum += pct;
    seen++;
  }
  if (!seen) return null;
  return { sum, exclusive: Math.abs(sum - 1) <= EXCLUSIVE_BAND };
}

/**
 * Netto-raden är bilagans egen sammanfattning av frågan: "Netto – Använder
 * sociala medier" i stället för Youtube, Facebook, Instagram var för sig.
 * När användaren inte pekat ut något alternativ är det den som svarar på
 * "hur många" — inte det alternativ som råkar stå först i arket.
 */
export function defaultOption(question: Question): string {
  const netto = question.options.find((o) => isNetto(o.label));
  return (netto ?? question.options[0]).label;
}
import { datasetFor, getQuestion, getSegment, segmentsInGroup, TOTAL_GROUP } from './dataset';

/** Pastellerna är data. En serie = en färg. */
export const DATA_COLORS = ['#C8E7DD', '#A7D8FD', '#FFE696', '#FF9FB4'] as const;
export const FALLBACK_COLOR = '#E4E6E5';

export interface AnswerRow {
  key: string;
  label: string;
  value: SegmentValue;
  colorIndex: number;
}

/**
 * En serie är ett valt svarsalternativ. Väljer man Tiktok och Snapchat blir
 * det två serier med var sin färg, och varje serie har en rad per valt segment.
 */
export interface AnswerSeries {
  key: string;
  label: string;
  colorIndex: number;
  rows: AnswerRow[];
}

export interface Answer {
  question: Question;
  /** Alla svarsalternativ frågan har, för väljaren. */
  optionLabels: string[];
  /** De som faktiskt är valda. */
  selectedOptions: string[];
  segmentGroup: string;
  /** Segment-id som är valda inom gruppen. Tom lista betyder alla. */
  selectedSegments: string[];
  series: AnswerSeries[];
  /**
   * Stora talet finns bara när urvalet ger exakt ett tal.
   *
   * Med ett valt alternativ och ett valt segment är det den cellen. Med ett
   * alternativ och flera segment är det alternativets total, uttryckligen
   * märkt som total. Med flera alternativ finns inget enskilt tal — då visas
   * inget, för ett godtyckligt utvalt värde i 72 punkter läses som svaret på
   * frågan även när det inte är det.
   */
  headline: SegmentValue | null;
  headlineLabel: string;
  baseN: number;
  hasSmallBase: boolean;
  hasNoBase: boolean;
  /** Får staplarna läggas ihop? Null när frågan saknar totalvärden. */
  shape: OptionShape | null;
  /** Någon av de ritade raderna är en Netto-rad och behöver förklaras. */
  hasNettoRow: boolean;
}

export interface QueryInput {
  year: number;
  questionId: string;
  optionLabels?: string[] | null;
  segmentGroup?: string | null;
  segmentIds?: string[] | null;
  /**
   * Färdig fråga, för varianter vars alternativ slagits ihop ur två tabeller
   * i bilagan. Utan den skulle uppslagningen tappa de sammanslagna raderna.
   */
  question?: Question;
}

const MISSING: SegmentValue = { pct: null, n: 0, reliable: false, reason: 'missing' };

export function executeQuery({
  year, questionId, optionLabels, segmentGroup, segmentIds, question: given,
}: QueryInput): Answer | null {
  const question = given ?? getQuestion(year, questionId);
  if (!question) return null;

  // Bara alternativ som faktiskt finns i frågan, i frågans egen ordning.
  const chosen = (optionLabels ?? []).filter((l) => question.options.some((o) => o.label === l));
  const options: QuestionOption[] = chosen.length
    ? question.options.filter((o) => chosen.includes(o.label))
    : question.options.slice(0, 1);

  const group = segmentGroup && question.segment_groups.includes(segmentGroup)
    ? segmentGroup
    : TOTAL_GROUP;

  const colorOf = (label: string) =>
    Math.max(0, question.options.findIndex((o) => o.label === label)) % DATA_COLORS.length;

  let series: AnswerSeries[];
  // De alternativ som faktiskt ritas. Skiljer sig från `options` när inget är
  // valt: då är `options` bara en säkerhetsutgång på ett enda alternativ,
  // medan kortet på totalnivå ritar alla. Väljaren måste spegla det ritade,
  // annars säger kortet "alla svarsalternativ" medan pillret under påstår
  // att Youtube är påslaget.
  let rendered: QuestionOption[];

  if (group === TOTAL_GROUP) {
    // På totalnivå jämförs svarsalternativen med varandra — en färg per alternativ.
    rendered = chosen.length ? options : question.options;
    series = [{
      key: 'totalt',
      label: '',
      colorIndex: 0,
      rows: rendered.map((o) => ({
        key: o.label,
        label: o.label,
        value: o.values['totalt'] ?? MISSING,
        colorIndex: colorOf(o.label),
      })),
    }];
  } else {
    rendered = options;
    const inGroup = segmentsInGroup(year, group).filter((s) => s.id in question.options[0].values);
    const picked = (segmentIds ?? []).filter((id) => inGroup.some((s) => s.id === id));
    const segments = picked.length ? inGroup.filter((s) => picked.includes(s.id)) : inGroup;

    // En serie per valt alternativ, en rad per valt segment.
    series = options.map((o) => ({
      key: o.label,
      label: o.label,
      colorIndex: colorOf(o.label),
      rows: segments.map((s) => ({
        key: s.id,
        label: s.label,
        value: o.values[s.id] ?? MISSING,
        colorIndex: colorOf(o.label),
      })),
    }));
  }

  const primary = rendered[0];
  const total = primary.values['totalt'] ?? null;
  const allRows = series.flatMap((s) => s.rows);

  // Ett tal, eller inget.
  let headline: SegmentValue | null = null;
  let headlineLabel = '';
  if (rendered.length === 1) {
    const rows = series[0]?.rows ?? [];
    if (group !== TOTAL_GROUP && rows.length === 1) {
      headline = rows[0].value;
      headlineLabel = `${primary.label} · ${rows[0].label}`;
    } else {
      headline = total;
      headlineLabel = `${primary.label} · Totalt`;
    }
  }

  return {
    question,
    optionLabels: question.options.map((o) => o.label),
    // Tom markering betyder alla, och det är sant bara på totalnivå, där alla
    // alternativ faktiskt ritas. Med en nedbrytning måste ett alternativ vara
    // valt, och då är det valet som ska synas.
    selectedOptions: chosen.length === 0 && group === TOTAL_GROUP ? [] : rendered.map((o) => o.label),
    segmentGroup: group,
    selectedSegments: segmentIds ?? [],
    series,
    headline,
    headlineLabel,
    // Basen är alltid frågans n, oavsett om ett enskilt tal visas eller inte.
    baseN: total?.n ?? 0,
    hasSmallBase: allRows.some((r) => r.value.pct !== null && !r.value.reliable),
    hasNoBase: allRows.some((r) => r.value.reason === 'no_base'),
    shape: optionShape(question),
    // På totalnivå är raderna alternativen; med en nedbrytning är det i
    // stället serierubrikerna som bär alternativnamnet.
    hasNettoRow: group === TOTAL_GROUP
      ? allRows.some((r) => isNetto(r.label))
      : rendered.some((o) => isNetto(o.label)),
  };
}

/** Segment i en grupp som frågan faktiskt har värden för. */
export function availableSegments(year: number, question: Question, group: string) {
  if (group === TOTAL_GROUP) return [];
  return segmentsInGroup(year, group).filter((s) => s.id in question.options[0].values);
}

export const segmentLabel = (year: number, id: string): string => getSegment(year, id)?.label ?? id;

/** Källhänvisningen bär årgången — den är en del av källan, inte dekor. */
export const sourceLineFor = (year: number): string => {
  const m = datasetFor(year).meta;
  return `${m.source} · ${m.publisher}`;
};
