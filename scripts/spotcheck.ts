/**
 * Fas 1 är klar först när JSON:en är verifierad mot fem manuellt kontrollerade
 * värden i arket. Det här skriptet gör den kontrollen möjlig på sekunder:
 * för varje utvalt värde skrivs cellens exakta adress i xlsx-filen ut bredvid
 * det parsade värdet, så att en människa kan öppna arket och jämföra.
 *
 *   npm run spotcheck -- data/tabellbilaga-svenskarna-och-internet-2025.xlsx
 *   npm run spotcheck -- <xlsx> <fråge-id> <svarsalternativ> <segment-id>
 */
import ExcelJS from 'exceljs';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dataset, Question } from '../src/types.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataset: Dataset = JSON.parse(readFileSync(resolve(ROOT, 'src/data/dataset.json'), 'utf8'));

const colLetter = (c: number): string => {
  let s = '';
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const text = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((p) => p.text ?? '').join('');
    if ('result' in o) return text(o.result);
    if ('text' in o) return text(o.text);
    return '';
  }
  return String(v);
};

interface Target { q: Question; option: string; segment: string; }

/** Fem värden som täcker de fyra fällorna, om datasetet innehåller dem. */
function pickTargets(): Target[] {
  const picked: Target[] = [];
  const push = (q: Question | undefined, option: string, segment: string) => {
    if (!q) return;
    if (!q.options.some((o) => o.label === option)) return;
    if (!q.options[0].values[segment]) return;
    if (picked.some((p) => p.q.id === q.id && p.option === option && p.segment === segment)) return;
    picked.push({ q, option, segment });
  };

  // 1) Ett vanligt totalvärde.
  const first = dataset.questions[0];
  push(first, first.options[0].label, 'totalt');

  // 2) Ett segment utan bas (n = 0).
  for (const q of dataset.questions) {
    const o = q.options[0];
    const hit = Object.entries(o.values).find(([, v]) => v.reason === 'no_base');
    if (hit) { push(q, o.label, hit[0]); break; }
  }

  // 3) Ett segment med liten bas.
  let smallest: { q: Question; option: string; segment: string; n: number } | null = null;
  for (const q of dataset.questions) for (const o of q.options) {
    for (const [seg, v] of Object.entries(o.values)) {
      if (v.n > 0 && v.n < 100 && (!smallest || v.n < smallest.n)) {
        smallest = { q, option: o.label, segment: seg, n: v.n };
      }
    }
  }
  if (smallest) push(smallest.q, smallest.option, smallest.segment);

  // 4+5) Samma frågetext på två olika baser — det farligaste paret i datasetet.
  const byText = new Map<string, Question[]>();
  for (const q of dataset.questions) byText.set(q.text, [...(byText.get(q.text) ?? []), q]);
  const pair = [...byText.values()].find((qs) => qs.length > 1);
  if (pair) for (const q of pair.slice(0, 2)) push(q, q.options[0].label, 'totalt');

  // Fyll på med godtyckliga värden om datasetet saknar någon av fällorna.
  for (const q of dataset.questions) {
    if (picked.length >= 5) break;
    push(q, q.options[0].label, Object.keys(q.options[0].values)[1] ?? 'totalt');
  }
  return picked.slice(0, 5);
}

async function main() {
  const xlsxPath = resolve(ROOT, process.argv[2] ?? 'data/tabellbilaga-svenskarna-och-internet-2025.xlsx');
  if (!existsSync(xlsxPath)) {
    console.error(`Hittar ingen xlsx på ${xlsxPath}`);
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);

  const [, , , qArg, optArg, segArg] = process.argv;
  const targets: Target[] = qArg
    ? (() => {
        const q = dataset.questions.find((x) => x.id === qArg);
        if (!q) { console.error(`Okänt fråge-id: ${qArg}`); process.exit(1); }
        return [{ q, option: optArg ?? q.options[0].label, segment: segArg ?? 'totalt' }];
      })()
    : pickTargets();

  console.log(`Stickprov mot ${xlsxPath}\n`);

  for (const t of targets) {
    const ws = wb.getWorksheet(t.q.sheet);
    if (!ws) { console.log(`  Bladet "${t.q.sheet}" saknas.\n`); continue; }

    // Etikettraden ligger två rader under Bas-raden (Bas -> Cellinnehåll -> etiketter).
    let headerRow = -1;
    for (let r = t.q.source_row; r < t.q.source_row + 12; r++) {
      if (/^cellinneh[åa]ll\s*:/i.test(text(ws.getRow(r).getCell(1).value).trim())) { headerRow = r; break; }
    }
    const labelRow = headerRow + 1;

    const seg = dataset.segments.find((s) => s.id === t.segment);
    let col = -1;
    for (let c = 2; c <= ws.columnCount; c++) {
      if (text(ws.getRow(labelRow).getCell(c).value).trim() === seg?.label) { col = c; break; }
    }

    let optRow = -1;
    for (let r = labelRow + 1; r < labelRow + 60; r++) {
      const a = text(ws.getRow(r).getCell(1).value).trim();
      if (a === '') break;
      if (a === t.option) { optRow = r; break; }
    }

    const parsed = t.q.options.find((o) => o.label === t.option)?.values[t.segment];
    const addr = col > 0 && optRow > 0 ? `${t.q.sheet}!${colLetter(col)}${optRow}` : '(hittades inte)';
    const rawCell = col > 0 && optRow > 0 ? ws.getRow(optRow).getCell(col).value : null;
    const nAddr = col > 0 && headerRow > 0 ? `${colLetter(col)}${labelRow + 1}` : '—';
    const rawN = col > 0 && headerRow > 0 ? ws.getRow(labelRow + 1).getCell(col).value : null;

    console.log(`  Fråga    ${t.q.id}`);
    console.log(`  Text     ${t.q.text}`);
    console.log(`  Bas      ${t.q.base_label}`);
    console.log(`  Alt.     ${t.option}`);
    console.log(`  Segment  ${seg?.group} / ${seg?.label}`);
    console.log(`  Cell     ${addr}   rått i arket: ${JSON.stringify(text(rawCell))}`);
    console.log(`  n-cell   ${nAddr}   rått i arket: ${JSON.stringify(text(rawN))}`);
    console.log(`  Parsat   pct=${parsed?.pct}  n=${parsed?.n}  reliable=${parsed?.reliable}` +
      `${parsed?.reason ? `  reason=${parsed.reason}` : ''}${parsed?.sig ? `  sig=${parsed.sig.join('')}` : ''}`);
    console.log(`  Visas som ${parsed?.pct === null ? 'ingen bas' : Math.round((parsed!.pct as number) * 100) + ' %'}\n`);
  }
  console.log('Jämför "rått i arket" med "Parsat" för varje rad ovan. Fem stämmer = fas 1 klar.');
}

main().catch((e) => { console.error(e); process.exit(1); });
