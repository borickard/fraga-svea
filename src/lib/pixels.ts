/**
 * Pixelfigurerna.
 *
 * 13 × 18 celler. Tillräckligt för att läsas som en människa på håll och
 * för att bära två siffror på bröstet, vilket är hela poängen: åldern ska
 * gå att läsa på figuren och inte bara i en legend.
 *
 * Hudtonen är densamma för alla och bär ingen data. Kön syns på silhuetten
 * (hårets längd), ålder på tröjans färg och på siffrorna. Färg ensam kodar
 * alltså aldrig kön, och siffran dubblar tröjfärgen för den som inte skiljer
 * stegen åt.
 */
export const FIG_W = 13;
export const FIG_H = 18;

/** . tom · h hår · s hud · e öga · c tröja · p byxa · b sko */
const BODY = [
  '....hhhhh....',
  '...hhhhhhh...',
  '...hsssssh...',
  '...hsesesh...',
  '...hsssssh...',
  '....sssss....',
  '.....sss.....',
  '..ccccccccc..',
  '.ccccccccccc.',
  '.ccccccccccc.',
  '.ccccccccccc.',
  '.ccccccccccc.',
  '.ccccccccccc.',
  '.ccccccccccc.',
  '..ppppppppp..',
  '..ppp...ppp..',
  '..ppp...ppp..',
  '..bbb...bbb..',
];

/** Långt hår läggs till på sidorna. Kort hår slutar vid öronen. */
const LONG_HAIR: [number, number][] = [
  [2, 2], [2, 10], [3, 2], [3, 10], [4, 2], [4, 10],
  [5, 2], [5, 3], [5, 9], [5, 10], [6, 2], [6, 3], [6, 9], [6, 10],
  [7, 1], [7, 2], [7, 10], [7, 11], [8, 0], [8, 1], [8, 11], [8, 12],
  [9, 0], [9, 12], [10, 0], [10, 12],
];

export type Gender = 'man' | 'kvinna' | null;

export interface Cell { x: number; y: number; kind: string; }

export function figureCells(gender: Gender): Cell[] {
  const grid = BODY.map((row) => row.split(''));
  if (gender === 'kvinna') for (const [y, x] of LONG_HAIR) grid[y][x] = 'h';
  if (gender === 'man') {
    // Kortare lugg: en rad mindre hår i pannan.
    grid[1][3] = '.'; grid[1][9] = '.';
  }
  const out: Cell[] = [];
  grid.forEach((row, y) => row.forEach((kind, x) => { if (kind !== '.') out.push({ x, y, kind }); }));
  return out;
}

/** 3 × 5 siffror. Två får plats på tröjan, kolumn 3–9, rad 9–13. */
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

const DIGIT_TOP = 9;

/** Siffrorna centreras på bröstet. Ett ensamt tal hamnar mitt på. */
export function digitCells(text: string): Cell[] {
  const chars = text.slice(0, 2).split('').filter((c) => DIGITS[c]);
  if (!chars.length) return [];
  const width = chars.length * 3 + (chars.length - 1);
  const left = Math.round((FIG_W - width) / 2);
  const out: Cell[] = [];
  chars.forEach((c, i) => {
    DIGITS[c].forEach((row, y) => {
      row.split('').forEach((bit, x) => {
        if (bit === '1') out.push({ x: left + i * 4 + x, y: DIGIT_TOP + y, kind: 'd' });
      });
    });
  });
  return out;
}

/**
 * Åldersrampen. Ålder är en ordnad skala, så färgen är sekventiell — en
 * kulör, ljus till mörk — och aldrig kategorisk. Stegen går från bilagans
 * mint till en djup grön.
 */
export const AGE_RAMP = [
  '#CFE9E0', '#B2DDD0', '#93D0BF', '#72C2AC', '#4FB397',
  '#2FA181', '#1B8E6E', '#15765C', '#0F5C48',
] as const;

export const NEUTRAL_SHIRT = '#B9C2BE';
export const SKIN = '#EFE2D4';
export const HAIR_YOUNG = '#2B2A28';
export const HAIR_OLD = '#AFB4B7';
export const TROUSERS = '#4A5256';
export const SHOES = '#2B2A28';
