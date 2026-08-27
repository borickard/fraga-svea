import type { Question } from '../types';
import { Hits } from './Hits';

interface Props {
  query: string;
  suggestions: Question[];
  onSelect: (q: Question) => void;
}

/**
 * Ingen match = inget svar.
 *
 * Kan frågan inte mappas mot en faktisk fråga i datasetet svarar appen att vi
 * inte har mätt det, och föreslår de tre närmaste frågorna. Den gissar aldrig.
 */
export function NoMatch({ query, suggestions, onSelect }: Props) {
  return (
    <section className="nomatch" aria-live="polite">
      <p className="nomatch__head">Det här har vi inte mätt.</p>
      <p className="nomatch__body">
        {query
          ? <>Undersökningen innehåller ingen fråga som svarar på ”{query}”.</>
          : <>Undersökningen innehåller ingen fråga som svarar på det.</>}{' '}
        Här är de närmaste frågorna som faktiskt finns i materialet.
      </p>
      {suggestions.length > 0
        ? <Hits hits={suggestions} activeId={null} onSelect={onSelect} label="Närmaste frågor" />
        : <p className="label">Inga närliggande frågor hittades.</p>}
    </section>
  );
}
