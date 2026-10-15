import { useState } from 'react';
import type { ChartKind, Module, ModuleData } from '../lib/dashboard';
import { Chart, colorOf } from './Chart';
import { People } from './People';
import { useWidth } from '../lib/useWidth';
import { Provenance } from './Provenance';
import { formatPct } from '../lib/format';
import { missingLabel } from '../lib/query';

const KIND_LABEL: Record<ChartKind, string> = {
  tal: 'Tal', bar: 'Staplar', grouped: 'Grupperat', line: 'Linje', donut: 'Ring', folk: 'Folk',
};

interface Props {
  data: ModuleData;
  year: number;
  editing: boolean;
  onChange: (next: Module) => void;
  onRemove: () => void;
  onEdit: () => void;
  onMove: (delta: number) => void;
  dragHandlers?: React.HTMLAttributes<HTMLElement>;
}

/**
 * En ruta i rutnätet.
 *
 * Bär samma skyldigheter som svarskortet: bas och n syns alltid, källan syns
 * alltid, och läsanvisningarna följer med. En modul som lossnat från sitt
 * sammanhang — delad vidare, utskriven, skärmdumpad — måste fortfarande gå
 * att granska.
 */
export function ModuleCard({ data, year, editing, onChange, onRemove, onEdit, onMove, dragHandlers }: Props) {
  const [table, setTable] = useState(false);
  const [plotRef, width] = useWidth<HTMLDivElement>();
  const { module } = data;

  const notes = {
    shape: data.shape,
    /*
     * Summan betyder något bara när x-axeln är frågans svarsalternativ.
     * I figurvyn gör den aldrig det: banden där är disjunkta och summerar
     * till hundra per konstruktion, och "kan inte läggas ihop — 182 %"
     * bredvid hundra figurer som just lagts ihop motsäger bilden.
     */
    showsSum: data.chart !== 'folk'
      && data.categories.length > 1 && data.series.length >= 1 && data.module.options.length !== 1,
    hasNettoRow: data.hasNettoRow,
    hasSmallBase: data.hasSmallBase,
    weighted: data.question.n_basis === 'viktade_intervjuer',
  };

  const single = data.chart === 'tal' ? data.series[0]?.points[0] : null;

  return (
    <article className={`module module--span${module.span}`} aria-label={data.title}>
      <header className="module__head">
        <span className="module__grip" aria-hidden="true" {...dragHandlers} />
        <div className="module__titles">
          <h3 className="module__title">{data.title}</h3>
          <p className="module__subtitle">{data.subtitle}</p>
        </div>
      </header>

      <div className="module__plot" ref={plotRef}>
        {single ? (
          <p className="module__hero">
            {single.value.pct === null
              ? <span className="module__hero-none">{missingLabel(single.value)}</span>
              : formatPct(single.value.pct)}
            <span className="module__hero-label">{data.series[0].label} · {single.label}</span>
          </p>
        ) : table ? (
          <ModuleTable data={data} />
        ) : data.chart === 'folk' ? (
          <People data={data} width={width} year={year} />
        ) : (
          <Chart data={data} width={width} />
        )}
      </div>

      {data.fallback && <p className="module__fallback">{data.fallback}</p>}

      <Provenance
        baseLabel={data.question.base_label} nLabel={data.nLabel}
        baseN={data.baseN} year={year} notes={notes}
      />

      {editing && (
        <div className="module__tools">
          <div className="module__kinds">
            {(['tal', 'bar', 'grouped', 'line', 'donut', 'folk'] as ChartKind[]).map((k) => {
              const ok = data.allowed.includes(k);
              return (
                <button
                  key={k} type="button" className="pill pill--tool"
                  aria-pressed={data.chart === k} disabled={!ok}
                  /* En form datan inte bär går inte att välja. Skälet står i
                     titeln i stället för att knappen tigande gör fel sak. */
                  title={ok ? KIND_LABEL[k] : 'Går inte på det här urvalet'}
                  onClick={() => onChange({ ...module, chart: k })}
                >
                  {KIND_LABEL[k]}
                </button>
              );
            })}
          </div>
          {data.availableGenders.length > 1 && (
            <div className="module__kinds">
              {data.availableGenders.map((g) => {
                const on = g === 'Alla' ? module.genders.length === 0 : module.genders.includes(g);
                return (
                  <button
                    key={g} type="button" className="pill pill--tool" aria-pressed={on}
                    onClick={() => {
                      if (g === 'Alla') return onChange({ ...module, genders: [] });
                      const next = module.genders.includes(g)
                        ? module.genders.filter((x) => x !== g)
                        : [...module.genders.filter((x) => x !== 'Alla'), g];
                      onChange({ ...module, genders: next });
                    }}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          )}
          <div className="module__actions">
            <button type="button" className="pill pill--tool" onClick={() => setTable((t) => !t)} aria-pressed={table}>
              Tabell
            </button>
            <button type="button" className="pill pill--tool"
              onClick={() => onChange({ ...module, span: module.span === 1 ? 2 : 1 })}>
              {module.span === 1 ? 'Bredda' : 'Smalna'}
            </button>
            <button type="button" className="pill pill--tool" onClick={() => onMove(-1)} aria-label="Flytta bakåt">←</button>
            <button type="button" className="pill pill--tool" onClick={() => onMove(1)} aria-label="Flytta framåt">→</button>
            <button type="button" className="pill pill--tool" onClick={onEdit}>Ändra urval</button>
            <button type="button" className="pill pill--tool" onClick={onRemove}>Ta bort</button>
          </div>
        </div>
      )}
    </article>
  );
}

/** Tabellen är inte en reserv utan ett krav: gul serie ligger på 2,2:1 mot vitt. */
function ModuleTable({ data }: { data: ModuleData }) {
  return (
    <div className="module__tablewrap">
      <table className="module__table">
        <thead>
          <tr>
            <th scope="col" />
            {data.series.map((s) => (
              <th key={s.key} scope="col">
                <span className="chart__swatch" style={{ background: colorOf(s.colorIndex) }} />{s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.categories.map((c, i) => (
            <tr key={c}>
              <th scope="row">{c}</th>
              {data.series.map((s) => {
                const v = s.points[i]?.value;
                return <td key={s.key}>{!v || v.pct === null ? '—' : `${formatPct(v.pct)}${v.reliable ? '' : ' °'}`}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
