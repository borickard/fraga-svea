interface Props {
  items: { id: string; label: string }[];
  active: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
}

/**
 * Segment- och alternativväljare. Neutrala: pastellerna hör hemma i grafen,
 * aldrig i knappar eller paneler.
 */
export function Pills({ items, active, onSelect, ariaLabel }: Props) {
  if (items.length <= 1) return null;
  return (
    <div className="pills" role="group" aria-label={ariaLabel}>
      {items.map((item) => (
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
    </div>
  );
}
