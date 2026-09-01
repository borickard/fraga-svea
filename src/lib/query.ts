/**
 * Deterministisk exekvering av en query mot datasetet.
 *
 * Det här är den enda vägen från fråga till siffra. Språkmodellen får aldrig
 * producera ett värde — den får på sin höjd peka ut vilken fråga, vilka
 * svarsalternativ och vilka segment som ska slås upp. Uppslagningen sker här,
 * i klienten, mot den statiska JSON:en.
 */
import type { Question, QuestionOption, SegmentValue } from '../types';
import { dataset, getQuestion, getSegment, segmentsInGroup, TOTAL_GROUP } from './dataset';

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
}

export interface QueryInput {
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
  questionId, optionLabels, segmentGroup, segmentIds, question: given,
}: QueryInput): Answer | null {
  const question = given ?? getQuestion(questionId);
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

  if (group === TOTAL_GROUP) {
    // På totalnivå jämförs svarsalternativen med varandra — en färg per alternativ.
    const compared = chosen.length ? options : question.options;
    series = [{
      key: 'totalt',
      label: '',
      colorIndex: 0,
      rows: compared.map((o) => ({
        key: o.label,
        label: o.label,
        value: o.values['totalt'] ?? MISSING,
        colorIndex: colorOf(o.label),
      })),
    }];
  } else {
    const inGroup = segmentsInGroup(group).filter((s) => s.id in question.options[0].values);
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

  const primary = options[0];
  const total = primary.values['totalt'] ?? null;
  const allRows = series.flatMap((s) => s.rows);

  // Ett tal, eller inget.
  let headline: SegmentValue | null = null;
  let headlineLabel = '';
  if (options.length === 1) {
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
    selectedOptions: options.map((o) => o.label),
    segmentGroup: group,
    selectedSegments: segmentIds ?? [],
    series,
    headline,
    headlineLabel,
    // Basen är alltid frågans n, oavsett om ett enskilt tal visas eller inte.
    baseN: total?.n ?? 0,
    hasSmallBase: allRows.some((r) => r.value.pct !== null && !r.value.reliable),
    hasNoBase: allRows.some((r) => r.value.reason === 'no_base'),
  };
}

/** Segment i en grupp som frågan faktiskt har värden för. */
export function availableSegments(question: Question, group: string) {
  if (group === TOTAL_GROUP) return [];
  return segmentsInGroup(group).filter((s) => s.id in question.options[0].values);
}

export const segmentLabel = (id: string): string => getSegment(id)?.label ?? id;

export const sourceLine = `${dataset.meta.source} · ${dataset.meta.publisher}`;
