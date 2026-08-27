/**
 * Radbrytning för SVG-text. SVG bryter inte text själv, och kortet måste kunna
 * bära frågans exakta formulering utan att den klipps av.
 * Bredderna är approximativa men stabila — de behöver bara duga för layout.
 */
const AVG_CHAR = { sans: 0.52, mono: 0.6 } as const;

export function measure(text: string, fontSize: number, family: keyof typeof AVG_CHAR): number {
  return text.length * fontSize * AVG_CHAR[family];
}

export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  family: keyof typeof AVG_CHAR = 'sans',
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, fontSize, family) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Kortar av med ellips i stället för att brytas — används på segmentetiketter. */
export function truncate(text: string, maxWidth: number, fontSize: number, family: keyof typeof AVG_CHAR = 'mono'): string {
  if (measure(text, fontSize, family) <= maxWidth) return text;
  const max = Math.max(1, Math.floor(maxWidth / (fontSize * AVG_CHAR[family])) - 1);
  return text.slice(0, max).trimEnd() + '…';
}
