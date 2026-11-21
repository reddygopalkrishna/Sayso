import type {
  AppStatus,
  CleanupStatus,
  HelperStatus,
  LastUtterance,
  SttStatus,
} from '../../shared/status.ts';
import { useStatus } from './useStatus.ts';

type Row = { label: string; detail: string; tone: 'ok' | 'warn' | 'bad' | 'idle' };

const dot: Record<Row['tone'], string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  idle: 'bg-neutral-400 animate-pulse',
};

function helperRow(h: HelperStatus): Row {
  switch (h.state) {
    case 'connected':
      return { label: 'Helper connected', detail: `v${h.helperVersion} · ${h.os}`, tone: 'ok' };
    case 'crashed':
      return {
        label: 'Helper crashed',
        detail: `${h.reason}; retrying in ${Math.round(h.retryInMs / 1000)} s`,
        tone: 'bad',
      };
    case 'missing':
      return {
        label: 'Helper not built',
        detail: 'Run pnpm helper:build, then restart.',
        tone: 'warn',
      };
    case 'stopped':
      return { label: 'Helper stopped', detail: '', tone: 'idle' };
    case 'starting':
      return { label: 'Starting helper…', detail: '', tone: 'idle' };
  }
}

function sttRow(s: SttStatus): Row {
  switch (s.state) {
    case 'ready':
      return { label: 'Speech model ready', detail: s.model, tone: 'ok' };
    case 'loading':
      return {
        label: 'Loading speech model…',
        detail: `${s.model} (first run downloads ~600 MB)`,
        tone: 'idle',
      };
    case 'error':
      return { label: 'Speech model failed', detail: s.message, tone: 'bad' };
    case 'unknown':
      return { label: 'Speech model', detail: 'waiting for helper', tone: 'idle' };
  }
}

function fnRow(status: AppStatus): Row {
  switch (status.fnListener) {
    case 'active':
      return { label: 'Fn listener on', detail: 'Hold Fn and speak.', tone: 'ok' };
    case 'unavailable':
      return {
        label: 'Fn listener off',
        detail: 'Turn on Accessibility for Sayso in System Settings → Privacy & Security.',
        tone: 'warn',
      };
    case 'unknown':
      return { label: 'Fn listener', detail: 'waiting for helper', tone: 'idle' };
  }
}

function cleanupRow(c: CleanupStatus): Row {
  if (c.level === 'off')
    return { label: 'Cleanup off', detail: 'Raw transcript is typed.', tone: 'ok' };
  if (c.level === 'light')
    return { label: 'Light cleanup', detail: 'Fillers removed locally.', tone: 'ok' };
  if (c.provider) return { label: 'AI cleanup on', detail: c.provider, tone: 'ok' };
  return {
    label: 'AI cleanup unavailable',
    detail: 'Add GEMINI_API_KEY to .env; using local light cleanup.',
    tone: 'warn',
  };
}

const methodLabel: Record<LastUtterance['method'], string> = {
  off: 'raw',
  light: 'light cleanup',
  llm: 'AI cleanup',
  fallback: 'light cleanup (AI fallback)',
};

function StatusRow({ row }: { row: Row }): React.JSX.Element {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot[row.tone]}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium">{row.label}</p>
        {row.detail && <p className="truncate text-xs text-neutral-500">{row.detail}</p>}
      </div>
    </li>
  );
}

export function App(): React.JSX.Element {
  const status = useStatus();
  return (
    <main className="flex h-screen flex-col gap-5 bg-neutral-50 p-6 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <h1 className="text-2xl font-semibold tracking-tight">Sayso</h1>
      {status && (
        <>
          <ul className="flex flex-col gap-3">
            <StatusRow row={helperRow(status.helper)} />
            <StatusRow row={sttRow(status.stt)} />
            <StatusRow row={fnRow(status)} />
            <StatusRow row={cleanupRow(status.cleanup)} />
          </ul>
          {status.last && (
            <section className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700">
              <p className="text-xs text-neutral-500">
                Last inserted{status.last.appName ? ` into ${status.last.appName}` : ''} ·{' '}
                {methodLabel[status.last.method]} ({status.last.tone}) · STT{' '}
                {Math.round(status.last.sttMs)} ms · cleanup {Math.round(status.last.cleanupMs)} ms
              </p>
              {status.last.text && <p className="mt-1 line-clamp-3 text-sm">{status.last.text}</p>}
              {status.last.command && (
                <p className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  then ran “{status.last.command.replace('_', ' ')}”
                </p>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
