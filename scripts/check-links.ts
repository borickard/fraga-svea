/**
 * Granskar årskopplingarna mot svarsalternativen.
 *
 * Textlikhet räcker inte. "Vilka har du använt minst varje vecka?" och "Vilka
 * har du använt varje vecka?" är nästan identiska meningar, men i 2025 handlar
 * den om meddelandeappar och i 2026 om AI-tjänster. Alternativlistan avslöjar
 * det; frågetexten gör det inte.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dataset } from '../src/types.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const YEARS = [2025, 2026];
const datasets = new Map<number, Dataset>(YEARS.map((y) => [y, read(`src/data/dataset-${y}.json`) as Dataset]));
const concepts: { id: string; titel: string; formuleringar: Record<string, string[]> }[] =
  read('src/data/concepts.json').concepts;

const norm = (s: string) => s.toLowerCase().replace(/[^a-zå-ö0-9]/g, '');

function optionsFor(year: number, texts: string[]): Set<string> {
  const out = new Set<string>();
  for (const q of datasets.get(year)!.questions) {
    if (!texts.includes(q.text)) continue;
    for (const o of q.options) out.add(norm(o.label));
  }
  return out;
}

let bad = 0, ok = 0;
for (const c of concepts) {
  const years = Object.keys(c.formuleringar).map(Number).sort();
  if (years.length < 2) continue;

  const sets = years.map((y) => optionsFor(y, c.formuleringar[String(y)]));
  let shared = 0;
  for (const o of sets[0]) if (sets[1].has(o)) shared++;
  const overlap = sets[0].size && sets[1].size ? shared / Math.min(sets[0].size, sets[1].size) : 0;

  if (overlap < 0.3) {
    bad++;
    console.log(`\n✗ ${c.titel}  (överlapp ${Math.round(overlap * 100)} %)`);
    for (const y of years) {
      console.log(`   ${y}: ${c.formuleringar[String(y)][0].slice(0, 66)}`);
      console.log(`         ${[...optionsFor(y, c.formuleringar[String(y)])].slice(0, 5).join(', ').slice(0, 88)}`);
    }
  } else ok++;
}
console.log(`\n${ok} kopplingar med överlappande svarsalternativ, ${bad} utan.`);
if (bad) {
  console.log('Koppla isär med: npm run link-concepts -- nej <nummer>, eller redigera concepts.json.');
  process.exit(1);
}
