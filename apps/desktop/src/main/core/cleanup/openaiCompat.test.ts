import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatProvider } from './openaiCompat.ts';
import { LLMError, type CleanupRequest } from './types.ts';

const request: CleanupRequest = {
  rawText: 'um hello there',
  tone: 'casual',
  dictionary: ['Sayso'],
  appName: 'Slack',
};
const signal = (): AbortSignal => new AbortController().signal;

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers }));
}
const ok = (content: string | null, finish = 'stop') =>
  reply(200, { choices: [{ message: { content }, finish_reason: finish }] });

const make = (
  fetchMock: typeof fetch,
  over: Partial<ConstructorParameters<typeof OpenAICompatProvider>[0]> = {},
) =>
  new OpenAICompatProvider({
    name: 'groq',
    apiKey: 'secret-key',
    baseUrl: 'https://api.example.com/openai/v1',
    model: 'qwen/test',
    extraBody: { reasoning_effort: 'none' },
    fetch: fetchMock,
    ...over,
  });

describe('OpenAICompatProvider: the request', () => {
  it('posts to /chat/completions with the key in a header, never the URL, and the right body', async () => {
    const fetchMock = ok('Hello there.');
    await expect(make(fetchMock).cleanup(request, signal())).resolves.toBe('Hello there.');
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('fetch was not called');
    const [url, init] = call;
    expect(String(url)).toBe('https://api.example.com/openai/v1/chat/completions');
    expect(String(url)).not.toContain('secret-key');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      authorization: 'Bearer secret-key',
      'content-type': 'application/json',
    });
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      temperature: number;
      max_tokens: number;
      reasoning_effort: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body).toMatchObject({ model: 'qwen/test', temperature: 0, reasoning_effort: 'none' });
    expect(body.max_tokens).toBeGreaterThanOrEqual(128);
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(body.messages[0]?.content).toContain('Sayso');
    expect(body.messages[1]?.content).toBe('<transcript>\num hello there\n</transcript>');
  });

  it('gives longer text more room, within a ceiling', async () => {
    const tokens = async (text: string): Promise<number> => {
      const fetchMock = ok('x');
      await make(fetchMock).cleanup({ ...request, rawText: text }, signal());
      return (JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { max_tokens: number })
        .max_tokens;
    };
    expect(await tokens('a'.repeat(2000))).toBeGreaterThan(await tokens('a'));
    expect(await tokens('a'.repeat(100_000))).toBe(4096);
  });

  it('normalises a trailing slash on the base URL', async () => {
    const fetchMock = ok('x');
    await make(fetchMock, { baseUrl: 'https://api.example.com/v1///' }).cleanup(request, signal());
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.example.com/v1/chat/completions',
    );
  });

  it('refuses an empty key and names itself', () => {
    expect(() => make(ok('x'), { apiKey: '' })).toThrow(/groq API key is empty/);
    const p = make(ok('x'));
    expect([p.name, p.model, p.lastUsed()]).toEqual(['groq', 'qwen/test', 'groq']);
  });
});

describe('OpenAICompatProvider: the answer', () => {
  it('trims the text and removes a reasoning block some models include', async () => {
    await expect(make(ok('  Hi.\n')).cleanup(request, signal())).resolves.toBe('Hi.');
    await expect(
      make(ok('<think>the user said um</think>\n\nHello there.')).cleanup(request, signal()),
    ).resolves.toBe('Hello there.');
  });

  it.each([
    ['an empty answer', ok('   '), /returned no text/],
    ['a null answer', ok(null), /returned no text/],
    ['output cut off at the token limit', ok('Hello', 'length'), /cut off/],
    ['no choices', reply(200, { choices: [] }), /returned no text/],
    ['an unexpected shape', reply(200, { choices: 'nope' }), /unexpected response/],
  ])('rejects %s', async (_label, fetchMock, message) => {
    await expect(make(fetchMock).cleanup(request, signal())).rejects.toThrow(message);
  });
});

describe('OpenAICompatProvider: failures carry what the chain needs', () => {
  it('reads a rate limit and its Retry-After', async () => {
    const fetchMock = reply(
      429,
      { error: { message: 'Rate limit reached' } },
      { 'retry-after': '2.5' },
    );
    const error = await make(fetchMock)
      .cleanup(request, signal())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LLMError);
    expect(error).toMatchObject({ status: 429, retryAfterMs: 2500 });
    expect((error as Error).message).toBe('groq 429: Rate limit reached');
  });

  it.each([['0'], ['soon'], ['-3']])('ignores a useless Retry-After (%s)', async (value) => {
    const fetchMock = reply(429, { error: { message: 'slow down' } }, { 'retry-after': value });
    const error = await make(fetchMock)
      .cleanup(request, signal())
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 429, retryAfterMs: null });
  });

  it('reports other HTTP errors with their message', async () => {
    const fetchMock = reply(401, { error: { message: 'Invalid API key' } });
    await expect(make(fetchMock).cleanup(request, signal())).rejects.toThrow(
      'groq 401: Invalid API key',
    );
  });

  it('falls back to the status text when the body is not JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('<html>', { status: 502, statusText: 'Bad Gateway' }),
    );
    await expect(make(fetchMock).cleanup(request, signal())).rejects.toThrow(/groq 502/);
  });

  it('reports a network failure, and a timeout when the caller aborted', async () => {
    const down = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(make(down).cleanup(request, signal())).rejects.toThrow(/groq request failed/);
    const controller = new AbortController();
    const aborting = vi.fn<typeof fetch>(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(make(aborting).cleanup(request, controller.signal)).rejects.toThrow(/timed out/);
  });
});

describe('OpenAICompatProvider.warmUp', () => {
  const head = () => vi.fn<typeof fetch>(async () => new Response(null, { status: 404 }));

  it('sends a bare HEAD to the service address: no key, no body, no text', () => {
    const fetchMock = head();
    make(fetchMock).warmUp();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.example.com/');
    expect(init?.method).toBe('HEAD');
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toBeUndefined();
    expect(JSON.stringify(init)).not.toContain('secret-key');
  });

  it('is throttled and never throws', () => {
    let t = 1_000;
    const fetchMock = head();
    const p = make(fetchMock, { now: () => t });
    p.warmUp();
    t += 1_000;
    p.warmUp();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const throwing = vi.fn<typeof fetch>(() => {
      throw new Error('boom');
    });
    expect(() => make(throwing).warmUp()).not.toThrow();
  });
});
