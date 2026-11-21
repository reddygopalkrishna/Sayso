import { useState } from 'react';
import type { HandsFreeStatus } from '../../shared/status.ts';

interface CardProps {
  status: HandsFreeStatus;
  wakeWord: string;
  /** The speech model is ready (hands-free cannot start before). */
  ready: boolean;
  message: string | null;
  onToggle: (on: boolean) => void;
}

const STATE_TEXT: Record<HandsFreeStatus['state'], string> = {
  off: 'Off',
  starting: 'Starting…',
  listening: 'Listening',
  error: 'Stopped',
};

/** The hands-free switch and what to say, as plain markup (tested on its own). */
export function HandsFreeCard({
  status,
  wakeWord,
  ready,
  message,
  onToggle,
}: CardProps): React.JSX.Element {
  const on = status.state === 'listening' || status.state === 'starting';
  const word = wakeWord.charAt(0).toUpperCase() + wakeWord.slice(1);
  const problem = message ?? (status.state === 'error' ? status.message : null);
  return (
    <section
      aria-label="Hands-free"
      className={`flex flex-col gap-3 rounded-2xl border p-5 shadow-sm ${
        status.state === 'listening'
          ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30'
          : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Hands-free</h2>
          <p className="text-xs text-neutral-500">
            Talk without holding a key. The microphone stays on while this is on; audio never leaves
            this Mac and nothing is saved.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <span
            className={
              status.state === 'listening'
                ? 'font-medium text-emerald-600 dark:text-emerald-400'
                : 'text-neutral-500'
            }
          >
            {STATE_TEXT[status.state]}
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Hands-free on or off"
            className="h-4 w-8"
            checked={on}
            disabled={!ready && !on}
            onChange={(e) => onToggle(e.target.checked)}
          />
        </label>
      </div>
      {!ready && !on && (
        <p className="text-xs text-neutral-500">Available once the speech model has loaded.</p>
      )}
      <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
        <li>
          <span className="font-medium">“type …”</span>
          <span className="text-neutral-500"> types the rest</span>
        </li>
        <li>
          <span className="font-medium">“send it”</span>
          <span className="text-neutral-500"> or “enter” presses Enter</span>
        </li>
        <li>
          <span className="font-medium">“open Slack”</span>
          <span className="text-neutral-500"> opens an app or site</span>
        </li>
        <li>
          <span className="font-medium">“{word}, new tab”</span>
          <span className="text-neutral-500"> any other command</span>
        </li>
      </ul>
      <p className="text-xs text-neutral-500">
        Anything else is ignored, never typed. After a command, others work without “{word}” for a
        minute.
      </p>
      {problem && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {problem}
        </p>
      )}
    </section>
  );
}

/** The switch, wired to the app. */
export function HandsFree({
  status,
  wakeWord,
  ready,
}: {
  status: HandsFreeStatus;
  wakeWord: string;
  ready: boolean;
}): React.JSX.Element {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <HandsFreeCard
      status={status}
      wakeWord={wakeWord}
      ready={ready}
      message={message}
      onToggle={(on) => {
        setMessage(null);
        window.sayso.handsFree.set(on).catch((e: unknown) => {
          setMessage(e instanceof Error ? e.message : String(e));
        });
      }}
    />
  );
}
