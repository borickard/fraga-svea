import { activeTopics } from '../lib/labels';

interface Props {
  active: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * Ämnen att börja från.
 *
 * Utan dem är sökfältet en tom ruta: man måste redan veta vad undersökningen
 * innehåller för att kunna fråga den. Ämnena visar vad som går att fråga om.
 * De är neutrala i färg — pastellerna hör hemma i grafen.
 */
export function Topics({ active, onSelect }: Props) {
  const topics = activeTopics();
  if (topics.length === 0) return null;

  return (
    <div className="pills pills--topics" role="group" aria-label="Ämnen i undersökningen">
      {topics.map((t) => (
        <button
          key={t.id}
          type="button"
          className="pill"
          aria-pressed={t.id === active}
          onClick={() => onSelect(t.id === active ? null : t.id)}
        >
          {t.label} <span className="pill__count">{t.count}</span>
        </button>
      ))}
    </div>
  );
}
