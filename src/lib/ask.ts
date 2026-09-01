/**
 * Klientsidan av fas 3.
 *
 * Skickar användarens fråga till en tunn serverless-funktion och får tillbaka
 * en query — aldrig ett svar, aldrig ett värde. Allt som kommer tillbaka
 * valideras mot det lokala datasetet innan det används: modellens output är
 * ett förslag om vilken uppslagning som ska göras, ingenting annat.
 */
import type { QuerySpec } from '../types';
import { getQuestion, segmentsInGroup } from './dataset';

export class AskUnavailable extends Error {}

export async function askModel(question: string, signal?: AbortSignal): Promise<QuerySpec> {
  let res: Response;
  try {
    res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AskUnavailable('Kunde inte nå frågelagret.');
  }

  if (res.status === 501) throw new AskUnavailable('Frågelagret är inte konfigurerat.');
  if (!res.ok) throw new AskUnavailable(`Frågelagret svarade ${res.status}.`);

  const data = (await res.json()) as Partial<QuerySpec>;

  // Modellen får inte hitta på ett id. Finns det inte i datasetet är det ingen match.
  const id = typeof data.question_id === 'string' ? data.question_id : null;
  const known = id ? getQuestion(id) : undefined;

  const segmentGroup =
    known && typeof data.segment_group === 'string' && known.segment_groups.includes(data.segment_group)
      ? data.segment_group
      : null;

  // Bara segment som finns i den valda gruppen. Etiketter modellen hittat på
  // faller bort, och kvar blir tom lista, vilket betyder alla.
  const inGroup = segmentGroup ? segmentsInGroup(segmentGroup) : [];
  const segments = Array.isArray(data.segments)
    ? data.segments
        .filter((l): l is string => typeof l === 'string')
        .map((l) => inGroup.find((s) => s.label === l)?.id)
        .filter((id): id is string => Boolean(id))
    : [];

  const spec: QuerySpec = {
    question_id: known ? known.id : null,
    segment_group: segmentGroup,
    segments,
    // Bara alternativ som faktiskt finns i frågan släpps igenom.
    options: known && Array.isArray(data.options)
      ? data.options.filter((o): o is string => typeof o === 'string' && known.options.some((x) => x.label === o))
      : [],
    confidence: data.confidence === 'high' ? 'high' : 'low',
    no_match: data.no_match === true || !known,
  };
  return spec;
}
