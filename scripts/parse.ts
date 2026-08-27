/**
 * Fas 1 — Parser. tabellbilaga-*.xlsx  ->  src/data/dataset.json
 *
 * Regler som styr all kod här nere:
 *  - Idempotent. Samma xlsx in ger byte-identisk JSON ut.
 *  - Loggar allt den hoppar över. Tysta fel är oacceptabla.
 *  - Lagrar rått (andelar 0–1), formaterar aldrig.
 *
 * Körs med: npm run parse -- [sökväg till xlsx]
 */
import ExcelJS from 'exceljs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dataset, Question, QuestionOption, Segment, SegmentValue } from '../src/types.js';
import { segmentId, questionId, TOTAL_GROUP } from './slug.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Blad vi parsar. Internetpenetrationstudie och Tabellbeskrivning är utanför scope i fas 1. */
const SHEETS_IN_SCOPE = [
  'Studie 1 bas samtliga',
  'Studie 1 bas internetanvändare',
];

/** Under den här gränsen är segmentet inte tillräckligt stort för att publicera. */
const RELIABLE_MIN_N = 100;

// ---------------------------------------------------------------- logg

type LogLevel = 'info' | 'skip' | 'warn';
interface LogEntry { level: LogLevel; sheet: string; row: number | null; message: string; }
const log: LogEntry[] = [];
const note = (level: LogLevel, sheet: string, row: number | null, message: string) =>
  void log.push({ level, sheet, row, message });

// ---------------------------------------------------------------- celler

type Raw = string | number | null;

/** ExcelJS lämnar tillbaka rich text, formler och hyperlänkar som objekt. Platta ut allt. */
function cellToRaw(value: unknown): Raw {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? null : t;
  }
  if (value instanceof Date) return value.toISOString();
  const o = value as Record<string, unknown>;
  if (Array.isArray(o.richText)) {
    const t = (o.richText as { text?: string }[]).map((p) => p.text ?? '').join('').trim();
    return t === '' ? null : t;
  }
  if ('result' in o) return cellToRaw(o.result);
  if ('text' in o) return cellToRaw(o.text);
  if ('error' in o) return null;
  return null;
}

const asText = (raw: Raw): string => (raw === null ? '' : String(raw).trim());
/** Normaliserad jämförelsetext: gemener, kollapsade blanksteg, inga kolon på slutet. */
const norm = (raw: Raw): string =>
  asText(raw).toLowerCase().replace(/\s+/g, ' ').replace(/[:\s]+$/, '').trim();

interface ParsedCell { num: number | null; sig: string[]; issue?: 'not_numeric'; }

/**
 * Cellinnehållet är "Kolumn% Chi2": talet kan följas av signifikansbokstäver
 * som pekar ut vilka andra kolumner värdet skiljer sig signifikant från.
 * De bokstäverna är data — de plockas ut separat, de kastas aldrig.
 */
function parseValueCell(raw: Raw): ParsedCell {
  if (raw === null) return { num: null, sig: [] };
  if (typeof raw === 'number') return { num: raw, sig: [] };

  const text = String(raw).trim();
  if (text === '' || text === '-' || text === '–') return { num: null, sig: [] };

  const m = text.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) {
    // Ingen siffra alls — men det kan ändå vara rena signifikansmarkörer.
    const onlySig = text.match(/[A-Za-zÅÄÖåäö*†‡]/g) ?? [];
    return { num: null, sig: onlySig, issue: 'not_numeric' };
  }

  let num = Number.parseFloat(m[0].replace(',', '.'));
  const rest = text.slice(0, m.index).concat(text.slice((m.index ?? 0) + m[0].length));
  if (/%/.test(rest)) num = num / 100; // explicit procentskrivning -> tillbaka till andel

  const sig = (rest.match(/[A-Za-z*†‡]/g) ?? []).filter((c) => c !== 'e' && c !== 'E');
  return { num, sig };
}

function parseInt0(raw: Raw): number {
  if (raw === null) return 0;
  if (typeof raw === 'number') return Math.round(raw);
  const m = String(raw).replace(/\s| /g, '').match(/-?\d+/);
  return m ? Number.parseInt(m[0], 10) : 0;
}

// ---------------------------------------------------------------- tabellparsning

type Grid = Raw[][]; // [rowIndex0][colIndex0]

interface ColumnSegment { col: number; segment: Segment; }

const BAS_RE = /^bas\s*:/i;
const CELL_CONTENT_RE = /^cellinneh[åa]ll\s*:/i;
const N_ROW = 'antal intervjuer';
const NW_ROW = 'antal viktade intervjuer';

/** Hur långt nedåt vi letar efter "Cellinnehåll:" innan vi ger upp på tabellen. */
const HEADER_SEARCH_WINDOW = 12;

function isRowEmpty(row: Raw[] | undefined): boolean {
  return !row || row.every((c) => c === null);
}

interface TableParseResult {
  question: Question | null;
  segments: Segment[];
  /** Rad (0-index) där parsern slutade läsa den här tabellen. */
  endRow: number;
}

function parseTable(grid: Grid, start: number, sheet: string): TableParseResult {
  const rowNo = (i: number) => i + 1; // 1-indexerat för loggen och source_row
  const fail = (msg: string, end: number): TableParseResult => {
    note('skip', sheet, rowNo(start), msg);
    return { question: null, segments: [], endRow: end };
  };

  // 1) Bas och frågetext. Båda ligger normalt i samma cell, åtskilda av radbrytning.
  const basCellText = asText(grid[start]?.[0]);
  const lines = basCellText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const baseLabel = (lines[0] ?? '').replace(BAS_RE, '').trim();
  let questionText = lines.slice(1).join(' ').trim();

  if (!baseLabel) return fail('Bas-raden saknar basetikett.', start + 1);

  // 2) Cellinnehåll-raden bär segmentgruppernas rubriker.
  let headerRow = -1;
  for (let i = start; i < Math.min(grid.length, start + HEADER_SEARCH_WINDOW); i++) {
    if (CELL_CONTENT_RE.test(asText(grid[i]?.[0]))) { headerRow = i; break; }
    // Frågetexten kan ligga på egen rad under Bas-raden.
    if (i > start && !questionText) {
      const t = asText(grid[i]?.[0]);
      if (t && !BAS_RE.test(t)) questionText = t;
    }
  }
  if (headerRow === -1) {
    return fail(`Hittade ingen "Cellinnehåll:"-rad inom ${HEADER_SEARCH_WINDOW} rader. Tabellen hoppas över.`, start + 1);
  }
  if (!questionText) {
    return fail('Hittade ingen frågetext mellan Bas-raden och Cellinnehåll-raden.', headerRow + 1);
  }

  const cellContent = asText(grid[headerRow][0]).replace(CELL_CONTENT_RE, '').trim();

  // 3) Segmentgrupper: rubriken står i gruppens första kolumn, resten är tomma.
  //    Forward-fill ger varje kolumn sin grupp. Grupperna läses ur arket, aldrig hårdkodade.
  const width = Math.max(grid[headerRow].length, grid[headerRow + 1]?.length ?? 0);
  const groupPerCol: string[] = [];
  let current = '';
  for (let c = 1; c < width; c++) {
    const raw = asText(grid[headerRow][c]);
    if (raw) current = raw.replace(/[:\s]+$/, '').trim();
    groupPerCol[c] = current;
  }

  // 4) Segmentetiketterna ligger på raden under.
  const labelRow = headerRow + 1;
  if (isRowEmpty(grid[labelRow])) {
    return fail('Raden med segmentetiketter är tom.', labelRow + 1);
  }

  const columns: ColumnSegment[] = [];
  const seenIds = new Set<string>();
  for (let c = 1; c < width; c++) {
    const label = asText(grid[labelRow][c]);
    if (!label) continue;
    const group = norm(label) === 'totalt' ? TOTAL_GROUP : (groupPerCol[c] || TOTAL_GROUP);
    if (!groupPerCol[c] && norm(label) !== 'totalt') {
      note('warn', sheet, rowNo(labelRow), `Kolumn ${c + 1} ("${label}") saknar grupprubrik, hamnar under ${TOTAL_GROUP}.`);
    }
    const id = segmentId(group, label);
    if (seenIds.has(id)) {
      note('warn', sheet, rowNo(labelRow), `Segmentet "${group} / ${label}" förekommer flera gånger i tabellen. Första kolumnen gäller.`);
      continue;
    }
    seenIds.add(id);
    columns.push({ col: c, segment: { id, group, label } });
  }
  if (columns.length === 0) return fail('Tabellen har inga segmentkolumner.', labelRow + 1);

  // 5) Basraderna.
  // Bilagan är inte konsekvent: en del tabeller har både "Antal intervjuer"
  // och "Antal viktade intervjuer", andra bara den viktade raden. Läs det som
  // finns, och håll reda på vilket det var — ett viktat tal är inte ett antal
  // genomförda intervjuer och får aldrig presenteras som ett.
  let nRow = -1, nwRow = -1, cursor = labelRow + 1;
  for (let i = labelRow + 1; i < Math.min(grid.length, labelRow + 8); i++) {
    const key = norm(grid[i]?.[0]);
    if (key === N_ROW) { nRow = i; cursor = i + 1; }
    else if (key === NW_ROW) { nwRow = i; cursor = i + 1; }
    else if (nRow !== -1 || nwRow !== -1) break;
  }
  if (nRow === -1 && nwRow === -1) {
    return fail('Hittade varken "Antal intervjuer" eller "Antal viktade intervjuer". Utan bas går tabellen inte att publicera.', cursor);
  }

  const basisRow = nRow !== -1 ? nRow : nwRow;
  const nBasis: 'intervjuer' | 'viktade_intervjuer' = nRow !== -1 ? 'intervjuer' : 'viktade_intervjuer';
  if (nRow === -1) {
    note('info', sheet, rowNo(nwRow), 'Tabellen saknar "Antal intervjuer". n hämtas från de viktade intervjuerna och märks som viktat.');
  }

  const nPerCol = new Map<number, number>();
  const nwPerCol = new Map<number, number>();
  for (const { col } of columns) {
    nPerCol.set(col, parseInt0(grid[basisRow][col] ?? null));
    if (nwRow !== -1) nwPerCol.set(col, parseInt0(grid[nwRow][col] ?? null));
  }

  // 6) Svarsalternativen, fram till första tomma rad eller nästa tabell.
  const options: QuestionOption[] = [];
  let i = cursor;
  for (; i < grid.length; i++) {
    if (isRowEmpty(grid[i])) break;
    const label = asText(grid[i][0]);
    if (BAS_RE.test(label)) break;
    if (!label) {
      note('skip', sheet, rowNo(i), 'Rad med värden men utan svarsalternativ i kolumn A. Hoppas över.');
      continue;
    }

    const values: Record<string, SegmentValue> = {};
    for (const { col, segment } of columns) {
      const n = nPerCol.get(col) ?? 0;
      const nw = nwPerCol.get(col);

      // Fälla 2: 0 betyder nästan alltid "ingen bas", inte "noll procent".
      if (n === 0) {
        values[segment.id] = { pct: null, n: 0, reliable: false, reason: 'no_base' };
        continue;
      }

      const parsed = parseValueCell(grid[i][col] ?? null);
      const v: SegmentValue = {
        pct: parsed.num,
        n,
        // Fälla 4: små baser är en funktion, inte en brist.
        reliable: parsed.num !== null && n >= RELIABLE_MIN_N,
      };
      if (nw !== undefined) v.n_weighted = nw;
      if (parsed.num === null) {
        v.reason = parsed.issue === 'not_numeric' ? 'not_numeric' : 'missing';
        if (parsed.issue === 'not_numeric') {
          note('warn', sheet, rowNo(i), `Cellen för "${segment.label}" i "${label}" innehåller inget tal: "${asText(grid[i][col] ?? null)}".`);
        }
      }
      if (parsed.sig.length) v.sig = parsed.sig;
      values[segment.id] = v;
    }
    options.push({ label, values });
  }

  if (options.length === 0) {
    return fail('Tabellen har noll svarsalternativ.', i + 1);
  }

  const groups: string[] = [];
  for (const { segment } of columns) if (!groups.includes(segment.group)) groups.push(segment.group);

  const question: Question = {
    id: questionId(questionText, baseLabel),
    text: questionText,
    base_label: baseLabel,
    sheet,
    source_row: rowNo(start),
    segment_groups: groups,
    n_basis: nBasis,
    options,
  };
  if (cellContent && !/kolumn%/i.test(cellContent)) {
    note('warn', sheet, rowNo(headerRow), `Ovänt cellinnehåll: "${cellContent}". Förväntade "Kolumn% Chi2".`);
  }

  return { question, segments: columns.map((c) => c.segment), endRow: i };
}

// ---------------------------------------------------------------- stabil serialisering

/** Sorterade nycklar överallt -> byte-identisk output för samma input. */
function stableStringify(value: unknown, indent = 2): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v as object)) throw new Error('Cirkulär referens i datasetet.');
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = walk((v as Record<string, unknown>)[k]);
    }
    return out;
  };
  return JSON.stringify(walk(value), null, indent) + '\n';
}

// ---------------------------------------------------------------- körning

async function main() {
  const argPath = process.argv[2];
  const xlsxPath = resolve(ROOT, argPath ?? 'data/tabellbilaga-svenskarna-och-internet-2025.xlsx');

  if (!existsSync(xlsxPath)) {
    console.error(
      `\nHittar ingen xlsx på ${xlsxPath}\n\n` +
      `Lägg tabellbilagan i data/ eller peka ut den:\n` +
      `  npm run parse -- sökväg/till/tabellbilaga.xlsx\n`
    );
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);

  const present = wb.worksheets.map((w) => w.name);
  console.log(`Blad i filen: ${present.join(', ')}`);

  const questions: Question[] = [];
  const segments: Segment[] = [];
  const segmentIndex = new Map<string, Segment>();
  const idCounts = new Map<string, number>();

  for (const sheetName of SHEETS_IN_SCOPE) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) {
      note('skip', sheetName, null, 'Bladet finns inte i filen.');
      continue;
    }

    // Läs in hela bladet som ett rutnät. includeEmpty krävs — tomma rader avgränsar tabeller.
    const grid: Grid = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const cells: Raw[] = [];
      const count = Math.max(row.cellCount, ws.columnCount);
      for (let c = 1; c <= count; c++) cells.push(cellToRaw(row.getCell(c).value));
      grid[rowNumber - 1] = cells;
    });
    for (let r = 0; r < grid.length; r++) if (!grid[r]) grid[r] = [];

    let tablesHere = 0;
    for (let r = 0; r < grid.length; r++) {
      if (!BAS_RE.test(asText(grid[r][0]))) continue;
      const { question, segments: tableSegments, endRow } = parseTable(grid, r, sheetName);
      if (question) {
        // Kollisionshantering: samma frågetext + samma bas två gånger i bladet.
        const seen = idCounts.get(question.id) ?? 0;
        idCounts.set(question.id, seen + 1);
        if (seen > 0) {
          const unique = `${question.id}_${seen + 1}`;
          note('warn', sheetName, question.source_row,
            `Fråge-id "${question.id}" är upptaget (samma frågetext och bas). Sparas som "${unique}".`);
          question.id = unique;
        }
        questions.push(question);
        for (const s of tableSegments) if (!segmentIndex.has(s.id)) { segmentIndex.set(s.id, s); segments.push(s); }
        tablesHere++;
      }
      r = Math.max(r, endRow - 1);
    }
    note('info', sheetName, null, `${tablesHere} frågetabeller inlästa.`);
    console.log(`  ${sheetName}: ${tablesHere} frågetabeller`);
  }

  for (const name of present) {
    if (!SHEETS_IN_SCOPE.includes(name)) note('info', name, null, 'Bladet är utanför scope i fas 1 och parsas inte.');
  }

  const dataset: Dataset = {
    meta: {
      source: 'Svenskarna och internet 2025',
      publisher: 'Internetstiftelsen',
      appendix: basename(xlsxPath),
      generated_from: basename(xlsxPath),
      question_count: questions.length,
      segment_count: segments.length,
    },
    // Segment sorteras inte om — arkets ordning är den redaktionella ordningen.
    segments,
    questions,
  };

  mkdirSync(resolve(ROOT, 'src/data'), { recursive: true });
  writeFileSync(resolve(ROOT, 'src/data/dataset.json'), stableStringify(dataset), 'utf8');

  const logText = log
    .map((e) => `[${e.level.toUpperCase()}] ${e.sheet}${e.row ? `:${e.row}` : ''} — ${e.message}`)
    .join('\n');
  mkdirSync(resolve(ROOT, 'data'), { recursive: true });
  writeFileSync(resolve(ROOT, 'data/parse-log.txt'), logText + '\n', 'utf8');

  const skips = log.filter((e) => e.level === 'skip').length;
  const warns = log.filter((e) => e.level === 'warn').length;
  console.log(
    `\nSkrev src/data/dataset.json — ${questions.length} frågor, ${segments.length} segment.\n` +
    `Logg: data/parse-log.txt (${skips} överhoppade, ${warns} varningar)`
  );
  if (skips > 0) console.log('Överhoppade tabeller finns i loggen. Läs den.');
}

main().catch((err) => { console.error(err); process.exit(1); });
