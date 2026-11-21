export interface DictionaryTerm {
  /** The exact spelling to use. */
  phrase: string;
  /** What the speech model tends to hear instead (optional). */
  spokenAs: string | null;
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const collapse = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** True when `phrase` appears in `text` as a whole word or phrase, ignoring case. */
export function containsPhrase(text: string, phrase: string): boolean {
  const source = escape(collapse(phrase)).replace(/ /g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${source}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

/**
 * Fixes the spelling of your own words: "say so" → "Sayso" (a "heard as" entry) and "github" →
 * "GitHub" (case). Whole words only, ignoring case, in one pass so a replacement is never
 * replaced again. Local and instant; runs before any AI cleanup.
 */
export function applyDictionary(text: string, terms: readonly DictionaryTerm[]): string {
  if (terms.length === 0 || text === '') return text;
  const target = new Map<string, string>();
  for (const term of terms) {
    target.set(collapse(term.phrase), term.phrase);
    if (term.spokenAs) target.set(collapse(term.spokenAs), term.phrase);
  }
  // Longest first, so "get hub pages" wins over "get hub".
  const sources = [...target.keys()].sort((a, b) => b.length - a.length);
  const alternation = sources.map((s) => escape(s).replace(/ /g, '\\s+')).join('|');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`, 'giu');
  return text.replace(pattern, (match) => target.get(collapse(match)) ?? match);
}
