import { afterEach, describe, expect, it, vi } from 'vitest';
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
  openaiApiKey: null,
  openaiModel: null,
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

describe('buildProvider: OpenAI as a second AI', () => {
  afterEach(() => vi.unstubAllGlobals());
  const withOpenAi = (over: Partial<ProviderConfig> = {}) =>
    config({ openaiApiKey: 'o-secret', openaiModel: 'model-from-env', ...over });

  it('all three: Groq, then OpenAI, then Gemini', () => {
    const built = buildProvider(withOpenAi());
    expect(built.provider).toBeInstanceOf(ChainedProvider);
    expect(built.label).toBe(
      'groq · qwen/qwen3.8-27b, then openai · model-from-env, then gemini · gemini-flash-lite-latest',
    );
    expect(built.timeoutMs).toBe(6_000);
  });

  it('Groq and OpenAI (no Gemini key)', () => {
    const built = buildProvider(withOpenAi({ geminiApiKey: null }));
    expect(built.label).toBe('groq · qwen/qwen3.8-27b, then openai · model-from-env');
    expect(built.timeoutMs).toBe(4_000);
  });

  it('OpenAI and Gemini (no Groq key): OpenAI first', () => {
    expect(buildProvider(withOpenAi({ groqApiKey: null })).label).toBe(
      'openai · model-from-env, then gemini · gemini-flash-lite-latest',
    );
  });

  it('OpenAI alone', () => {
    const built = buildProvider(withOpenAi({ groqApiKey: null, geminiApiKey: null }));
    expect(built.provider).toBeInstanceOf(OpenAICompatProvider);
    expect(built.label).toBe('openai · model-from-env');
    expect(built.timeoutMs).toBe(2_500);
  });

  it('a key without a model is not used: a model name is never guessed', () => {
    const built = buildProvider(config({ openaiApiKey: 'o-secret', openaiModel: null }));
    expect(built.label).not.toContain('openai');
  });

  it('a model without a key is not used', () => {
    const built = buildProvider(config({ openaiApiKey: null, openaiModel: 'x' }));
    expect(built.label).not.toContain('openai');
  });

  it('SAYSO_AI_PROVIDER=openai uses OpenAI only', () => {
    const built = buildProvider(withOpenAi({ aiProvider: 'openai' }));
    expect(built.label).toBe('openai · model-from-env');
  });

  it('SAYSO_AI_PROVIDER=gemini or groq keeps text away from OpenAI', () => {
    expect(buildProvider(withOpenAi({ aiProvider: 'gemini' })).label).not.toContain('openai');
    expect(buildProvider(withOpenAi({ aiProvider: 'groq' })).label).not.toContain('openai');
  });

  it('falls through Groq to OpenAI, sends the key only in a header, and never logs it', async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = String(url);
        calls.push({
          url: target,
          headers: (init?.headers ?? {}) as Record<string, string>,
          body: String(init?.body ?? ''),
        });
        if (target.includes('groq')) {
          return new Response(JSON.stringify({ error: { message: 'down' } }), { status: 500 });
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Hello there.' }, finish_reason: 'stop' }],
          }),
          { status: 200 },
        );
      }),
    );
    const logs: string[] = [];
    const built = buildProvider(withOpenAi(), (m) => logs.push(m));
    const answer = await built.provider?.cleanup(
      { rawText: 'um hello there', tone: 'casual', dictionary: [], appName: null },
      new AbortController().signal,
    );
    expect(answer).toBe('Hello there.');
    expect(built.provider?.lastUsed?.()).toBe('openai');
    const posts = calls.filter((c) => c.url.endsWith('/chat/completions'));
    expect(posts.map((c) => new URL(c.url).host)).toEqual(['api.groq.com', 'api.openai.com']);
    const openai = posts[1];
    expect(openai?.headers['authorization']).toBe('Bearer o-secret');
    expect(openai?.url).not.toContain('o-secret');
    const body = JSON.parse(openai?.body ?? '{}') as Record<string, unknown>;
    expect(body['model']).toBe('model-from-env');
    expect(body['max_completion_tokens']).toBeGreaterThan(0);
    expect(body).not.toHaveProperty('max_tokens');
    // Groq's request never carries the OpenAI key, and nothing logged contains any key.
    expect(JSON.stringify(posts[0])).not.toContain('o-secret');
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain('o-secret');
      expect(line).not.toContain('q-key');
    }
  });

  it('falls through Groq and OpenAI to Gemini, and says so', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const target = String(url);
        if (target.includes('generativelanguage')) {
          return new Response(
            JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello there.' }] } }] }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ error: { message: 'down' } }), { status: 500 });
      }),
    );
    const built = buildProvider(withOpenAi());
    const answer = await built.provider?.cleanup(
      { rawText: 'um hello there', tone: 'casual', dictionary: [], appName: null },
      new AbortController().signal,
    );
    expect(answer).toBe('Hello there.');
    expect(built.provider?.lastUsed?.()).toBe('gemini');
  });
});
