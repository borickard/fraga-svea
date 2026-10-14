import { useMemo, useState } from 'react';
import { activeAxes, findings, type Finding } from '../lib/divides';
import { formatPct } from '../lib/format';
import { useWidth } from '../lib/useWidth';

const TRACK = '#E4E6E5';
/*
 * En kulör i två valörer, inte två kulörer.
 *
 * Mörk punkt är den högre polen och ljus den lägre, så färgen kodar storlek
 * — det hanteln finns till för. Vilken grupp som är vilken står alltid i
 * text bredvid, eftersom den rollen byter plats mellan raderna.
 */
const HIGH = '#1B9E77';
const LOW = '#9BD9C4';

interface Props {
  year: number;
  onOpen: (f: Finding) => void;
}

/**
 * Skiljelinjer.
 *
 * Vänder på verktyget: i stället för att användaren ska ställa rätt fråga
 * letar appen själv upp var två grupper svarar mest olika. Det är samma
 * uppslagning som överallt annars — inga nya tal — men riktningen är omvänd.
 *
 * Varje fynd ritas som en hantel. Formen finns till just för två värden per
 * rad: ögat läser avståndet mellan punkterna, vilket är precis det fyndet
 * handlar om, medan två staplar hade bett läsaren jämföra två längder från
 * samma kant.
 */
export function Divides({ year, onOpen }: Props) {
  const axes = useMemo(() => activeAxes(year), [year]);
  const [axis, setAxis] = useState(axes[0]?.grupp ?? '');
  const rows = useMemo(() => (axis ? findings(year, axis) : []), [year, axis]);
  const current = axes.find((a) => a.grupp === axis);

  return (
    <section className="divides">
      <p className="divides__lead">
        Var delar sig Sverige mest? Appen går igenom varje fråga i bilagan och rangordnar
        de ställen där två grupper svarar mest olika.
      </p>

      <div className="pillset">
        <p className="pillset__label label">Skiljelinje</p>
        <div className="pills">
          {axes.map((a) => (
            <button
              key={a.grupp} type="button" className="pill" aria-pressed={a.grupp === axis}
              onClick={() => setAxis(a.grupp)}
            >
              {a.etikett} <span className="pill__count">{a.count}</span>
            </button>
          ))}
        </div>
      </div>

      {current && (
        <p className="divides__count label">
          {rows.length} fynd längs {current.etikett.toLowerCase()}, störst skillnad först
        </p>
      )}

      <ol className="divides__list">
        {rows.map((f) => <Row key={`${f.question.id}|${f.option}`} f={f} onOpen={onOpen} />)}
      </ol>

      {/*
        Golvet står utskrivet. En lista som påstår sig hitta nyheter måste
        säga vad den sållat bort, annars ser frånvaron av fynd ut som ett
        påstående om att skillnader saknas.
      */}
      <p className="divides__note">
        <strong>Skillnaderna är samband, inte orsaker.</strong> Grupperna överlappar varandra —
        politisk åskådning hänger ihop med ålder, inkomst med utbildning — och bilagan
        korsar dem inte, så det går inte att avgöra vilken egenskap som driver en
        skillnad. Att vänsterväljare oftare säger sig må sämre av skrollande kan lika
        gärna handla om att de är yngre.
      </p>
      <p className="divides__note">
        Med i listan: skillnader på minst 10 procentenheter, där båda grupperna har minst
        100 intervjuer och skillnaden är större än vad slumpen rimligen ger (z-test, 95 %).
        Testet räknas här — bilagan anger Chi2 i sidhuvudet men lägger inga markörer i
        cellerna. För de flesta tabeller är n viktade intervjuer, vilket överskattar
        precisionen, så golvet är en grovsållning mot brus och inte ett publicerbart
        signifikanspåstående. Ett fynd per fråga, det med störst skillnad.
      </p>
    </section>
  );
}

function Row({ f, onOpen }: { f: Finding; onOpen: (f: Finding) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const w = Math.max(120, width);
  const H = 26;
  const R = 6;
  const x = (p: number) => R + p * (w - R * 2);

  return (
    <li className="divides__item">
      <button type="button" className="divides__row" onClick={() => onOpen(f)}>
        <span className="divides__gap">{Math.round(f.gap * 100)}<i>pe</i></span>

        <span className="divides__body">
          <span className="divides__title">{f.title}</span>
          <span className="divides__option">{f.option}</span>

          <span className="divides__plot" ref={ref}>
            {width > 0 && (
              <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img"
                aria-label={`${f.high.label} ${formatPct(f.high.pct)}, ${f.low.label} ${formatPct(f.low.pct)}`}>
                <line x1={R} y1={H / 2} x2={w - R} y2={H / 2} stroke={TRACK} strokeWidth="3" strokeLinecap="round" />
                <line
                  x1={x(Math.min(f.low.pct, f.high.pct))} y1={H / 2}
                  x2={x(Math.max(f.low.pct, f.high.pct))} y2={H / 2}
                  stroke={HIGH} strokeWidth="3" strokeLinecap="round" opacity="0.28"
                />
                <circle cx={x(f.low.pct)} cy={H / 2} r={R} fill={LOW} stroke="#FFFFFF" strokeWidth="2" />
                <circle cx={x(f.high.pct)} cy={H / 2} r={R} fill={HIGH} stroke="#FFFFFF" strokeWidth="2" />
              </svg>
            )}
          </span>

          {/* Namn och tal i text: färgen ensam får aldrig bära vilken pol som är vilken. */}
          <span className="divides__poles">
            <span><i className="divides__dot" style={{ background: HIGH }} />{f.high.label} {formatPct(f.high.pct)}</span>
            <span><i className="divides__dot" style={{ background: LOW }} />{f.low.label} {formatPct(f.low.pct)}</span>
            <span className="divides__n">n = {f.high.n} / {f.low.n}</span>
          </span>
        </span>
      </button>
    </li>
  );
}
