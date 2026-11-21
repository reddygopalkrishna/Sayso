import type { CommandSpec } from '@sayso/command-grammar';
import type { TranscriptSegment, TranscriptWord } from '../stt/types.ts';

export interface CommandMatch {
  command: CommandSpec;
  /** The phrase as matched, e.g. "send it". */
  phrase: string;
  /** Silence before the command's first word; null when the command was said on its own. */
  gapMs: number | null;
}

export interface RoutingDecision {
  /** Text to clean up and insert ('' when the utterance was only a command). */
  dictation: string;
  /** Trailing end command to run after inserting, if the pause rule matched and it is allowed. */
  command: CommandMatch | null;
  /** Why a trailing command phrase stayed text (for logs and tests). */
  keptAsText?: 'no_pause' | 'not_allowed';
}

export interface RouteOptions {
  endCommands: readonly CommandSpec[];
  /** Minimum silence before an end command (TECHNICAL_ARCHITECTURE §5.3); default 600 ms. */
  pauseMs: number;
  /** Context check (blocked apps now; the SafetyGate in step 5). Not allowed → stays text. */
  isAllowed: (command: CommandSpec) => boolean;
}

/** Lowercase letters and digits only: "Send." → "send", "p.m." → "pm". */
export function normalizeWord(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * The pause rule, on the raw transcript (before cleanup): the last words are an end command
 * ("send", "new line", "send it") only if they are said alone, after a pause of at least
 * `pauseMs`, and the command is allowed here. Everything else is dictation.
 */
export function route(segment: TranscriptSegment, opts: RouteOptions): RoutingDecision {
  const asText: RoutingDecision = { dictation: segment.text, command: null };
  const words = segment.words.filter((w) => normalizeWord(w.text) !== '');
  if (words.length === 0) return asText;

  const match = matchTrailing(words, opts.endCommands);
  if (!match) return asText;

  const first = words[words.length - match.length];
  const before = words[words.length - match.length - 1];
  const gapMs = before && first ? first.startMs - before.endMs : null;
  if (gapMs !== null && gapMs < opts.pauseMs) return { ...asText, keptAsText: 'no_pause' };
  if (!opts.isAllowed(match.command)) return { ...asText, keptAsText: 'not_allowed' };

  return {
    dictation: stripTrailingPhrase(segment.text, match.phrase, words.slice(0, -match.length)),
    command: { command: match.command, phrase: match.phrase, gapMs },
  };
}

/** Longest end-command phrase that equals the last words. */
function matchTrailing(
  words: readonly TranscriptWord[],
  commands: readonly CommandSpec[],
): { command: CommandSpec; phrase: string; length: number } | null {
  const tail = words.map((w) => normalizeWord(w.text));
  let best: { command: CommandSpec; phrase: string; length: number } | null = null;
  for (const command of commands) {
    for (const phrase of command.phrases) {
      const parts = phrase.split(' ');
      if (parts.length > tail.length || (best && parts.length <= best.length)) continue;
      const last = tail.slice(-parts.length);
      if (parts.every((p, i) => p === last[i])) best = { command, phrase, length: parts.length };
    }
  }
  return best;
}

/**
 * Removes the command from the end of the transcript text, keeping the punctuation the user's
 * sentence ended with ("…tomorrow? Send." → "…tomorrow?"). Falls back to the remaining words.
 */
function stripTrailingPhrase(
  text: string,
  phrase: string,
  remaining: readonly TranscriptWord[],
): string {
  const body = phrase
    .split(' ')
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s,.\\-]+');
  const pattern = new RegExp(`(?:^|[\\s,;:\\u2013\\u2014-]+)${body}[\\s.,!?\\u2026]*$`, 'iu');
  if (pattern.test(text)) return text.replace(pattern, '').trim();
  return remaining
    .map((w) => w.text)
    .join(' ')
    .trim();
}
