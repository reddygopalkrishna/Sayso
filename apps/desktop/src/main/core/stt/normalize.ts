import type { TranscriptWord } from './types.ts';

// Whisper marks non-speech as "[BLANK_AUDIO]", "(upbeat music)", "*laughs*" and similar.
const NON_SPEECH =
  '(?:(?:soft|upbeat|dramatic|gentle|background)\\s+)?(?:music|silence|inaudible|laughs?|laughing|laughter|applause|noise|static|sighs?|coughs?|clears throat|blank[_ ]audio|no speech|typing|clicking|beep)';
const BRACKETED = /\[[^\]]*\]/g;
const PAREN_OR_STAR = new RegExp(`\\(\\s*${NON_SPEECH}\\s*\\)|\\*\\s*${NON_SPEECH}\\s*\\*`, 'gi');

// What Whisper invents out of near-silence (it was trained on video subtitles). Dropped only when
// it is the whole transcript, so a real sentence that mentions watching is never touched.
const INVENTED =
  /^(?:thanks?(?:\s+you)?\s+(?:so\s+much\s+)?for\s+(?:watching|listening)(?:\s+(?:this\s+video|everyone|guys))?|please\s+(?:like\s+and\s+)?subscribe(?:\s+to\s+(?:my|the)\s+channel)?|(?:like\s+and\s+)?subscribe(?:\s+to\s+the\s+channel)?|subtitles?\s+by\s+.{1,60}|see\s+you\s+(?:in\s+the\s+)?next\s+(?:video|time))[\s.!?,]*$/i;

/** Removes Whisper's non-speech markers and collapses whitespace. */
export function stripNonSpeech(text: string): string {
  const cleaned = text
    .replace(BRACKETED, ' ')
    .replace(PAREN_OR_STAR, ' ')
    // Whisper writes "- Yes. - No." for turns of a conversation: a leading or between-sentences dash
    // is a marker, not text ("- Delete last word." must still be the command).
    .replace(/^\s*[-\u2013\u2014\u2022]+\s+/, '')
    .replace(/([.!?])\s+[-\u2013\u2014]+\s+/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
  return INVENTED.test(cleaned) ? '' : cleaned;
}

/** Drops words that are only non-speech markers or bracket fragments. */
export function cleanWords(words: readonly TranscriptWord[]): TranscriptWord[] {
  return words
    .map((w) => ({ ...w, text: w.text.trim() }))
    .filter((w) => stripNonSpeech(w.text).replace(/^[[\]()*_]+$/, '') !== '');
}
