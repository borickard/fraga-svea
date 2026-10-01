/**
 * Kön är en egen dimension, inte 16 extra gruppnamn.
 *
 * Bilagan korsar kön med åtta av sina segmentaxlar och lägger resultatet i
 * gruppnamnet: "ÅLDERSGRUPPER", "ÅLDERSGRUPPER - MÄN", "ÅLDERSGRUPPER -
 * KVINNOR". Som en platt lista blir det 38 poster där den som vill se män
 * 16–25 år måste veta att hen ska leta efter en grupp vars namn slutar på
 * MÄN — och först därefter hitta åldersbandet inuti den.
 *
 * Här delas namnet upp igen: 22 axlar att välja bland, och kön som en egen
 * väljare bredvid. Uppdelningen är avläst ur arkets egen namngivning och
 * ändrar ingenting i datan — gruppnamnet som slås upp är exakt detsamma.
 */
import { datasetFor, TOTAL_GROUP } from './dataset';

/**
 * Suffixet ankras till slutet. Det måste det vara: axeln "ÄLDRE - YNGRE
 * HALVAN AV BEFOLKNINGEN" bär själv ett bindestreck, och en lösare regel
 * hade styckat den mitt itu.
 */
const GENDER_SUFFIX = /\s*-\s*(MÄN|KVINNOR|POJKAR|FLICKOR)\s*$/i;

/** Ordningen könen visas i. "Alla" är axeln utan suffix. */
const GENDER_ORDER = ['Alla', 'Män', 'Kvinnor', 'Pojkar', 'Flickor'];

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Gruppnamnet utan könssuffix. "ÅLDERSGRUPPER - MÄN" -> "ÅLDERSGRUPPER". */
export const axisOf = (group: string): string => group.replace(GENDER_SUFFIX, '');

/** Könet i gruppnamnet, eller "Alla" när suffix saknas. */
export const genderOf = (group: string): string => {
  const m = GENDER_SUFFIX.exec(group);
  return m ? titleCase(m[1]) : 'Alla';
};

export interface Axis {
  /** Namnet utan könssuffix. Används som värde i väljaren. */
  axis: string;
  /** Könsvarianter som finns för just den här axeln, "Alla" först. */
  genders: string[];
}

/**
 * Axlarna för en uppsättning gruppnamn, i arkets ordning.
 *
 * Tar gruppnamnen från frågan och inte från hela datasetet: en fråga som
 * saknar nedbrytning på sysselsättning ska inte erbjuda den.
 */
export function axesOf(groups: string[]): Axis[] {
  const out: Axis[] = [];
  for (const group of groups) {
    if (group === TOTAL_GROUP) continue;
    const axis = axisOf(group);
    const gender = genderOf(group);
    const found = out.find((a) => a.axis === axis);
    if (found) {
      if (!found.genders.includes(gender)) found.genders.push(gender);
    } else {
      out.push({ axis, genders: [gender] });
    }
  }
  for (const a of out) {
    a.genders.sort((x, y) => GENDER_ORDER.indexOf(x) - GENDER_ORDER.indexOf(y));
  }
  return out;
}

/**
 * Gruppnamnet för en axel och ett kön, eller null när kombinationen inte
 * finns i bilagan. Null är ett riktigt svar: långtifrån alla axlar är
 * korsade med kön, och att hitta på ett gruppnamn vore att hitta på data.
 */
export function groupFor(groups: string[], axis: string, gender: string): string | null {
  return groups.find((g) => axisOf(g) === axis && genderOf(g) === gender) ?? null;
}

/** Segmentgrupperna som finns i årgången, i arkets ordning. */
export function groupsInYear(year: number): string[] {
  const out: string[] = [];
  for (const s of datasetFor(year).segments) if (!out.includes(s.group)) out.push(s.group);
  return out;
}
