/**
 * Hundra figurer.
 *
 * Formen svarar på det som bilagan egentligen handlar om och som ingen
 * stapel visar: vem är det här en andel AV. Basen är inte en fotnot utan
 * hundra kroppar som står där. Byter man bas materialiseras eller löses de
 * upp; byter man fråga springer de till nya ytor.
 *
 * Tre layouter, och vilken som gäller avgörs av datan — aldrig av smak:
 *
 *  - partition   Uteslutande fråga. Alternativen delar upp de hundra exakt.
 *  - nästlad     Bilagans egen "Andel användare"-form, där "varje vecka" är
 *                en delmängd av "använt" och "varje dag" en delmängd av den.
 *                Det här är den inneslutning ett Venn-diagram skulle visa,
 *                och här är den sann.
 *  - binär       Ett valt alternativ på en flervalsfråga: ja eller nej.
 *
 * Det som INTE går: ett Venn-diagram mellan två svarsalternativ. Bilagan ger
 * marginalerna (46 % Instagram, 15 % Tiktok) och unionen via Netto-raden,
 * men aldrig snittet. Varje ritat överlapp hade varit påhittat.
 */
import type { Question } from '../types';
import type { Lane, ModuleData } from './dashboard';
import { isNetto } from './query';
import { TOTAL_GROUP } from './dataset';

export type FieldLayout = 'partition' | 'nested' | 'binary';

export interface PeopleField {
  key: string;
  label: string;
  /** Andel av basen, 0–1. */
  pct: number;
  count: number;
  /** Hur djupt fältet ligger i en nästlad layout. 0 är ytterst. */
  depth: number;
}

export interface Figure {
  /** Stabil identitet. Behålls när fälten byts, så att figuren kan springa. */
  key: string;
  field: number;
  segment: string | null;
  gender: 'man' | 'kvinna' | null;
  /** Nedre gränsen i åldersbandet. Står på tröjan. */
  age: number | null;
}

export interface PeopleData {
  layout: FieldLayout;
  fields: PeopleField[];
  figures: Figure[];
  /** Segmentgruppen figurerna är fördelade efter, eller null. */
  composition: string | null;
  /**
   * Är de hundra figurerna hela basen?
   *
   * Utan nedbrytning är de det, och med en nedbrytning som täcker hela basen
   * också. Med ett urval under basen — bara kvinnor, bara ett åldersband —
   * är de något mindre, och då betyder en figur inte samma antal personer.
   */
  wholeBase: boolean;
  /** Vilka hundra personer figurerna är. Alltid utskrivet. */
  population: string;
  /** Antal intervjuer bakom befolkningen. */
  populationN: number;
  note: string;
}

/** En figur är en procent. Hundra är exakt nog och ryms på en skärm. */
const FIGURES = 100;

/**
 * Nästlad form, igenkänd på bilagans eget ord.
 *
 * "Andel användare (Använt minst någon gång senaste 12 månaderna)" är
 * övermängden; raden som är dess komplement stänger hundraprocenten; resten
 * är delmängder. Aritmetik ensam kan inte bevisa inneslutning — två tal som
 * råkar vara mindre än ett tredje säger ingenting — så regeln hänger på
 * formuleringen, precis som isNetto gör.
 */
function nestedChain(question: Question): { outer: string; inner: string[]; rest: string } | null {
  const at = (label: string) => question.options.find((o) => o.label === label)?.values['totalt']?.pct ?? null;
  const outer = question.options.find((o) => /^andel användare/i.test(o.label));
  if (!outer) return null;
  const a = at(outer.label);
  if (a === null) return null;
  const rest = question.options.find((o) => {
    const v = at(o.label);
    return o.label !== outer.label && v !== null && Math.abs(a + v - 1) <= 0.005;
  });
  if (!rest) return null;
  const inner = question.options
    .filter((o) => o.label !== outer.label && o.label !== rest.label && !isNetto(o.label))
    .map((o) => ({ label: o.label, v: at(o.label) }))
    .filter((x): x is { label: string; v: number } => x.v !== null && x.v <= a)
    .sort((x, y) => y.v - x.v)
    .map((x) => x.label);
  return inner.length >= 1 ? { outer: outer.label, inner, rest: rest.label } : null;
}

/** Största-rest: heltal som summerar till exakt `total`. */
function allocate(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sum) * total);
  const floors = exact.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]++;
    left--;
  }
  return floors;
}

const AGE_RE = /^(\d+)\s*[-–+]/;
const genderOfLane = (lane: Lane): 'man' | 'kvinna' | null => {
  if (lane.gender === 'Män' || lane.gender === 'Pojkar') return 'man';
  if (lane.gender === 'Kvinnor' || lane.gender === 'Flickor') return 'kvinna';
  if (/^man$/i.test(lane.label)) return 'man';
  if (/^kvinna$/i.test(lane.label)) return 'kvinna';
  return null;
};

export function buildPeople(data: ModuleData): PeopleData {
  const { question } = data;
  const pctAt = (label: string, segmentId: string): number | null =>
    question.options.find((o) => o.label === label)?.values[segmentId]?.pct ?? null;

  // --- vilka fält som finns, och hur de fylls per bana
  const chain = nestedChain(question);
  const picked = data.module.options.filter((l) => question.options.some((o) => o.label === l));

  let layout: FieldLayout;
  let fieldLabels: string[];
  let depths: number[];
  /** Andelen av en bana som hamnar i fältet. */
  let shareIn: (fieldIndex: number, segmentId: string) => number;

  if (chain && picked.length === 0) {
    layout = 'nested';
    // Ytterst de som inte använt, därefter en skalbana per steg inåt.
    fieldLabels = [chain.rest, ...chain.inner.map((_, i) => chain.inner[i])];
    const levels = [chain.outer, ...chain.inner];
    fieldLabels = [chain.rest, ...levels.map((l, i) =>
      i === levels.length - 1 ? l : `${l} (ej ${levels[i + 1].toLowerCase()})`)];
    depths = [0, ...levels.map((_, i) => i + 1)];
    shareIn = (fi, sid) => {
      if (fi === 0) return pctAt(chain.rest, sid) ?? 0;
      const here = pctAt(levels[fi - 1], sid) ?? 0;
      const next = fi - 1 < levels.length - 1 ? (pctAt(levels[fi], sid) ?? 0) : 0;
      return Math.max(0, here - next);
    };
  } else if (picked.length === 1) {
    layout = 'binary';
    fieldLabels = [picked[0], `Inte ${picked[0].toLowerCase()}`];
    depths = [1, 0];
    shareIn = (fi, sid) => {
      const v = pctAt(picked[0], sid) ?? 0;
      return fi === 0 ? v : 1 - v;
    };
  } else {
    layout = 'partition';
    const opts = (picked.length ? picked : question.options.map((o) => o.label)).filter((l) => !isNetto(l));
    fieldLabels = opts;
    depths = opts.map(() => 0);
    shareIn = (fi, sid) => pctAt(opts[fi], sid) ?? 0;
  }

  // --- figurerna fördelas på banor FÖRST, efter befolkningsandel
  //
  // Ordningen spelar roll för animationen. En bana har lika många figurer
  // oavsett vilken fråga som visas, eftersom antalet bara beror på segmentets
  // andel av basen. Därför behåller varje figur sin nyckel när frågan ändras
  // och kan springa till ett nytt fält i stället för att bytas ut.
  /*
   * Banorna ÄR befolkningen, också när de inte är hela basen.
   *
   * Väljer man bara kvinnor är de hundra figurerna hundra kvinnor, och
   * andelarna som fördelar dem är kvinnornas. Alternativet — att falla
   * tillbaka på totalkolumnen — gav en modul vars rubrik sa "kvinnor"
   * medan figurerna visade alla. Vilka hundra det är står utskrivet, och
   * data.partitions avgör bara om det råkar vara hela basen.
   */
  /*
   * Banor som bilagan inte redovisar något för utesluts.
   *
   * De har bas och n men noll i alla svarsalternativ, så det finns inget att
   * fördela dem efter. Låter man dem vara kvar tilldelas de figurer efter
   * sin andel av basen och placerar sedan noll av dem, och de hundra blir
   * nittiotre. Hur många som uteslöts står utskrivet.
   */
  const hasData = (l: Lane) =>
    fieldLabels.some((_, fi) => shareIn(fi, l.id) > 0);
  const allLanes = data.lanes.filter((l) => l.n > 0);
  const usable = allLanes.filter(hasData);
  const dropped = allLanes.length - usable.length;
  const useLanes = usable.length > 0;
  const lanes: Lane[] = useLanes
    ? usable
    : [{ gender: 'Alla', id: 'totalt', label: 'Totalt', n: 1 }];
  const perLane = allocate(lanes.map((l) => l.n), FIGURES);

  const figures: Figure[] = [];
  const fieldCounts = fieldLabels.map(() => 0);

  lanes.forEach((lane, li) => {
    const budget = perLane[li];
    if (!budget) return;
    const weights = fieldLabels.map((_, fi) => Math.max(0, shareIn(fi, lane.id)));
    const split = allocate(weights, budget);
    const age = AGE_RE.exec(lane.label)?.[1];
    let k = 0;
    split.forEach((count, fi) => {
      fieldCounts[fi] += count;
      for (let i = 0; i < count; i++) {
        figures.push({
          key: `${lane.id}#${k++}`,
          field: fi,
          segment: useLanes ? lane.label : null,
          gender: genderOfLane(lane),
          age: age ? Number(age) : null,
        });
      }
    });
  });

  const fields: PeopleField[] = fieldLabels.map((label, i) => ({
    key: label,
    label,
    pct: fieldCounts[i] / FIGURES,
    count: fieldCounts[i],
    depth: depths[i],
  }));

  const saknas = dropped > 0
    ? ` ${dropped} ${dropped === 1 ? 'grupp saknar' : 'grupper saknar'} uppgift i bilagan och är utelämnade.`
    : '';
  const note = layout === 'nested'
    ? 'Ytorna ligger i varandra: varje inre yta är en delmängd av den yttre.'
    : layout === 'binary'
      ? 'Två ytor: de som svarat alternativet, och alla andra i basen.'
      : 'Alternativen utesluter varandra, så de hundra delas upp exakt.';

  const populationN = useLanes ? lanes.reduce((a, l) => a + l.n, 0) : (question.options[0]?.values['totalt']?.n ?? 0);
  // Utan nedbrytning är de hundra figurerna hela basen — "totalt" som
  // befolkningsnamn sa ingenting om vilka de var.
  const wholeBase = data.module.axis === TOTAL_GROUP || data.partitions || !useLanes;
  const population = wholeBase
    ? question.base_label
    : [data.module.genders.join(' och '), data.module.segments.join(', ')]
        .filter(Boolean).join(', ') || data.module.axis.toLowerCase();

  return {
    layout,
    fields,
    figures,
    composition: useLanes && figures.some((f) => f.age !== null) ? data.module.axis : null,
    population,
    populationN,
    wholeBase,
    note: note + saknas,
  };
}
