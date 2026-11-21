import { describe, expect, it } from 'vitest';
import type { CleanupMethodName, HistoryEntry } from '../../shared/data.ts';
import { percentile, summarize } from './historyStats.ts';

const row = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 'x',
  createdAt: 1,
  appBundleId: null,
  appName: null,
  mode: 'dictation',
  rawText: 'a',
  finalText: 'A.',
  action: null,
  outcome: 'done',
  latencyMs: 1000,
  cleanup: null,
  ...over,
});
const withCleanup = (method: CleanupMethodName, ms: number, latencyMs = 1000) =>
  row({ latencyMs, cleanup: { method, ms } });

describe('percentile (nearest rank)', () => {
  it.each([
    [[], 50, null],
    [[5], 50, 5],
    [[1, 2, 3, 4], 50, 2],
    [[4, 1, 3, 2], 50, 2], // order does not matter
    [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95, 10],
    [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90, 9],
    [Array.from({ length: 100 }, (_, i) => i + 1), 95, 95],
  ])('%j at %i%% → %s', (values, p, expected) => {
    expect(percentile(values, p)).toBe(expected);
  });
});

describe('summarize', () => {
  it('has nothing to say about an empty history', () => {
    expect(summarize([])).toEqual({
      dictations: 0,
      medianMs: null,
      p95Ms: null,
      aiMedianMs: null,
      share: {},
      withCleanup: 0,
    });
  });

  it('median and slowest 5% of total time, over finished dictations only', () => {
    const rows = [800, 900, 1000, 1100, 5000].map((ms) => row({ latencyMs: ms }));
    rows.push(
      row({ mode: 'command', latencyMs: 99_999 }),
      row({ outcome: 'blocked', latencyMs: 99_999 }),
      row({ latencyMs: null }),
    );
    const stats = summarize(rows);
    expect(stats).toMatchObject({ dictations: 5, medianMs: 1000, p95Ms: 5000 });
  });

  it('shares of each way of cleaning up, and the AI time only where the AI ran', () => {
    const stats = summarize([
      withCleanup('llm', 900),
      withCleanup('llm', 1300),
      withCleanup('llm', 700),
      withCleanup('local', 1),
      row({ cleanup: null }), // saved before cleanup info existed: not counted
    ]);
    expect(stats.withCleanup).toBe(4);
    expect(stats.share.llm).toBeCloseTo(0.75);
    expect(stats.share.local).toBeCloseTo(0.25);
    expect(stats.aiMedianMs).toBe(900);
  });

  it('does not count a failed AI call as AI time', () => {
    const stats = summarize([withCleanup('fallback', 2500), withCleanup('llm', 800)]);
    expect(stats.aiMedianMs).toBe(800);
    expect(stats.share.fallback).toBeCloseTo(0.5);
  });
});
