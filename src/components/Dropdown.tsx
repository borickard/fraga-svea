import { useId } from 'react';

export interface DropdownOption { id: string; label: string; }

interface Props {
  label: string;
  options: DropdownOption[];
  value: string;
  onChange: (id: string) => void;
}

/**
 * Enkelval med många värden.
 *
 * Bilagan har 22 plattformar och 39 segmentgrupper. Som piller blir det en
 * vägg som fyller skärmen innan man ens sett ett svar — en dashboard, vilket
 * är precis vad den här designen inte ska vara. En rad räcker, och eftersom
 * bara ett värde kan gälla åt gången förlorar man ingenting på att vika ihop
 * dem.
 */
export function Dropdown({ label, options, value, onChange }: Props) {
  const id = useId();
  return (
    <div className="pillset">
      <label className="pillset__label label" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="dropdown"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
