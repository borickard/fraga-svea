/**
 * Appens tillstånd i adressfältet.
 *
 * Två skäl, och det andra är det viktigaste. Bakåtknappen ska fungera — utan
 * den är varje klick enkelriktat. Men samma kodning gör också varje svar till
 * en länk: en journalist kan skicka "så här ser det ut för kvinnor 16-25 år"
 * till sin redaktör i stället för en skärmdump.
 *
 * Fråge-id:t bär redan bas, frekvens och plattform — selectionFor plockar
 * isär det igen — så bara visningsvalen behöver egna parametrar.
 *
 * Svarsalternativ och segment upprepas som egna parametrar i stället för att
 * slås ihop med ett skiljetecken. Bilagans etiketter innehåller komma,
 * snedstreck och parenteser; varje tänkbar avgränsare finns redan i datan.
 */
export interface UrlState {
  year?: number;
  query?: string;
  topic?: string | null;
  questionId?: string;
  segmentGroup?: string;
  /** Tom lista betyder alla, precis som i appen. */
  options?: string[];
  segments?: string[];
}

export function toSearch(state: UrlState, multipleYears: boolean): string {
  const p = new URLSearchParams();
  if (multipleYears && state.year) p.set('ar', String(state.year));

  if (state.questionId) {
    p.set('f', state.questionId);
    if (state.segmentGroup && state.segmentGroup !== 'TOTALT') p.set('per', state.segmentGroup);
    for (const o of state.options ?? []) p.append('alt', o);
    for (const s of state.segments ?? []) p.append('seg', s);
  } else {
    if (state.query?.trim()) p.set('q', state.query.trim());
    if (state.topic) p.set('amne', state.topic);
  }

  const s = p.toString();
  return s ? `?${s}` : '';
}

export function fromSearch(search: string): UrlState {
  const p = new URLSearchParams(search);
  const year = Number(p.get('ar'));
  return {
    year: Number.isFinite(year) && year > 0 ? year : undefined,
    query: p.get('q') ?? undefined,
    topic: p.get('amne'),
    questionId: p.get('f') ?? undefined,
    segmentGroup: p.get('per') ?? undefined,
    options: p.getAll('alt'),
    segments: p.getAll('seg'),
  };
}
