import { useEffect, useState } from 'react';
import type { HelperStatus } from '../../shared/helper-status.ts';

function describe(status: HelperStatus | null): { label: string; detail: string; dot: string } {
  switch (status?.state) {
    case 'connected':
      return {
        label: 'Helper connected',
        detail: `v${status.helperVersion} · ${status.os}`,
        dot: 'bg-emerald-500',
      };
    case 'crashed':
      return {
        label: 'Helper crashed',
        detail: `${status.reason}; retrying in ${Math.round(status.retryInMs / 1000)} s`,
        dot: 'bg-red-500',
      };
    case 'missing':
      return {
        label: 'Helper not built',
        detail: 'Run pnpm helper:build, then restart the app.',
        dot: 'bg-amber-500',
      };
    case 'stopped':
      return { label: 'Helper stopped', detail: '', dot: 'bg-neutral-400' };
    default:
      return { label: 'Starting helper…', detail: '', dot: 'bg-neutral-400 animate-pulse' };
  }
}

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<HelperStatus | null>(null);

  useEffect(() => {
    const unsubscribe = window.sayso.onHelperStatus(setStatus);
    void window.sayso.getHelperStatus().then(setStatus);
    return unsubscribe;
  }, []);

  const { label, detail, dot } = describe(status);
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-3 bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <h1 className="text-2xl font-semibold tracking-tight">Sayso</h1>
      <div className="flex items-center gap-2 text-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <span>{label}</span>
      </div>
      {detail && <p className="text-xs text-neutral-500">{detail}</p>}
    </main>
  );
}
