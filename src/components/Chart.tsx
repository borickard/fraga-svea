import { useState } from 'react';
import type { ModuleData } from '../lib/dashboard';
import type { SegmentValue } from '../types';
import { formatPct } from '../lib/format';
import { truncate, wrapText } from '../lib/wrap';

/**
 * Slot 1–6 ur tokens.css. Tilldelas i fast ordning, aldrig cykliskt.
 *
 * Sex, inte fyra: ringen får ha sex delar och en modul sex serier. Med fyra
 * färger blev "Mer sällan" grön precis som "Flera gånger dagligen", och då
 * är färgen inte längre en nyckel. Taket i dashboard.ts (MAX_SERIES) och
 * ringens taköverensstämmer med antalet slots, så listan tar aldrig slut.
 */
export const SERIES_COLORS = ['#1B9E77', '#2A78D6', '#E0A100', '#D4557C', '#4A3AA7', '#EB6834'] as const;
const NO_BASE = '#E4E6E5';
const INK = '#16181A';
const MUTED = '#71767B';
const GRID = 'rgba(22, 24, 26, 0.08)';
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export const colorOf = (i: number): string => SERIES_COLORS[i % SERIES_COLORS.length];

interface Props {
  data: ModuleData;
  width: number;
}

interface Hover { x: number; y: number; title: string; value: SegmentValue; }

/**
 * Modulernas graf.
 *
 * Formen är redan vald i dashboard.ts, och den väljer aldrig en form datan
 * inte bär: ingen ring på en flervalsfråga, ingen linje över en axel utan
 * ordning. Här ritas bara.
 *
 * Varje serie bär både färg och text — direktetikett vid märket och namn i
 * legenden. Den gula serien ligger på 2,2:1 mot vitt och skulle inte vara
 * läsbar på färgen ensam.
 */
export function Chart({ data, width }: Props) {
  const [hover, setHover] = useState<Hover | null>(null);
  if (width < 80) return null;

  const multi = data.series.length > 1;
  const body =
    data.chart === 'line' ? <Line data={data} width={width} onHover={setHover} />
    : data.chart === 'donut' ? <Donut data={data} width={width} onHover={setHover} />
    : <Bars data={data} width={width} multi={multi} onHover={setHover} />;

  return (
    <div className="chart">
      {multi && (
        <ul className="chart__legend">
          {data.series.map((s) => (
            <li key={s.key}>
              <span className="chart__swatch" style={{ background: colorOf(s.colorIndex) }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {body}
      {hover && (
        <div className="chart__tip" style={{ left: hover.x, top: hover.y }} role="status">
          <strong>{hover.title}</strong>
          {hover.value.pct === null
            ? 'ingen bas'
            : `${formatPct(hover.value.pct)} · n = ${hover.value.n}${hover.value.reliable ? '' : ' (liten bas)'}`}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- staplar */

const BAR_H = 15;
const BAR_H_MULTI = 11;
const BAR_GAP = 2;
const GROUP_GAP = 14;

function Bars({ data, width, multi, onHover }: Props & { multi: boolean; onHover: (h: Hover | null) => void }) {
  const labelW = Math.min(230, Math.max(84, Math.round(width * 0.34)));
  const valueW = 46;
  const trackX = labelW + 10;
  const trackW = Math.max(40, width - trackX - valueW - 6);
  const barH = multi ? BAR_H_MULTI : BAR_H;

  /**
   * Kategorietiketten bryts över högst två rader. Bilagans alternativ heter
   * "Andel användare (Använt minst någon gång senaste 12 månaderna)", och i
   * en smal modul blev det "Andel användare (A…" — vilket inte säger vilken
   * andel. Tabellvyn bär hela texten när inte ens två rader räcker.
   */
  const lines = data.categories.map((c) => {
    const all = wrapText(c, labelW, 11, 'mono');
    if (all.length <= 2) return all;
    return [all[0], truncate(`${all[1]} ${all[2]}`, labelW, 11, 'mono')];
  });
  const labelH = Math.max(...lines.map((l) => l.length)) * 14;
  const barsH = data.series.length * (barH + BAR_GAP) - BAR_GAP;
  const groupH = Math.max(barsH, labelH) + GROUP_GAP;
  const height = data.categories.length * groupH + 6;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="chart__svg" role="img"
      aria-label={`${data.title}. ${data.subtitle}.`}>
      {data.categories.map((cat, ci) => {
        const top = ci * groupH;
        return (
          <g key={cat}>
            {lines[ci].map((line, li) => (
              <text key={li} x={0} y={top + barH - 2 + li * 14} fontFamily={MONO} fontSize="11" fill={MUTED}>
                {line}
              </text>
            ))}
            {data.series.map((s, si) => {
              const point = s.points[ci];
              if (!point) return null;
              const y = top + si * (barH + BAR_GAP);
              const noBase = point.value.pct === null;
              const w = noBase ? barH : Math.max(barH, trackW * (point.value.pct as number));
              return (
                <rect
                  key={s.key} x={trackX} y={y} width={w} height={barH} rx={barH / 2}
                  fill={noBase ? NO_BASE : colorOf(s.colorIndex)}
                  onPointerEnter={(e) => onHover({
                    x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY,
                    title: multi ? `${cat} · ${s.label}` : cat, value: point.value,
                  })}
                  onPointerLeave={() => onHover(null)}
                />
              );
            })}
            {/* Varje stapel bär sitt värde. En enda etikett per grupp lästes
                som gruppens tal: "Instagram 56 %" var männen 16-25 år.
                Och en delad dashboard läses utan pekare — hovertexten finns
                inte i en skärmdump. */}
            {data.series.map((s, si) => {
              const v = s.points[ci]?.value;
              if (!v) return null;
              return (
                <text
                  key={s.key} x={width} y={top + si * (barH + BAR_GAP) + barH - 2} textAnchor="end"
                  fontFamily={MONO} fontSize={multi ? '10' : '12'} fontWeight="500"
                  fill={v.pct === null ? MUTED : INK}
                >
                  {v.pct === null ? '—' : `${formatPct(v.pct)}${v.reliable ? '' : '°'}`}
                </text>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/* ----------------------------------------------------------- linje */

function Line({ data, width, onHover }: Props & { onHover: (h: Hover | null) => void }) {
  const padL = 34, padR = 10, padT = 8, padB = 26;
  const height = 200;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const x = (i: number) => padL + (data.categories.length === 1 ? plotW / 2 : (plotW * i) / (data.categories.length - 1));
  const y = (pct: number) => padT + plotH * (1 - pct);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="chart__svg" role="img"
      aria-label={`${data.title}. ${data.subtitle}.`}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={padL} y1={y(t)} x2={width - padR} y2={y(t)} stroke={GRID} strokeWidth="1" />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontFamily={MONO} fontSize="10" fill={MUTED}>
            {Math.round(t * 100)}
          </text>
        </g>
      ))}

      {data.series.map((s) => {
        const pts = s.points.map((p, i) => ({ i, p })).filter(({ p }) => p.value.pct !== null);
        const d = pts.map(({ i, p }, k) => `${k ? 'L' : 'M'}${x(i)} ${y(p.value.pct as number)}`).join(' ');
        return (
          <g key={s.key}>
            <path d={d} fill="none" stroke={colorOf(s.colorIndex)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {pts.map(({ i, p }) => (
              <circle
                key={p.key} cx={x(i)} cy={y(p.value.pct as number)} r="4.5"
                fill={colorOf(s.colorIndex)} stroke="#FFFFFF" strokeWidth="2"
                onPointerEnter={(e) => onHover({
                  x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY,
                  title: `${p.label} · ${s.label}`, value: p.value,
                })}
                onPointerLeave={() => onHover(null)}
              />
            ))}
          </g>
        );
      })}

      {/* Var tredje etikett när de är många, annars kolliderar de. */}
      {data.categories.map((c, i) => {
        const step = Math.ceil(data.categories.length / Math.max(3, Math.floor(width / 70)));
        if (i % step !== 0 && i !== data.categories.length - 1) return null;
        const last = i === data.categories.length - 1;
        return (
          <text
            key={c} x={x(i)} y={height - 8}
            textAnchor={i === 0 ? 'start' : last ? 'end' : 'middle'}
            fontFamily={MONO} fontSize="10" fill={MUTED}
          >
            {truncate(c, 70, 10, 'mono')}
          </text>
        );
      })}
    </svg>
  );
}

/* ----------------------------------------------------------- ring */

function Donut({ data, width, onHover }: Props & { onHover: (h: Hover | null) => void }) {
  const size = Math.min(width, 210);
  const r = size / 2 - 4;
  const inner = r * 0.58;
  const cx = size / 2, cy = size / 2;
  const points = data.series[0]?.points ?? [];
  const total = points.reduce((a, p) => a + (p.value.pct ?? 0), 0) || 1;

  let angle = -Math.PI / 2;
  const arcs = points.map((p, i) => {
    const slice = ((p.value.pct ?? 0) / total) * Math.PI * 2;
    const a0 = angle, a1 = angle + slice;
    angle = a1;
    const big = slice > Math.PI ? 1 : 0;
    const d = [
      `M${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}`,
      `A${r} ${r} 0 ${big} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`,
      `L${cx + inner * Math.cos(a1)} ${cy + inner * Math.sin(a1)}`,
      `A${inner} ${inner} 0 ${big} 0 ${cx + inner * Math.cos(a0)} ${cy + inner * Math.sin(a0)}`,
      'Z',
    ].join(' ');
    return { d, point: p, color: colorOf(i) };
  });

  return (
    <div className="chart__donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="chart__svg" role="img"
        aria-label={`${data.title}. ${data.subtitle}.`}>
        {arcs.map(({ d, point, color }) => (
          <path
            key={point.key} d={d} fill={color} stroke="#FFFFFF" strokeWidth="2"
            onPointerEnter={(e) => onHover({
              x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, title: point.label, value: point.value,
            })}
            onPointerLeave={() => onHover(null)}
          />
        ))}
      </svg>
      {/* Tårtbitar går inte att direktetikettera utan att de minsta kolliderar.
          Listan bredvid bär både färg, namn och värde. */}
      <ul className="chart__slices">
        {arcs.map(({ point, color }) => (
          <li key={point.key}>
            <span className="chart__swatch" style={{ background: color }} />
            <span className="chart__slice-label">{point.label}</span>
            <span className="chart__slice-value">{formatPct(point.value.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
