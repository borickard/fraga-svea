import type { ChartKind, Module } from './dashboard';

/**
 * Dashboardens liv utanför sessionen.
 *
 * Arbetskopian ligger i localStorage, så att den överlever en omladdning.
 * Delning sker på begäran och lägger hela uppsättningen i adressfältet: en
 * länk är det enda sättet att skicka vidare en dashboard utan en server som
 * sparar den, och det här är en prototyp utan server.
 *
 * Kodningen är base64 av JSON. Kompaktare vore att lagra svarsalternativ som
 * index i frågans lista, men ett index som glidit en rad visar fel
 * svarsalternativ utan att någonsin märkas. Etiketter kan valideras mot
 * frågan vid inläsning och säga ifrån. Det är värt tecknen.
 */
const KEY = 'fraga-svea.dashboard.v1';

type Packed = [
  questionId: string,
  chart: ChartKind,
  span: 1 | 2,
  axis: string,
  genders: string[],
  segments: string[],
  options: string[],
  title?: string,
];

const pack = (m: Module): Packed =>
  [m.questionId, m.chart, m.span, m.axis, m.genders, m.segments, m.options, m.title];

const unpack = (p: Packed, i: number): Module => ({
  id: `m${i}-${Math.random().toString(36).slice(2, 8)}`,
  questionId: p[0], chart: p[1], span: p[2] === 2 ? 2 : 1, axis: p[3],
  genders: p[4] ?? [], segments: p[5] ?? [], options: p[6] ?? [], title: p[7],
});

const toBase64Url = (s: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (s: string): string =>
  new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
  );

export function encodeModules(modules: Module[]): string {
  return toBase64Url(JSON.stringify(modules.map(pack)));
}

/** Returnerar tom lista på allt som inte går att läsa. En trasig länk är inte data. */
export function decodeModules(encoded: string): Module[] {
  try {
    const raw = JSON.parse(fromBase64Url(encoded));
    if (!Array.isArray(raw)) return [];
    return raw.filter((p) => Array.isArray(p) && typeof p[0] === 'string').map(unpack);
  } catch {
    return [];
  }
}

export function loadModules(): Module[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? decodeModules(raw) : [];
  } catch {
    return [];
  }
}

export function saveModules(modules: Module[]): void {
  try {
    localStorage.setItem(KEY, encodeModules(modules));
  } catch {
    // Privat läge eller blockerad lagring. Dashboarden fungerar ändå under
    // sessionen; den överlever bara inte en omladdning.
  }
}

export const newId = (): string => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
