/**
 * Skiljelinjer: var materialet delar sig mest längs en axel.
 *
 * Vänder på verktyget. I stället för att användaren ställer rätt fråga letar
 * appen själv upp de ställen där två grupper svarar mest olika, och lägger
 * fram dem rankade. Det är samma uppslagning som allt annat — ingen modell,
 * inga nya tal — men riktningen är omvänd.
 *
 * Varför inte bara största avvikelsen från riket: den ger tautologier.
 * Lågstadiebarn använder inte Facebook, studerande använder AI till studier.
 * Att i stället mäta spannet INOM en axel — störst mot minst bland
 * åldersbanden, bland inkomstgrupperna — ger fynd som faktiskt säger något.
 */
import type { Question, QuestionOption } from '../types';
import { datasetFor, TOTAL_GROUP } from './dataset';
import { isNetto } from './query';
import { titleFor } from './concepts';
import { groupOf } from './groups';
import raw from '../data/divides.json';

interface Config {
  axlar: { grupp: string; etikett: string }[];
  uteslutna: string[];
}
const config = raw as unknown as Config;

export const AXES = config.axlar;

export interface Pole {
  label: string;
  segmentId: string;
  pct: number;
  n: number;
}

export interface Finding {
  question: Question;
  title: string;
  option: string;
  /** Skillnaden i procentenheter, alltid positiv. */
  gap: number;
  high: Pole;
  low: Pole;
  group: string;
}

/**
 * Golv för att ett fynd ska få visas.
 *
 * Basen måste hålla i båda ändar, och skillnaden måste vara större än vad
 * slumpen rimligen producerar. Testet är ett vanligt z-test för två andelar
 * och räknas här — bilagan deklarerar Chi2 på 95 % i sidhuvudet men lägger
 * inga markörer i cellerna, så den vägen finns inte att gå.
 *
 * Observera att n för de flesta tabeller är VIKTADE intervjuer, inte antalet
 * genomförda. Ett viktat n överskattar precisionen, så testet är en grov
 * sållning mot brus och inte ett publicerbart signifikanspåstående. Det står
 * utskrivet i gränssnittet.
 */
const MIN_N = 100;
const MIN_GAP = 0.10;
const Z_95 = 1.96;

function significant(a: Pole, b: Pole): boolean {
  const se = Math.sqrt((a.pct * (1 - a.pct)) / a.n + (b.pct * (1 - b.pct)) / b.n);
  if (!(se > 0)) return false;
  return Math.abs(a.pct - b.pct) / se >= Z_95;
}

/** Större spann vinner; vid lika vinner det lägre toppvärdet. */
const bättre = (gap: number, high: number, mot: Finding): boolean =>
  gap > mot.gap + TIE || (Math.abs(gap - mot.gap) <= TIE && high < mot.high.pct);

const poles = (option: QuestionOption, ids: string[]): Pole[] =>
  ids
    .map((id) => ({ id, v: option.values[id] }))
    .filter((x) => x.v && x.v.pct !== null && x.v.n >= MIN_N)
    .map((x) => ({ label: '', segmentId: x.id, pct: x.v!.pct as number, n: x.v!.n }));

/** Två fynd är lika starka om de skiljer sig mindre än så här. */
const TIE = 0.01;

/**
 * Fynden för en axel, starkast först.
 *
 * Ett fynd per FRÅGEGRUPP, inte per tabell. Bilagan ger samma skillnad i
 * flera skepnader: som svarsalternativ och som sitt eget komplement ("Roblox
 * 22 %" och "Har inte använt 78 %"), i tabeller med olika bas, och en gång
 * till i plattformens egen tabell. Utan gruppering fylldes listan av samma
 * upptäckt om och om igen — "Skrollandets påverkan på måendet" låg två
 * gånger i topp, "AI i jobbet" tre.
 *
 * Vid lika stort spann väljs alternativet med det lägre toppvärdet. Det är
 * nästan alltid den positiva formuleringen: "22 % av barnfamiljerna använder
 * Roblox" säger mer än "99 % av de barnlösa gör det inte", fast talen bär
 * samma upptäckt.
 */
export function findings(year: number, group: string): Finding[] {
  const d = datasetFor(year);
  const labels = new Map(d.segments.filter((s) => s.group === group).map((s) => [s.id, s.label]));
  const ids = [...labels.keys()];
  if (ids.length < 2) return [];

  const bästa = new Map<string, Finding>();
  for (const question of d.questions) {
    if (config.uteslutna.includes(question.text.trim())) continue;
    if (!question.segment_groups.includes(group)) continue;

    let best: Finding | null = null;
    for (const option of question.options) {
      if (isNetto(option.label)) continue;
      const ps = poles(option, ids);
      if (ps.length < 2) continue;
      const high = ps.reduce((a, b) => (b.pct > a.pct ? b : a));
      const low = ps.reduce((a, b) => (b.pct < a.pct ? b : a));
      const gap = high.pct - low.pct;
      if (gap < MIN_GAP || !significant(high, low)) continue;
      if (best && !bättre(gap, high.pct, best)) continue;
      best = {
        question,
        title: titleFor(question),
        option: option.label,
        gap,
        high: { ...high, label: labels.get(high.segmentId) ?? '' },
        low: { ...low, label: labels.get(low.segmentId) ?? '' },
        group,
      };
    }
    if (!best) continue;
    const key = groupOf(year, question.id)?.id ?? question.id;
    const nuvarande = bästa.get(key);
    if (!nuvarande || bättre(best.gap, best.high.pct, nuvarande)) bästa.set(key, best);
  }
  /*
   * Samma tal mätt två gånger räknas en gång.
   *
   * Bilagan mäter en del beteenden både i en samlingsfråga och i tjänstens
   * egen tabell: "Sociala medier – dagligen / YouTube" och "Youtube – hur
   * ofta / Använt varje dag" är samma mätning med samma poler och samma
   * värden. Identiska värden i identiska segment är inte två fynd.
   */
  const sedda = new Set<string>();
  return [...bästa.values()]
    .sort((a, b) => b.gap - a.gap)
    .filter((f) => {
      const key = `${f.high.segmentId}|${f.low.segmentId}|${f.high.pct.toFixed(4)}|${f.low.pct.toFixed(4)}`;
      if (sedda.has(key)) return false;
      sedda.add(key);
      return true;
    });
}

/** Axlar som finns i årgången och ger minst ett fynd. */
export function activeAxes(year: number): { grupp: string; etikett: string; count: number }[] {
  const groups = new Set(datasetFor(year).segments.map((s) => s.group));
  return AXES
    .filter((a) => groups.has(a.grupp) && a.grupp !== TOTAL_GROUP)
    .map((a) => ({ ...a, count: findings(year, a.grupp).length }))
    .filter((a) => a.count > 0);
}
