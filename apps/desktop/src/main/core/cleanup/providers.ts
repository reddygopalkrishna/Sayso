import { ChainedProvider } from './ChainedProvider.ts';
import { GeminiProvider } from './gemini.ts';
import { OpenAICompatProvider } from './openaiCompat.ts';
import type { LLMProvider } from './types.ts';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
/** Measured 14 Nov 2026: about 0.2 s, careful on short text. Groq's lineup changes: set SAYSO_FAST_MODEL. */
export const DEFAULT_FAST_MODEL = 'qwen/qwen3.8-27b';

export interface ProviderConfig {
  geminiApiKey: string | null;
  geminiModel: string | undefined;
  groqApiKey: string | null;
  fastModel: string;
  /** auto: Groq first if there is a key, then Gemini. gemini / groq: only that one. */
  aiProvider: 'auto' | 'gemini' | 'groq';
}

/** Reasoning models think before answering, which costs seconds: ask them not to (or to barely). */
export function groqRequestExtras(model: string): Record<string, unknown> {
  if (/^qwen/i.test(model)) return { reasoning_effort: 'none' };
  if (/gpt-oss/i.test(model)) return { reasoning_effort: 'low' };
  return {};
}

export interface BuiltProvider {
  provider: LLMProvider | null;
  /** For the status screen, e.g. "groq · qwen/qwen3.8-27b, then gemini · gemini-flash-lite-latest". */
  label: string | null;
  /** How long cleanup may take in total before the local text is used. */
  timeoutMs: number;
}

/** Picks the AI provider(s) from the config. Groq first when it has a key, Gemini as the fallback. */
export function buildProvider(
  config: ProviderConfig,
  log: (message: string) => void = () => undefined,
): BuiltProvider {
  const groq =
    config.groqApiKey && config.aiProvider !== 'gemini'
      ? new OpenAICompatProvider({
          name: 'groq',
          apiKey: config.groqApiKey,
          baseUrl: GROQ_BASE_URL,
          model: config.fastModel,
          extraBody: groqRequestExtras(config.fastModel),
        })
      : null;
  const gemini =
    config.geminiApiKey && config.aiProvider !== 'groq'
      ? new GeminiProvider({ apiKey: config.geminiApiKey, model: config.geminiModel })
      : null;

  if (groq && gemini) {
    const chain = new ChainedProvider(groq, gemini, {
      onFallback: ({ from, to, reason, coolingDown }) =>
        log(
          `[cleanup] ${from} failed (${reason}); using ${to}${coolingDown ? ' and pausing ' + from : ''}`,
        ),
    });
    // The first provider gets 1.5 s; the second still needs its own time.
    return {
      provider: chain,
      label: `${groq.name} · ${groq.model}, then ${gemini.name} · ${gemini.model}`,
      timeoutMs: 4_000,
    };
  }
  const only = groq ?? gemini;
  return {
    provider: only,
    label: only ? `${only.name} · ${only.model}` : null,
    timeoutMs: 2_500,
  };
}
