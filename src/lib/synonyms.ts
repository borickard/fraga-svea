/**
 * Sökord som leder till en fråga utan att synas.
 *
 * Rubriken förblir Internetstiftelsens formulering. Synonymerna är bara en väg
 * dit, för att journalister söker på vardagsspråk och undersökningen är
 * skriven på utredningsspråk.
 */
import type { Question } from '../types';
import raw from '../data/synonyms.json';
import rawClusters from '../data/clusters.json';

const table = (raw as { synonyms: Record<string, string[]> }).synonyms;
const clusters = (rawClusters as { clusters: { id: string; members: { text: string }[] }[] }).clusters;

/** Klustrens synonymer ärvs av alla frågor i klustret. */
const byText = new Map<string, string[]>();
for (const [key, words] of Object.entries(table)) {
  const cluster = clusters.find((c) => c.id === key);
  if (cluster) {
    for (const m of cluster.members) byText.set(m.text, [...(byText.get(m.text) ?? []), ...words]);
  } else {
    byText.set(key, [...(byText.get(key) ?? []), ...words]);
  }
}

export const synonymsFor = (q: Question): string[] => byText.get(q.text) ?? [];
