import { useEffect, useId, useRef, useState } from 'react';

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
 * Bilagan har 22 plattformar och 21 segmentaxlar. Som piller blir det en
 * vägg som fyller skärmen innan man ens sett ett svar — en dashboard, vilket
 * är precis vad den här designen inte ska vara. En rad räcker, och eftersom
 * bara ett värde kan gälla åt gången förlorar man ingenting på att vika ihop
 * dem.
 *
 * Byggd för hand i stället för som <select>, eftersom operativsystemet ritar
 * select-listan själv: blå markering, systemtypsnitt, fyrkantiga hörn. Mitt i
 * ett kort med pasteller och mjuka skuggor ser den ut som ett fel.
 *
 * Tangentbordet beter sig som en listbox ska: piltangenter flyttar, Home och
 * End går till ändarna, Enter väljer, Escape stänger och lämnar tillbaka
 * fokus till knappen.
 */
export function Dropdown({ label, options, value, onChange }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const current = options[index] ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function openList() {
    setActive(index);
    setOpen(true);
  }

  function choose(i: number) {
    const o = options[i];
    if (o) onChange(o.id);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onListKey(e: React.KeyboardEvent) {
    const last = options.length - 1;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive((a) => Math.min(last, a + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActive((a) => Math.max(0, a - 1)); break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(last); break;
      case 'Enter':
      case ' ': e.preventDefault(); choose(active); break;
      case 'Escape':
      case 'Tab': setOpen(false); buttonRef.current?.focus(); break;
    }
  }

  return (
    <div className="pillset dropdown" ref={rootRef}>
      <span className="pillset__label label" id={`${id}-label`}>{label}</span>

      <button
        ref={buttonRef}
        type="button"
        className="dropdown__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openList(); }
        }}
      >
        <span className="dropdown__value" id={`${id}-value`}>{current?.label}</span>
        <svg className="dropdown__chevron" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          className="dropdown__list"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={`${id}-label`}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <li
              key={o.id}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={o.id === value}
              className={`dropdown__option${i === active ? ' is-active' : ''}`}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
