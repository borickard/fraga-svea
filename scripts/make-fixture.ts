/**
 * Bygger data/fixture-tabellbilaga.xlsx — ett strukturellt likadant ark som
 * den riktiga tabellbilagan, med påhittade värden.
 *
 * Syftet är att parsern och appen ska gå att köra och verifiera utan att den
 * riktiga filen finns på disk. Fixturen innehåller alla fyra fällorna med flit:
 *   1. värden som andelar 0–1
 *   2. kolumner med "Antal intervjuer" = 0 (ingen bas)
 *   3. samma frågetext på två olika baser, med kraftigt skilda andelar
 *   4. segment med n < 100, ett så lågt som 28
 * plus Chi2-signifikansbokstäver i en del celler.
 *
 * VÄRDENA ÄR PÅHITTADE. Fixturen får aldrig publiceras som data.
 */
import ExcelJS from 'exceljs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Deterministisk pseudorandom — fixturen måste bli identisk varje körning. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

interface Col { group: string; label: string; n: number; }

const TOTAL = (n: number): Col => ({ group: '', label: 'Totalt', n });

/** Banner för 18+-bladet. 10-talist står på 0 rakt igenom — gruppen ingår inte i basen. */
function banner18(total: number): Col[] {
  return [
    TOTAL(total),
    { group: 'KÖN:', label: 'Man', n: Math.round(total * 0.49) },
    { group: '', label: 'Kvinna', n: Math.round(total * 0.51) },
    { group: 'GENERATION:', label: '10-talist', n: 0 },
    { group: '', label: '00-talist', n: 289 },
    { group: '', label: '90-talist', n: 402 },
    { group: '', label: '80-talist', n: 431 },
    { group: '', label: '70-talist', n: 397 },
    { group: '', label: '60-talist', n: 412 },
    { group: '', label: '50-talist', n: 388 },
    { group: '', label: '40-talist', n: 206 },
    { group: 'UTBILDNINGSNIVÅ:', label: 'Grundskola', n: 188 },
    { group: '', label: 'Gymnasium', n: 964 },
    { group: '', label: 'Högskola/universitet', n: 1373 },
    { group: 'POLITISK ÅSKÅDNING:', label: 'Vänster', n: 742 },
    { group: '', label: 'Mitten', n: 611 },
    { group: '', label: 'Höger', n: 803 },
    { group: '', label: 'Vet ej', n: 369 },
    { group: 'GEOGRAFI:', label: 'Storstad', n: 1104 },
    { group: '', label: 'Mindre stad/tätort', n: 1189 },
    { group: '', label: 'Landsbygd', n: 232 },
  ];
}

/** Banner för internetanvändarbladet: skolstadier finns med, flera med små baser. */
function bannerNet(total: number): Col[] {
  const b = banner18(total);
  const gen = b.findIndex((c) => c.label === '10-talist');
  b[gen] = { group: 'GENERATION:', label: '10-talist', n: 174 }; // 8+ -> gruppen har bas här
  return [
    ...b,
    { group: 'STADIER:', label: 'Lågstadiet', n: 28 },   // fälla 4: extremt liten bas
    { group: '', label: 'Mellanstadiet', n: 63 },        // fälla 4
    { group: '', label: 'Högstadiet', n: 71 },           // fälla 4
    { group: '', label: 'Gymnasiet', n: 118 },
    { group: 'ANVÄNDER ENHET REGELBUNDET:', label: 'Mobiltelefon', n: 2611 },
    { group: '', label: 'Dator', n: 2044 },
    { group: '', label: 'Surfplatta', n: 1188 },
  ];
}

interface Table {
  base: string; question: string; options: string[]; cols: Col[]; seed: number; skew?: number;
  /** Flera tabeller i den riktiga bilagan saknar raden "Antal intervjuer" helt. */
  weightedOnly?: boolean;
}

const SIG_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function buildSheet(wb: ExcelJS.Workbook, name: string, tables: Table[]) {
  const ws = wb.addWorksheet(name);
  ws.getColumn(1).width = 46;

  for (const t of tables) {
    const rand = rng(t.seed);

    // Rad 1: "Bas: ..." + radbrytning + frågetexten. I den riktiga bilagan är
    // cellen sammanfogad över hela raden, så texten upprepas i varje kolumn.
    const basText = `Bas: ${t.base}\n${t.question}`;
    const basRow = ws.addRow([basText, ...t.cols.map(() => basText)]);
    basRow.alignment = { wrapText: true, vertical: 'top' };

    // Rad 2 och 3: Cellinnehåll är sammanfogat över två rader, så samma text
    // står på båda. Grupprubriken upprepas i varje kolumn gruppen omfattar.
    const cellContent = 'Cellinnehåll:\n Kolumn%\n Chi2 nivå(W):95%\n';
    let currentGroup = '';
    const groupPerCol = t.cols.map((c) => { if (c.group) currentGroup = c.group; return c.label === 'Totalt' ? '' : currentGroup; });

    const headerRow = ws.addRow([cellContent, ...groupPerCol]);
    headerRow.font = { bold: true };

    // Rad 3: segmentetiketterna, med gruppen upprepad även här.
    ws.addRow([cellContent, ...t.cols.map((c) => c.label)]);

    // Basraderna. Flera tabeller i bilagan redovisar bara viktade intervjuer.
    if (!t.weightedOnly) ws.addRow(['Antal intervjuer', ...t.cols.map((c) => c.n)]);
    ws.addRow(['Antal viktade intervjuer', ...t.cols.map((c) => (c.n === 0 ? 0 : Math.round(c.n * (0.94 + rand() * 0.12))))]);

    // En rad per svarsalternativ. Värdena lagras som andelar 0–1.
    t.options.forEach((opt, oi) => {
      const cells: (number | string)[] = [];
      const totalShare = Math.max(0.02, (t.skew ?? 1) * (0.62 - oi * 0.11) + rand() * 0.05);
      t.cols.forEach((c, ci) => {
        if (c.n === 0) { cells.push(0); return; } // fälla 2: 0 i arket = ingen bas
        const drift = (rand() - 0.5) * 0.34;
        const v = Math.min(0.98, Math.max(0.01, totalShare + (ci === 0 ? 0 : drift)));
        const pct = Math.round(v * 10000) / 10000;
        // Chi2: en del celler bär signifikansbokstäver utöver talet.
        if (ci > 0 && rand() > 0.82) {
          const a = SIG_LETTERS[Math.floor(rand() * 6)];
          const b = SIG_LETTERS[Math.floor(rand() * 6)];
          cells.push(`${pct} ${a}${b}`);
        } else {
          cells.push(pct);
        }
      });
      ws.addRow([opt, ...cells]);
    });

    ws.addRow([]); // tom rad avgränsar tabellen
  }
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'fraga-svea fixture';
  wb.created = new Date(0);
  wb.modified = new Date(0);

  buildSheet(wb, 'Studie 1 bas samtliga', [
    {
      base: 'Samtliga 18+ år', seed: 11,
      question: 'Använder du internet?',
      options: ['Ja, dagligen', 'Ja, men inte dagligen', 'Nej, aldrig'],
      cols: banner18(2934),
    },
    {
      // Bara viktade intervjuer, som flera tabeller i den riktiga bilagan.
      base: 'Samtliga 18+ år', seed: 12, weightedOnly: true,
      question: 'Hur oroad är du för att bli utsatt för bedrägeri på internet?',
      options: ['Mycket oroad', 'Ganska oroad', 'Inte särskilt oroad', 'Inte alls oroad'],
      cols: banner18(2934),
    },
  ]);

  buildSheet(wb, 'Studie 1 bas internetanvändare', [
    {
      // Fälla 3, del 1: bred bas -> lägre andelar.
      base: 'Internetanvändare 8+ år', seed: 21, skew: 0.9,
      question: 'Har du under de senaste 12 månaderna använt dig av några av följande AI-verktyg?',
      options: ['ChatGPT', 'Microsoft Copilot', 'Google Gemini', 'Perplexity', 'Snapchat My AI', 'Ingen av dessa'],
      cols: bannerNet(2725),
    },
    {
      // Fälla 3, del 2: identisk frågetext, smalare bas -> kraftigt högre andelar.
      base: 'Har använt AI-verktyg 8+ år', seed: 22, skew: 1.45,
      question: 'Har du under de senaste 12 månaderna använt dig av några av följande AI-verktyg?',
      options: ['ChatGPT', 'Microsoft Copilot', 'Google Gemini', 'Perplexity', 'Snapchat My AI', 'Ingen av dessa'],
      cols: bannerNet(1698),
    },
    {
      base: 'Har använt AI-verktyg 8+ år', seed: 23, skew: 1.2,
      question: 'Vad använder du AI-verktyg till?',
      options: ['Söka information', 'Skriva eller bearbeta text', 'Skapa bilder', 'Programmering', 'Översätta text', 'Underhållning'],
      cols: bannerNet(1698),
    },
    {
      base: 'Internetanvändare 16+ år', seed: 24, weightedOnly: true,
      question: 'Hur ofta använder du sociala medier?',
      options: ['Flera gånger om dagen', 'Dagligen', 'Varje vecka', 'Mer sällan', 'Aldrig'],
      cols: bannerNet(2610),
    },
    {
      base: 'Internetanvändare 8+ år', seed: 25,
      question: 'Vilka av följande tjänster använder du för att titta på rörlig bild?',
      options: ['YouTube', 'Netflix', 'SVT Play', 'TikTok', 'Viaplay', 'Ingen av dessa'],
      cols: bannerNet(2725),
    },
  ]);

  // Blad utanför scope — parsern ska hoppa över dem och säga att den gjorde det.
  const pen = wb.addWorksheet('Internetpenetrationstudie');
  pen.addRow(['Utanför scope i fas 1.']);
  const desc = wb.addWorksheet('Tabellbeskrivning');
  desc.addRow(['Metodtext. Läses men parsas inte.']);

  mkdirSync(resolve(ROOT, 'data'), { recursive: true });
  const out = resolve(ROOT, 'data/fixture-tabellbilaga.xlsx');
  await wb.xlsx.writeFile(out);
  console.log(`Skrev ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
