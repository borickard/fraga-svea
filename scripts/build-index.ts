/**
 * Bygger src/data/index-<år>.json: datasetet utan värden.
 *
 * Frågelagret i api/ importerade hela datasetet — 27 MB med samtliga andelar
 * och n — och plockade bort värdena i koden innan prompten byggdes. Det
 * fungerade, men det vilade på att koden fortsätter göra rätt.
 *
 * Med en värdelös indexfil blir regeln strukturell i stället: värdena finns
 * helt enkelt inte i den modul språkmodellen körs ifrån. Det går inte att
 * läcka en siffra som inte är där.
 *
 * Körs automatiskt före varje bygge.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dataset } from '../src/types.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = resolve(ROOT, 'src/data');

const files = readdirSync(DATA).filter((f) => /^dataset-\d{4}\.json$/.test(f)).sort();
if (!files.length) {
  console.error('Hittade inga dataset-<år>.json i src/data.');
  process.exit(1);
}

for (const file of files) {
  const d: Dataset = JSON.parse(readFileSync(resolve(DATA, file), 'utf8'));

  const index = {
    meta: {
      year: d.meta.year,
      source: d.meta.source,
      publisher: d.meta.publisher,
    },
    segments: d.segments,
    questions: d.questions.map((q) => ({
      id: q.id,
      text: q.text,
      base_label: q.base_label,
      segment_groups: q.segment_groups,
      options: q.options.map((o) => o.label),
    })),
  };

  const out = `index-${d.meta.year}.json`;
  writeFileSync(resolve(DATA, out), JSON.stringify(index, null, 2) + '\n', 'utf8');

  const before = readFileSync(resolve(DATA, file)).length;
  const after = readFileSync(resolve(DATA, out)).length;
  console.log(`${out}  ${(after / 1024).toFixed(0)} kB  (ur ${(before / 1048576).toFixed(1)} MB)`);
}
