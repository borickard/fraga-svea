/**
 * Fas 4 — Export.
 *
 * Exporten serialiserar exakt den nod som ligger på skärmen. Ingen separat
 * exportmall, ingen omritning: det användaren ser är det som laddas ner,
 * med bas och källhänvisning inbakade i bilden.
 *
 * Typsnitten bäddas in som base64 när de finns i public/fonts/. Utan
 * inbäddning renderar en fristående SVG med systemets fallback-typsnitt —
 * layouten håller, men formspråket tappas. Se scripts/fetch-fonts.mjs.
 */

const FONT_FILES = [
  { family: 'Instrument Sans', weight: 400, url: '/fonts/InstrumentSans-Regular.woff2' },
  { family: 'Instrument Sans', weight: 500, url: '/fonts/InstrumentSans-Medium.woff2' },
  { family: 'IBM Plex Mono', weight: 400, url: '/fonts/IBMPlexMono-Regular.woff2' },
  { family: 'IBM Plex Mono', weight: 500, url: '/fonts/IBMPlexMono-Medium.woff2' },
];

let fontCss: string | null = null;

async function embeddedFontCss(): Promise<string> {
  if (fontCss !== null) return fontCss;
  const faces: string[] = [];
  for (const f of FONT_FILES) {
    try {
      const res = await fetch(f.url);
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      faces.push(
        `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:normal;` +
        `src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');}`,
      );
    } catch {
      /* Typsnittet saknas — exporten fungerar ändå, med fallback. */
    }
  }
  if (faces.length === 0) {
    console.warn(
      'Inga typsnitt i public/fonts/ — exporten använder systemtypsnitt. Kör `node scripts/fetch-fonts.mjs`.',
    );
  }
  fontCss = faces.join('');
  return fontCss;
}

/**
 * Fryser noden: tar bort animationsklasser och det inbäddade keyframe-blocket,
 * så att bilden aldrig fångas halvvägs genom att staplarna växer.
 */
async function freeze(svg: SVGSVGElement): Promise<SVGSVGElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('style').forEach((s) => s.remove());
  clone.querySelectorAll('.svea-bar').forEach((el) => {
    el.removeAttribute('class');
    el.removeAttribute('style');
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const css = await embeddedFontCss();
  if (css) {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
  }
  return clone;
}

const serialize = (node: SVGSVGElement): string =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(node);

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Ge webbläsaren en tick innan objektet släpps.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportSvg(svg: SVGSVGElement, filename: string): Promise<void> {
  const markup = serialize(await freeze(svg));
  download(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), `${filename}.svg`);
}

export async function exportPng(svg: SVGSVGElement, filename: string, scale = 2): Promise<void> {
  const frozen = await freeze(svg);
  const width = Number(frozen.getAttribute('width'));
  const height = Number(frozen.getAttribute('height'));
  const markup = serialize(frozen);

  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Kunde inte rendera SVG:en till bild.'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Ingen 2d-kontext tillgänglig.');
    // Duken är vit i SVG:en, men PNG:en ska aldrig kunna bli transparent.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('Kunde inte skapa PNG.');
    download(blob, `${filename}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Filnamn som bär frågan och basen, så att filen går att identifiera i ett nedladdningsbibliotek. */
export function exportFilename(questionId: string, optionLabel: string, group: string): string {
  const clean = (s: string) =>
    s.toLowerCase()
      .replace(/å|ä/g, 'a').replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return ['svea', clean(questionId), clean(optionLabel), clean(group)].filter(Boolean).join('_').slice(0, 120);
}
