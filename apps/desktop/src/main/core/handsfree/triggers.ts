import type { TranscriptSegment } from '../stt/types.ts';

/** What a hands-free utterance asks for. */
export type HandsFreeIntent =
  /** "type …": the words after "type", with their timings (so a trailing "send" still works). */
  | { kind: 'dictate'; segment: TranscriptSegment }
  /** A voice command: the segment text is what the command matcher reads. */
  | { kind: 'command'; segment: TranscriptSegment };

export interface TriggerOptions {
  /** One lowercase word, e.g. "sayso". Needed before commands, unless Sayso is awake. */
  wakeWord: string;
  /** True for a minute after a recognised trigger: commands then work without the wake word. */
  awake: boolean;
  /** Whether the text is one command or a chain of commands. */
  isCommand: (text: string) => boolean;
}

export interface TriggerResult {
  intent: HandsFreeIntent | null;
  /** The utterance was a trigger (type, open, send it, the wake word): it extends the awake time. */
  triggered: boolean;
}

/** The short commands that work with no wake word, said on their own. */
const ALWAYS_ON = new Set(['send it', 'send', 'enter', 'press enter', 'new line']);

const norm = (word: string): string => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const normText = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * "Stop listening", "turn off hands-free", "hands-free off", "go to sleep": turns hands-free off by
 * voice. Whole utterance only, so a sentence that merely contains these words is not a stop.
 */
const STOP_LISTENING =
  /^(?:(?:please|ok|okay|hey)\s+)?(?:(?:stop|quit|exit|end|pause)\s+(?:listening|hands\s?free(?:\s+mode)?)|(?:turn|switch)\s+(?:off|of)\s+(?:hands\s?free(?:\s+mode)?|listening)|(?:turn|switch)\s+(?:hands\s?free(?:\s+mode)?|listening)\s+off|hands\s?free(?:\s+mode)?\s+off|go\s+to\s+sleep|disable\s+hands\s?free(?:\s+mode)?)$/;

export function isStopListening(text: string): boolean {
  return STOP_LISTENING.test(normText(text));
}

/** Removes the first word and the punctuation after it ("Type, hello" → "hello"). */
function afterFirstWord(segment: TranscriptSegment): TranscriptSegment {
  const text = segment.text.replace(/^\s*[^\s]+[\s,:;.\-–—]*/u, '').trimStart();
  return { ...segment, text, words: segment.words.slice(1) };
}

/**
 * Decides what a hands-free utterance is. Only three things are acted on without the wake word:
 * "type …", "send it" / "enter" / "new line", and "open …". Anything else is ignored, never
 * typed, so a conversation in the room cannot end up in the focused field.
 */
export function classifyHeard(segment: TranscriptSegment, options: TriggerOptions): TriggerResult {
  const first = norm(segment.text.trim().split(/\s+/)[0] ?? '');
  const whole = normText(segment.text);
  const none: TriggerResult = { intent: null, triggered: false };
  if (first === '' || whole === '') return none;

  // "type hello there" → the words after "type", typed like a dictation.
  if (first === 'type') {
    const rest = afterFirstWord(segment);
    return rest.text === ''
      ? { intent: null, triggered: true }
      : { intent: { kind: 'dictate', segment: rest }, triggered: true };
  }

  // "Sayso, new tab" or "Sayso, log me in" → a command, in the person's own words if need be
  // (the pipeline asks the interpreter when no exact command matches).
  if (first === options.wakeWord) {
    const rest = afterFirstWord(segment);
    return rest.text === ''
      ? { intent: null, triggered: true }
      : { intent: { kind: 'command', segment: rest }, triggered: true };
  }

  // "open Slack", and the short commands said alone.
  if ((first === 'open' || ALWAYS_ON.has(whole)) && options.isCommand(segment.text)) {
    return { intent: { kind: 'command', segment }, triggered: true };
  }

  // Awake: a command works with no wake word.
  if (options.awake && options.isCommand(segment.text)) {
    return { intent: { kind: 'command', segment }, triggered: true };
  }
  return none;
}
