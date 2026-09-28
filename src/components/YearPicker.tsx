interface Props {
  years: number[];
  active: number;
  onSelect: (year: number) => void;
}

/**
 * Årsväljare.
 *
 * Årgången är det yttersta valet i verktyget. Den står överst, bredvid
 * avsändaren, för att en siffra utan årtal är värdelös — och för att det ska
 * vara omöjligt att missa vilken undersökning man tittar på.
 */
export function YearPicker({ years, active, onSelect }: Props) {
  if (years.length < 2) return null;
  return (
    <div className="years" role="group" aria-label="Årgång">
      {years.map((y) => (
        <button
          key={y}
          type="button"
          className="pill pill--year"
          aria-pressed={y === active}
          onClick={() => onSelect(y)}
        >
          {y}
        </button>
      ))}
    </div>
  );
}
