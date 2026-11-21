import { describe, expect, it, vi } from 'vitest';
import { checkOutput, TextCleanup } from './TextCleanup.ts';
import type { CleanupLevel, CleanupRequest, LLMProvider } from './types.ts';

class FakeLLM implements LLMProvider {
  readonly name = 'fake';
  readonly model = 'fake-1';
  requests: CleanupRequest[] = [];
  constructor(
    private readonly respond: (r: CleanupRequest, signal: AbortSignal) => Promise<string>,
  ) {}
  cleanup(request: CleanupRequest, signal: AbortSignal): Promise<string> {
    this.requests.push(request);
    return this.respond(request, signal);
  }
}

const slack = { bundleId: 'com.tinyspeck.slackmacgap', appName: 'Slack' };
const raw = 'um so lets meet at 5 no 6 tomorrow';

function cleanup(provider: LLMProvider | null, level: CleanupLevel = 'full') {
  return new TextCleanup({
    provider,
    level: () => level,
    dictionary: () => [{ phrase: 'Sayso', spokenAs: 'say so' }],
    timeoutMs: 1_000,
  });
}

describe('TextCleanup', () => {
  it('uses the LLM for Full cleanup with the app tone and dictionary', async () => {
    const llm = new FakeLLM(async () => "Let's meet at 6 tomorrow.");
    const result = await cleanup(llm).clean({ rawText: raw, ...slack });
    expect(result).toMatchObject({
      text: "Let's meet at 6 tomorrow.",
      method: 'llm',
      tone: 'casual',
    });
    expect(llm.requests).toEqual([
      { rawText: raw, tone: 'casual', dictionary: ['Sayso'], appName: 'Slack' },
    ]);
  });

  it('spells your words correctly before cleanup, in Light mode too, and tells the AI the exact spellings', async () => {
    const llm = new FakeLLM(async (r) => r.rawText);
    const result = await cleanup(llm).clean({ rawText: 'tell say so about it', ...slack });
    expect(result.text).toBe('tell Sayso about it');
    expect(llm.requests[0]).toMatchObject({
      rawText: 'tell Sayso about it',
      dictionary: ['Sayso'],
    });

    const light = await cleanup(llm, 'light').clean({ rawText: 'um say so is great', ...slack });
    expect(light.text).toBe('Sayso is great');
  });

  it('leaves the raw text alone when cleanup is off', async () => {
    const result = await cleanup(null, 'off').clean({ rawText: 'say so', ...slack });
    expect(result.text).toBe('say so');
  });

  it('does not trust an AI answer that swaps an ordinary word for a dictionary word (real bug: "dictionary tab" became "Sayso tab")', async () => {
    const llm = new FakeLLM(async () => 'I opened the Sayso tab.');
    const result = await cleanup(llm).clean({
      rawText: 'um I opened the dictionary tab',
      ...slack,
    });
    expect(result).toMatchObject({ method: 'fallback', text: 'I opened the dictionary tab' });
    expect(result.fallbackReason).toContain('Sayso');
  });

  it('keeps an AI answer that spells a dictionary word the speaker really said', async () => {
    const llm = new FakeLLM(async () => 'Tell Sayso about it.');
    expect((await cleanup(llm).clean({ rawText: 'tell say so about it', ...slack })).method).toBe(
      'llm',
    );
    expect((await cleanup(llm).clean({ rawText: 'tell sayso about it', ...slack })).method).toBe(
      'llm',
    );
  });

  it('only ordinary words around a dictionary word are cleaned by the AI', async () => {
    const llm = new FakeLLM(async () => 'Open the dictionary tab and ask Sayso.');
    const result = await cleanup(llm).clean({
      rawText: 'um open the dictionary tab and ask say so',
      ...slack,
    });
    expect(result).toMatchObject({ method: 'llm', text: 'Open the dictionary tab and ask Sayso.' });
  });

  it('never sends literal apps to the LLM', async () => {
    const llm = new FakeLLM(async () => 'should not be used');
    const result = await cleanup(llm).clean({
      rawText: 'um git status',
      bundleId: 'com.apple.Terminal',
      appName: 'Terminal',
    });
    expect(result).toMatchObject({ text: 'git status', method: 'light', tone: 'literal' });
    expect(llm.requests).toHaveLength(0);
  });

  it.each([
    ['off', 'off', raw],
    ['light', 'light', 'So lets meet at 5 no 6 tomorrow'],
  ] as const)('level %s inserts %s text', async (level, method, text) => {
    const llm = new FakeLLM(async () => 'unused');
    const result = await cleanup(llm, level).clean({ rawText: raw, ...slack });
    expect(result).toMatchObject({ text, method });
    expect(llm.requests).toHaveLength(0);
  });

  it('uses light cleanup when there is no provider (no API key)', async () => {
    const result = await cleanup(null).clean({ rawText: raw, ...slack });
    expect(result.method).toBe('light');
  });

  it('falls back on provider errors', async () => {
    const llm = new FakeLLM(async () => {
      throw new Error('Gemini 429: quota');
    });
    const result = await cleanup(llm).clean({ rawText: raw, ...slack });
    expect(result).toMatchObject({ method: 'fallback', fallbackReason: 'Gemini 429: quota' });
    expect(result.text).toBe('So lets meet at 5 no 6 tomorrow');
  });

  it('falls back when the provider is too slow', async () => {
    vi.useFakeTimers();
    try {
      const llm = new FakeLLM(
        (_r, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('timed out')));
          }),
      );
      const pending = cleanup(llm).clean({ rawText: raw, ...slack });
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(pending).resolves.toMatchObject({
        method: 'fallback',
        fallbackReason: 'timed out',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back when the LLM adds content', async () => {
    const llm = new FakeLLM(
      async () =>
        'Sure! Here is a much longer reply that answers your question in detail and adds a lot.',
    );
    const result = await cleanup(llm).clean({ rawText: 'what time is it', ...slack });
    expect(result).toMatchObject({
      method: 'fallback',
      fallbackReason: 'output much longer than input',
    });
  });

  it('does not call the LLM when only fillers were said', async () => {
    const llm = new FakeLLM(async () => 'unused');
    const result = await cleanup(llm).clean({ rawText: 'um uh', ...slack });
    expect(result.text).toBe('');
    expect(llm.requests).toHaveLength(0);
  });
});

describe('checkOutput', () => {
  it.each([
    ['hi', 'Hi.', { ok: true, text: 'Hi.' }],
    ['hi', '"Hi."', { ok: true, text: 'Hi.' }],
    ['"quote" me', '"Quote" me.', { ok: true, text: '"Quote" me.' }],
    ['hi', '```\nHi.\n```', { ok: true, text: 'Hi.' }],
    ['hi', '<transcript>Hi.</transcript>', { ok: true, text: 'Hi.' }],
    ['hi', '   ', { ok: false, reason: 'empty output' }],
  ] as const)('%j / %j', (input, output, expected) => {
    expect(checkOutput(input, output)).toEqual(expected);
  });
});
