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
      // Sayso was not said, so it is not sent: only the names that were said go to the AI.
      { rawText: raw, tone: 'casual', dictionary: [], appName: 'Slack' },
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

  it('sends the AI only the names that were said, even with a long list of names', async () => {
    const llm = new FakeLLM(async (r) => r.rawText);
    const many = Array.from({ length: 200 }, (_, i) => ({ phrase: `Name${i}`, spokenAs: null }));
    const withMany = new TextCleanup({
      provider: llm,
      level: () => 'full',
      dictionary: () => [
        ...many,
        { phrase: 'Priya', spokenAs: null },
        { phrase: 'Sayso', spokenAs: 'say so' },
      ],
    });
    await withMany.clean({ rawText: 'um tell priya and say so about Name7 today', ...slack });
    expect([...(llm.requests[0]?.dictionary ?? [])].sort()).toEqual(['Name7', 'Priya', 'Sayso']);
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

  it('accepts a multi-line list from the AI and keeps the line breaks', async () => {
    const llm = new FakeLLM(async () => "1. It's in history.\n2. I added it.\n3. It works.");
    const result = await cleanup(llm).clean({
      rawText: "first one it's in history second one I added it third one it works",
      ...slack,
    });
    expect(result).toMatchObject({
      method: 'llm',
      text: "1. It's in history.\n2. I added it.\n3. It works.",
    });
  });

  it('without the AI, clearly numbered speech is still listed', async () => {
    const result = await cleanup(null).clean({
      rawText: "First one. It's in history. Second one. I added it.",
      ...slack,
    });
    expect(result).toMatchObject({ method: 'light', text: "1. It's in history.\n2. I added it." });
  });

  it('the fallback after an AI failure also lists numbered speech', async () => {
    const llm = new FakeLLM(async () => {
      throw new Error('Gemini 429: quota');
    });
    const result = await cleanup(llm).clean({
      rawText: 'First, check the logs. Second, restart the server.',
      ...slack,
    });
    expect(result).toMatchObject({
      method: 'fallback',
      text: '1. Check the logs.\n2. Restart the server.',
    });
  });

  describe('skipping the AI for short clean text', () => {
    const skipping = (llm: LLMProvider) =>
      new TextCleanup({
        provider: llm,
        level: () => 'full',
        skipWhenClean: () => true,
        timeoutMs: 1_000,
      });

    it('uses the local text and never calls the AI for a short, clean sentence', async () => {
      const llm = new FakeLLM(async () => 'unused');
      const result = await skipping(llm).clean({
        rawText: 'um can we meet at 6 tomorrow?',
        ...slack,
      });
      expect(result).toMatchObject({
        method: 'local',
        text: 'Can we meet at 6 tomorrow?',
        note: 'short and clean',
      });
      expect(llm.requests).toHaveLength(0);
    });

    it('still calls the AI when there is a cue (a correction) or the text is long', async () => {
      const llm = new FakeLLM(async () => 'Meet at 6.');
      expect((await skipping(llm).clean({ rawText: 'meet at 5 no 6.', ...slack })).method).toBe(
        'llm',
      );
      // distinct words: the local stutter rule would collapse a repeated one
      const long = Array.from({ length: 20 }, (_, i) => `word${i}`).join(' ') + '.';
      expect((await skipping(llm).clean({ rawText: long, ...slack })).method).toBe('llm');
      expect(llm.requests).toHaveLength(2);
    });

    it('needs a closing full stop in mail and documents, not in chat', async () => {
      const llm = new FakeLLM(async () => 'Thanks, will do.');
      const chat = await skipping(llm).clean({ rawText: 'thanks will do', ...slack });
      expect(chat.method).toBe('local');
      const mail = await skipping(llm).clean({
        rawText: 'thanks will do',
        bundleId: 'com.apple.mail',
        appName: 'Mail',
      });
      expect(mail.method).toBe('llm');
    });

    it('is off unless asked for', async () => {
      const llm = new FakeLLM(async () => 'Can we meet at 6 tomorrow?');
      const result = await cleanup(llm).clean({ rawText: 'can we meet at 6 tomorrow?', ...slack });
      expect(result.method).toBe('llm');
    });

    it('applies your dictionary first, so a "sounds like" word is still fixed locally', async () => {
      const llm = new FakeLLM(async () => 'unused');
      const result = await new TextCleanup({
        provider: llm,
        level: () => 'full',
        skipWhenClean: () => true,
        dictionary: () => [{ phrase: 'Sayso', spokenAs: 'say so' }],
      }).clean({ rawText: 'say so is great.', ...slack });
      expect(result).toMatchObject({ method: 'local', text: 'Sayso is great.' });
    });
  });

  it('records which AI answered (a chain reports the one that did)', async () => {
    const llm = Object.assign(new FakeLLM(async () => 'Hello there.'), {
      lastUsed: () => 'gemini',
    });
    expect((await cleanup(llm).clean({ rawText: 'um hello there', ...slack })).provider).toBe(
      'gemini',
    );
    const plain = new FakeLLM(async () => 'Hello there.');
    expect((await cleanup(plain).clean({ rawText: 'um hello there', ...slack })).provider).toBe(
      'fake',
    );
  });

  it('records no AI provider when the AI was not used', async () => {
    const llm = new FakeLLM(async () => 'x');
    expect(
      (await cleanup(llm, 'light').clean({ rawText: 'hello', ...slack })).provider,
    ).toBeUndefined();
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
