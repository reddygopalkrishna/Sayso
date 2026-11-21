const ORDINALS = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];
const CARDINALS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/**
 * A spoken list marker at the start of a sentence: "First, …", "Second one. …", "Number 3: …".
 * Punctuation after the marker is required, which keeps ordinary sentences out ("first of all",
 * "first one is red", "third-party") and matches how the speech model writes a spoken list.
 */
const MARKER = new RegExp(
  `(?:^|(?<=[.!?]\\s))(?:(${ORDINALS.join('|')})(?:\\s+(?:one|point|thing|item)(?=[,.:;]))?` +
    `|(?:number|point|step|item)\\s+(${CARDINALS.join('|')}|\\d{1,2})(?=[,.:;]))[,.:;]+\\s*`,
  'giu',
);

function markerValue(ordinal: string | undefined, cardinal: string | undefined): number {
  if (ordinal) return ORDINALS.indexOf(ordinal.toLowerCase()) + 1;
  if (!cardinal) return 0;
  const n = CARDINALS.indexOf(cardinal.toLowerCase());
  return n >= 0 ? n + 1 : Number(cardinal);
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Turns clearly numbered speech into a numbered list, one item per line:
 * "First one. It works. Second one. It is fast." → "1. It works.\n2. It is fast."
 * Only when the markers run 1, 2, 3… in order (at least two) at sentence starts, and every item
 * has text; anything else is returned unchanged. A lead-in sentence stays on the line above.
 */
export function formatLists(text: string): string {
  const found: Array<{ start: number; end: number; value: number }> = [];
  for (const m of text.matchAll(MARKER)) {
    found.push({
      start: m.index,
      end: m.index + m[0].length,
      value: markerValue(m[1], m[2]),
    });
  }
  // The longest run 1, 2, 3, … from the first marker.
  const run: typeof found = [];
  for (const marker of found) {
    if (marker.value === run.length + 1) run.push(marker);
    else if (run.length === 0) continue;
    else break;
  }
  if (run.length < 2 || run[0]?.value !== 1) return text;

  const items = run.map((marker, i) => {
    const next = run[i + 1];
    return text.slice(marker.end, next ? next.start : undefined).trim();
  });
  if (items.some((item) => item === '')) return text;

  const first = run[0];
  const lead = first ? text.slice(0, first.start).trim() : '';
  const list = items.map((item, i) => `${i + 1}. ${capitalise(item)}`).join('\n');
  return lead === '' ? list : `${lead}\n${list}`;
}
