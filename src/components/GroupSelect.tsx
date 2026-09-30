interface Props {
  groups: string[];
  active: string;
  onSelect: (group: string) => void;
  totalLabel: string;
}

/**
 * Segmentgruppsväljare.
 *
 * Bilagan bryter ner på 39 grupper. Som piller blir det sex rader som fyller
 * halva skärmen innan man ens sett ett svar — en dashboard, vilket är precis
 * vad den här designen inte ska vara. En rad räcker.
 */
export function GroupSelect({ groups, active, onSelect, totalLabel }: Props) {
  return (
    <div className="pillset groupselect">
      {/* "Nedbrytning" är undersökningsspråk. "Visa per" säger vad kontrollen
          gör, vilket är det enda en journalist på deadline behöver veta. */}
      <label className="pillset__label label" htmlFor="svea-group">Visa per</label>
      <select
        id="svea-group"
        className="groupselect__input"
        value={active}
        onChange={(e) => onSelect(e.target.value)}
      >
        {groups.map((g) => (
          <option key={g} value={g}>{g === 'TOTALT' ? totalLabel : g}</option>
        ))}
      </select>
    </div>
  );
}
