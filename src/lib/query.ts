/**
 * Deterministisk exekvering av en query mot datasetet.
 *
 * Det här är den enda vägen från fråga till siffra. Språkmodellen får aldrig
 * producera ett värde — den får på sin höjd peka ut vilken fråga, vilket
 * svarsalternativ och vilken segmentgrupp som ska slås upp. Uppslagningen
 * sker här, i klienten, mot den statiska JSON:en.
 */
import type { Question, QuestionOption, SegmentValue } from '../types';
import { dataset, getQuestion, segmentsInGroup, TOTAL_GROUP } from './dataset';

/** Pastellerna är data. En serie = en färg. */
export const DATA_COLORS = ['#C8E7DD', '#A7D8FD', '#FFE696', '#FF9FB4'] as const;
export const FALLBACK_COLOR = '#E4E6E5';

export interface AnswerRow {
  key: string;
  label: string;
  value: SegmentValue;
  /** Serieindex -> färg. Segment utan bas färgas aldrig. */
  colorIndex: number;
}

export interface Answer {
  question: Question;
  option: QuestionOption;
  optionLabels: string[];
  segmentGroup: string;
  /** En rad per segment i gruppen, eller en rad per svarsalternativ när gruppen är TOTALT. */
  rows: AnswerRow[];
  /** Stora talet: totalvärdet för det valda svarsalternativet. */
  headline: SegmentValue | null;
  headlineLabel: string;
  colorIndex: number;
  /** n för hela frågan, det som står i fotnoten. */
  baseN: number;
  hasSmallBase: boolean;
  hasNoBase: boolean;
}

export interface QueryInput {
  questionId: string;
  optionLabel?: string | null;
  segmentGroup?: string | null;
}

export function executeQuery({ questionId, optionLabel, segmentGroup }: QueryInput): Answer | null {
  const question = getQuestion(questionId);
  if (!question) return null;

  const option =
    question.options.find((o) => o.label === optionLabel) ?? question.options[0];
  if (!option) return null;

  const colorIndex = Math.max(0, question.options.indexOf(option)) % DATA_COLORS.length;
  const group = segmentGroup && question.segment_groups.includes(segmentGroup)
    ? segmentGroup
    : TOTAL_GROUP;

  const rows: AnswerRow[] =
    group === TOTAL_GROUP
      // På totalnivå jämförs svarsalternativen med varandra — en färg per alternativ.
      ? question.options.map((o, i) => ({
          key: o.label,
          label: o.label,
          value: o.values['totalt'] ?? { pct: null, n: 0, reliable: false, reason: 'missing' },
          colorIndex: i % DATA_COLORS.length,
        }))
      // På segmentnivå är alla staplar samma serie, alltså samma färg.
      : segmentsInGroup(group)
          .filter((s) => s.id in option.values)
          .map((s) => ({
            key: s.id,
            label: s.label,
            value: option.values[s.id],
            colorIndex,
          }));

  const headline = option.values['totalt'] ?? null;

  return {
    question,
    option,
    optionLabels: question.options.map((o) => o.label),
    segmentGroup: group,
    rows,
    headline,
    headlineLabel: option.label,
    colorIndex,
    baseN: headline?.n ?? 0,
    hasSmallBase: rows.some((r) => r.value.pct !== null && !r.value.reliable),
    hasNoBase: rows.some((r) => r.value.reason === 'no_base'),
  };
}

export const sourceLine = `${dataset.meta.source} · ${dataset.meta.publisher}`;
