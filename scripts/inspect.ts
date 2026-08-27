/**
 * Diagnostik. Dumpar råa celler ur ett blad så att arkets faktiska struktur
 * går att jämföra med vad parsern förväntar sig.
 *
 * Texten skrivs JSON-citerad, så radbrytningar, dubbla mellanslag och
 * hårda blanksteg syns i stället för att försvinna.
 *
 *   npm run inspect -- <xlsx> "Studie 1 bas samtliga" 1 30
 *   npm run inspect -- <xlsx> "Studie 1 bas samtliga" 1 30 6   # 6 kolumner
 */
import ExcelJS from 'exceljs';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

function text(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((p) => p.text ?? '').join('');
    if ('result' in o) return text(o.result);
    if ('text' in o) return text(o.text);
    return '';
  }
  return String(v);
}

const [, , file, sheetName, fromArg, toArg, colsArg] = process.argv;
if (!file || !sheetName) {
  console.error('Användning: npm run inspect -- <xlsx> "<bladnamn>" [från] [till] [antal kolumner]');
  process.exit(1);
}

const path = resolve(process.cwd(), file);
if (!existsSync(path)) { console.error(`Hittar ingen fil på ${path}`); process.exit(1); }

const from = Number.parseInt(fromArg ?? '1', 10);
const to = Number.parseInt(toArg ?? '30', 10);
const cols = Number.parseInt(colsArg ?? '4', 10);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path);

console.log(`Blad i filen: ${wb.worksheets.map((w) => `"${w.name}"`).join(', ')}\n`);

const ws = wb.getWorksheet(sheetName);
if (!ws) { console.error(`Bladet "${sheetName}" finns inte.`); process.exit(1); }

console.log(`"${sheetName}" — ${ws.rowCount} rader, ${ws.columnCount} kolumner`);
console.log(`Visar rad ${from}–${to}, kolumn A–${String.fromCharCode(64 + cols)}\n`);

for (let r = from; r <= Math.min(to, ws.rowCount); r++) {
  const row = ws.getRow(r);
  const cells: string[] = [];
  for (let c = 1; c <= cols; c++) {
    const t = text(row.getCell(c).value);
    cells.push(t === '' ? '·' : JSON.stringify(t));
  }
  console.log(`${String(r).padStart(4)} | ${cells.join(' | ')}`);
}
