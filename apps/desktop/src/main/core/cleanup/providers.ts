import { ChainedProvider, type ChainOptions } from './ChainedProvider.ts';
import { GeminiProvider } from './gemini.ts';
import { OpenAICompatProvider } from './openaiCompat.ts';
import type { LLMProvider } from './types.ts';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
/** Measured 14 Nov 2026: about 0.2 s, careful on short text. Groq's lineup changes: set SAYSO_FAST_MODEL. */
export const DEFAULT_FAST_MODEL = 'qwen/qwen3.8-27b';

export interface ProviderConfig {
  geminiApiKey: string | null;
  geminiModel: string | undefined;
  groqApiKey: string | null;
  fastModel: string;
  /** auto: Groq, then OpenAI, then Gemini (each only with its key). gemini / groq / openai: only that one. */
  aiProvider: 'auto' | 'gemini' | 'groq' | 'openai';
  /** OpenAI is used for cleanup only with a key AND a model (a model name is never guessed). */
  openaiApiKey?: string | null;
  openaiModel?: string | null;
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

/**
 * Picks the AI provider(s) from the config: Groq first, then OpenAI (only with a key and a model),
 * then Gemini, each only when it has what it needs. SAYSO_AI_PROVIDER can force a single one.
 */
export function buildProvider(
  config: ProviderConfig,
  log: (message: string) => void = () => undefined,
): BuiltProvider {
  const wants = (name: ProviderConfig['aiProvider']): boolean =>
    config.aiProvider === 'auto' || config.aiProvider === name;
  const groq =
    config.groqApiKey && wants('groq')
      ? new OpenAICompatProvider({
          name: 'groq',
          apiKey: config.groqApiKey,
          baseUrl: GROQ_BASE_URL,
          model: config.fastModel,
          extraBody: groqRequestExtras(config.fastModel),
        })
      : null;
  const openai =
    config.openaiApiKey && config.openaiModel && wants('openai')
      ? new OpenAICompatProvider({
          name: 'openai',
          apiKey: config.openaiApiKey,
          baseUrl: OPENAI_BASE_URL,
          model: config.openaiModel,
          tokenField: 'max_completion_tokens',
          retryWithoutTemperature: true,
        })
      : null;
  const gemini =
    config.geminiApiKey && wants('gemini')
      ? new GeminiProvider({ apiKey: config.geminiApiKey, model: config.geminiModel })
      : null;

  const available: LLMProvider[] = [groq, openai, gemini].filter(
    (p): p is NonNullable<typeof p> => p !== null,
  );
  const onFallback: ChainOptions['onFallback'] = ({ from, to, reason, coolingDown }) =>
    log(
      `[cleanup] ${from} failed (${reason}); using ${to}${coolingDown ? ' and pausing ' + from : ''}`,
    );
  // The first gets 1.5 s, a middle one 2 s; the last one still needs its own time.
  const chainOf = (list: readonly LLMProvider[], isFirst: boolean): LLMProvider => {
    const [head, ...tail] = list;
    if (!head) throw new Error('no providers');
    if (tail.length === 0) return head;
    return new ChainedProvider(head, chainOf(tail, false), {
      onFallback,
      ...(isFirst ? {} : { primaryTimeoutMs: 2_000 }),
    });
  };
  if (available.length === 0) return { provider: null, label: null, timeoutMs: 2_500 };
  const chain = chainOf(available, true);
  return {
    provider: chain,
    label: available.map((p) => `${p.name} · ${p.model}`).join(', then '),
    timeoutMs: [2_500, 4_000, 6_000][available.length - 1] ?? 6_000,
  };
}
