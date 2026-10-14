import { formatN } from '../lib/format';
import { sourceLineFor } from '../lib/query';
import { readingNotes, type NoteInput } from '../lib/notes';

interface Props {
  baseLabel: string;
  nLabel: string;
  baseN: number;
  year: number;
  notes: NoteInput;
}

/**
 * Bas, n, källa och läsanvisningar.
 *
 * Delas av dashboardens moduler och av frågevyns figurvy. Svarskortet har
 * samma uppgifter inristade i sin egen SVG, eftersom den filen lämnar appen
 * — men varje vy som visar ett tal måste bära dem, utan undantag. Att ha
 * dem på ett ställe är enda sättet att se till att ingen vy glömmer dem.
 */
export function Provenance({ baseLabel, nLabel, baseN, year, notes }: Props) {
  return (
    <footer className="prov">
      <p className="prov__base label">Bas: {baseLabel} · {nLabel} = {formatN(baseN)}</p>
      <p className="prov__source label">{sourceLineFor(year)}</p>
      {readingNotes(notes).map((n) => <p key={n} className="prov__note label">{n}</p>)}
    </footer>
  );
}
