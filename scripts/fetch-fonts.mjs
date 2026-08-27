/**
 * Hämtar Instrument Sans och IBM Plex Mono till public/fonts/ som woff2.
 *
 * Typsnitten behövs bara för exporten: en fristående SVG- eller PNG-fil
 * renderas utan tillgång till sidans typsnitt, så de måste bäddas in i filen.
 * Appen i webbläsaren laddar typsnitten från Google Fonts som vanligt.
 *
 *   node scripts/fetch-fonts.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/fonts');

const SPECS = [
  { css: 'Instrument+Sans:wght@400', file: 'InstrumentSans-Regular.woff2' },
  { css: 'Instrument+Sans:wght@500', file: 'InstrumentSans-Medium.woff2' },
  { css: 'IBM+Plex+Mono:wght@400', file: 'IBMPlexMono-Regular.woff2' },
  { css: 'IBM+Plex+Mono:wght@500', file: 'IBMPlexMono-Medium.woff2' },
];

// Google Fonts serverar woff2 bara till moderna user agents.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

await mkdir(OUT, { recursive: true });

for (const spec of SPECS) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${spec.css}&display=swap`;
  const css = await fetch(cssUrl, { headers: { 'User-Agent': UA } }).then((r) => r.text());
  // Latin Extended täcker å, ä och ö. Ta sista latin-blocket, det är det bredaste.
  const urls = [...css.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)].map((m) => m[1]);
  if (!urls.length) {
    console.error(`Hittade ingen woff2 för ${spec.css}. Hoppar över.`);
    continue;
  }
  const buf = Buffer.from(await fetch(urls[urls.length - 1]).then((r) => r.arrayBuffer()));
  await writeFile(resolve(OUT, spec.file), buf);
  console.log(`${spec.file}  ${(buf.length / 1024).toFixed(1)} kB`);
}
console.log('\nKlart. Exporten bäddar nu in typsnitten i SVG och PNG.');
