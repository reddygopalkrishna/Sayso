import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimSingleInstance, type InstanceLock } from './singleInstance.ts';

function fakeLock(freeAfterAttempts: number) {
  let attempts = 0;
  let listener: (() => void) | null = null;
  const lock: InstanceLock = {
    requestSingleInstanceLock: () => ++attempts > freeAfterAttempts,
    onSecondInstance: (l) => {
      listener = l;
    },
  };
  return { lock, attempts: () => attempts, fireSecondInstance: () => listener?.() };
}

const handlers = () => ({ onSecondInstance: vi.fn(), onReplaced: vi.fn() });

describe('claimSingleInstance', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs when no other copy holds the lock', async () => {
    const { lock } = fakeLock(0);
    await expect(claimSingleInstance(lock, { newestWins: false, ...handlers() })).resolves.toBe(
      true,
    );
  });

  it('packaged: a second copy quits and the running copy is brought forward', async () => {
    const { lock, attempts, fireSecondInstance } = fakeLock(0);
    const h = handlers();
    await claimSingleInstance(lock, { newestWins: false, ...h });
    const second = fakeLock(Infinity);
    await expect(
      claimSingleInstance(second.lock, { newestWins: false, ...handlers() }),
    ).resolves.toBe(false);
    expect(second.attempts()).toBe(1);
    fireSecondInstance();
    expect(h.onSecondInstance).toHaveBeenCalledOnce();
    expect(h.onReplaced).not.toHaveBeenCalled();
    expect(attempts()).toBe(1);
  });

  it('dev: the running copy is told it was replaced', async () => {
    const { lock, fireSecondInstance } = fakeLock(0);
    const h = handlers();
    await claimSingleInstance(lock, { newestWins: true, ...h });
    fireSecondInstance();
    expect(h.onReplaced).toHaveBeenCalledOnce();
    expect(h.onSecondInstance).not.toHaveBeenCalled();
  });

  it('dev: the new copy waits until the old copy has quit', async () => {
    const { lock, attempts } = fakeLock(3);
    const claimed = claimSingleInstance(lock, { newestWins: true, ...handlers(), pollMs: 250 });
    await vi.advanceTimersByTimeAsync(750);
    await expect(claimed).resolves.toBe(true);
    expect(attempts()).toBe(4);
  });

  it('dev: gives up if the old copy never quits (e.g. an older build without this code)', async () => {
    const { lock } = fakeLock(Infinity);
    const claimed = claimSingleInstance(lock, {
      newestWins: true,
      ...handlers(),
      timeoutMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(1_250);
    await expect(claimed).resolves.toBe(false);
  });
});
