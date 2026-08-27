import type { Question } from '../types';
import { isAmbiguous, optionPreview } from '../lib/dataset';
import { hasTitle, titleFor } from '../lib/labels';

interface Props {
  hits: Question[];
  activeId: string | null;
  onSelect: (q: Question) => void;
  label: string;
}

/**
 * Träfflistan.
 *
 * Titeln står överst för att gå att skumma — flera frågor i bilagan heter
 * bara "Youtube" eller "Har du tidigare använt …?". Men frågans exakta
 * formulering står alltid kvar under den: det är den som är källan, och den
 * får aldrig ersättas av en rubrik någon skrivit i efterhand.
 *
 * Basen står alltid med: samma frågetext förekommer med olika baser, och det
 * är den vanligaste källan till felaktiga rubriker.
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
            <span className="hits__text">{titleFor(q)}</span>
            {hasTitle(q) && <span className="hits__wording">{q.text}</span>}
            <span className="hits__base label">Bas: {q.base_label}</span>
            {/* Två tabeller kan ha samma frågetext och samma bas. Då är
                svarsalternativen det enda som skiljer dem åt. */}
            {isAmbiguous(q.id) && (
              <span className="hits__options label">{optionPreview(q)}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
