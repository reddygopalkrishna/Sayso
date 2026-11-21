import { describe, expect, it, vi } from 'vitest';
import { ChainedProvider } from './ChainedProvider.ts';
import { LLMError, type CleanupRequest, type LLMProvider } from './types.ts';

const request: CleanupRequest = { rawText: 'hello', tone: 'casual', dictionary: [], appName: null };
const live = (): AbortSignal => new AbortController().signal;

type Impl = (signal: AbortSignal) => Promise<string>;
function fake(name: string, impl: Impl): LLMProvider & { calls: number; warmed: number } {
  const p = {
    name,
    model: `${name}-model`,
    calls: 0,
    warmed: 0,
    cleanup(_request: CleanupRequest, signal: AbortSignal) {
      p.calls += 1;
      return impl(signal);
    },
    warmUp() {
      p.warmed += 1;
    },
  };
  return p;
}
const answers =
  (text: string): Impl =>
  async () =>
    text;
const fails =
  (error: Error): Impl =>
  async () => {
    throw error;
  };

function setup(primary: Impl, fallback: Impl = answers('from fallback'), options = {}) {
  let t = 1_000;
  const events: Array<{ from: string; to: string; reason: string; coolingDown: boolean }> = [];
  const a = fake('groq', primary);
  const b = fake('gemini', fallback);
  const chain = new ChainedProvider(a, b, {
    now: () => t,
    onFallback: (e) => void events.push(e),
    ...options,
  });
  return { chain, a, b, events, advance: (ms: number) => void (t += ms) };
}

describe('ChainedProvider: the normal path', () => {
  it('uses the first provider and leaves the second alone', async () => {
    const { chain, a, b } = setup(answers('from groq'));
    expect(await chain.cleanup(request, live())).toBe('from groq');
    expect([a.calls, b.calls, chain.lastUsed()]).toEqual([1, 0, 'groq']);
  });

  it('is named after both providers', () => {
    const { chain } = setup(answers('x'));
    expect(chain.name).toBe('groq+gemini');
    expect(chain.model).toBe('groq-model, then gemini-model');
  });
});

describe('ChainedProvider: when the first one fails', () => {
  it('uses the second provider and says which one answered', async () => {
    const { chain, events } = setup(fails(new LLMError('groq 500: oops', 500)));
    expect(await chain.cleanup(request, live())).toBe('from fallback');
    expect(chain.lastUsed()).toBe('gemini');
    expect(events).toEqual([
      { from: 'groq', to: 'gemini', reason: 'groq 500: oops', coolingDown: false },
    ]);
  });

  it('gives up on the first provider after its time budget (a slow answer is not worth waiting for)', async () => {
    const hang: Impl = (signal) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new LLMError('timed out'))),
      );
    const { chain, a, b } = setup(hang, answers('from fallback'), { primaryTimeoutMs: 20 });
    expect(await chain.cleanup(request, live())).toBe('from fallback');
    expect([a.calls, b.calls]).toEqual([1, 1]);
  });

  it('throws the second provider’s error when both fail', async () => {
    const { chain } = setup(fails(new LLMError('first')), fails(new LLMError('second')));
    await expect(chain.cleanup(request, live())).rejects.toThrow('second');
  });

  it('does not start another request once the caller has given up', async () => {
    const controller = new AbortController();
    const first: Impl = async () => {
      controller.abort();
      throw new LLMError('timed out');
    };
    const { chain, b } = setup(first);
    await expect(chain.cleanup(request, controller.signal)).rejects.toThrow('timed out');
    expect(b.calls).toBe(0);
  });
});

describe('ChainedProvider: cooldown after trouble', () => {
  it('a rate limit pauses the first provider for as long as it asks, then tries it again', async () => {
    const { chain, a, b, events, advance } = setup(fails(new LLMError('groq 429', 429, 5_000)));
    await chain.cleanup(request, live());
    expect(events[0]?.coolingDown).toBe(true);
    await chain.cleanup(request, live()); // straight to the fallback: no wasted request
    advance(4_000);
    await chain.cleanup(request, live());
    expect([a.calls, b.calls]).toEqual([1, 3]);
    advance(1_100); // 5.1 s after the rate limit
    await chain.cleanup(request, live());
    expect([a.calls, b.calls]).toEqual([2, 4]);
  });

  it('without a Retry-After the pause is the default 30 s; a huge one is capped at 60 s', async () => {
    const plain = setup(fails(new LLMError('429', 429)));
    await plain.chain.cleanup(request, live());
    plain.advance(29_000);
    expect(plain.chain.primaryCoolingDown).toBe(true);
    plain.advance(1_100);
    expect(plain.chain.primaryCoolingDown).toBe(false);

    const huge = setup(fails(new LLMError('429', 429, 3_600_000)));
    await huge.chain.cleanup(request, live());
    huge.advance(60_100);
    expect(huge.chain.primaryCoolingDown).toBe(false);
  });

  it('two failures in a row pause it; one failure does not', async () => {
    const { chain, a, advance } = setup(fails(new LLMError('boom', 500)));
    await chain.cleanup(request, live());
    expect(chain.primaryCoolingDown).toBe(false);
    await chain.cleanup(request, live());
    expect(chain.primaryCoolingDown).toBe(true);
    await chain.cleanup(request, live());
    expect(a.calls).toBe(2);
    advance(30_100);
    await chain.cleanup(request, live());
    expect(a.calls).toBe(3);
  });

  it('a success in between resets the count', async () => {
    let fail = true;
    const { chain } = setup(async () => {
      if (fail) throw new LLMError('boom', 500);
      return 'from groq';
    });
    await chain.cleanup(request, live());
    fail = false;
    await chain.cleanup(request, live());
    fail = true;
    await chain.cleanup(request, live());
    expect(chain.primaryCoolingDown).toBe(false);
  });
});

describe('ChainedProvider.warmUp', () => {
  it('warms the first provider, or the second while the first is paused', async () => {
    const { chain, a, b } = setup(fails(new LLMError('429', 429)));
    chain.warmUp();
    expect([a.warmed, b.warmed]).toEqual([1, 0]);
    await chain.cleanup(request, live());
    chain.warmUp();
    expect([a.warmed, b.warmed]).toEqual([1, 1]);
  });

  it('copes with providers that cannot warm up', () => {
    const bare: LLMProvider = { name: 'x', model: 'y', cleanup: async () => 'z' };
    expect(() => new ChainedProvider(bare, bare).warmUp()).not.toThrow();
  });
});

it('logs through the callback only when the second provider steps in', async () => {
  const log = vi.fn();
  const { chain } = setup(answers('ok'), answers('x'), { onFallback: log });
  await chain.cleanup(request, live());
  expect(log).not.toHaveBeenCalled();
});
