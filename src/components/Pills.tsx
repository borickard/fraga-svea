import { useState } from 'react';

export interface PillItem { id: string; label: string; }

interface Props {
  items: PillItem[];
  /** Synlig rubrik över raden. Utan den vet man inte vad pillren styr. */
  label: string;
  selected: string[];
  onChange: (next: string[]) => void;
  /**
   * Flervalsläge. Tom lista betyder alla — det är skillnad på att inte ha
   * valt något och att ha valt allt, men i grafen visas samma sak, och
   * "alla" är rätt utgångsläge när man inte sagt något.
   */
  multi?: boolean;
  maxVisible?: number;
  /** Text på knappen som nollställer till alla. Utelämnas i enkelval. */
  allLabel?: string;
}

/**
 * Segment- och alternativväljare. Neutrala: pastellerna hör hemma i grafen,
 * aldrig i knappar eller paneler.
 *
 * Valda piller ligger på en egen rad överst, de ovalda under. Med tjugo
 * alternativ i samma klump gick det annars inte att se vad som var påslaget
 * utan att läsa varje piller — och det är just det valet som avgör vad grafen
 * visar.
 */
export function Pills({
  items, label, selected, onChange, multi = false, maxVisible = 8, allLabel,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const isOn = (id: string) => selected.includes(id);
  const active = items.filter((i) => isOn(i.id));
  const inactive = items.filter((i) => !isOn(i.id));

  const head = <p className="pillset__label label">{label}</p>;

  /**
   * Ett enda val är inget val. Raden försvann tidigare helt, vilket fick
   * basväljaren att dyka upp och försvinna mellan frågor — man kunde inte
   * lära sig var den satt. Nu står värdet kvar, låst, så att raden alltid
   * finns och alltid säger vilken bas svaret vilar på.
   */
  if (items.length === 1 && !multi) {
    return (
      <div className="pillset" role="group" aria-label={label}>
        {head}
        <div className="pills">
          <span className="pill pill--locked" title={items[0].label}>{items[0].label}</span>
        </div>
      </div>
    );
  }

  // Uppdelningen i två rader finns för att flervalet annars är oläsbart. Med
  // ett enda val syns det redan vilket piller som är påslaget, och en extra
  // avdelare vore bara en linje till.
  const split = multi;

  function toggle(id: string) {
    if (!multi) return onChange([id]);
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const collapse = !expanded && inactive.length > maxVisible;
  const shown = collapse ? inactive.slice(0, maxVisible) : inactive;
  const hidden = inactive.length - shown.length;

  const pill = (item: PillItem, on: boolean) => (
    <button
      key={item.id}
      type="button"
      className="pill"
      aria-pressed={on}
      onClick={() => toggle(item.id)}
      title={item.label}
    >
      {item.label}
    </button>
  );

  if (!split) {
    return (
      <div className="pillset" role="group" aria-label={label}>
        {head}
        <div className="pills">
          {items.map((i) => pill(i, isOn(i.id)))}
        </div>
      </div>
    );
  }

  return (
    <div className="pillset" role="group" aria-label={label}>
      {head}
      {/* Aktiv rad. Tom markering i flervalsläge betyder alla, och då står
          det uttryckligen i stället för att raden ser tom och trasig ut. */}
      <div className="pills pills--active">
        {multi && selected.length === 0 ? (
          <span className="pill pill--all" aria-current="true">
            {allLabel ?? 'Alla'}
          </span>
        ) : (
          active.map((i) => pill(i, true))
        )}
        {/* Nollställning, inte ett val. Med samma text som det mörka pillret
            ovan ("Alla svarsalternativ") såg den ut som en tredje påslagen
            markering bredvid Youtube och Facebook. */}
        {multi && selected.length > 0 && allLabel && (
          <button type="button" className="pill pill--more" onClick={() => onChange([])}>
            Visa alla
          </button>
        )}
      </div>

      {shown.length > 0 && (
        <div className="pills pills--inactive">
          {shown.map((i) => pill(i, false))}
          {collapse && hidden > 0 && (
            <button type="button" className="pill pill--more" onClick={() => setExpanded(true)}>
              +{hidden} till
            </button>
          )}
          {expanded && inactive.length > maxVisible && (
            <button type="button" className="pill pill--more" onClick={() => setExpanded(false)}>
              Visa färre
            </button>
          )}
        </div>
      )}
    </div>
  );
}
