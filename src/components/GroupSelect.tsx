import { Dropdown } from './Dropdown';

interface Props {
  groups: string[];
  active: string;
  onSelect: (group: string) => void;
  totalLabel: string;
}

/** Segmentgruppsväljare. Bilagan bryter ner på 39 grupper — se Dropdown. */
export function GroupSelect({ groups, active, onSelect, totalLabel }: Props) {
  return (
    <Dropdown
      /* "Nedbrytning" är undersökningsspråk. "Visa per" säger vad kontrollen
         gör, vilket är det enda en journalist på deadline behöver veta. */
      label="Visa per"
      options={groups.map((g) => ({ id: g, label: g === 'TOTALT' ? totalLabel : g }))}
      value={active}
      onChange={onSelect}
    />
  );
}
