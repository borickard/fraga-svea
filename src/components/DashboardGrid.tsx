import { useRef, useState } from 'react';
import type { Module, ModuleData } from '../lib/dashboard';
import { ModuleCard } from './ModuleCard';

interface Props {
  modules: Module[];
  resolve: (m: Module) => ModuleData | null;
  year: number;
  editing: boolean;
  onReorder: (next: Module[]) => void;
  onChange: (next: Module) => void;
  onRemove: (id: string) => void;
  onEdit: (m: Module) => void;
}

/**
 * Rutnätet.
 *
 * Kolumnerna är auto-fill med minsta bredd, så antalet följer fönstret utan
 * brytpunkter att hålla reda på. En modul tar en eller två kolumner; fri
 * storlek i både led hade krävt ett eget layoutsystem och gett rader som
 * inte går ihop.
 *
 * Omordning sker med pekare — mus, penna och finger genom samma kod — och
 * finns också som knappar på varje modul. Drag och släpp är osynligt för
 * den som navigerar med tangentbord, så knapparna är inte ett tillägg utan
 * den väg som alltid fungerar.
 */
export function DashboardGrid({ modules, resolve, year, editing, onReorder, onChange, onRemove, onEdit }: Props) {
  const [dragging, setDragging] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  function move(id: string, delta: number) {
    const from = modules.findIndex((m) => m.id === id);
    const to = Math.max(0, Math.min(modules.length - 1, from + delta));
    if (from === to) return;
    const next = [...modules];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onReorder(next);
  }

  /** Vilken modul ligger under pekaren? Närmast mittpunkt vinner. */
  function indexAt(x: number, y: number): number {
    const cards = [...(gridRef.current?.children ?? [])] as HTMLElement[];
    let best = -1;
    let bestDist = Infinity;
    cards.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + r.height / 2);
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  function startDrag(id: string) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (!editing || e.button !== 0) return;
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(id);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (dragging !== id) return;
        const to = indexAt(e.clientX, e.clientY);
        const from = modules.findIndex((m) => m.id === id);
        if (to < 0 || to === from) return;
        const next = [...modules];
        const [m] = next.splice(from, 1);
        next.splice(to, 0, m);
        onReorder(next);
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (dragging !== id) return;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        setDragging(null);
      },
      onPointerCancel: () => setDragging(null),
    };
  }

  return (
    <div className="grid" ref={gridRef}>
      {modules.map((m) => {
        const data = resolve(m);
        if (!data) {
          return (
            <article key={m.id} className="module module--span1 module--gone">
              <p className="module__title">Frågan finns inte i {year}</p>
              <p className="module__subtitle">Modulen pekar på något den här årgången inte mätt.</p>
              {editing && (
                <button type="button" className="pill pill--tool" onClick={() => onRemove(m.id)}>Ta bort</button>
              )}
            </article>
          );
        }
        return (
          <div
            key={m.id}
            className={`grid__cell grid__cell--span${m.span}${dragging === m.id ? ' is-dragging' : ''}`}
          >
            <ModuleCard
              data={data}
              year={year}
              editing={editing}
              onChange={onChange}
              onRemove={() => onRemove(m.id)}
              onEdit={() => onEdit(m)}
              onMove={(d) => move(m.id, d)}
              dragHandlers={editing ? startDrag(m.id) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
