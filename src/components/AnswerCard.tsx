import { forwardRef } from 'react';
import type { Answer } from '../lib/query';
import { DATA_COLORS, FALLBACK_COLOR, sourceLine } from '../lib/query';
import { formatN, formatPct } from '../lib/format';
import { truncate, wrapText } from '../lib/wrap';

/**
 * Signaturen.
 *
 * Kortet på skärmen och den nedladdade bilden är samma nod. Det finns ingen
 * separat exportmall och ingen skillnad mellan förhandsvisning och fil —
 * därför är hela kortet en enda SVG, inte HTML med en graf inuti.
 * Siffran kan inte lämna appen utan sin bas och sin källa.
 *
 * Grafen: inga rutnät, inga axellinjer, ingen legend, ingen tooltip.
 * Segmentnamn till vänster, rundad stapel, värde till höger. Det är allt.
 */

const W = 720;
const PAD = 36;
const LABEL_W = 158;
const VALUE_W = 84;
const GAP = 16;
const BAR_H = 14;
const ROW_H = 40;
const TRACK_X = PAD + LABEL_W + GAP;
const TRACK_W = W - PAD - VALUE_W - GAP - TRACK_X;

const INK = '#16181A';
const MUTED = '#71767B';
const HAIRLINE = 'rgba(22, 24, 26, 0.07)';
const SURFACE = '#FFFFFF';

const SANS = "'Instrument Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/** Staplarna växer ut från vänster, förskjutet 40 ms per rad. Inaktiverat vid reducerad rörelse. */
const BAR_ANIMATION_CSS = `
@keyframes svea-bar-in { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.svea-bar { transform-origin: ${TRACK_X}px 0; animation: svea-bar-in 280ms cubic-bezier(0.2,0,0.1,1) both; }
@media (prefers-reduced-motion: reduce) { .svea-bar { animation: none; } }
`;

export interface AnswerCardProps {
  answer: Answer;
  /** Sätts vid export: stänger av animationen så att bilden aldrig fångas halvvägs. */
  still?: boolean;
}

export const AnswerCard = forwardRef<SVGSVGElement, AnswerCardProps>(function AnswerCard(
  { answer, still = false },
  ref,
) {
  const { question, rows, headline, headlineLabel, baseN, hasSmallBase } = answer;

  // Flera tabeller i bilagan redovisar bara viktade intervjuer. Ett viktat tal
  // är inte ett antal genomförda intervjuer och märks därför ut, både i
  // fotnoten och i varningen om små baser.
  const weighted = question.n_basis === 'viktade_intervjuer';
  const nLabel = weighted ? 'Viktade intervjuer' : 'n';
  const cautionText = weighted
    ? '° färre än 100 viktade intervjuer — tolka med försiktighet'
    : '° färre än 100 intervjuer — tolka med försiktighet';

  // ---- vertikal layout, uträknad före render så att höjden alltid stämmer
  // Frågans exakta formulering står överst: kortet ska gå att läsa fristående,
  // och siffran får aldrig lämna appen utan sin fråga.
  const questionLines = wrapText(question.text, W - PAD * 2, 18, 'sans');
  const questionTop = PAD + 18;
  const questionEnd = questionTop + (questionLines.length - 1) * 25;

  const headlineY = questionEnd + 84;
  const kickerY = headlineY + 24;
  const rule1Y = kickerY + 26;
  const rowsY = rule1Y + 26;
  const rowsEnd = rowsY + rows.length * ROW_H;
  const rule2Y = rowsEnd + 10;

  const metaY = rule2Y + 26;
  const sourceY = metaY + 17;
  const cautionY = sourceY + 17;
  const H = (hasSmallBase ? cautionY : sourceY) + PAD - 6;

  const label = (text: string) => text.toUpperCase();

  return (
    <svg
      ref={ref}
      className="card-svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`${headlineLabel}: ${formatPct(headline?.pct ?? null)}. Bas: ${question.base_label}, ${nLabel} = ${baseN}.`}
    >
      {!still && <style>{BAR_ANIMATION_CSS}</style>}
      <rect x="0" y="0" width={W} height={H} fill={SURFACE} />

      {questionLines.map((line, i) => (
        <text
          key={`q${i}`} x={PAD} y={questionTop + i * 25}
          fontFamily={SANS} fontSize="18" fontWeight="500" fill={INK}
        >
          {line}
        </text>
      ))}

      {/* Stora talet. Mono, så att siffror inte hoppar i bredd när värdet byts. */}
      <text
        x={PAD} y={headlineY}
        fontFamily={MONO} fontSize="72" fontWeight="500" fill={INK}
        letterSpacing="-0.02em"
      >
        {headline?.pct === null || headline === null ? (
          <tspan fontSize="40">ingen bas</tspan>
        ) : (
          <>
            {Math.round(headline.pct * 100)}
            {/* Procenttecknet sätts mindre och tätt intill: i mono blir ett
                fullstort tecken plus mellanslag en glugg på tjugo pixlar. */}
            <tspan fontSize="34" dx="4">%</tspan>
          </>
        )}
      </text>
      <text
        x={PAD} y={kickerY}
        fontFamily={MONO} fontSize="11" fontWeight="500" fill={MUTED} letterSpacing="0.08em"
      >
        {label(headlineLabel)}
      </text>

      <line x1={PAD} y1={rule1Y} x2={W - PAD} y2={rule1Y} stroke={HAIRLINE} strokeWidth="1" />

      {/* Grafen. Skalan är alltid 0–100 %: utan axel måste stapelns längd
          gå att läsa mot hela spåret, annars blir bilden missvisande i en artikel. */}
      {rows.map((row, i) => {
        const y = rowsY + i * ROW_H;
        const barY = y + (ROW_H - BAR_H) / 2 - 6;
        const noBase = row.value.pct === null;
        const w = noBase ? 0 : Math.max(BAR_H, TRACK_W * (row.value.pct as number));
        const fill = noBase ? FALLBACK_COLOR : DATA_COLORS[row.colorIndex % DATA_COLORS.length];
        const small = !noBase && !row.value.reliable;

        return (
          <g key={row.key}>
            <text
              x={PAD} y={barY + BAR_H - 2}
              fontFamily={MONO} fontSize="12" fill={MUTED}
            >
              {truncate(row.label, LABEL_W, 12, 'mono')}
            </text>

            {noBase ? (
              // Segment utan bas färgas aldrig och får aldrig ett värde.
              <rect x={TRACK_X} y={barY} width={BAR_H} height={BAR_H} rx={BAR_H / 2} fill={fill} />
            ) : (
              <rect
                className={still ? undefined : 'svea-bar'}
                style={still ? undefined : { animationDelay: `${i * 40}ms` }}
                x={TRACK_X} y={barY} width={w} height={BAR_H}
                rx={BAR_H / 2}
                fill={fill}
              />
            )}

            {/* Värdet står efter stapeln, aldrig ovanpå den. Pastellerna klarar
                inte kontrastkraven som textbakgrund. */}
            <text
              x={W - PAD} y={barY + BAR_H - 2}
              textAnchor="end"
              fontFamily={MONO} fontSize={noBase ? '11' : '13'} fontWeight="500"
              fill={noBase ? MUTED : INK}
            >
              {noBase ? 'ingen bas' : `${formatPct(row.value.pct)}${small ? ' °' : ''}`}
            </text>
          </g>
        );
      })}

      <line x1={PAD} y1={rule2Y} x2={W - PAD} y2={rule2Y} stroke={HAIRLINE} strokeWidth="1" />

      {/* Bas och källa. Alltid, utan undantag. */}
      <text x={PAD} y={metaY} fontFamily={MONO} fontSize="11" fontWeight="500" fill={INK} letterSpacing="0.08em">
        {label(`Bas: ${question.base_label} · ${nLabel} = ${formatN(baseN)}`)}
      </text>
      <text x={PAD} y={sourceY} fontFamily={MONO} fontSize="11" fill={MUTED} letterSpacing="0.08em">
        {label(sourceLine)}
      </text>

      {hasSmallBase && (
        <text x={PAD} y={cautionY} fontFamily={MONO} fontSize="11" fill={MUTED} letterSpacing="0.06em">
          {label(cautionText)}
        </text>
      )}
    </svg>
  );
});
