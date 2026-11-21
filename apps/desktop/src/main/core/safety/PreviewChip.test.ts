import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewChip } from './PreviewChip.ts';

function setup(captureEscape: (enabled: boolean) => Promise<void> = async () => undefined) {
  const log: string[] = [];
  const listeners = new Set<() => void>();
  const chip = new PreviewChip({
    show: (label, ms) => log.push(`show ${label} ${ms}`),
    hide: () => log.push('hide'),
    captureEscape: async (enabled) => {
      log.push(`capture ${enabled}`);
      await captureEscape(enabled);
    },
    onEscape: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  const escape = (): void => listeners.forEach((l) => l());
  return { chip, log, escape, listeners };
}

describe('PreviewChip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('proceeds after the preview time and cleans up', async () => {
    const { chip, log, listeners } = setup();
    const result = chip.confirm('Send', 1000);
    await vi.advanceTimersByTimeAsync(999);
    expect(log).toEqual(['capture true', 'show Send 1000']);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('proceed');
    expect(log).toEqual(['capture true', 'show Send 1000', 'hide', 'capture false']);
    expect(listeners.size).toBe(0);
  });

  it('Esc cancels immediately', async () => {
    const { chip, log, escape } = setup();
    const result = chip.confirm('Send', 1000);
    await vi.advanceTimersByTimeAsync(300);
    escape();
    await expect(result).resolves.toBe('cancelled');
    expect(log.slice(-2)).toEqual(['hide', 'capture false']);
  });

  it('listens for Esc before the helper confirms capture, so an early Esc is not lost', async () => {
    let release: () => void = () => undefined;
    const { chip, escape } = setup((enabled) =>
      enabled ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve(),
    );
    const result = chip.confirm('Send', 1000);
    escape();
    release();
    await expect(result).resolves.toBe('cancelled');
  });

  it('still proceeds when the helper cannot capture Escape', async () => {
    const { chip, log } = setup(async (enabled) => {
      if (enabled) throw new Error('helper gone');
    });
    const result = chip.confirm('Send', 500);
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toBe('proceed');
    expect(log).toContain('show Send 500');
  });

  it('ignores Esc after it has finished', async () => {
    const { chip, escape } = setup();
    const result = chip.confirm('Send', 100);
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(() => escape()).not.toThrow();
  });
});
