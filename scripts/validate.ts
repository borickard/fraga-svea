/**
 * Fas 1 — Validering som separat steg.
 *
 * Hårda fel (exit 1): sådant som gör datasetet opublicerbart.
 * Rimlighetskontroller: skrivs ut för manuell granskning, stoppar inte bygget.
 * Enkelvalsfrågor bör summera nära 1.0 per segment. Flervalsfrågor gör det inte —
 * därför är summan en rapport till en människa, inte ett automatiskt underkännande.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dataset } from '../src/types.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELIABLE_MIN_N = 100;

const errors: string[] = [];
const warnings: string[] = [];
const report: string[] = [];

const say = (line = '') => { report.push(line); console.log(line); };
const fail = (m: string) => { errors.push(m); };
const warn = (m: string) => { warnings.push(m); };

const dataset: Dataset = JSON.parse(readFileSync(resolve(ROOT, 'src/data/dataset.json'), 'utf8'));
const segmentIds = new Set(dataset.segments.map((s) => s.id));

say(`Validerar ${dataset.meta.appendix}`);
say(`${dataset.questions.length} frågor, ${dataset.segments.length} segment`);
say();

// ---------------------------------------------------------------- hårda krav

if (dataset.questions.length === 0) fail('Datasetet innehåller noll frågor.');
if (dataset.segments.length === 0) fail('Datasetet innehåller noll segment.');
if (dataset.meta.question_count !== dataset.questions.length) {
  fail(`meta.question_count (${dataset.meta.question_count}) stämmer inte med antalet frågor (${dataset.questions.length}).`);
}
if (dataset.meta.segment_count !== dataset.segments.length) {
  fail(`meta.segment_count (${dataset.meta.segment_count}) stämmer inte med antalet segment (${dataset.segments.length}).`);
}

const seenQuestionIds = new Set<string>();
for (const q of dataset.questions) {
  const where = `${q.id} (${q.sheet}:${q.source_row})`;

  if (seenQuestionIds.has(q.id)) fail(`Dubblerat fråge-id: ${q.id}`);
  seenQuestionIds.add(q.id);

  // Varje fråga måste ha minst ett svarsalternativ.
  if (q.options.length === 0) fail(`${where} saknar svarsalternativ.`);

  // Basetiketten måste finnas — utan bas får svaret inte visas.
  if (!q.base_label) fail(`${where} saknar bas-etikett.`);
  if (!q.text) fail(`${where} saknar frågetext.`);

  // Bas-sluggen måste ligga i id:t, annars kan två baser förväxlas.
  if (!q.id.includes('__')) fail(`${where} har ett id utan bas-slug.`);

  for (const opt of q.options) {
    if (!opt.label) fail(`${where} har ett svarsalternativ utan etikett.`);
    const keys = Object.keys(opt.values);
    if (keys.length === 0) fail(`${where} / "${opt.label}" saknar värden.`);
    for (const segId of keys) {
      // Varje segment i values måste finnas i segments.
      if (!segmentIds.has(segId)) fail(`${where} / "${opt.label}" refererar okänt segment "${segId}".`);
      const v = opt.values[segId];
      if (v.pct !== null && (v.pct < 0 || v.pct > 1)) {
        // Värdena är andelar 0–1. Allt annat betyder att parsern läst fel kolumn.
        fail(`${where} / "${opt.label}" / ${segId}: pct=${v.pct} ligger utanför 0–1.`);
      }
      if (v.pct === null && !v.reason) fail(`${where} / "${opt.label}" / ${segId}: pct är null utan reason.`);
      if (v.n === 0 && v.reason !== 'no_base') {
        fail(`${where} / "${opt.label}" / ${segId}: n=0 men reason är "${v.reason}" i stället för no_base.`);
      }
      if (v.pct !== null && v.n >= RELIABLE_MIN_N && !v.reliable) {
        fail(`${where} / "${opt.label}" / ${segId}: n=${v.n} men reliable=false.`);
      }
      if (v.reliable && v.n < RELIABLE_MIN_N) {
        fail(`${where} / "${opt.label}" / ${segId}: reliable=true trots n=${v.n}.`);
      }
    }
  }
}

// Segment som aldrig används är inte fel, men ska synas.
const used = new Set<string>();
for (const q of dataset.questions) for (const o of q.options) for (const k of Object.keys(o.values)) used.add(k);
for (const s of dataset.segments) if (!used.has(s.id)) warn(`Segmentet "${s.id}" används inte i någon fråga.`);

// ---------------------------------------------------------------- fälla 3

const byText = new Map<string, string[]>();
for (const q of dataset.questions) {
  const list = byText.get(q.text) ?? [];
  list.push(q.base_label);
  byText.set(q.text, list);
}
const multiBase = [...byText.entries()].filter(([, bases]) => bases.length > 1);
if (multiBase.length) {
  say('Frågetexter som förekommer på flera baser — bas-etiketten måste följa med i varje svar:');
  for (const [text, bases] of multiBase) {
    say(`  "${text.slice(0, 72)}${text.length > 72 ? '…' : ''}"`);
    for (const b of bases) say(`      bas: ${b}`);
  }
  say();
}

// ---------------------------------------------------------------- rimlighetskontroll

say('Kolumn%-summor per fråga (segmentet Totalt). Enkelval bör ligga nära 1.0,');
say('flervalsfrågor gör det inte. Kontrolleras manuellt.');
say();
say('  SUMMA  TYP        FRÅGA');
for (const q of dataset.questions) {
  let sum = 0, counted = 0;
  for (const o of q.options) {
    const v = o.values['totalt'];
    if (v && v.pct !== null) { sum += v.pct; counted++; }
  }
  if (counted === 0) { warn(`${q.id} har inga värden för segmentet Totalt.`); continue; }
  const single = Math.abs(sum - 1) <= 0.03;
  const type = single ? 'enkelval ' : 'flerval  ';
  say(`  ${sum.toFixed(3)}  ${type}  ${q.id}`);
}
say();

// ---------------------------------------------------------------- baser

let noBase = 0, small = 0, total = 0;
const smallSegments = new Map<string, number>();
for (const q of dataset.questions) {
  for (const o of q.options) {
    for (const [segId, v] of Object.entries(o.values)) {
      total++;
      if (v.reason === 'no_base') noBase++;
      else if (v.n < RELIABLE_MIN_N) { small++; smallSegments.set(segId, v.n); }
    }
  }
}
say(`Celler: ${total} totalt, ${noBase} utan bas (renderas aldrig som 0 %), ${small} med n < ${RELIABLE_MIN_N}.`);
if (smallSegments.size) {
  say('Segment med liten bas — varnas för i gränssnittet:');
  for (const [id, n] of [...smallSegments.entries()].sort((a, b) => a[1] - b[1])) {
    say(`  n = ${String(n).padStart(4)}  ${id}`);
  }
}
say();

// ---------------------------------------------------------------- utfall

if (warnings.length) {
  say(`${warnings.length} varningar:`);
  for (const w of warnings) say(`  ! ${w}`);
  say();
}

writeFileSync(resolve(ROOT, 'data/validation-report.txt'), report.join('\n') + '\n', 'utf8');

if (errors.length) {
  console.error(`\n${errors.length} HÅRDA FEL:`);
  for (const e of errors) console.error(`  x ${e}`);
  console.error('\nDatasetet är inte publicerbart.');
  process.exit(1);
}
console.log('Validering OK. Rapport: data/validation-report.txt');
