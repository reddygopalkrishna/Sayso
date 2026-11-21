import { useState } from 'react';
import type { PermissionsStatus } from '../../shared/status.ts';

type Kind = 'microphone' | 'accessibility';

const button =
  'rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:hover:bg-neutral-700';
const primary =
  'rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200';

function Step(props: {
  number: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          props.done ? 'bg-emerald-500 text-white' : 'bg-neutral-200 dark:bg-neutral-700'
        }`}
      >
        {props.done ? '✓' : props.number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {props.title}
          <span className="sr-only">{props.done ? ' (done)' : ' (needs your action)'}</span>
        </p>
        {!props.done && <div className="mt-1 flex flex-col gap-2">{props.children}</div>}
      </div>
    </li>
  );
}

/**
 * First-run setup: Microphone and Accessibility. Shown only while one of them is missing; the
 * status refreshes by itself every couple of seconds, so it disappears once macOS says yes.
 */
export function Onboarding({
  permissions,
}: {
  permissions: PermissionsStatus;
}): React.JSX.Element | null {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { microphone, accessibility } = permissions;
  const known = microphone !== 'unknown' && accessibility !== 'unknown';
  if (!known || (microphone === 'granted' && accessibility === 'granted')) return null;

  const run = async (kind: Kind | null, action: () => Promise<void>): Promise<void> => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const openSettings = (pane: Kind) => run(null, () => window.sayso.permissions.openSettings(pane));
  const request = (kind: Kind) => run(kind, () => window.sayso.permissions.request(kind));

  return (
    <section
      aria-label="Set up permissions"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40"
    >
      <h2 className="text-base font-semibold">Two quick permissions</h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
        Sayso needs these to hear you and to type for you. Nothing leaves this Mac for them.
      </p>
      <ol className="mt-4 flex flex-col gap-4">
        <Step number={1} title="Microphone, so Sayso can hear you" done={microphone === 'granted'}>
          {microphone === 'undetermined' ? (
            <div>
              <button
                type="button"
                className={primary}
                disabled={busy === 'microphone'}
                onClick={() => void request('microphone')}
              >
                {busy === 'microphone' ? 'Waiting for your answer…' : 'Allow microphone'}
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                {microphone === 'restricted'
                  ? 'A device policy blocks the microphone for this app.'
                  : 'macOS only asks once. Turn the switch on in Privacy & Security → Microphone.'}
              </p>
              <div>
                <button
                  type="button"
                  className={button}
                  onClick={() => void openSettings('microphone')}
                >
                  Open Microphone settings
                </button>
              </div>
            </>
          )}
        </Step>
        <Step
          number={2}
          title="Accessibility, so Sayso can type, press keys and click"
          done={accessibility === 'granted'}
        >
          <p className="text-xs text-neutral-600 dark:text-neutral-300">
            Turn on the switch next to Sayso (while developing, the app that started it, such as
            Terminal). The Fn key starts working as soon as you do.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              disabled={busy === 'accessibility'}
              onClick={() => void request('accessibility')}
            >
              Show the macOS prompt
            </button>
            <button
              type="button"
              className={button}
              onClick={() => void openSettings('accessibility')}
            >
              Open Accessibility settings
            </button>
          </div>
        </Step>
      </ol>
      <p role="status" className="mt-3 min-h-4 text-xs text-red-600 dark:text-red-400">
        {error}
      </p>
    </section>
  );
}
