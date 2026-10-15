/**
 * Hämtar Sveriges folkmängd per ettårsklass och kön från SCB.
 *
 * Körs för hand, inte i bygget: SCB är en extern tjänst och ett bygge ska
 * inte kunna falla på att den är nere. Resultatet checkas in.
 *
 *   npm run population
 *
 * Tabellen är BE0101A/BefolkningNy — folkmängd efter region, civilstånd,
 * ålder, kön och år. Civilstånd utelämnas ur frågan och summeras då bort av
 * PxWeb. Siffran avser 31 december det år som hämtas.
 */
import { writeFileSync } from 'node:fs';

const URL = 'https://api.scb.se/OV0104/v1/doris/sv/ssd/BE/BE0101/BE0101A/BefolkningNy';
const MAX_AGE = 100;

interface PxResponse {
  data: { key: string[]; values: string[] }[];
}

async function main() {
  const year = process.argv[2];
  if (!year) {
    console.error('Användning: npm run population -- <årtal>   (t.ex. 2024)');
    process.exit(1);
  }

  const ages = [...Array(MAX_AGE).keys()].map(String).concat('100+');
  const body = {
    query: [
      { code: 'Region', selection: { filter: 'item', values: ['00'] } },
      { code: 'Alder', selection: { filter: 'item', values: ages } },
      { code: 'Kon', selection: { filter: 'item', values: ['1', '2'] } },
      { code: 'ContentsCode', selection: { filter: 'item', values: ['BE0101N1'] } },
      { code: 'Tid', selection: { filter: 'item', values: [year] } },
    ],
    response: { format: 'json' },
  };

  // SCB svarar sporadiskt 503 på namnuppslag. Några omförsök med växande
  // paus räcker; ett skript som hämtar externt ska inte falla på första nyk.
  let res: Response | null = null;
  for (let försök = 1; försök <= 5; försök++) {
    res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) break;
    const text = await res.text();
    if (försök === 5) {
      console.error(`SCB svarade ${res.status}: ${text}`);
      process.exit(1);
    }
    console.error(`  försök ${försök} gav ${res.status}, väntar ${försök * 2} s`);
    await new Promise((r) => setTimeout(r, försök * 2000));
  }

  const px = (await res!.json()) as PxResponse;
  // Index 0–100, där 100 rymmer "100+".
  const man = new Array<number>(MAX_AGE + 1).fill(0);
  const kvinna = new Array<number>(MAX_AGE + 1).fill(0);
  for (const row of px.data) {
    const [, alder, kon] = row.key;
    const i = alder === '100+' ? MAX_AGE : Number(alder);
    const n = Number(row.values[0]);
    if (!Number.isFinite(i) || !Number.isFinite(n)) continue;
    (kon === '1' ? man : kvinna)[i] += n;
  }

  const summa = [...man, ...kvinna].reduce((a, b) => a + b, 0);
  const out = {
    _kommentar: [
      'Genererad av scripts/fetch-population.ts — redigera inte för hand.',
      'Index 0–100 är ettårsklasser; 100 rymmer även äldre ("100+").',
      'Siffran avser 31 december angivet år.',
    ],
    kalla: 'SCB, Folkmängden efter region, civilstånd, ålder, kön och år (BE0101A/BefolkningNy)',
    url: URL,
    ar: Number(year),
    hamtad: new Date().toISOString().slice(0, 10),
    totalt: summa,
    man,
    kvinna,
  };

  writeFileSync('src/data/population.json', `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Skrev src/data/population.json — ${summa.toLocaleString('sv-SE')} personer, ${year}-12-31.`);
}

main();
