import type { Question } from '../types';
import { axesFor, variantOf, type QuestionGroup } from '../lib/groups';

/** En träff är en grupp plus den fråga i gruppen som sökningen fastnade på. */
export interface Hit {
  group: QuestionGroup;
  question: Question;
}

interface Props {
  hits: Hit[];
  activeId: string | null;
  onSelect: (hit: Hit) => void;
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
 * står alltid kvar under den: det är den som är källan. Formuleringen är
 * den träffade variantens, inte gruppens första — en sökning på "tiktok"
 * visade annars "YouTube" under rubriken och öppnade sedan Tiktok.
 */
export function Hits({ hits, activeId, onSelect, label }: Props) {
  if (hits.length === 0) return null;

  return (
    <ul className="hits" aria-label={label}>
      {hits.map((hit) => {
        const { group, question } = hit;
        // Baser och frekvenser för just den träffade plattformen. Klustret som
        // helhet har tre baser; Tiktok har en, och det är Tiktok raden gäller.
        const object = variantOf(group, question.id)?.object ?? null;
        const axes = axesFor(group, { object });

        const parts: string[] = [];
        if (axes.bases.length > 1) parts.push(`${axes.bases.length} baser`);
        else if (axes.bases[0]) parts.push(`Bas: ${axes.bases[0]}`);
        if (axes.frequencies.length > 1) parts.push(`${axes.frequencies.length} frekvenser`);

        return (
          <li className="hits__item" key={group.id}>
            <button
              type="button"
              className="hits__button"
              aria-current={group.id === activeId}
              onClick={() => onSelect(hit)}
            >
              <span className="hits__text">{group.title}</span>
              {group.title !== question.text && (
                <span className="hits__wording">{question.text}</span>
              )}
              <span className="hits__base label">{parts.join(' · ')}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
