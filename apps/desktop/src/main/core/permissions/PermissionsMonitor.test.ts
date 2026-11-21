import type { PermissionsMessage } from '@sayso/helper-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PermissionsStatus } from '../../../shared/status.ts';
import { isComplete, PermissionsMonitor, toStatus } from './PermissionsMonitor.ts';

const reply = (
  microphone: PermissionsMessage['microphone'],
  accessibility: boolean,
): PermissionsMessage => ({
  v: 1,
  type: 'permissions',
  id: 'p',
  microphone,
  accessibility,
});

describe('toStatus / isComplete', () => {
  it('maps the helper answer', () => {
    expect(toStatus(reply('undetermined', false))).toEqual({
      microphone: 'undetermined',
      accessibility: 'denied',
    });
    expect(toStatus(reply('granted', true))).toEqual({
      microphone: 'granted',
      accessibility: 'granted',
    });
  });

  it.each([
    [{ microphone: 'granted', accessibility: 'granted' }, true],
    [{ microphone: 'granted', accessibility: 'denied' }, false],
    [{ microphone: 'denied', accessibility: 'granted' }, false],
    [{ microphone: 'unknown', accessibility: 'unknown' }, false],
  ] as const)('%o → %s', (status, expected) => {
    expect(isComplete(status)).toBe(expected);
  });
});

describe('PermissionsMonitor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(answers: Array<PermissionsMessage | Error>) {
    const seen: PermissionsStatus[] = [];
    let calls = 0;
    const monitor = new PermissionsMonitor({
      ask: async () => {
        const next = answers[Math.min(calls++, answers.length - 1)];
        if (next instanceof Error) throw next;
        if (!next) throw new Error('no answer');
        return next;
      },
      onChange: (s) => seen.push(s),
      fastMs: 2_000,
      slowMs: 15_000,
    });
    return { monitor, seen, calls: () => calls };
  }

  it('polls quickly while something is missing, and reports only changes', async () => {
    const { monitor, seen, calls } = setup([
      reply('undetermined', false),
      reply('undetermined', false),
      reply('granted', false),
      reply('granted', true),
    ]);
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000); // same answer: no new event
    expect(seen).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls()).toBe(4);
    expect(seen.map((s) => `${s.microphone}/${s.accessibility}`)).toEqual([
      'undetermined/denied',
      'granted/denied',
      'granted/granted',
    ]);
    monitor.stop();
  });

  it('slows down once everything is granted', async () => {
    const { monitor, calls } = setup([reply('granted', true)]);
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls()).toBe(2);
    monitor.stop();
  });

  it('goes unknown when the helper cannot answer, and recovers', async () => {
    const { monitor, seen } = setup([
      reply('granted', true),
      new Error('helper not connected'),
      reply('granted', true),
    ]);
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(seen.at(-1)).toEqual({ microphone: 'unknown', accessibility: 'unknown' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(seen.at(-1)).toEqual({ microphone: 'granted', accessibility: 'granted' });
    monitor.stop();
  });

  it('refresh looks at once and does not double the polling', async () => {
    const { monitor, seen, calls } = setup([reply('undetermined', false), reply('granted', false)]);
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    await monitor.refresh();
    expect(seen.at(-1)?.microphone).toBe('granted');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls()).toBe(3); // one scheduled poll after the refresh, not two
    monitor.stop();
  });

  it('stop ends the polling', async () => {
    const { monitor, calls } = setup([reply('undetermined', false)]);
    monitor.start();
    await vi.advanceTimersByTimeAsync(0);
    monitor.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls()).toBe(1);
  });

  it('accept and reset update the status', () => {
    const { monitor, seen } = setup([reply('granted', true)]);
    monitor.accept(reply('denied', true));
    expect(monitor.status).toEqual({ microphone: 'denied', accessibility: 'granted' });
    monitor.reset();
    expect(seen.at(-1)).toEqual({ microphone: 'unknown', accessibility: 'unknown' });
  });
});
