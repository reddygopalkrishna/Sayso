import { describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from './gemini.ts';
import type { CleanupRequest } from './types.ts';

const request: CleanupRequest = {
  rawText: 'um hello there',
  tone: 'casual',
  dictionary: ['Sayso'],
  appName: 'Slack',
};

function reply(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

const ok = (text: string, finishReason = 'STOP') =>
  reply(200, { candidates: [{ content: { parts: [{ text }] }, finishReason }] });

describe('GeminiProvider', () => {
  it('sends the key in a header, not the URL, and returns the text', async () => {
    const fetchMock = ok('Hello there.');
    const gemini = new GeminiProvider({ apiKey: 'test-key', model: 'gemini-x', fetch: fetchMock });
    await expect(gemini.cleanup(request, new AbortController().signal)).resolves.toBe(
      'Hello there.',
    );

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('fetch was not called');
    const [url, init] = call;
    expect(String(url)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent',
    );
    expect(String(url)).not.toContain('test-key');
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    const body = JSON.parse(String(init?.body)) as {
      systemInstruction: { parts: Array<{ text: string }> };
      contents: Array<{ parts: Array<{ text: string }> }>;
      generationConfig: { temperature: number };
    };
    expect(body.systemInstruction.parts[0]?.text).toContain('Dictionary (exact spelling): Sayso');
    expect(body.systemInstruction.parts[0]?.text).toContain('Slack');
    expect(body.contents[0]?.parts[0]?.text).toBe('<transcript>\num hello there\n</transcript>');
    expect(body.generationConfig.temperature).toBe(0);
  });

  it('defaults to the latest Flash model', () => {
    expect(new GeminiProvider({ apiKey: 'k', fetch: ok('x') }).model).toBe('gemini-flash-latest');
  });

  it.each([
    [
      'HTTP error with message',
      reply(429, { error: { message: 'Quota exceeded' } }),
      /Gemini 429: Quota exceeded/,
    ],
    [
      'blocked prompt',
      reply(200, { promptFeedback: { blockReason: 'SAFETY' } }),
      /blocked.*SAFETY/,
    ],
    ['safety stop', ok('', 'SAFETY'), /stopped early \(SAFETY\)/],
    ['truncated', ok('Hello', 'MAX_TOKENS'), /cut off/],
    ['bad shape', reply(200, { candidates: 'nope' }), /unexpected response/],
  ])('rejects on %s', async (_label, fetchMock, message) => {
    const gemini = new GeminiProvider({ apiKey: 'k', fetch: fetchMock });
    await expect(gemini.cleanup(request, new AbortController().signal)).rejects.toThrow(message);
  });

  it('reports a timeout when aborted', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    const gemini = new GeminiProvider({ apiKey: 'k', fetch: fetchMock });
    await expect(gemini.cleanup(request, controller.signal)).rejects.toThrow(/timed out/);
  });

  it('refuses an empty key', () => {
    expect(() => new GeminiProvider({ apiKey: '' })).toThrow(/empty/);
  });
});
