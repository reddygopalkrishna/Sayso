/**
 * "first result", "third email", "the last link", "second one": which item on screen, counted
 * from the top. Pure, so the command matcher and the app read positions the same way.
 */
export type PositionKind = 'result' | 'link' | 'row' | 'button' | 'any';

export interface Position {
  /** 1 for the first, 2 for the second…; -1 for the last. */
  index: number;
  kind: PositionKind;
  /** How it was said, for messages: "third email". */
  spoken: string;
}

const ORDINALS: Readonly<Record<string, number>> = {
  first: 1,
  top: 1,
  '1st': 1,
  second: 2,
  '2nd': 2,
  third: 3,
  '3rd': 3,
  fourth: 4,
  '4th': 4,
  fifth: 5,
  '5th': 5,
  sixth: 6,
  '6th': 6,
  seventh: 7,
  '7th': 7,
  eighth: 8,
  '8th': 8,
  ninth: 9,
  '9th': 9,
  tenth: 10,
  '10th': 10,
  last: -1,
  bottom: -1,
};

const KINDS: Readonly<Record<string, PositionKind>> = {
  result: 'result',
  results: 'result',
  'search result': 'result',
  hit: 'result',
  link: 'link',
  links: 'link',
  email: 'row',
  emails: 'row',
  mail: 'row',
  message: 'row',
  messages: 'row',
  conversation: 'row',
  chat: 'row',
  thread: 'row',
  row: 'row',
  item: 'row',
  entry: 'row',
  file: 'row',
  button: 'button',
  one: 'any',
  option: 'any',
};

/**
 * Reads "third email", "the first search result", "last one" or "2nd link". Returns null for
 * anything else ("app store", "first of all, …"), so "open …" keeps its usual meaning there.
 */
export function parsePosition(text: string): Position | null {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w !== '' && w !== 'the');
  const first = words[0];
  if (first === undefined) return null;
  const index = ORDINALS[first];
  if (index === undefined) return null;
  const rest = words.slice(1).join(' ');
  if (rest === '') return { index, kind: 'any', spoken: first };
  const kind = KINDS[rest];
  if (kind === undefined) return null;
  return { index, kind, spoken: `${first} ${rest}` };
}
