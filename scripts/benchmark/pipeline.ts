/**
 * The same text steps Sayso runs after speech-to-text, taken from the app's own code so the
 * benchmark cannot drift from the product: built-in names and your dictionary, local cleanup,
 * optional AI cleanup, and web-address formatting.
 */
import { commands } from '../../packages/command-grammar/src/index.ts';
import { BUILT_IN_TERMS } from '../../apps/desktop/src/main/core/cleanup/builtInTerms.ts';
import { applyDictionary } from '../../apps/desktop/src/main/core/cleanup/dictionary.ts';
import { TextCleanup } from '../../apps/desktop/src/main/core/cleanup/TextCleanup.ts';
import { fixWebAddresses } from '../../apps/desktop/src/main/core/cleanup/webAddress.ts';
import type { LLMProvider } from '../../apps/desktop/src/main/core/cleanup/types.ts';
import { CommandEngine } from '../../apps/desktop/src/main/core/commands/CommandEngine.ts';
import type { Interpreter } from '../../apps/desktop/src/main/core/interpret/Interpreter.ts';
import { stripNonSpeech } from '../../apps/desktop/src/main/core/stt/normalize.ts';

export const engine = new CommandEngine(commands);

export interface TextResult {
  text: string;
  /** How it was cleaned: light (local rules), local (AI not needed), llm, fallback. */
  method: string;
}

/** Dictation: what Sayso would type for these words, in a general app (default style). */
export async function sayso(raw: string, provider: LLMProvider | null): Promise<TextResult> {
  const cleanup = new TextCleanup({
    provider,
    level: () => (provider ? 'full' : 'light'),
    dictionary: () => BUILT_IN_TERMS,
    skipWhenClean: () => true,
    timeoutMs: 4_000,
  });
  const result = await cleanup.clean({
    rawText: stripNonSpeech(raw),
    bundleId: 'com.apple.Notes',
    appName: 'Notes',
  });
  return { text: fixWebAddresses(result.text), method: result.method };
}

/** Command mode applies the dictionary to what was heard, then matches the grammar. */
export function commandIdFor(heard: string, withDictionary: boolean): string | null {
  const text = stripNonSpeech(heard);
  const prepared = withDictionary ? applyDictionary(text, BUILT_IN_TERMS) : text;
  return engine.matchChain(prepared)?.[0]?.command.id ?? null;
}

/** The interpreter, asked only when no exact command matched, as in the app (no screen here). */
export async function interpretedCommandId(
  heard: string,
  interpreter: Interpreter,
): Promise<string | null> {
  const plan = await interpreter.interpret({
    utterance: applyDictionary(stripNonSpeech(heard), BUILT_IN_TERMS),
    appName: 'Google Chrome',
    screen: [],
  });
  const first = plan?.steps[0];
  return first?.kind === 'command' ? first.match.command.id : null;
}
