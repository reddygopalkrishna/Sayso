import {
  parseMessageRequest,
  parsePosition,
  phraseArgument,
  type CommandSpec,
} from '@sayso/command-grammar';

import { messageArgument } from './messageSentence.ts';

export interface InstantMatch {
  command: CommandSpec;
  /** The grammar phrase that matched, e.g. "click {label}". */
  phrase: string;
  /** Values for the phrase's {argument}, e.g. { label: "submit" }. Empty for plain phrases. */
  args: Record<string, string>;
  /** 1 = exact; below 1 = fuzzy (a close mis-hearing, e.g. "new tap"). */
  confidence: number;
}

interface Compiled {
  command: CommandSpec;
  phrase: string;
  /** The words before the {argument} (the whole phrase when it has none). */
  literal: string;
  literalWords: number;
  argName: string | null;
}

/**
 * Arguments that must make sense to count: "open the third email" is a position, but "open the
 * App Store" is not, so it stays "open" an app. A phrase whose argument passes its check wins over
 * an equally long phrase without a check.
 */
const ARGUMENT_CHECKS: Readonly<Record<string, (value: string) => boolean>> = {
  position: (value) => parsePosition(value) !== null,
  // Who and what: only a sentence that really names a person and a text counts.
  message: (value) => parseMessageRequest(value) !== null,
};

/** Fuzzy matching only for phrases this long, and only above this similarity. */
const FUZZY_MIN_LENGTH = 5;
const FUZZY_MIN_SIMILARITY = 0.85;

const POLITE_PREFIX = /^(?:please|can you|could you|would you|will you)\s+/;
const POLITE_SUFFIX = /\s+(?:please|thanks|thank you)$/;
const ARTICLE_PREFIX = /^(?:the|a|an|on the|on|my)\s+/;
const LABEL_SUFFIX = /\s+(?:button|link|icon)$/;
const APP_SUFFIX = /\s+(?:app|application|website|site|page)$/;
/** Words that name nothing: "click the button", "open it". They count as no argument at all. */
const GENERIC_ARGUMENT = new Set([
  'button',
  'link',
  'icon',
  'app',
  'it',
  'that',
  'this',
  'here',
  'there',
]);

/**
 * Mishearings of short commands, seen live ("NewTek", "NewTown", "He tender"). Applied only when
 * they are the whole utterance, so a sentence that happens to contain these words is untouched.
 */
const MISHEARD: ReadonlyMap<string, string> = new Map([
  ['newtek', 'new tab'],
  ['new tek', 'new tab'],
  ['new tech', 'new tab'],
  ['newtown', 'new tab'],
  ['new temp', 'new tab'],
  ['new tub', 'new tab'],
  ['he tender', 'hit enter'],
  ['hit tender', 'hit enter'],
  ['hit ender', 'hit enter'],
  ['scrolla', 'scroll down'],
  ['new chart', 'new chat'],
  ['new check', 'new chat'],
  ['a new chat', 'new chat'],
  ['a new chart', 'new chat'],
  ['openclaw', 'open claude'],
  ['open claw', 'open claude'],
]);

/** Lowercase words only (letters and digits, single spaces), without politeness words. */
export function normalizeUtterance(text: string): string {
  let n = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (let i = 0; i < 3; i++) {
    n = n.replace(POLITE_PREFIX, '').replace(POLITE_SUFFIX, '');
  }
  // "new chart" is never a real thing to say: "click new chart" and "open new chart" mean the chat.
  n = n.replace(/\bnew chart\b/g, 'new chat');
  // "faster result" is "first result" (heard live); the open-by-position command then takes it.
  n = n.replace(/\bfaster (result|link|item)\b/g, 'first $1');
  return MISHEARD.get(n) ?? n;
}

function cleanArgument(name: string, rest: string): string {
  let arg = rest;
  // A message keeps its first words as said ("message a friend…" is not an article).
  while (name !== 'message' && ARTICLE_PREFIX.test(arg)) arg = arg.replace(ARTICLE_PREFIX, '');
  // "open GitHub app" / "open GitHub website" keep their last word: the resolver reads it as a
  // preference (and remembers it). Only "click ... button" and "switch to ... app" drop theirs.
  if (name === 'label') arg = arg.replace(LABEL_SUFFIX, '');
  else if (name === 'app') arg = arg.replace(APP_SUFFIX, '');
  arg = arg.trim();
  return GENERIC_ARGUMENT.has(arg) ? '' : arg;
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j] ?? 0;
      prev[j] = Math.min(
        above + 1,
        (prev[j - 1] ?? 0) + 1,
        diagonal + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return prev[b.length] ?? 0;
}

function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}

/**
 * Matches a whole utterance (command mode, Fn+Shift) to commands.json: exact phrases first, then
 * phrases with an argument ("click Submit"), then close mis-hearings. Pure and local: no AI, well
 * under a millisecond.
 */
export class CommandEngine {
  private readonly compiled: readonly Compiled[];

  constructor(commands: readonly CommandSpec[]) {
    this.compiled = commands.flatMap((command) =>
      command.phrases.map((phrase) => {
        const argName = phraseArgument(phrase);
        const literal = argName ? phrase.slice(0, phrase.lastIndexOf(' ')) : phrase;
        return { command, phrase, literal, literalWords: literal.split(' ').length, argName };
      }),
    );
  }

  /**
   * A whole sentence as a list of commands: "open Chrome, new tab" → two steps. Returns null when
   * the sentence is not exactly one command or a chain of known commands (so nothing runs).
   */
  matchChain(text: string): InstantMatch[] | null {
    text = joinBeforeMessage(text);
    // An explicit joint (comma, "then") wins: "open Chrome, new tab" is two steps, not "open" a
    // target called "Chrome new tab". Without a joint, or when a part is not a command, the
    // whole sentence is tried as one command. A message is never cut up: from the part that says
    // "message …" to the end, everything is the message (it may contain commas and "then").
    const segments = splitSegments(text);
    const at = segments.findIndex((seg) => messageArgument(text.slice(seg.start)) !== null);
    if (at >= 0) {
      const steps: InstantMatch[] = [];
      for (const seg of segments.slice(0, at)) {
        const step = this.match(seg.text);
        if (!step) return null;
        steps.push(step);
      }
      const message = this.match(text.slice(segments[at]?.start ?? 0));
      if (!message || steps.length + 1 > MAX_CHAIN_STEPS) return null;
      return [...steps, message];
    }
    const parts = splitChain(text);
    if (parts.length >= 2 && parts.length <= MAX_CHAIN_STEPS) {
      const steps: InstantMatch[] = [];
      for (const part of parts) {
        const step = this.match(part);
        if (!step) break;
        steps.push(step);
      }
      if (steps.length === parts.length) return steps;
    }
    const single = this.match(text);
    return single ? [single] : null;
  }

  match(text: string): InstantMatch | null {
    const message = this.matchMessage(text);
    if (message) return message;
    const n = normalizeUtterance(text);
    if (n === '') return null;
    return this.matchExact(n) ?? this.matchWithArgument(n) ?? this.matchFuzzy(n);
  }

  /** A spoken message keeps its words exactly as said (see messageSentence.ts). */
  private matchMessage(text: string): InstantMatch | null {
    const arg = messageArgument(text);
    if (arg === null) return null;
    const c = this.compiled.find((x) => x.command.action.type === 'sendMessage');
    return c
      ? { command: c.command, phrase: c.phrase, args: { message: arg }, confidence: 1 }
      : null;
  }

  private matchExact(n: string): InstantMatch | null {
    const hit = this.compiled.find((c) => c.argName === null && c.literal === n);
    return hit ? { command: hit.command, phrase: hit.phrase, args: {}, confidence: 1 } : null;
  }

  private matchWithArgument(n: string): InstantMatch | null {
    let best: { c: Compiled; arg: string } | null = null;
    for (const c of this.compiled) {
      if (!c.argName || !n.startsWith(`${c.literal} `)) continue;
      const arg = cleanArgument(c.argName, n.slice(c.literal.length + 1));
      if (arg === '') continue;
      const check = ARGUMENT_CHECKS[c.argName];
      if (check && !check(arg)) continue;
      const longer = !best || c.literal.length > best.c.literal.length;
      const sameButChecked =
        best !== null &&
        c.literal.length === best.c.literal.length &&
        check !== undefined &&
        ARGUMENT_CHECKS[best.c.argName ?? ''] === undefined;
      if (longer || sameButChecked) best = { c, arg };
    }
    return best && this.build(best.c, best.arg, 1);
  }

  private matchFuzzy(n: string): InstantMatch | null {
    const words = n.split(' ');
    let best: { c: Compiled; arg: string; score: number } | null = null;
    for (const c of this.compiled) {
      if (c.literal.length < FUZZY_MIN_LENGTH) continue;
      let heard: string;
      let arg = '';
      if (c.argName) {
        if (words.length <= c.literalWords) continue;
        heard = words.slice(0, c.literalWords).join(' ');
        arg = cleanArgument(c.argName, words.slice(c.literalWords).join(' '));
        if (arg === '') continue;
        const check = ARGUMENT_CHECKS[c.argName];
        if (check && !check(arg)) continue;
      } else {
        heard = n;
      }
      const score = similarity(heard, c.literal);
      if (score >= FUZZY_MIN_SIMILARITY && (!best || score > best.score)) best = { c, arg, score };
    }
    return best && this.build(best.c, best.arg, best.score);
  }

  private build(c: Compiled, arg: string, confidence: number): InstantMatch {
    return {
      command: c.command,
      phrase: c.phrase,
      args: c.argName ? { [c.argName]: arg } : {},
      confidence,
    };
  }
}

/** Most commands one sentence may chain. More than this is refused, so nothing runs by accident. */
export const MAX_CHAIN_STEPS = 4;

/**
 * "open WhatsApp and send hi to Ravi": a bare "and" is not a joint, except right before a message
 * ("open Tom and Jerry" stays one command). That one "and" becomes a comma.
 */
function joinBeforeMessage(text: string): string {
  for (const m of text.matchAll(/\s+and\s+/gi)) {
    if (messageArgument(text.slice(m.index + m[0].length)) !== null) {
      return `${text.slice(0, m.index)}, ${text.slice(m.index + m[0].length)}`;
    }
  }
  return text;
}

/**
 * Splits a sentence into steps at explicit joints only: a comma, a semicolon, "then" or "and
 * then". A bare "and" is not a joint ("open Tom and Jerry" must stay one command).
 */
export function splitChain(text: string): string[] {
  return splitSegments(text).map((seg) => seg.text);
}

/** The parts of a sentence between joints, with where each starts in the original text. */
function splitSegments(text: string): Array<{ text: string; start: number }> {
  const joint = /\s*(?:[,;]|\b(?:and\s+)?then\b)\s*/gi;
  const segments: Array<{ text: string; start: number }> = [];
  let from = 0;
  const push = (end: number): void => {
    const raw = text.slice(from, end);
    const trimmed = raw.trim();
    if (trimmed !== '') segments.push({ text: trimmed, start: from + raw.indexOf(trimmed) });
  };
  for (const m of text.matchAll(joint)) {
    push(m.index);
    from = m.index + m[0].length;
  }
  push(text.length);
  return segments;
}

/** Fills {label}, {target} or {app} in a command label ("Click “{label}”") from the matched args. */
export function fillLabel(label: string, args: Readonly<Record<string, string>>): string {
  return label.replace(/\{([a-z]+)\}/g, (_match, key: string) => args[key] ?? '');
}
