import { applyDictionary, type DictionaryTerm } from './dictionary.ts';

const TLDS = [
  'com',
  'org',
  'net',
  'io',
  'ai',
  'dev',
  'app',
  'co',
  'in',
  'so',
  'me',
  'gov',
  'edu',
  'us',
  'uk',
  'tv',
  'gg',
  'xyz',
];
const TLD = `(?:${TLDS.join('|')})`;
/** Words that are never the name of a site: "the dot com bubble" stays as said. */
const NOT_A_NAME = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'in',
  'on',
  'at',
  'and',
  'or',
  'is',
  'my',
]);

const LABEL = String.raw`[\p{L}\p{N}-]+`;
/**
 * "name dot rest" or "name . rest" (a space before the dot), where the rest ends in a known
 * ending. "Wait. So" is a sentence, not an address, so a dot right after a word does not count.
 */
const SPOKEN_DOT = new RegExp(
  String.raw`(?<![\p{L}\p{N}@.])(${LABEL}(?:\.${LABEL})*)(?:\s+dot\s+|\s+\.\s*)((?:${LABEL}\.)*${TLD})(?![\p{L}\p{N}])`,
  'giu',
);

/** "chatgpt dot com", "chatgpt . com" and "google dot co dot in" → chatgpt.com, google.co.in. */
function joinSpokenDots(text: string): string {
  let out = text;
  for (let i = 0; i < 4; i++) {
    const next = out.replace(SPOKEN_DOT, (match, name: string, rest: string) => {
      const ending = rest.split('.').at(-1)?.toLowerCase() ?? '';
      if (!TLDS.includes(ending) || NOT_A_NAME.has(name.toLowerCase())) return match;
      return `${name}.${rest}`;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

/** A web address: optional scheme and www, a name, a known ending, an optional path. */
const ADDRESS = new RegExp(
  `(?<![\\p{L}\\p{N}@.])((?:https?:\\/\\/)?(?:www\\.)?[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*\\.${TLD})(?![\\p{L}\\p{N}@-])(\\/[^\\s]*)?`,
  'giu',
);

/**
 * Web addresses come out the way they are typed in a browser: "chatgpt dot com" → chatgpt.com,
 * the host in lowercase (paths keep their case). When the whole text is one address, there is no
 * capital letter and no full stop at the end. Emails are left alone.
 */
export function fixWebAddresses(text: string): string {
  const joined = joinSpokenDots(text).replace(
    ADDRESS,
    (_m, host: string, path?: string) => host.toLowerCase() + (path ?? ''),
  );
  const whole = joined.trim().replace(/[.,;:!?]+$/u, '');
  const only = new RegExp(`^${ADDRESS.source}$`, 'iu');
  return only.test(whole) ? whole : joined;
}

/**
 * "type …" with the hold key: the rest is typed as said, with no AI and no end command (so
 * "type send" types the word "send"). Your words and the built-in names are still spelled right,
 * and web addresses are fixed.
 */
export function typeLiterally(text: string, terms: readonly DictionaryTerm[]): string {
  return fixWebAddresses(applyDictionary(text.trim(), terms));
}

/** The words after a leading "type" (and the punctuation after it), or null when there is none. */
export function afterTypeWord(text: string): string | null {
  const match = /^\s*type\b[\s,:;.\-–—]*/iu.exec(text);
  if (!match) return null;
  const rest = text.slice(match[0].length).trim();
  return rest === '' ? null : rest;
}
