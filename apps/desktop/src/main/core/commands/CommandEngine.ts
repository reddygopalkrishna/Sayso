import { phraseArgument, type CommandSpec } from '@sayso/command-grammar';

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
  return n;
}

function cleanArgument(name: string, rest: string): string {
  let arg = rest;
  while (ARTICLE_PREFIX.test(arg)) arg = arg.replace(ARTICLE_PREFIX, '');
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

  match(text: string): InstantMatch | null {
    const n = normalizeUtterance(text);
    if (n === '') return null;
    return this.matchExact(n) ?? this.matchWithArgument(n) ?? this.matchFuzzy(n);
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
      if (!best || c.literal.length > best.c.literal.length) best = { c, arg };
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

/** Fills {label}, {target} or {app} in a command label ("Click “{label}”") from the matched args. */
export function fillLabel(label: string, args: Readonly<Record<string, string>>): string {
  return label.replace(/\{([a-z]+)\}/g, (_match, key: string) => args[key] ?? '');
}
