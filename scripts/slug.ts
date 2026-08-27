/**
 * Deterministisk slugifiering. Samma input ger alltid samma output —
 * parsern måste vara idempotent, och id:n är nycklar i JSON:en.
 */
const CHAR_MAP: Record<string, string> = {
  å: 'a', ä: 'a', ö: 'o', é: 'e', è: 'e', ü: 'u', ø: 'o', æ: 'ae',
};

export function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/[åäöéèüøæ]/g, (c) => CHAR_MAP[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Segment-id = slug(grupp) + "_" + slug(etikett).
 * Grupprefixet är obligatoriskt: etiketter som "Man" och "Kvinna" återkommer
 * i flera grupper (KÖN, GENERATION per kön) och får aldrig kollidera.
 * "Totalt" är den enda etikett som saknar grupp och behåller id "totalt".
 */
export function segmentId(group: string, label: string): string {
  if (group === TOTAL_GROUP) return 'totalt';
  return `${slug(group)}_${slug(label)}`;
}

export const TOTAL_GROUP = 'TOTALT';

/**
 * Fråge-id = slug(frågetext, förkortad) + "__" + slug(bas).
 * Bas-sluggen är icke-förhandlingsbar: samma frågetext förekommer med olika
 * baser (AI-frågorna finns både på "Internetanvändare 8+ år" och
 * "Har använt AI-verktyg 8+ år") och andelarna skiljer sig kraftigt.
 */
export function questionId(text: string, baseLabel: string, maxWords = 8): string {
  const words = slug(text).split('_').filter(Boolean).slice(0, maxWords);
  const stem = words.join('_') || 'fraga';
  return `${stem}__${slug(baseLabel)}`;
}
