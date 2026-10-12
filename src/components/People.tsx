import { useEffect, useRef, useState } from 'react';
import type { ModuleData } from '../lib/dashboard';
import { buildPeople, type Figure } from '../lib/people';
import {
  AGE_RAMP, FIG_H, FIG_W, HAIR_OLD, HAIR_YOUNG, NEUTRAL_SHIRT, SHOES, SKIN, TROUSERS,
  digitCells, figureCells, type Gender,
} from '../lib/pixels';

const MUTED = '#71767B';
const INK = '#16181A';
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/** Åldersband i bilagans ordning. Index styr både tröjfärg och håret. */
const AGE_STARTS = [8, 12, 16, 26, 36, 46, 56, 66, 76];
const ageIndex = (age: number | null): number =>
  age === null ? -1 : Math.max(0, AGE_STARTS.findIndex((a) => a === age));

interface Variant { id: string; gender: Gender; age: number | null; }

const variantId = (f: Figure) => `v${f.gender ?? 'x'}-${f.age ?? 'x'}`;

/**
 * Figurerna.
 *
 * Hela plotten är en SVG. Varje figur är ett <use> av en symbol, flyttad med
 * transform — hundra figurer med var sin uppsättning rektanglar hade varit
 * tiotusen noder, och ingen webbläsare animerar det mjukt.
 *
 * Figurer som lämnar urvalet blir kvar en stund som spöken så att de hinner
 * lösas upp. Det är inte dekor: en bas som krymper när man byter från
 * "Samtliga" till "Internetanvändare" är själva poängen med formen, och en
 * figur som bara försvinner visar inte att något togs bort.
 */
export function People({ data, width }: { data: ModuleData; width: number }) {
  const people = buildPeople(data);
  const [ghosts, setGhosts] = useState<Figure[]>([]);
  const prev = useRef<Figure[]>([]);
  const lastPos = useRef(new Map<string, { x: number; y: number }>());

  /*
   * Nyckelsträngen som beroende, inte figurlistan.
   *
   * buildPeople ger en ny array varje rendering, så effekten kördes om
   * konstant — och dess cleanup avbröt då timern som skulle ta bort
   * spökena. De blev kvar för alltid och dubblade antalet figurer.
   */
  const keys = people.figures.map((f) => f.key).join('|');
  useEffect(() => {
    const now = new Set(keys.split('|'));
    const gone = prev.current.filter((f) => !now.has(f.key));
    prev.current = people.figures;
    if (!gone.length) return;
    setGhosts(gone);
    const t = window.setTimeout(() => setGhosts([]), 620);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  if (width < 120) return null;

  const scale = width > 620 ? 2 : 1.5;
  const showDigits = scale >= 2;
  const cellW = FIG_W * scale + 4;
  const cellH = FIG_H * scale + 5;
  const PAD = 9;
  const GAP = 12;
  // Varje djup får en egen rad över rutorna, djupast överst. Utan en rad per
  // djup lade sig konsolerna över varandra och över fältens egna tal.
  const maxDepth = Math.max(0, ...people.fields.map((f) => f.depth));
  const BRACKET_H = 13;
  const HEAD = people.layout === 'nested' ? 26 + maxDepth * BRACKET_H : 26;

  // Kolumnerna fördelas efter antal, så tätheten blir densamma i alla fält.
  const n = people.fields.length;
  const totalCols = Math.max(n * 2, Math.floor((width - GAP * (n - 1) - n * PAD * 2) / cellW));
  const totalCount = people.fields.reduce((a, f) => a + f.count, 0) || 1;
  const cols = people.fields.map((f) => Math.max(2, Math.round((totalCols * f.count) / totalCount)));
  const widths = cols.map((c) => c * cellW + PAD * 2);
  const rows = people.fields.map((f, i) => Math.max(1, Math.ceil(f.count / cols[i])));
  const boxH = Math.max(...rows) * cellH + PAD * 2;

  const xs: number[] = [];
  let run = 0;
  widths.forEach((w) => { xs.push(run); run += w + GAP; });
  const plotW = Math.max(run - GAP, 1);
  const labelLines = Math.max(...people.fields.map(
    (f) => wrapLabel(f.label, Math.max(8, Math.floor((f.count / totalCount) * 40) + 8)).length));
  const height = HEAD + boxH + 20 + labelLines * 12;

  // Platser i varje fält, i tur och ordning.
  const taken = people.fields.map(() => 0);
  const place = (fi: number) => {
    const k = taken[fi]++;
    return {
      x: xs[fi] + PAD + (k % cols[fi]) * cellW,
      y: HEAD + PAD + Math.floor(k / cols[fi]) * cellH,
    };
  };

  // Inom ett fält står de yngsta först, så gradienten går att läsa.
  const ordered = [...people.figures].sort((a, b) =>
    a.field - b.field || ageIndex(a.age) - ageIndex(b.age) || a.key.localeCompare(b.key));
  const positions = new Map<string, { x: number; y: number }>();
  for (const f of ordered) positions.set(f.key, place(f.field));

  const variants = new Map<string, Variant>();
  for (const f of [...people.figures, ...ghosts]) {
    variants.set(variantId(f), { id: variantId(f), gender: f.gender, age: f.age });
  }

  const scaleBox = plotW > width ? width / plotW : 1;

  /*
   * Spöket ska blekna där det stod, inte i hörnet.
   *
   * Platserna läses ur ref:en INNAN den skrivs om, så att den rendering som
   * först visar ett spöke fortfarande bär föregående platser. Skrivningen
   * sker under renderingen och inte i en effekt — en effekt efter ett
   * villkorligt return hade brutit hook-ordningen.
   */
  const ghostPositions = new Map(
    ghosts.map((g) => [g.key, lastPos.current.get(g.key) ?? { x: 0, y: 0 }] as const));
  lastPos.current = positions;

  return (
    <div className="folk">
      <svg
        width={width} height={height * scaleBox}
        viewBox={`0 0 ${plotW} ${height}`} className="chart__svg" role="img"
        aria-label={`${data.title}. ${people.fields.map((f) => `${f.label}: ${f.count} av 100`).join('. ')}`}
      >
        <defs>
          {[...variants.values()].map((v) => <FigureSymbol key={v.id} variant={v} showDigits={showDigits} />)}
        </defs>

        {people.fields.map((f, i) => (
          <g key={f.key}>
            <rect
              x={xs[i]} y={HEAD} width={widths[i]} height={boxH} rx="14"
              fill="rgba(22,24,26,0.028)"
            />
            <text x={xs[i]} y={HEAD - 8} fontFamily={MONO} fontSize="11" fontWeight="500" fill={INK}>
              {f.count} av 100
            </text>
            {wrapLabel(f.label, Math.max(8, Math.floor(widths[i] / 6))).map((line, li) => (
              <text
                key={li} x={xs[i]} y={HEAD + boxH + 16 + li * 12}
                fontFamily={MONO} fontSize="10" fill={MUTED}
              >
                {line}
              </text>
            ))}
          </g>
        ))}

        {/* Inneslutningen. Konsolen spänner över de fält som tillsammans
            utgör övermängden — det är den delmängdsrelation ett Venn-diagram
            skulle visa, och här är den tagen ur datan. */}
        {people.layout === 'nested' && people.fields.map((f, i) => {
          if (f.depth === 0) return null;
          const from = xs[i];
          const to = xs[people.fields.length - 1] + widths[people.fields.length - 1];
          const y = HEAD - 22 - (maxDepth - f.depth) * BRACKET_H;
          const total = people.fields.slice(i).reduce((a, x) => a + x.count, 0);
          return (
            <g key={`b${f.key}`}>
              <path d={`M${from} ${y + 5}L${from} ${y}L${to} ${y}L${to} ${y + 5}`}
                fill="none" stroke="rgba(22,24,26,0.22)" strokeWidth="1" />
              <text x={(from + to) / 2} y={y - 3} textAnchor="middle"
                fontFamily={MONO} fontSize="9" fill={MUTED}>
                {total} av 100
              </text>
            </g>
          );
        })}

        {people.figures.map((f) => {
          const p = positions.get(f.key)!;
          return (
            <use
              key={f.key} href={`#${variantId(f)}`}
              className="folk__fig"
              width={FIG_W * scale} height={FIG_H * scale}
              style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
            />
          );
        })}

        {ghosts.map((f) => {
          const p = ghostPositions.get(f.key) ?? { x: 0, y: 0 };
          return (
            <use
              key={`g${f.key}`} href={`#${variantId(f)}`}
              className="folk__fig folk__fig--gone"
              width={FIG_W * scale} height={FIG_H * scale}
              style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
            />
          );
        })}
      </svg>

      <p className="folk__note">
        Hundra figurer ur <strong>{people.population}</strong> · n = {people.populationN}. {people.note}
      </p>
      {people.composition && (
        <div className="folk__key">
          <span className="folk__key-label">Ålder</span>
          {AGE_STARTS.map((a, i) => (
            <span key={a} className="folk__key-step">
              <span className="chart__swatch" style={{ background: AGE_RAMP[i] }} />{a}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Två rader räcker för bilagans bandnamn. Resten klipps med ellips. */
function wrapLabel(text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > max && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length <= 2) return lines;
  return [lines[0], `${lines[1].slice(0, Math.max(1, max - 1))}…`];
}

function FigureSymbol({ variant, showDigits }: { variant: Variant; showDigits: boolean }) {
  const i = ageIndex(variant.age);
  const shirt = i >= 0 ? AGE_RAMP[Math.min(i, AGE_RAMP.length - 1)] : NEUTRAL_SHIRT;
  const hair = variant.age !== null && variant.age >= 66 ? HAIR_OLD : HAIR_YOUNG;
  const fill: Record<string, string> = { h: hair, s: SKIN, e: INK, c: shirt, p: TROUSERS, b: SHOES };
  // Mörk tröja behöver ljusa siffror, ljus tröja mörka.
  const digit = i >= 5 ? '#FFFFFF' : INK;

  return (
    <symbol id={variant.id} viewBox={`0 0 ${FIG_W} ${FIG_H}`}>
      {figureCells(variant.gender).map((c) => (
        <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width="1" height="1" fill={fill[c.kind]} shapeRendering="crispEdges" />
      ))}
      {showDigits && variant.age !== null && digitCells(String(variant.age)).map((c) => (
        <rect key={`d${c.x}-${c.y}`} x={c.x} y={c.y} width="1" height="1" fill={digit} shapeRendering="crispEdges" />
      ))}
    </symbol>
  );
}
