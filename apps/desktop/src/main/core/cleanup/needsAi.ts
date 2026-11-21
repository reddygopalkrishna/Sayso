export interface NeedsAiResult {
  needed: boolean;
  /** Why the AI is (or is not) needed; shown in the log. */
  reason: string;
}

/** A short utterance is one the local rules can finish. Longer ones are where the AI earns its time. */
export const MAX_LOCAL_WORDS = 12;

const TERMINAL_PUNCTUATION = /[.?!…]["')\]]*$/;

// Anything that hints the speaker said something the local rules cannot sort out. Deliberately
// broad: a wrong "no AI needed" costs quality, a wrong "AI needed" only costs ~0.8 s.
const CUES: ReadonlyArray<readonly [reason: string, pattern: RegExp]> = [
  [
    'a filler or hedge',
    /\b(?:you know|i mean|like|sort of|kind of|basically|actually|literally)\b/i,
  ],
  [
    'a possible correction',
    /\b(?:no|wait|sorry|scratch that|never ?mind|rather|instead|correction|oops)\b/i,
  ],
  [
    'numbered points',
    /\b(?:first|second|third|fourth|fifth|(?:number|step|point|item)\s+(?:one|two|three|four|five|\d+))\b/i,
  ],
  ['a spoken line break', /\b(?:new line|next line|new paragraph)\b/i],
  ['a spoken address (dot / at)', /\bdot\b|\bat\b.+\bdot\b/i],
];

/**
 * Decides whether a transcript, after the local cleanup, still needs the AI. It does not for a
 * short, already-punctuated sentence with none of the cues above: the local rules produce what the
 * AI would. This saves the whole AI round trip (0.6–2 s) on short dictations (about a quarter of
 * a chatty user's, fewer for someone who dictates long passages).
 *
 * For casual text a missing closing full stop is accepted, so "open activity monitor" is left as
 * is; professional text needs it.
 */
export function needsAi(
  text: string,
  options: { tone?: 'casual' | 'professional' } = {},
): NeedsAiResult {
  const trimmed = text.trim();
  if (trimmed === '') return { needed: false, reason: 'empty' };
  const words = trimmed.split(/\s+/).length;
  if (words > MAX_LOCAL_WORDS)
    return { needed: true, reason: `${words} words (more than ${MAX_LOCAL_WORDS})` };
  // A closing full stop is optional in a chat message but expected in mail and documents.
  if (options.tone === 'professional' && !TERMINAL_PUNCTUATION.test(trimmed)) {
    return { needed: true, reason: 'no closing punctuation' };
  }
  for (const [reason, pattern] of CUES) {
    if (pattern.test(trimmed)) return { needed: true, reason };
  }
  return { needed: false, reason: 'short and clean' };
}
