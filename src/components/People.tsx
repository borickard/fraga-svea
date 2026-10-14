import { useEffect, useRef, useState } from 'react';
import type { ModuleData } from '../lib/dashboard';
import { buildPeople, type Figure } from '../lib/people';
import { arrange, blobPath, type Arrangement } from '../lib/blobs';
import {
  AGE_RAMP, FIG_H, FIG_W, HAIR_OLD, HAIR_YOUNG, NEUTRAL_SHIRT, SHOES, SKIN, TROUSERS,
  digitCells, figureCells, type Gender,
} from '../lib/pixels';

const INK = '#16181A';
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

const AGE_STARTS = [8, 12, 16, 26, 36, 46, 56, 66, 76];
const ageIndex = (age: number | null): number =>
  age === null ? -1 : Math.max(0, AGE_STARTS.findIndex((a) => a === age));

interface Variant { id: string; gender: Gender; age: number | null; }
const variantId = (f: Figure) => `v${f.gender ?? 'x'}-${f.age ?? 'x'}`;

/*
 * Figurstorlekar, störst först — och bara heltal.
 *
 * Pixelkonst ritas med shapeRendering="crispEdges", som snäpper varje cell
 * till enhetspixlar. På en bruten skala blir somliga celler två pixlar och
 * andra tre, och figuren faller isär i ett raster som ser urblekt ut. Vid
 * heltal är varje cell exakt lika stor och figuren blir skarp.
 */
const SCALES = [3, 2, 1];

/**
 * Figurerna.
 *
 * Ytorna är organiska och — när mängderna är nästlade — ligger de fysiskt i
 * varandra. Den som använder varje dag står inuti ytan för dem som använder
 * varje vecka, som ligger inuti ytan för alla användare. Inneslutningen är
 * alltså geometrin själv och inte en konsol att ta på förtroende.
 *
 * Hela plotten är en SVG, och varje figur ett <use> av en symbol. Rörelsen
 * delas i två lager: ett som flyttar i sidled och ett som flyttar i höjdled,
 * med olika tidskurvor. Resultatet är en båge i stället för en rak linje —
 * en människa som byter yta går runt, inte tvärs igenom.
 */
export function People(
  { data, width, svgRef }: { data: ModuleData; width: number; svgRef?: React.Ref<SVGSVGElement> },
) {
  const people = buildPeople(data);
  const [ghosts, setGhosts] = useState<Figure[]>([]);
  const prev = useRef<Figure[]>([]);
  const lastPos = useRef(new Map<string, { x: number; y: number }>());

  const keys = people.figures.map((f) => f.key).join('|');
  useEffect(() => {
    const now = new Set(keys.split('|'));
    const gone = prev.current.filter((f) => !now.has(f.key));
    prev.current = people.figures;
    if (!gone.length) return;
    setGhosts(gone);
    const t = window.setTimeout(() => setGhosts([]), 760);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  if (width < 140) return null;

  const spec = people.fields.map((f, i) => ({ field: i, count: f.count, depth: f.depth }));
  const layout = people.layout === 'nested' ? 'nested' : 'row';

  // Största figurstorlek vars layout ryms på bredden. Att krympa en färdig
  // layout i stället hade gjort tröjsiffrorna oläsbara.
  let scale = SCALES[SCALES.length - 1];
  let plan: Arrangement = arrange(spec, layout, FIG_W * scale + 5, FIG_H * scale + 4, width);
  for (const s of SCALES) {
    const a = arrange(spec, layout, FIG_W * s + 5, FIG_H * s + 4, width);
    if (a.width <= width) { scale = s; plan = a; break; }
  }
  const showDigits = scale >= 2;

  const TOP = 26;
  const height = plan.height + TOP + 34;

  // Platserna i varje yta, uppifrån och ner.
  const bySlot = new Map<number, { x: number; y: number }[]>();
  for (const s of plan.slots) {
    const list = bySlot.get(s.field) ?? [];
    list.push({ x: s.x, y: s.y });
    bySlot.set(s.field, list);
  }
  for (const list of bySlot.values()) list.sort((a, b) => a.y - b.y || a.x - b.x);

  const ordered = [...people.figures].sort((a, b) =>
    a.field - b.field || ageIndex(a.age) - ageIndex(b.age) || a.key.localeCompare(b.key));
  // Platserna plockas med jämnt steg över hela ytan. Tar man de första i
  // ordningen samlas figurerna upptill och lämnar ett hål i botten av ytan.
  const counts = new Map<number, number>();
  for (const f of ordered) counts.set(f.field, (counts.get(f.field) ?? 0) + 1);
  const taken = new Map<number, number>();
  const positions = new Map<string, { x: number; y: number }>();
  for (const f of ordered) {
    const list = bySlot.get(f.field) ?? [];
    const k = taken.get(f.field) ?? 0;
    taken.set(f.field, k + 1);
    const need = counts.get(f.field) ?? 1;
    const stride = list.length > need ? list.length / need : 1;
    const slot = list[Math.min(list.length - 1, Math.floor(k * stride))]
      ?? list[list.length - 1] ?? { x: plan.width / 2, y: plan.height / 2 };
    positions.set(f.key, {
      x: slot.x - (FIG_W * scale) / 2,
      y: slot.y - (FIG_H * scale) / 2 + TOP,
    });
  }

  const ghostPositions = new Map(
    ghosts.map((g) => [g.key, lastPos.current.get(g.key) ?? { x: 0, y: 0 }] as const));
  lastPos.current = positions;

  const variants = new Map<string, Variant>();
  for (const f of [...people.figures, ...ghosts]) {
    variants.set(variantId(f), { id: variantId(f), gender: f.gender, age: f.age });
  }

  const order = new Map([...people.figures].map((f, i) => [f.key, i]));

  return (
    <div className="folk">
      <svg
        ref={svgRef}
        width={Math.min(width, plan.width)} height={height * Math.min(1, width / plan.width)}
        viewBox={`0 0 ${plan.width} ${height}`} className="chart__svg" role="img"
        aria-label={`${data.title}. ${people.fields.map((f) => `${f.label}: ${f.count} av 100`).join('. ')}`}
      >
        <defs>
          {[...variants.values()].map((v) => <FigureSymbol key={v.id} variant={v} showDigits={showDigits} />)}
        </defs>

        <g transform={`translate(0 ${TOP})`}>
          {/* Varje djupare yta är en aning starkare. Ytorna ritas utifrån och
              in, så lagren staplas och inneslutningen syns som en ton som
              mörknar inåt — även med hundra figurer ovanpå. */}
          {plan.blobs.map((b) => (
            <path
              key={b.field} d={blobPath(b)}
              fill={`rgba(27,158,119,${(0.05 + b.depth * 0.05).toFixed(3)})`}
              stroke="none"
            />
          ))}
        </g>


        {/* Konturerna över folkmassan. Under den syntes de inte alls, och
            det är konturen som bär inneslutningen. */}
        <g transform={`translate(0 ${TOP})`}>
          {plan.blobs.map((b) => (
            <path key={`e${b.field}`} d={blobPath(b)} fill="none"
              stroke="rgba(22,24,26,0.26)" strokeWidth="1.25" />
          ))}
        </g>

        {people.figures.map((f) => {
          const p = positions.get(f.key)!;
          const d = (order.get(f.key) ?? 0) % 26 * 7;
          return (
            <g key={f.key} className="folk__x" style={{ transform: `translateX(${p.x}px)`, transitionDelay: `${d}ms` }}>
              <use
                href={`#${variantId(f)}`} className="folk__y"
                width={FIG_W * scale} height={FIG_H * scale}
                style={{ transform: `translateY(${p.y}px)`, transitionDelay: `${d}ms` }}
              />
            </g>
          );
        })}

        {ghosts.map((f) => {
          const p = ghostPositions.get(f.key) ?? { x: 0, y: 0 };
          return (
            <g key={`g${f.key}`} style={{ transform: `translateX(${p.x}px)` }}>
              <use
                href={`#${variantId(f)}`} className="folk__gone"
                width={FIG_W * scale} height={FIG_H * scale}
                style={{ transform: `translateY(${p.y}px)` }}
              />
            </g>
          );
        })}
        {/* Allra sist, ovanpå allt: ritade före figurerna doldes etiketterna
            av dem. Etiketten sitter på sin egen kontur, så att den hör ihop med rätt
            yta även när ytorna ligger i varandra. */}
        {plan.blobs.map((b) => {
          const f = people.fields[b.field];
          if (!f) return null;
          const y = b.cy - b.r + TOP;
          const text = `${f.count} av 100`;
          const w = text.length * 6.4 + 14;
          return (
            <g key={`l${b.field}`}>
              <rect x={b.cx - w / 2} y={y - 10} width={w} height={17} rx="8.5" fill="#FFFFFF" opacity="0.94" />
              <text x={b.cx} y={y + 2} textAnchor="middle" fontFamily={MONO} fontSize="10.5" fontWeight="500" fill={INK}>
                {text}
              </text>
            </g>
          );
        })}
      </svg>

      <ul className="folk__fields">
        {people.fields.map((f) => (
          <li key={f.key} style={{ paddingLeft: `${f.depth * 14}px` }}>
            <span className="folk__fields-n">{f.count}</span> {f.label}
          </li>
        ))}
      </ul>

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

function FigureSymbol({ variant, showDigits }: { variant: Variant; showDigits: boolean }) {
  const i = ageIndex(variant.age);
  const shirt = i >= 0 ? AGE_RAMP[Math.min(i, AGE_RAMP.length - 1)] : NEUTRAL_SHIRT;
  const hair = variant.age !== null && variant.age >= 66 ? HAIR_OLD : HAIR_YOUNG;
  const fill: Record<string, string> = { h: hair, s: SKIN, e: INK, c: shirt, p: TROUSERS, b: SHOES };
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
