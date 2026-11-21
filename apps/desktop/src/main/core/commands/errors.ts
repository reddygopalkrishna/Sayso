import { describeRefusal, type RefuseReason } from '../safety/SafetyGate.ts';

/**
 * A command word that needs more, said on its own ("open", "click it"): what to say next.
 * Speech often clips a short command to its first word, so the pill asks instead of failing.
 */
const NEEDS_MORE: Readonly<Record<string, string>> = {
  open: 'Open what? Say “open Slack”.',
  launch: 'Launch what? Say “launch Slack”.',
  start: 'Start what? Say “start Slack”.',
  click: 'Click what? Say “click Sign in”.',
  press: 'Press what? Say “press Submit”.',
  tap: 'Tap what? Say “tap Next”.',
  hit: 'Hit what? Say “hit Save”.',
  switch: 'Switch to which app? Say “switch to Chrome”.',
  focus: 'Focus which app? Say “focus Slack”.',
  message: 'Message who? Say “message Priya on Slack saying hello”.',
  tell: 'Tell who? Say “tell Priya that I am late”.',
};
/** Words after the command word that name nothing ("open it", "click the button"). */
const NAMES_NOTHING = new Set([
  'it',
  'that',
  'this',
  'app',
  'button',
  'link',
  'icon',
  'here',
  'there',
  'the',
  'a',
  'an',
]);

/** What to say next when `heard` is only a command word, or null. */
export function needsMoreHint(heard: string): string | null {
  const words = heard
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const [first, ...rest] = words;
  if (first === undefined || NEEDS_MORE[first] === undefined) return null;
  return rest.every((w) => NAMES_NOTHING.has(w)) ? (NEEDS_MORE[first] ?? null) : null;
}

/** Command mode heard something that is not a command. Nothing is typed. */
export class CommandNotUnderstood extends Error {
  constructor(readonly heard: string) {
    super(needsMoreHint(heard) ?? `Didn't catch a command: “${heard.trim()}”`);
    this.name = 'CommandNotUnderstood';
  }
}

/** The SafetyGate refused the command in this context. The message is shown on the pill. */
export class CommandRefused extends Error {
  constructor(
    readonly reason: RefuseReason | 'needs_confirmation',
    appName: string | null,
  ) {
    super(describeRefusal(reason, appName));
    this.name = 'CommandRefused';
  }
}

/** The command was understood and allowed, but could not be carried out. */
export class CommandFailed extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CommandFailed';
  }
}
