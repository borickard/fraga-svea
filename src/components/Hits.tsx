import type { QuestionGroup } from '../lib/groups';

interface Props {
  groups: QuestionGroup[];
  activeId: string | null;
  onSelect: (g: QuestionGroup) => void;
  label: string;
}

/**
 * Träfflistan. En rad per fråga, inte per tabell.
 *
 * Bilagan har samma fråga i upp till sex tabeller — olika baser, olika
 * frekvenser — men det är en fråga med filter, inte sex träffar. Raden
 * visar hur många baser och frekvenser som finns bakom.
 *
 * Titeln står överst för att gå att skumma, men frågans exakta formulering
 * står alltid kvar under den: det är den som är källan.
 */
export function Hits({ groups, activeId, onSelect, label }: Props) {
  if (groups.length === 0) return null;

  return (
    <ul className="hits" aria-label={label}>
      {groups.map((g) => {
        const parts: string[] = [];
        if (g.bases.length > 1) parts.push(`${g.bases.length} baser`);
        else parts.push(`Bas: ${g.bases[0]}`);
        if (g.frequencies.length > 1) parts.push(`${g.frequencies.length} frekvenser`);

        return (
          <li className="hits__item" key={g.id}>
            <button
              type="button"
              className="hits__button"
              aria-current={g.id === activeId}
              onClick={() => onSelect(g)}
            >
              <span className="hits__text">{g.title}</span>
              {g.title !== g.sampleText && <span className="hits__wording">{g.sampleText}</span>}
              <span className="hits__base label">{parts.join(' · ')}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
