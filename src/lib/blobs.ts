/**
 * Ytorna figurerna står i.
 *
 * Organiska former i stället för rutor, och — viktigare — former som ligger
 * i varandra när mängderna gör det. I den nästlade formen är inneslutningen
 * nu själva geometrin: de som använder varje dag står inuti ytan för dem som
 * använder varje vecka, som i sin tur ligger inuti ytan för alla användare.
 * Tidigare stod banden bredvid varandra med en konsol över, och läsaren fick
 * ta inneslutningen på förtroende.
 *
 * Formen är en cirkel med små övertoner, så att kanten vaggar i stället för
 * att vara perfekt. Vågigheten håller sig under fem procent av radien:
 * ytan är ungefär proportionell mot antalet, men det är figurerna som bär
 * talet — de går att räkna, och varje yta har sitt antal utskrivet.
 */

export interface Blob {
  /** Fältets index. */
  field: number;
  cx: number;
  cy: number;
  /** Grundradie före vågighet. */
  r: number;
  /** Fasvinklar, så att varje yta vaggar på sitt eget sätt men alltid lika. */
  p1: number;
  p2: number;
  /** Hur djupt ytan ligger. Större djup = längre in. */
  depth: number;
}

export interface Slot { x: number; y: number; field: number; }

const WOBBLE_1 = 0.042;
const WOBBLE_2 = 0.026;

/** Radien i en given riktning. */
export function radiusAt(b: Blob, theta: number): number {
  return b.r * (1 + WOBBLE_1 * Math.sin(3 * theta + b.p1) + WOBBLE_2 * Math.sin(5 * theta + b.p2));
}

/** Konturen som en sluten, mjuk bana. */
export function blobPath(b: Blob, steps = 72): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = radiusAt(b, t);
    pts.push([b.cx + r * Math.cos(t), b.cy + r * Math.sin(t)]);
  }
  // Catmull-Rom genom punkterna, utskriven som kubiska bézier.
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < steps; i++) {
    const p0 = pts[(i - 1 + steps) % steps];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % steps];
    const p3 = pts[(i + 2) % steps];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)},${c2x.toFixed(1)} ${c2y.toFixed(1)},${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
}

/**
 * Ligger platsen i ytan — med marginal för figurens egen storlek?
 *
 * Utan marginal testas bara figurens mittpunkt, och i en liten yta hänger
 * halva kroppen utanför konturen. En figur som står utanför sin yta är inte
 * en skönhetsfråga: ytan är påståendet om vilka de hundra är.
 */
const inside = (b: Blob, x: number, y: number, inset: number): boolean => {
  const dx = x - b.cx;
  const dy = y - b.cy;
  const d = Math.hypot(dx, dy);
  return d <= radiusAt(b, Math.atan2(dy, dx)) - inset;
};

/**
 * Platser att stå på.
 *
 * Ett förskjutet rutnät läggs över hela ytan och varje punkt tilldelas den
 * innersta yta den ligger i. Figurerna hamnar då av sig själva i ringarna
 * mellan konturerna, utan att någon behöver räkna ut en ringlayout.
 */
export function slotsFor(
  blobs: Blob[], width: number, height: number, stepX: number, stepY: number, inset: number,
): Slot[] {
  // Innersta först, så att en punkt i flera ytor hamnar i den djupaste.
  const ordered = [...blobs].sort((a, b) => b.depth - a.depth);
  const out: Slot[] = [];
  let row = 0;
  for (let y = stepY * 0.6; y < height; y += stepY, row++) {
    const offset = row % 2 ? stepX / 2 : 0;
    for (let x = stepX * 0.5 + offset; x < width; x += stepX) {
      // Den djupaste ytan som rymmer hela figuren. En plats som bara ryms i
      // en yttre yta hamnar där, inte i den inre den sticker ut ur.
      const hit = ordered.find((b) => inside(b, x, y, inset));
      if (hit) out.push({ x, y, field: hit.field });
    }
  }
  return out;
}

export interface Arrangement { blobs: Blob[]; slots: Slot[]; width: number; height: number; }

interface FieldSpec { field: number; count: number; depth: number }

/**
 * Lägger ut ytorna och letar upp en storlek där alla figurer får plats.
 *
 * Skalan söks i stället för att räknas fram. Packningstätheten i en ring
 * beror på ringens krökning och på var rutnätet råkar hamna, och en formel
 * som stämmer i mitten slår fel längst in. Sökningen frågar i stället den
 * färdiga layouten: ryms alla? annars större.
 */
export function arrange(
  fields: FieldSpec[],
  layout: 'nested' | 'row',
  stepX: number,
  stepY: number,
  maxWidth: number,
): Arrangement {
  const total = fields.reduce((a, f) => a + f.count, 0) || 1;

  const build = (scale: number): Arrangement => {
    const blobs: Blob[] = [];
    let width: number;
    let height: number;

    if (layout === 'nested') {
      // Kumulativt inifrån: varje yta rymmer sig själv och allt innanför.
      /*
       * Ytorna ligger i varandra men inte koncentriskt.
       *
       * Med gemensam mittpunkt blir varje ring lika tjock runtom, och alla
       * konturer har sin topp på samma lodlinje — etiketterna hamnar i en
       * stapel mitt i bilden. Förskjutna inåt-nedåt blir ringarna i stället
       * månskäror, etiketterna trappar sig snett, och formen ser ut som
       * vätska som samlats i botten i stället för som en måltavla.
       *
       * Förskjutningen är halva spelrummet mellan konturerna, så att den
       * inre ytan garanterat ligger helt innanför den yttre även med
       * vågigheten inräknad.
       */
      const byDepth = [...fields].sort((a, b) => a.depth - b.depth);
      const R = scale;
      const margin = 1 + WOBBLE_1 + WOBBLE_2;
      width = R * 2 * margin + stepX;
      height = R * 2 * margin + stepY;
      let cx = width / 2;
      let cy = height / 2;
      let prevR = R;
      byDepth.forEach((f, i) => {
        const cum = byDepth.slice(i).reduce((a, x) => a + x.count, 0);
        const r = R * Math.sqrt(cum / total);
        if (i > 0) {
          const spelrum = prevR * (1 - WOBBLE_1 - WOBBLE_2) - r * margin;
          const d = Math.max(0, spelrum) * 0.5;
          cx += d * 0.34;
          cy += d * 0.94;
        }
        blobs.push({
          field: f.field, cx, cy, r,
          p1: 0.7 + i * 1.3, p2: 2.1 + i * 0.9, depth: f.depth,
        });
        prevR = r;
      });
    } else {
      /*
       * Ytorna radas upp och bryter rad när bredden tar slut. Utan radbrytning
       * blev sex ytor en remsa på nära niohundra pixlar, och enda sättet att
       * få den att rymmas var att krympa figurerna tills de slutade läsas som
       * människor.
       */
      /*
       * Ytan är proportionell mot antalet — utom för de allra minsta, som får
       * ett golv. Två figurer i en yta vars area svarar mot två procent ryms
       * helt enkelt inte, och att låta sökningen blåsa upp allt tills de gör
       * det hade gjort den stora ytan absurd. Talen står utskrivna på varje
       * yta, så golvet ljuger inte om något.
       */
      const floor = (n: number) =>
        n <= 0 ? stepX * 0.9 : Math.sqrt((n * stepX * stepY) / Math.PI) / 0.74 + stepY * 0.45;
      const radii = fields.map((f) =>
        Math.max(scale * Math.sqrt(Math.max(f.count, 0.5) / total), floor(f.count)));
      const gap = stepX * 0.6;
      const limit = Math.max(maxWidth, Math.max(...radii) * 2 + 1);
      let x = 0;
      let top = 0;
      let lineH = 0;
      width = 0;
      fields.forEach((f, i) => {
        const d = radii[i] * 2;
        if (x > 0 && x + d > limit) { top += lineH + gap; x = 0; lineH = 0; }
        blobs.push({
          field: f.field, cx: x + radii[i], cy: top + radii[i], r: radii[i],
          p1: 0.4 + i * 1.7, p2: 1.6 + i * 1.1, depth: 0,
        });
        x += d + gap;
        lineH = Math.max(lineH, d);
        width = Math.max(width, x - gap);
      });
      height = top + lineH;
    }

    return {
      blobs,
      slots: slotsFor(blobs, width, height, stepX, stepY, stepY * 0.42),
      width, height,
    };
  };

  const fits = (a: Arrangement): boolean =>
    fields.every((f) => a.slots.filter((s) => s.field === f.field).length >= f.count);

  // Sök uppåt tills allt ryms, sedan halvera intervallet för att inte lämna
  // en onödigt gles layout.
  let lo = Math.max(stepX, stepY) * 2;
  let hi = lo;
  let best = build(hi);
  for (let i = 0; i < 14 && !fits(best); i++) {
    lo = hi;
    hi *= 1.35;
    best = build(hi);
  }
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    const candidate = build(mid);
    if (fits(candidate)) { hi = mid; best = candidate; } else lo = mid;
  }

  // Naturlig storlek. Den som ritar väljer figurstorlek efter den, i stället
  // för att krympa en färdig layout — krympt text slutar gå att läsa.
  return best;
}
