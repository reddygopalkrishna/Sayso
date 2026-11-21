/** Apps Sayso knows the steps for when sending a message by voice. */
export type MessageApp = 'slack' | 'whatsapp';

export interface MessageRequest {
  /** The app named in the sentence ("on Slack"), or null when it was not named. */
  app: MessageApp | null;
  /** Who to message, as said (one to four words). */
  name: string;
  /** What to send, as said. */
  text: string;
}

const APP_CLAUSE = '(?:on|in|via|using|through)\\s+(slack|whats\\s?app)';
/** Words that end the name and start the text: "Priya saying I will be late". */
const MARKER = /\s+(?:saying|says|that says|that|to say|and say|say)\s+/i;
const APP_AT_END = new RegExp(`\\s+${APP_CLAUSE}$`, 'i');
const APP_AT_START = new RegExp(`^${APP_CLAUSE}(?:\\s+|$)`, 'i');
const MARKER_WORDS = new Set(['saying', 'says', 'that', 'say']);
const NAME_WORD = /^[\p{L}\p{N}][\p{L}\p{N}'.-]*$/u;
const MAX_NAME_WORDS = 4;

const appFrom = (word: string | undefined): MessageApp | null =>
  word === undefined ? null : word.toLowerCase().startsWith('slack') ? 'slack' : 'whatsapp';

/**
 * Splits what follows "message …" or "send a message to …" into who, what and (optionally) which
 * app. Deterministic, with no guessing:
 *  - "Priya saying I will be late": the words "saying", "that", "say" end the name;
 *  - "Priya on Slack I will be late": without such a word the name is the first word, then an
 *    optional "on Slack" or "on WhatsApp", then the text.
 * Returns null when there is no name or no text, or the name is too long to be a name.
 */
export function parseMessageRequest(input: string): MessageRequest | null {
  let rest = input.trim().replace(/\s+/g, ' ');
  rest = rest.replace(/^to\s+/i, '');
  if (rest === '') return null;

  let nameSide: string;
  let text: string;
  let app: MessageApp | null = null;

  const marker = MARKER.exec(rest);
  if (marker && marker.index > 0) {
    nameSide = rest.slice(0, marker.index);
    text = rest.slice(marker.index + marker[0].length);
    const clause = APP_AT_END.exec(nameSide);
    if (clause) {
      app = appFrom(clause[1]);
      nameSide = nameSide.slice(0, clause.index);
    }
  } else {
    const space = rest.indexOf(' ');
    if (space < 0) return null;
    nameSide = rest.slice(0, space);
    text = rest.slice(space + 1);
    const clause = APP_AT_START.exec(text);
    if (clause) {
      app = appFrom(clause[1]);
      text = text.slice(clause[0].length);
    }
  }

  const nameWords = nameSide.trim().split(' ').filter(Boolean);
  if (nameWords.length === 0 || nameWords.length > MAX_NAME_WORDS) return null;
  if (!nameWords.every((w) => NAME_WORD.test(w))) return null;
  text = text.trim();
  if (text === '' || MARKER_WORDS.has(text.toLowerCase())) return null;
  if (nameWords.some((w) => MARKER_WORDS.has(w.toLowerCase()))) return null;
  return { app, name: nameWords.join(' '), text };
}
