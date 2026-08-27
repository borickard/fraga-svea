import type { FormEvent } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  canSubmit: boolean;
}

/** Sökfältet ligger alltid överst. Skuggan lyfter mjukt vid fokus. */
export function SearchField({ value, onChange, onSubmit, busy, canSubmit }: Props) {
  const submit = (e: FormEvent) => { e.preventDefault(); if (canSubmit && !busy) onSubmit(); };

  return (
    <form className="search" onSubmit={submit} role="search">
      <span className="search__icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12.2 12.2 16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <label className="sr-only" htmlFor="svea-search">Fråga om svenskarnas internetvanor</label>
      <input
        id="svea-search"
        className="search__input"
        type="search"
        autoComplete="off"
        placeholder="Fråga om svenskarnas internetvanor…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {busy ? (
        <span className="search__spinner" role="status" aria-label="Tolkar frågan" />
      ) : (
        <button className="search__action" type="submit" disabled={!canSubmit}>Fråga</button>
      )}
    </form>
  );
}
