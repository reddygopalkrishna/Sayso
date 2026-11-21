import { parseMessageRequest } from '@sayso/command-grammar';

const POLITE_PREFIX = /^(?:please|can you|could you|would you|will you)\s+/i;
const MARKER = '(saying|that says|that|to say|and say|say)';

/**
 * Recognises a spoken message and returns what follows "message …", with the words exactly as
 * said (case, apostrophes and punctuation kept): everything after "saying" / "that says" is the
 * message, and is never read as commands. Forms:
 *   "message Priya on Slack saying I will be late"
 *   "send a message to Priya saying …" / "send message to Priya saying …"
 *   "send Priya a message saying …"
 *   "tell Priya that …" / "tell Priya to say …" (only with "that" or "to say": "tell Priya hello"
 *   could be a name and a text or something else, so it is not taken)
 * Null when the sentence is not one of these or has no name or no text.
 */
export function messageArgument(text: string): string | null {
  let raw = text.trim().replace(/\s+/g, ' ');
  for (let i = 0; i < 3; i++) raw = raw.replace(POLITE_PREFIX, '');
  let arg: string | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^message\s+(.+)$/i.exec(raw))) arg = m[1] ?? null;
  else if ((m = /^send(?: a)? message to\s+(.+)$/i.exec(raw))) arg = m[1] ?? null;
  else if ((m = new RegExp(`^send\\s+(.+?)\\s+a message\\s+${MARKER}\\s+(.+)$`, 'i').exec(raw)))
    arg = `${m[1]} ${m[2]} ${m[3]}`;
  else if ((m = /^tell\s+(.+?)\s+(?:that says|that|to say)\s+(.+)$/i.exec(raw)))
    arg = `${m[1]} saying ${m[2]}`;
  return arg !== null && parseMessageRequest(arg) !== null ? arg : null;
}

/** True when the sentence starts like a message (used to stop a chain from cutting it up). */
export function startsLikeMessage(text: string): boolean {
  return messageArgument(text) !== null;
}

/**
 * Finds `text` (a message the AI proposed) in what was really said, ignoring case and
 * punctuation, and returns the words exactly as said (with a trailing . ! or ?). Null when the
 * words are not all in the sentence in that order, so an AI can never rewrite a message.
 */
export function verbatimIn(utterance: string, text: string): string | null {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped.join('[^\\p{L}\\p{N}]+')}(?![\\p{L}\\p{N}])[.!?]*`,
    'iu',
  );
  return pattern.exec(utterance)?.[0] ?? null;
}
