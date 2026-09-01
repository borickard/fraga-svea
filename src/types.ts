/**
 * Datamodellen delas mellan parsern (scripts/) och appen (src/).
 * Allt lagras rått: pct är en andel 0–1, aldrig procent.
 */

export type ValueReason = 'no_base' | 'missing' | 'not_numeric';

export interface SegmentValue {
  /** Andel 0–1. null när värdet inte finns eller saknar bas. */
  pct: number | null;
  /** Antal intervjuer i segmentet. */
  n: number;
  /** Antal viktade intervjuer. Saknas i vissa tabeller. */
  n_weighted?: number;
  /** false när n < 100 eller när basen saknas helt. */
  reliable: boolean;
  /** Varför pct är null. Utelämnas när pct finns. */
  reason?: ValueReason;
  /** Signifikansmarkörer ur cellen (Chi2), t.ex. ["b","d"]. Utelämnas när tomt. */
  sig?: string[];
}

export interface QuestionOption {
  label: string;
  /** Nyckel = segment.id */
  values: Record<string, SegmentValue>;
}

export interface Segment {
  id: string;
  group: string;
  label: string;
}

export interface Question {
  id: string;
  text: string;
  base_label: string;
  sheet: string;
  /** 1-indexerad rad för "Bas:"-raden i arket. */
  source_row: number;
  /** Frågekod ur arket, t.ex. ANV_FREK. Finns bara i penetrationsstudien. */
  question_code?: string;
  /** Segmentgrupper som faktiskt förekommer i just den här tabellen. */
  segment_groups: string[];
  /**
   * Vilken rad n är hämtad ur. Flera tabeller i bilagan redovisar bara
   * "Antal viktade intervjuer" och saknar "Antal intervjuer" helt. Då används
   * det viktade talet — men det måste märkas som viktat överallt det visas,
   * eftersom det inte är ett antal genomförda intervjuer.
   */
  n_basis: 'intervjuer' | 'viktade_intervjuer';
  options: QuestionOption[];
}

export interface DatasetMeta {
  source: string;
  publisher: string;
  appendix: string;
  /** Sätts av parsern, inte för hand. */
  generated_from: string;
  /** Antal frågor respektive segment, för snabb sanity-check. */
  question_count: number;
  segment_count: number;
}

export interface Dataset {
  meta: DatasetMeta;
  segments: Segment[];
  questions: Question[];
}

/** Det enda språkmodellen får returnera. Inga värden, någonsin. */
export interface QuerySpec {
  question_id: string | null;
  segment_group: string | null;
  /** Segmentetiketter inom gruppen. Tom lista betyder alla. */
  segments: string[];
  options: string[];
  confidence: 'high' | 'low';
  no_match: boolean;
}
