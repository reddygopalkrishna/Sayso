import type { CleanupMethodName, HistoryCleanup, HistoryEntry } from '../../shared/data.ts';

export interface HistoryStats {
  /** Dictations that finished, with a recorded time. */
  dictations: number;
  medianMs: number | null;
  /** Slowest 5%: what the worst case feels like. */
  p95Ms: number | null;
  /** Median time of the AI step, over the dictations where the AI ran. */
  aiMedianMs: number | null;
  /** Time of the AI step per provider (e.g. Groq vs Gemini), where the AI ran; fastest first. */
  byProvider: Array<{ provider: string; count: number; medianMs: number }>;
  /** Share (0–1) of dictations per way of cleaning up, among rows that recorded one. */
  share: Partial<Record<CleanupMethodName, number>>;
  /** How many rows recorded their cleanup method (older rows did not). */
  withCleanup: number;
}

/** Nearest-rank percentile of a list of numbers; null when empty. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] ?? null;
}

function providerStats(cleaned: readonly HistoryCleanup[]): HistoryStats['byProvider'] {
  const times = new Map<string, number[]>();
  for (const c of cleaned) {
    if (c.method !== 'llm' || !c.provider) continue;
    times.set(c.provider, [...(times.get(c.provider) ?? []), c.ms]);
  }
  return [...times]
    .map(([provider, ms]) => ({ provider, count: ms.length, medianMs: percentile(ms, 50) ?? 0 }))
    .sort((a, b) => a.medianMs - b.medianMs);
}

/** Speed figures for the History tab, from the entries it already shows. */
export function summarize(entries: readonly HistoryEntry[]): HistoryStats {
  const done = entries.filter((e) => e.mode === 'dictation' && e.outcome === 'done');
  const totals = done.flatMap((e) => (e.latencyMs === null ? [] : [e.latencyMs]));
  const cleaned = done.flatMap((e) => (e.cleanup ? [e.cleanup] : []));
  const share: HistoryStats['share'] = {};
  for (const c of cleaned) share[c.method] = (share[c.method] ?? 0) + 1 / cleaned.length;
  return {
    dictations: totals.length,
    medianMs: percentile(totals, 50),
    p95Ms: percentile(totals, 95),
    aiMedianMs: percentile(
      cleaned.filter((c) => c.method === 'llm').map((c) => c.ms),
      50,
    ),
    share,
    byProvider: providerStats(cleaned),
    withCleanup: cleaned.length,
  };
}
