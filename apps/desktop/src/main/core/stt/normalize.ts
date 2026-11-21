import type { TranscriptWord } from './types.ts';

// Whisper marks non-speech as "[BLANK_AUDIO]", "(upbeat music)", "*laughs*" and similar.
const NON_SPEECH =
  '(?:(?:soft|upbeat|dramatic|gentle|background)\\s+)?(?:music|silence|inaudible|laughs?|laughing|laughter|applause|noise|static|sighs?|coughs?|clears throat|blank[_ ]audio|no speech|typing|clicking|beep)';
const BRACKETED = /\[[^\]]*\]/g;
const PAREN_OR_STAR = new RegExp(`\\(\\s*${NON_SPEECH}\\s*\\)|\\*\\s*${NON_SPEECH}\\s*\\*`, 'gi');

/** Removes Whisper's non-speech markers and collapses whitespace. */
export function stripNonSpeech(text: string): string {
  return text.replace(BRACKETED, ' ').replace(PAREN_OR_STAR, ' ').replace(/\s+/g, ' ').trim();
}

/** Drops words that are only non-speech markers or bracket fragments. */
export function cleanWords(words: readonly TranscriptWord[]): TranscriptWord[] {
  return words
    .map((w) => ({ ...w, text: w.text.trim() }))
    .filter((w) => stripNonSpeech(w.text).replace(/^[[\]()*_]+$/, '') !== '');
}
