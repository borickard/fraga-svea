import type { Question } from '../types';

interface Props {
  hits: Question[];
  activeId: string | null;
  onSelect: (q: Question) => void;
  label: string;
}

/**
 * Träfflistan. Basen står alltid intill frågetexten: samma frågetext
 * förekommer med olika baser, och det är den vanligaste källan till
 * felaktiga rubriker.
 */
export function Hits({ hits, activeId, onSelect, label }: Props) {
  if (hits.length === 0) return null;
  return (
    <ul className="hits" aria-label={label}>
      {hits.map((q) => (
        <li className="hits__item" key={q.id}>
          <button
            type="button"
            className="hits__button"
            aria-current={q.id === activeId}
            onClick={() => onSelect(q)}
          >
            <span className="hits__text">{q.text}</span>
            <span className="hits__base label">Bas: {q.base_label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
