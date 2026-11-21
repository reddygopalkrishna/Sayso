import { formatLists } from './lists.ts';

// Local cleanup with no AI: used for Light level, literal apps, and as the fallback when the LLM
// fails or is too slow. Conservative on purpose: it only removes what is never meant to be typed.

const FILLERS = /(^|[\s,.;!?])(?:um+|uh+|uhm+|erm+|er|ah+|hmm+|mhm|mm+)(?=$|[\s,.;!?])[,]?/gi;
// Doubled words that are often correct English.
const VALID_DOUBLES = new Set(['had', 'that', 'is', 'do', 'bye', 'very', 'so', 'no', 'yes']);

export interface LightOptions {
  /** Literal apps (terminal, code) keep their casing and repeats; only fillers go. */
  literal?: boolean;
}

/** Removes hesitation sounds and, unless literal, stuttered repeats ("I I think"); tidies spacing. */
export function lightCleanup(text: string, options: LightOptions = {}): string {
  let out = text.replace(FILLERS, '$1');
  if (!options.literal) {
    out = out.replace(/\b(\w+)((?:\s+\1\b)+)/gi, (match, word: string) =>
      VALID_DOUBLES.has(word.toLowerCase()) ? match : word,
    );
  }
  out = out
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([,;])(?:\s*[,;])+/g, '$1')
    .replace(/^[\s,;.]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!options.literal && out.length > 0) out = out.charAt(0).toUpperCase() + out.slice(1);
  return options.literal ? out : formatLists(out);
}
