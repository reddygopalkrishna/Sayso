import type { Style } from '../../../shared/settings.ts';
import type { DictionaryTerm } from './dictionary.ts';

/** URLs and email addresses stay exactly as written (the trailing punctuation does not belong to them). */
const KEEP_AS_WRITTEN = /(?:https?:\/\/|www\.)[^\s]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** A numbered-list marker at the start of a line ("1. " or "2) "). */
const LIST_MARKER = /^(\s*\d+[.)]\s)/;
const TRAILING_PUNCTUATION = /[.,;:!?)]+$/;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Chill: no capitals and almost no punctuation ("hey are you free for lunch tomorrow lets do 12").
 * Your own words keep their spelling (Sayso, GitHub), links and emails stay as written, numbered
 * lists keep their numbers, and line breaks stay. Default leaves the text as it is.
 */
export function applyStyle(
  text: string,
  style: Style,
  terms: readonly DictionaryTerm[] = [],
): string {
  if (style !== 'chill') return text;

  // Pull out what must not change, leaving placeholders that contain nothing but a number.
  const kept: string[] = [];
  const hold = (value: string): string => `\uE000${kept.push(value) - 1}\uE000`;

  let work = text.replace(KEEP_AS_WRITTEN, (match) => {
    const tail = TRAILING_PUNCTUATION.exec(match)?.[0] ?? '';
    return hold(tail ? match.slice(0, -tail.length) : match) + tail;
  });
  for (const { phrase } of terms) {
    if (phrase === '') continue;
    const whole = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`, 'giu');
    work = work.replace(whole, () => hold(phrase));
  }

  work = work
    .split('\n')
    .map((line) => {
      const marker = LIST_MARKER.exec(line)?.[1] ?? '';
      const rest = line
        .slice(marker.length)
        .toLowerCase()
        // Sentence punctuation goes when it ends a word; a dot inside "3.5" or "p.m" stays.
        .replace(/[.,;:!?…]+(?=\s|$)/gu, '')
        .replace(/ {2,}/g, ' ')
        .trimEnd();
      return marker + rest;
    })
    .join('\n');

  return work.replace(/\uE000(\d+)\uE000/g, (_m, index: string) => kept[Number(index)] ?? '');
}
