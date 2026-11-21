import { useEffect, useState } from 'react';
import type { HistoryCleanup, HistoryEntry } from '../../shared/data.ts';
import type { AppStatus } from '../../shared/status.ts';
import { summarize, type HistoryStats } from './historyStats.ts';
import { useLoad } from './useLoad.ts';

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** How the text was cleaned up, in words a person understands. */
export function cleanupLabel(c: HistoryCleanup): string {
  switch (c.method) {
    case 'llm':
      return `${c.provider ? providerName(c.provider) : 'AI'} ${seconds(c.ms)}`;
    case 'local':
      return 'no AI needed';
    case 'fallback':
      return 'AI unavailable, local rules';
    case 'light':
      return 'local rules';
    case 'off':
      return 'raw';
  }
}

/** "groq" → "Groq". */
const providerName = (provider: string): string =>
  provider.charAt(0).toUpperCase() + provider.slice(1);

const percent = (share: number | undefined): string => `${Math.round((share ?? 0) * 100)}%`;

/** The speed figures above the list: how fast it feels, and how often the AI was skipped. */
export function SpeedSummary({ stats }: { stats: HistoryStats }): React.JSX.Element | null {
  if (stats.dictations < 3 || stats.medianMs === null) return null;
  return (
    <section
      aria-label="Speed"
      className="rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-700"
    >
      <p>
        <span className="font-medium">Speed</span>
        <span className="text-neutral-500"> (last {stats.dictations} dictations): </span>
        median {seconds(stats.medianMs)}
        {stats.p95Ms !== null && (
          <span className="text-neutral-500"> · slowest 5% {seconds(stats.p95Ms)}</span>
        )}
      </p>
      {stats.withCleanup >= 3 && (
        <p className="mt-1 text-xs text-neutral-500">
          AI skipped {percent(stats.share.local)} · AI used {percent(stats.share.llm)}
          {stats.aiMedianMs !== null && ` (median ${seconds(stats.aiMedianMs)})`}
          {(stats.share.fallback ?? 0) > 0 && ` · AI unavailable ${percent(stats.share.fallback)}`}
          {stats.byProvider.length > 0 &&
            ` · ${stats.byProvider.map((p) => `${providerName(p.provider)} ${seconds(p.medianMs)} (${p.count})`).join(', ')}`}
        </p>
      )}
    </section>
  );
}

const OUTCOME: Record<HistoryEntry['outcome'], { label: string; style: string }> = {
  done: {
    label: 'Done',
    style: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  },
  cancelled: {
    label: 'Cancelled',
    style: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
  },
  blocked: {
    label: 'Blocked',
    style: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  },
  failed: {
    label: 'Failed',
    style: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  },
};

function when(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export function HistoryRow({ entry }: { entry: HistoryEntry }): React.JSX.Element {
  const outcome = OUTCOME[entry.outcome];
  return (
    <li className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <time dateTime={new Date(entry.createdAt).toISOString()}>{when(entry.createdAt)}</time>
        <span>·</span>
        <span>{entry.mode === 'command' ? 'Command' : 'Dictation'}</span>
        {entry.appName && (
          <>
            <span>·</span>
            <span>{entry.appName}</span>
          </>
        )}
        {entry.latencyMs !== null && (
          <>
            <span>·</span>
            <span>{(entry.latencyMs / 1000).toFixed(1)} s</span>
          </>
        )}
        {entry.cleanup && (
          <>
            <span>·</span>
            <span>{cleanupLabel(entry.cleanup)}</span>
          </>
        )}
        <span className={`ml-auto rounded-full px-2 py-0.5 font-medium ${outcome.style}`}>
          {outcome.label}
        </span>
      </div>
      {entry.rawText === null ? (
        <p className="mt-1.5 text-sm italic text-neutral-500">
          Not saved: it was said into a password field.
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-neutral-500">
          <span className="sr-only">Heard: </span>“{entry.rawText}”
        </p>
      )}
      {entry.finalText && (
        <p className="mt-1 whitespace-pre-line text-sm">
          <span className="text-xs text-neutral-500">Typed: </span>
          {entry.finalText}
        </p>
      )}
      {entry.action && (
        <p className="mt-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">
          {entry.action.result === 'ran'
            ? 'Ran'
            : entry.action.result === 'cancelled'
              ? 'Cancelled'
              : 'Skipped'}{' '}
          “{entry.action.command.replace('_', ' ')}”
        </p>
      )}
    </li>
  );
}

/** What you said and what Sayso did. Stored on this Mac only; the last 50 are kept. */
export function History({ status }: { status: AppStatus }): React.JSX.Element {
  const { data, error, reload } = useLoad(() => window.sayso.history.list());
  const [confirming, setConfirming] = useState(false);

  // A new utterance finished (or failed): the list changed.
  const signal = `${status.last?.text ?? ''}|${status.last?.sttMs ?? ''}|${status.dictation.phase}`;
  useEffect(() => {
    void reload();
  }, [signal, reload]);

  const clear = async (): Promise<void> => {
    await window.sayso.history.clear();
    setConfirming(false);
    await reload();
  };

  return (
    <section aria-label="History" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-500">
          Kept on this Mac only. The last 50 are stored; anything said into a password field is
          never saved.
        </p>
        {confirming ? (
          <span className="flex shrink-0 items-center gap-2 text-sm">
            Clear all?
            <button
              type="button"
              className="font-medium text-red-600 underline"
              onClick={() => void clear()}
            >
              Yes, clear
            </button>
            <button type="button" className="underline" onClick={() => setConfirming(false)}>
              No
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="shrink-0 text-sm underline disabled:no-underline disabled:opacity-40"
            disabled={!data || data.length === 0}
            onClick={() => setConfirming(true)}
          >
            Clear history
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {data && data.length === 0 && !error && (
        <p className="text-sm text-neutral-500">Nothing yet. Hold Fn and say something.</p>
      )}
      {data && <SpeedSummary stats={summarize(data)} />}
      <ul className="flex flex-col gap-2">
        {data?.map((entry) => (
          <HistoryRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}
