/**
 * Begrepp — ryggraden i det redaktionella lagret.
 *
 * Ett begrepp är en sak undersökningen mäter. Det har en titel, synonymer och
 * en lista formuleringar per årgång. Internetstiftelsen skriver om frågorna
 * mellan åren, så en titel eller ett sökord som hänger på exakt frågetext
 * tappas vid varje ny årgång. Hänger det på begreppet överlever det.
 *
 * Kopplingen mellan årgångar är granskad, aldrig gissad: bara formuleringar
 * som ligger under samma begrepp räknas som samma fråga. En felaktigt
 * hopkopplad fråga ger en felaktig trendlinje.
 */
import type { Question } from '../types';
import raw from '../data/concepts.json';

export interface Concept {
  id: string;
  titel: string;
  synonymer?: string[];
  formuleringar: Record<string, string[]>;
  matchning?: 'obekräftad' | 'ingen';
  kandidat?: { ar: number; text: string; likhet: number };
}

export const concepts: Concept[] = (raw as { concepts: Concept[] }).concepts;

const byId = new Map(concepts.map((c) => [c.id, c]));

/** Frågetext -> begrepp. En text hör till exakt ett begrepp. */
const byText = new Map<string, Concept>();
for (const c of concepts) {
  for (const texts of Object.values(c.formuleringar)) {
    for (const t of texts) byText.set(t, c);
  }
}

export const conceptById = (id: string): Concept | undefined => byId.get(id);
export const conceptFor = (q: Question): Concept | undefined => byText.get(q.text);

/** Titeln följer begreppet. Saknas den används frågans egen formulering. */
export const titleFor = (q: Question): string => conceptFor(q)?.titel ?? q.text;
export const hasTitle = (q: Question): boolean => titleFor(q) !== q.text;

export const synonymsFor = (q: Question): string[] => conceptFor(q)?.synonymer ?? [];

/** Formuleringar för ett begrepp ett visst år. Tom lista = begreppet saknas det året. */
export const wordingsFor = (conceptId: string, year: number): string[] =>
  byId.get(conceptId)?.formuleringar[String(year)] ?? [];

/** Årgångar där begreppet finns, bekräftat. */
export const yearsFor = (conceptId: string): number[] =>
  Object.keys(byId.get(conceptId)?.formuleringar ?? {}).map(Number).sort();

/** Begrepp som väntar på mänsklig granskning av sin årskoppling. */
export const pendingReview = (): Concept[] => concepts.filter((c) => c.matchning === 'obekräftad' && c.kandidat);
