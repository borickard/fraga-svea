/**
 * Bekräftar eller avvisar en föreslagen koppling mellan årgångar.
 *
 * Seedern föreslår, men kopplar aldrig. Det här skriptet är steget där en
 * människa säger ja eller nej, och det är avsiktligt ett eget kommando:
 * kopplingen avgör om två årtal ritas som samma trendlinje.
 *
 *   npm run link-concepts                 lista förslagen
 *   npm run link-concepts -- ja 1 2 3     koppla ihop par 1, 2 och 3
 *   npm run link-concepts -- nej 10 12    markera som utan motsvarighet
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = resolve(ROOT, 'src/data/concepts.json');

interface Concept {
  id: string;
  titel: string;
  synonymer?: string[];
  formuleringar: Record<string, string[]>;
  matchning?: 'obekräftad' | 'ingen';
  kandidat?: { ar: number; text: string; likhet: number };
}

const file = JSON.parse(readFileSync(FILE, 'utf8')) as { _kommentar: string[]; concepts: Concept[] };
const concepts = file.concepts;

/** Förslagen i samma ordning som de listas, så att numren är stabila. */
const proposals = concepts
  .filter((c) => c.matchning === 'obekräftad' && c.kandidat)
  .sort((a, b) => (b.kandidat!.likhet - a.kandidat!.likhet) || a.id.localeCompare(b.id));

const [verb, ...numbers] = process.argv.slice(2);

if (!verb) {
  console.log(`${proposals.length} förslag:\n`);
  proposals.forEach((c, i) => {
    const year = Object.keys(c.formuleringar)[0];
    console.log(`${String(i + 1).padStart(2)}. likhet ${c.kandidat!.likhet.toFixed(2)}`);
    console.log(`    ${year}: ${Object.values(c.formuleringar)[0][0]}`);
    console.log(`    ${c.kandidat!.ar}: ${c.kandidat!.text}\n`);
  });
  console.log('Koppla:  npm run link-concepts -- ja 1 2 3');
  console.log('Avvisa:  npm run link-concepts -- nej 10 12');
  process.exit(0);
}

if (verb !== 'ja' && verb !== 'nej') {
  console.error('Första argumentet ska vara "ja" eller "nej".');
  process.exit(1);
}

const picked = numbers.map((n) => Number.parseInt(n, 10));
for (const n of picked) {
  if (!Number.isInteger(n) || n < 1 || n > proposals.length) {
    console.error(`Ogiltigt nummer: ${n}. Det finns ${proposals.length} förslag.`);
    process.exit(1);
  }
}

let changed = 0;
for (const n of picked) {
  const concept = proposals[n - 1];
  const candidate = concept.kandidat!;

  if (verb === 'nej') {
    concept.matchning = 'ingen';
    delete concept.kandidat;
    changed++;
    console.log(`${n}. utan motsvarighet: ${concept.titel}`);
    continue;
  }

  // Det andra begreppet slukas: dess formuleringar flyttas hit och posten tas bort.
  const other = concepts.find(
    (c) => c !== concept && (c.formuleringar[String(candidate.ar)] ?? []).includes(candidate.text),
  );
  if (!other) {
    console.error(`${n}. hittade inte motparten för "${concept.titel}". Hoppar över.`);
    continue;
  }

  for (const [year, texts] of Object.entries(other.formuleringar)) {
    concept.formuleringar[year] = [...new Set([...(concept.formuleringar[year] ?? []), ...texts])];
  }
  if (other.synonymer?.length) {
    concept.synonymer = [...new Set([...(concept.synonymer ?? []), ...other.synonymer])];
  }
  delete concept.matchning;
  delete concept.kandidat;
  concepts.splice(concepts.indexOf(other), 1);
  changed++;
  console.log(`${n}. kopplade: ${concept.titel}  (${Object.keys(concept.formuleringar).sort().join(' + ')})`);
}

writeFileSync(FILE, JSON.stringify(file, null, 2) + '\n', 'utf8');
const linked = concepts.filter((c) => Object.keys(c.formuleringar).length > 1).length;
const left = concepts.filter((c) => c.matchning === 'obekräftad' && c.kandidat).length;
console.log(`\n${changed} ändrade. ${concepts.length} begrepp, ${linked} kopplade över årgångar, ${left} förslag kvar.`);
