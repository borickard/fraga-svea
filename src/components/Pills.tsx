import { useState } from 'react';

interface Props {
  items: { id: string; label: string }[];
  active: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  /**
   * Bilagan bryter ner på 35 segmentgrupper och vissa frågor har tjugo
   * svarsalternativ. Allt på en gång blir en vägg av piller — en dashboard,
   * vilket är just vad den här designen inte ska vara. Visa de första och
   * låt resten fällas ut.
   */
  maxVisible?: number;
}

/**
 * Segment- och alternativväljare. Neutrala: pastellerna hör hemma i grafen,
 * aldrig i knappar eller paneler.
 */
export function Pills({ items, active, onSelect, ariaLabel, maxVisible = 8 }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (items.length <= 1) return null;

  // Det valda pillret måste alltid synas, även om det ligger långt ner.
  const activeIndex = items.findIndex((i) => i.id === active);
  const collapse = !expanded && items.length > maxVisible;
  const visible = collapse
    ? [...items.slice(0, maxVisible), ...(activeIndex >= maxVisible ? [items[activeIndex]] : [])]
    : items;
  const hidden = items.length - visible.length;

  return (
    <div className="pills" role="group" aria-label={ariaLabel}>
      {visible.map((item) => (
        <button
          key={item.id}
          type="button"
          className="pill"
          aria-pressed={item.id === active}
          onClick={() => onSelect(item.id)}
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
