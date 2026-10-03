/**
 * Dashboarden: moduler som tillsammans bygger ett rutnät.
 *
 * En modul är en fråga plus ett urval, inte en sparad bild. Den slås upp på
 * nytt varje gång den ritas, ur samma dataset och samma kod som svarskortet.
 * Det är därför en delad dashboard inte kan innehålla ett tal som inte finns
 * i bilagan: det finns ingen väg in för ett värde som inte kommer ur
 * uppslagningen.
 *
 * Det nya mot svarskortet är att en modul bär TVÅ segmentdimensioner. Bilagan
 * korsar ålder med kön och lägger korsningen i gruppnamnet, så "Tiktok i
 * åldern 16-35, män mot kvinnor" är fyra uppslagningar i två grupper. Kortet
 * klarar en grupp i taget; modulen väver ihop dem.
 */
import type { Question, SegmentValue } from '../types';
import { availableSegments, isNetto, optionShape, type OptionShape } from './query';
import { getQuestion, TOTAL_GROUP } from './dataset';
import { axesOf, groupFor } from './segments';
import { groupOf, resolve, selectionFor } from './groups';
import { titleFor } from './concepts';

/**
 * Formerna. "tal" är med för att ett ensamt värde inte är en graf — en
 * stapel som alltid går till samma plats säger ingenting som siffran inte
 * redan sagt.
 */
export type ChartKind = 'tal' | 'bar' | 'grouped' | 'line' | 'donut';

export interface Module {
  id: string;
  /** Frågan. Id:t bär bas, frekvens och plattform. */
  questionId: string;
  /** Valda svarsalternativ. Tom lista betyder alla. */
  options: string[];
  /** Segmentaxel utan könssuffix, eller TOTALT. */
  axis: string;
  /**
   * Könsvarianter att visa. Tom lista betyder bara den okorsade axeln.
   * Lagras som kön, inte som gruppnamn, så att modulen överlever att man
   * byter axel under den.
   */
  genders: string[];
  /**
   * Segment som ETIKETTER, inte id:n. "16-25 år" har olika id i
   * ÅLDERSGRUPPER, ÅLDERSGRUPPER - MÄN och ÅLDERSGRUPPER - KVINNOR, och
   * modulen ska peka på bandet — inte på en av dess tre kopior.
   */
  segments: string[];
  chart: ChartKind;
  /** Hur många kolumner i rutnätet modulen tar. */
  span: 1 | 2;
  /** Egen rubrik. Utelämnad betyder frågans egen. */
  title?: string;
}

export interface ChartPoint {
  key: string;
  label: string;
  value: SegmentValue;
}

export interface ChartSeries {
  key: string;
  label: string;
  colorIndex: number;
  points: ChartPoint[];
}

export interface ModuleData {
  module: Module;
  question: Question;
  title: string;
  /** Underrubrik: vilket urval som visas. */
  subtitle: string;
  categories: string[];
  series: ChartSeries[];
  baseN: number;
  /** "n" eller "Viktade intervjuer" — viktade tal får aldrig passera omärkta. */
  nLabel: string;
  shape: OptionShape | null;
  hasNettoRow: boolean;
  hasSmallBase: boolean;
  /** Former datan tillåter. Alltid minst en. */
  allowed: ChartKind[];
  /** Formen som faktiskt ritas. Kan skilja sig från modulens önskade. */
  chart: ChartKind;
  /** Satt när önskad form inte gick att rita, med skälet. */
  fallback?: string;
  /**
   * Könsvarianter axeln erbjuder. Modulen är enda stället där flera kan
   * visas samtidigt — frågevyn slår upp en grupp i taget, och "män mot
   * kvinnor i samma graf" är två grupper.
   */
  availableGenders: string[];
}

/**
 * Axlar där ordningen betyder något, och en linje därför går att dra.
 *
 * En linje påstår att det finns en väg mellan punkterna. Mellan åldersband
 * och inkomstnivåer finns det; mellan Götaland och Norrland finns det inte,
 * och mellan plattformar är det rent nonsens. Listan är medvetet kort —
 * tveksamma fall hör inte hemma här.
 */
const ORDERED_AXES = [
  'ÅLDERSGRUPPER',
  'ÅLDERSGRUPPERINGAR',
  'GENERATION',
  'GEN (XYZ)',
  'STADIER',
  'UTBILDNINGSNIVÅ',
  'HUSHÅLLSINKOMST',
];

/**
 * Könens fasta ordning och fasta färgplats.
 *
 * Färgen ska följa entiteten, inte klickordningen. Klickar man Kvinnor före
 * Män blir annars Kvinnor grön i en modul och blå i nästa, och en dashboard
 * där samma kön byter färg mellan rutorna är oläsbar. Män är alltid slot 1
 * och Kvinnor alltid slot 2, även när bara det ena visas.
 */
const GENDER_ORDER = ['Alla', 'Män', 'Kvinnor', 'Pojkar', 'Flickor'];
const genderSlot = (g: string): number => Math.max(0, GENDER_ORDER.indexOf(g) - 1);

/** Högst så många serier. Över det går de inte att skilja åt med färg. */
export const MAX_SERIES = 6;
/** Över sex tårtbitar slutar en ring vara läsbar. */
const MAX_DONUT_SLICES = 6;

const MISSING: SegmentValue = { pct: null, n: 0, reliable: false, reason: 'missing' };

/** Gruppnamnen frågan faktiskt har värden för. */
function groupsOf(question: Question): string[] {
  return [TOTAL_GROUP, ...question.segment_groups.filter((g) => g !== TOTAL_GROUP)];
}

/**
 * Löser upp en modul till färdiga serier.
 *
 * Returnerar null när frågan inte finns i årgången — en delad länk kan vara
 * äldre än datasetet, och då ska modulen säga det i stället för att visa en
 * tom ruta.
 */
export function resolveModule(year: number, module: Module): ModuleData | null {
  const group = groupOf(year, module.questionId);
  if (!group) return null;
  const question = resolve(group, selectionFor(year, module.questionId)) ?? getQuestion(year, module.questionId);
  if (!question) return null;

  const groups = groupsOf(question);
  const wantedOptions = module.options.filter((l) => question.options.some((o) => o.label === l));
  const options = wantedOptions.length
    ? question.options.filter((o) => wantedOptions.includes(o.label))
    : question.options;

  // Varje kön blir en egen uppslagning i en egen grupp. Saknas korsningen i
  // bilagan hoppas könet över — det får aldrig fyllas i med närmaste grannen.
  const genders = (module.genders.length ? module.genders : ['Alla'])
    .slice()
    .sort((a, b) => GENDER_ORDER.indexOf(a) - GENDER_ORDER.indexOf(b));
  const lanes: { gender: string; segments: { id: string; label: string }[] }[] = [];
  if (module.axis === TOTAL_GROUP) {
    lanes.push({ gender: 'Alla', segments: [{ id: 'totalt', label: 'Totalt' }] });
  } else {
    for (const gender of genders) {
      const name = groupFor(groups, module.axis, gender);
      if (!name) continue;
      const all = availableSegments(year, question, name);
      const picked = module.segments.length
        ? all.filter((s) => module.segments.includes(s.label))
        : all;
      if (picked.length) lanes.push({ gender, segments: picked.map((s) => ({ id: s.id, label: s.label })) });
    }
  }
  if (!lanes.length) lanes.push({ gender: 'Alla', segments: [{ id: 'totalt', label: 'Totalt' }] });

  const valueAt = (optionLabel: string, segmentId: string): SegmentValue =>
    question.options.find((o) => o.label === optionLabel)?.values[segmentId] ?? MISSING;

  const showGender = lanes.length > 1;
  const laneLabel = (gender: string, segment: string) => {
    if (segment === 'Totalt' && !showGender) return 'Totalt';
    if (segment === 'Totalt') return gender;
    return showGender ? `${gender} · ${segment}` : segment;
  };

  let categories: string[];
  let series: ChartSeries[];

  if (options.length > 1) {
    // Flera alternativ: alternativen är x-axeln, urvalet blir serier.
    categories = options.map((o) => o.label);
    series = [];
    for (const lane of lanes) {
      for (const s of lane.segments) {
        series.push({
          key: `${lane.gender}|${s.id}`,
          label: laneLabel(lane.gender, s.label),
          colorIndex: series.length,
          points: options.map((o) => ({ key: o.label, label: o.label, value: valueAt(o.label, s.id) })),
        });
      }
    }
  } else {
    // Ett alternativ: segmenten är x-axeln, könen blir serier.
    const option = options[0];
    categories = lanes[0].segments.map((s) => s.label);
    series = lanes.map((lane, i) => ({
      key: lane.gender,
      label: showGender ? lane.gender : (option?.label ?? ''),
      // Könets egen plats, inte radens: Kvinnor är blå oavsett om Män visas.
      colorIndex: lane.gender === 'Alla' ? i : genderSlot(lane.gender),
      points: lane.segments.map((s) => ({
        key: s.id,
        label: s.label,
        value: option ? valueAt(option.label, s.id) : MISSING,
      })),
    }));
  }

  const points = series.flatMap((s) => s.points);
  const total = question.options[0]?.values['totalt'] ?? null;
  const shape = optionShape(question);

  // --- vilka former datan tillåter
  const single = points.length === 1;
  const allowed: ChartKind[] = [];
  if (single) allowed.push('tal');
  allowed.push('bar');
  if (series.length > 1) allowed.push('grouped');
  if (ORDERED_AXES.includes(module.axis) && categories.length >= 3 && options.length <= 1) allowed.push('line');
  // Ringen kräver en helhet att dela: alternativen måste utesluta varandra,
  // allihop måste vara med, och de får inte vara fler än sex.
  const wholeQuestion = options.length === question.options.filter((o) => !isNetto(o.label)).length
    || options.length === question.options.length;
  if (
    shape?.exclusive && series.length === 1 && options.length > 1 && wholeQuestion
    && categories.filter((c) => !isNetto(c)).length <= MAX_DONUT_SLICES
  ) allowed.push('donut');

  let chart = module.chart;
  let fallback: string | undefined;
  if (!allowed.includes(chart)) {
    fallback = reasonFor(chart, { shape, series: series.length, axis: module.axis, single });
    chart = single ? 'tal' : allowed.includes('grouped') && series.length > 1 ? 'grouped' : 'bar';
  }

  // Ringen visar delarna, aldrig bilagans sammanräkningar av dem. Med
  // Netto-raderna kvar summerar "Hur ofta använder du internet?" till 300 %
  // och ringen blir ren fiktion.
  if (chart === 'donut') {
    categories = categories.filter((c) => !isNetto(c));
    series = series.map((s) => ({ ...s, points: s.points.filter((p) => !isNetto(p.label)) }));
  }

  const option = options.length === 1 ? options[0] : null;
  const parts = [
    option ? option.label : `${categories.length} svarsalternativ`,
    module.axis === TOTAL_GROUP ? 'totalt' : module.axis.toLowerCase(),
    module.genders.length ? module.genders.join(' och ').toLowerCase() : null,
  ].filter(Boolean);

  return {
    module,
    question,
    title: module.title ?? titleFor(question),
    subtitle: parts.join(' · '),
    categories,
    series: series.slice(0, MAX_SERIES),
    baseN: total?.n ?? 0,
    nLabel: question.n_basis === 'viktade_intervjuer' ? 'Viktade intervjuer' : 'n',
    shape,
    hasNettoRow: categories.some(isNetto) || series.some((s) => isNetto(s.label)),
    hasSmallBase: points.some((p) => p.value.pct !== null && !p.value.reliable),
    allowed,
    chart,
    fallback,
    availableGenders: axesOf(groups).find((a) => a.axis === module.axis)?.genders ?? [],
  };
}

function reasonFor(
  wanted: ChartKind,
  ctx: { shape: OptionShape | null; series: number; axis: string; single: boolean },
): string {
  if (ctx.single) return 'Ett enda värde är ingen graf — visas som tal.';
  switch (wanted) {
    case 'donut':
      return ctx.shape && !ctx.shape.exclusive
        ? `Ringen kräver en helhet. Alternativen summerar till ${Math.round(ctx.shape.sum * 100)} % och är alltså inte delar av samma hela.`
        : 'Ringen kräver ett urval utan nedbrytning och högst sex delar.';
    case 'line':
      return ORDERED_AXES.includes(ctx.axis)
        ? 'Linjen behöver minst tre punkter i ordning.'
        : `En linje påstår en väg mellan punkterna. ${ctx.axis.toLowerCase()} har ingen ordning.`;
    case 'grouped':
      return 'Grupperade staplar kräver mer än en serie.';
    default:
      return 'Formen går inte att rita på det här urvalet.';
  }
}
