import { applyDictionary, containsPhrase, type DictionaryTerm } from './dictionary.ts';
import { lightCleanup } from './light.ts';
import { needsAi } from './needsAi.ts';
import { toneForApp } from './tone.ts';
import type { CleanupLevel, LLMProvider, Tone } from './types.ts';

export interface CleanupInput {
  rawText: string;
  bundleId: string | null;
  appName: string | null;
}

/**
 * How the text was produced: off (raw), light (local rules, by choice), local (local rules because
 * the AI was not needed), llm, or fallback (the AI failed or was not trusted).
 */
export type CleanupMethod = 'off' | 'light' | 'local' | 'llm' | 'fallback';

export interface CleanupResult {
  text: string;
  method: CleanupMethod;
  tone: Tone;
  ms: number;
  /** Why the LLM result was not used, when method is 'fallback'. */
  fallbackReason?: string;
  /** Why the AI was skipped, when method is 'local'. */
  note?: string;
  /** Which AI produced the text (e.g. "groq"), when method is 'llm'. */
  provider?: string;
}

export interface TextCleanupOptions {
  provider: LLMProvider | null;
  level: () => CleanupLevel;
  /** Your own words: spelled correctly by a local pass, and sent to the AI as exact spellings. */
  dictionary?: () => readonly DictionaryTerm[];
  toneOverrides?: () => Readonly<Record<string, Tone>>;
  /** Skip the AI for short text the local rules can finish (see needsAi.ts). */
  skipWhenClean?: () => boolean;
  /** Past this the local cleanup is used, so dictation never stalls on the network. */
  timeoutMs?: number;
  now?: () => number;
}

/**
 * Raw transcript → text to insert. Picks the tone from the target app, calls the LLM for Full
 * cleanup, and falls back to local Light cleanup on any failure or suspicious output.
 */
export class TextCleanup {
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: TextCleanupOptions) {
    this.timeoutMs = opts.timeoutMs ?? 2_500;
    this.now = opts.now ?? Date.now;
  }

  async clean(input: CleanupInput): Promise<CleanupResult> {
    const started = this.now();
    const tone = toneForApp(input.bundleId, this.opts.toneOverrides?.());
    const done = (
      text: string,
      method: CleanupMethod,
      fallbackReason?: string,
      note?: string,
    ): CleanupResult => ({
      text,
      method,
      tone,
      ms: this.now() - started,
      ...(fallbackReason ? { fallbackReason } : {}),
      ...(note ? { note } : {}),
    });

    const level = this.opts.level();
    if (level === 'off') return done(input.rawText, 'off');
    const terms = this.opts.dictionary?.() ?? [];
    const spelled = applyDictionary(input.rawText, terms);
    const light = lightCleanup(spelled, { literal: tone === 'literal' });
    if (level === 'light' || tone === 'literal' || !this.opts.provider) return done(light, 'light');
    // Nothing left to clean (e.g. the user only said "um").
    if (light === '') return done('', 'light');
    if (this.opts.skipWhenClean?.()) {
      const decision = needsAi(light, {
        tone: tone === 'professional' ? 'professional' : 'casual',
      });
      if (!decision.needed) return done(light, 'local', undefined, decision.reason);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const output = await this.opts.provider.cleanup(
        {
          rawText: spelled,
          tone,
          dictionary: [...new Set(terms.map((t) => t.phrase))],
          appName: input.appName,
        },
        controller.signal,
      );
      const checked = checkOutput(spelled, output);
      if (!checked.ok) return done(light, 'fallback', checked.reason);
      // Spelling fixes ("say so" → Sayso) were already made locally, so the AI never needs to add
      // one of your words. If it did, it replaced an ordinary word with it: do not trust the answer.
      const invented = terms.find(
        (t) => containsPhrase(checked.text, t.phrase) && !containsPhrase(spelled, t.phrase),
      );
      if (invented) {
        return done(light, 'fallback', `the AI added the dictionary word “${invented.phrase}”`);
      }
      return {
        ...done(checked.text, 'llm'),
        provider: this.opts.provider.lastUsed?.() ?? this.opts.provider.name,
      };
    } catch (error) {
      return done(light, 'fallback', error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timer);
    }
  }
}

type Checked = { ok: true; text: string } | { ok: false; reason: string };

/** Rejects output that is empty, wrapped, or much longer than the input (added content). */
export function checkOutput(raw: string, output: string): Checked {
  let text = output.trim();
  // Undo common wrappers: code fences, our own tags, surrounding quotes.
  text = text.replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
  text = text.replace(/^<transcript>\s*|\s*<\/transcript>$/g, '').trim();
  if (/^["“].*["”]$/s.test(text) && !/^["“].*["”]$/s.test(raw.trim()))
    text = text.slice(1, -1).trim();
  if (text === '') return { ok: false, reason: 'empty output' };
  if (text.length > raw.length * 1.6 + 40)
    return { ok: false, reason: 'output much longer than input' };
  return { ok: true, text };
}
