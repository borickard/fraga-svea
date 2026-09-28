/**
 * Bygger ett förslag till src/data/concepts.json ur befintliga filer.
 *
 * Ett begrepp är en sak undersökningen mäter. Det har en titel, synonymer och
 * en lista formuleringar per årgång — för Internetstiftelsen skriver om
 * frågorna mellan åren.
 *
 * Skriptet kopplar bara ihop årgångar där formuleringen är IDENTISK. Allt
 * annat lämnas som ett eget begrepp med ett kandidatförslag som inte gör
 * någonting förrän en människa bekräftat det. En felaktigt hopkopplad fråga
 * ger en felaktig trendlinje, vilket är precis det fel verktyget finns för
 * att förhindra.
 *
 *   npm run seed-concepts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dataset } from '../src/types.js';
import { slug } from './slug.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const YEARS = [2025, 2026];
const datasets = new Map<number, Dataset>(
  YEARS.map((y) => [y, read(`src/data/dataset-${y}.json`) as Dataset]),
);

/**
 * Titlar och synonymer hämtas ur den befintliga concepts.json. En omkörning
 * räknar alltså om årskopplingarna men rör aldrig det redaktionella arbetet.
 */
interface Existing { id: string; titel: string; synonymer?: string[]; formuleringar: Record<string, string[]> }
const existing: Existing[] = existsSync(resolve(ROOT, 'src/data/concepts.json'))
  ? read('src/data/concepts.json').concepts
  : [];

/**
 * Nycklad på år OCH text. Enbart text vore fel: "Vilka har du använt
 * dagligen?" står ordagrant i båda årgångarna men gäller meddelandeappar
 * 2025 och AI-tjänster 2026. En titel som vandrar mellan åren sätter fel
 * rubrik över rätt siffra.
 */
const titles: Record<string, string> = {};
const synonymsByText = new Map<string, string[]>();
for (const c of existing) {
  for (const [year, texts] of Object.entries(c.formuleringar)) {
    for (const t of texts) {
      titles[`${year}||${t}`] = c.titel;
      if (c.synonymer?.length) synonymsByText.set(`${year}||${t}`, [...(synonymsByText.get(`${year}||${t}`) ?? []), ...c.synonymer]);
    }
  }
}

// ---------------------------------------------------------------- likhet

const normalize = (s: string) =>
  s.toLowerCase().replace(/å|ä/g, 'a').replace(/ö/g, 'o').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const tokensOf = (s: string) => new Set(normalize(s).split(' ').filter((t) => t.length > 2));

/**
 * Svarsalternativen per frågetext och år.
 *
 * Textlikhet räcker inte, och inte ens identisk text räcker. "Vilka har du
 * använt dagligen?" står ordagrant i båda årgångarna men gäller
 * meddelandeappar 2025 och AI-tjänster 2026. Alternativlistan avslöjar det.
 */
const optionKey = (s: string) => s.toLowerCase().replace(/[^a-zå-ö0-9]/g, '');

function optionsOf(year: number, text: string): Set<string> {
  const out = new Set<string>();
  for (const q of datasets.get(year)!.questions) {
    if (q.text !== text) continue;
    for (const o of q.options) out.add(optionKey(o.label));
  }
  return out;
}

const OPTION_FLOOR = 0.3;

/** Delar de två frågorna tillräckligt många svarsalternativ för att vara samma fråga? */
function sameSubject(yearA: number, textA: string, yearB: number, textB: string): boolean {
  const a = optionsOf(yearA, textA), b = optionsOf(yearB, textB);
  if (!a.size || !b.size) return false;
  let shared = 0;
  for (const o of a) if (b.has(o)) shared++;
  return shared / Math.min(a.size, b.size) >= OPTION_FLOOR;
}

function similarity(a: string, b: string): number {
  const ta = tokensOf(a), tb = tokensOf(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

const textsByYear = new Map<number, string[]>(
  YEARS.map((y) => [y, [...new Set(datasets.get(y)!.questions.map((q) => q.text))]]),
);

const CANDIDATE_FLOOR = 0.8;

/** Bästa motsvarighet i ett annat år, om de är varandras bästa träff. */
function bestCandidate(year: number, text: string): { ar: number; text: string; likhet: number } | null {
  let best: { ar: number; text: string; likhet: number } | null = null;
  for (const other of YEARS) {
    if (other === year) continue;
    for (const cand of textsByYear.get(other)!) {
      const likhet = Math.round(similarity(text, cand) * 100) / 100;
      if (likhet < CANDIDATE_FLOOR || (best && likhet <= best.likhet)) continue;
      if (!sameSubject(year, text, other, cand)) continue;
      best = { ar: other, text: cand, likhet };
    }
  }
  if (!best) return null;

  // Ömsesidighet: är kandidatens bästa träff tillbaka i vårt år samma text?
  let reverse: { text: string; likhet: number } | null = null;
  for (const cand of textsByYear.get(year)!) {
    if (!sameSubject(best.ar, best.text, year, cand)) continue;
    const likhet = similarity(best.text, cand);
    if (!reverse || likhet > reverse.likhet) reverse = { text: cand, likhet };
  }
  return reverse && reverse.text === text ? best : null;
}

// ---------------------------------------------------------------- begrepp

interface Concept {
  id: string;
  titel: string;
  synonymer?: string[];
  formuleringar: Record<string, string[]>;
  /** Sätts bara när begreppet finns i en enda årgång. */
  matchning?: 'obekräftad' | 'ingen';
  kandidat?: { ar: number; text: string; likhet: number };
}

const seenPairs = new Set<string>();
const used = new Map<number, Set<string>>(YEARS.map((y) => [y, new Set()]));
const concepts: Concept[] = [];
const takenIds = new Set<string>();

function idFor(title: string, fallback: string): string {
  const base = slug(title) || slug(fallback) || 'begrepp';
  let id = base;
  let n = 2;
  while (takenIds.has(id)) id = `${base}_${n++}`;
  takenIds.add(id);
  return id;
}

/**
 * 1) Identisk formulering kopplas direkt. Detsamma gäller texter som bara
 *    skiljer sig i versaler eller skiljetecken — "Youtube" mot "YouTube" är
 *    inte en omskrivning, det är samma fråga.
 */
for (const text of textsByYear.get(YEARS[0])!) {
  if (used.get(YEARS[0])!.has(text)) continue;
  const matches = new Map<number, string>([[YEARS[0], text]]);
  for (const other of YEARS.slice(1)) {
    const hit = textsByYear.get(other)!.find(
      (c) => !used.get(other)!.has(c)
        && (c === text || normalize(c) === normalize(text))
        && sameSubject(YEARS[0], text, other, c),
    );
    if (hit) matches.set(other, hit);
  }
  if (matches.size < 2) continue;
  for (const [y, t] of matches) used.get(y)!.add(t);
  const key = `${YEARS[0]}||${text}`;
  const title = titles[key] ?? text;
  concepts.push({
    id: idFor(title, text),
    titel: title,
    ...(synonymsByText.has(key) ? { synonymer: [...new Set(synonymsByText.get(key)!)] } : {}),
    formuleringar: Object.fromEntries([...matches].map(([y, t]) => [String(y), [t]])),
  });
}

// 2) Resten blir egna begrepp, med kandidat men utan verkan.
for (const year of YEARS) {
  for (const text of textsByYear.get(year)!) {
    if (used.get(year)!.has(text)) continue;
    used.get(year)!.add(text);

    // Kandidat bara vid hög likhet OCH ömsesidigt bästa träff. Utan det
    // paras "play- och strömmande tjänster" ihop med "appar och tjänster",
    // och "nätdejtat" med "e-legitimationer".
    // Varje par ska granskas en gång, inte en gång från varje håll.
    const candidate = bestCandidate(year, text);
    const pairKey = candidate ? [text, candidate.text].sort().join('||') : null;
    const best = pairKey && !seenPairs.has(pairKey) ? candidate : null;
    if (pairKey) seenPairs.add(pairKey);

    const key = `${year}||${text}`;
    const title = titles[key] ?? text;
    concepts.push({
      id: idFor(title, text),
      titel: title,
      ...(synonymsByText.has(key) ? { synonymer: [...new Set(synonymsByText.get(key)!)] } : {}),
      formuleringar: { [String(year)]: [text] },
      matchning: 'obekräftad',
      ...(best ? { kandidat: best } : {}),
    });
  }
}

const out = {
  _kommentar: [
    'Begrepp: en sak undersökningen mäter. Handskriven fil — redigera fritt.',
    '',
    'formuleringar listar frågans exakta lydelse per årgång. Internetstiftelsen',
    'skriver om frågorna mellan åren, så samma begrepp kan ha olika lydelse.',
    'Titeln och synonymerna följer begreppet och överlever därför omskrivningar.',
    '',
    'matchning: "obekräftad" betyder att begreppet bara hittats i en årgång.',
    'kandidat är ett FÖRSLAG på motsvarighet i ett annat år, beräknat på',
    'ordlikhet. Det gör ingenting förrän en människa flyttat in texten under',
    'formuleringar för det året och tagit bort matchning och kandidat.',
    'Sätt matchning: "ingen" för begrepp som saknar motsvarighet — då slutar',
    'de efterfrågas.',
    '',
    'Automatik kopplar aldrig ihop årgångar här. En felaktigt hopkopplad fråga',
    'ger en felaktig trendlinje, vilket är precis det fel verktyget ska hindra.',
  ],
  concepts,
};

const target = resolve(ROOT, 'src/data/concepts.json');
if (existsSync(target) && !process.argv.includes('--force')) {
  console.error(`\n${target} finns redan. Kör med --force för att skriva över.\n`);
  process.exit(1);
}
writeFileSync(target, JSON.stringify(out, null, 2) + '\n', 'utf8');

const linked = concepts.filter((c) => Object.keys(c.formuleringar).length > 1).length;
const pending = concepts.filter((c) => c.matchning === 'obekräftad');
console.log(`Skrev src/data/concepts.json — ${concepts.length} begrepp.`);
console.log(`  kopplade över årgångar: ${linked}`);
console.log(`  obekräftade: ${pending.length}, varav ${pending.filter((c) => c.kandidat).length} med kandidat`);
