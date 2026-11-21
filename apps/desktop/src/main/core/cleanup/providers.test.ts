import { describe, expect, it } from 'vitest';
import { ChainedProvider } from './ChainedProvider.ts';
import { GeminiProvider } from './gemini.ts';
import { OpenAICompatProvider } from './openaiCompat.ts';
import {
  buildProvider,
  DEFAULT_FAST_MODEL,
  groqRequestExtras,
  type ProviderConfig,
} from './providers.ts';

const config = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  geminiApiKey: 'g-key',
  geminiModel: undefined,
  groqApiKey: 'q-key',
  fastModel: DEFAULT_FAST_MODEL,
  aiProvider: 'auto',
  ...over,
});

describe('groqRequestExtras: stop reasoning models from thinking', () => {
  it.each([
    ['qwen/qwen3.8-27b', { reasoning_effort: 'none' }],
    ['Qwen/Qwen3-32B', { reasoning_effort: 'none' }],
    ['openai/gpt-oss-120b', { reasoning_effort: 'low' }],
    ['openai/gpt-oss-20b', { reasoning_effort: 'low' }],
    ['llama-3.1-8b-instant', {}],
    ['anything-else', {}],
  ])('%s', (model, extras) => {
    expect(groqRequestExtras(model)).toEqual(extras);
  });
});

describe('buildProvider', () => {
  it('both keys: Groq first, Gemini as the fallback, with room for both', () => {
    const built = buildProvider(config());
    expect(built.provider).toBeInstanceOf(ChainedProvider);
    expect(built.label).toBe('groq · qwen/qwen3.8-27b, then gemini · gemini-flash-lite-latest');
    expect(built.timeoutMs).toBe(4_000);
  });

  it('only a Gemini key: Gemini alone', () => {
    const built = buildProvider(config({ groqApiKey: null }));
    expect(built.provider).toBeInstanceOf(GeminiProvider);
    expect(built.label).toBe('gemini · gemini-flash-lite-latest');
    expect(built.timeoutMs).toBe(2_500);
  });

  it('only a Groq key: Groq alone, with the chosen model', () => {
    const built = buildProvider(config({ geminiApiKey: null, fastModel: 'openai/gpt-oss-20b' }));
    expect(built.provider).toBeInstanceOf(OpenAICompatProvider);
    expect(built.label).toBe('groq · openai/gpt-oss-20b');
  });

  it('no keys: no AI (the local cleanup is used)', () => {
    expect(buildProvider(config({ geminiApiKey: null, groqApiKey: null }))).toEqual({
      provider: null,
      label: null,
      timeoutMs: 2_500,
    });
  });

  it('SAYSO_AI_PROVIDER=gemini keeps text away from Groq even with a Groq key', () => {
    const built = buildProvider(config({ aiProvider: 'gemini' }));
    expect(built.provider).toBeInstanceOf(GeminiProvider);
    expect(built.label).not.toContain('groq');
  });

  it('SAYSO_AI_PROVIDER=groq ignores the Gemini key', () => {
    const built = buildProvider(config({ aiProvider: 'groq' }));
    expect(built.provider).toBeInstanceOf(OpenAICompatProvider);
  });

  it('a forced provider without its key gives no AI rather than the other one', () => {
    expect(buildProvider(config({ aiProvider: 'groq', groqApiKey: null })).provider).toBeNull();
    expect(buildProvider(config({ aiProvider: 'gemini', geminiApiKey: null })).provider).toBeNull();
  });
});
