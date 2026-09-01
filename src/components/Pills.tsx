import { useState } from 'react';

export interface PillItem { id: string; label: string; }

interface Props {
  items: PillItem[];
  ariaLabel: string;
  /**
   * Flervalsläge. Tom lista betyder alla — det är skillnad på att inte ha
   * valt något och att ha valt allt, men i grafen visas samma sak, och
   * "alla" är rätt utgångsläge när man inte sagt något.
   */
  selected: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
  maxVisible?: number;
  /** Text på knappen som nollställer till alla. Utelämnas i enkelval. */
  allLabel?: string;
}

/**
 * Segment- och alternativväljare. Neutrala: pastellerna hör hemma i grafen,
 * aldrig i knappar eller paneler.
 */
export function Pills({
  items, ariaLabel, selected, onChange, multi = false, maxVisible = 8, allLabel,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  if (items.length <= 1 && !multi) return null;
  if (items.length === 0) return null;

  const isOn = (id: string) => (multi && selected.length === 0 ? false : selected.includes(id));

  function toggle(id: string) {
    if (!multi) return onChange([id]);
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  // Valda piller måste alltid synas, även om de ligger långt ner i listan.
  const collapse = !expanded && items.length > maxVisible;
  const visible = collapse
    ? [
        ...items.slice(0, maxVisible),
        ...items.slice(maxVisible).filter((i) => isOn(i.id)),
      ]
    : items;
  const hidden = items.length - visible.length;

  return (
    <div className="pills" role="group" aria-label={ariaLabel}>
      {multi && allLabel && (
        <button
          type="button"
          className="pill"
          aria-pressed={selected.length === 0}
          onClick={() => onChange([])}
        >
          {allLabel}
        </button>
      )}

      {visible.map((item) => (
        <button
          key={item.id}
          type="button"
          className="pill"
          aria-pressed={isOn(item.id)}
          onClick={() => toggle(item.id)}
          title={item.label}
        >
          {item.label}
        </button>
      ))}

      {collapse && hidden > 0 && (
        <button type="button" className="pill pill--more" onClick={() => setExpanded(true)}>
          +{hidden} till
        </button>
      )}
      {expanded && items.length > maxVisible && (
        <button type="button" className="pill pill--more" onClick={() => setExpanded(false)}>
          Visa färre
        </button>
      )}
    </div>
  );
}
