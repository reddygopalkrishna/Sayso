import type {
  AppStatus,
  CleanupStatus,
  HelperStatus,
  LastUtterance,
  SttStatus,
} from '../../shared/status.ts';
import { Card } from './Card.tsx';
import { HandsFree } from './HandsFree.tsx';
import { Onboarding } from './Onboarding.tsx';

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
  local: 'local (AI not needed)',
  llm: 'AI cleanup',
  fallback: 'light cleanup (AI fallback)',
};

function databaseRow(d: AppStatus['database']): Row | null {
  return d.state === 'error'
    ? {
        label: 'Local database unavailable',
        detail: `${d.message}. History and your dictionary are off; dictation still works.`,
        tone: 'bad',
      }
    : null;
}

const KEY_NAME: Record<AppStatus['holdKey'], string> = {
  fn: 'Fn',
  rightOption: 'Right ⌥',
  rightCommand: 'Right ⌘',
  rightControl: 'Right ⌃',
};

/** What to say, grouped: each line is something Sayso does today. */
const THINGS_TO_SAY: Array<{ title: string; lines: Array<[say: string, does: string]> }> = [
  {
    title: 'Type',
    lines: [
      ['type hello there', 'types the words'],
      ['type my email', 'types the email you saved'],
      ['send it / enter', 'presses Enter'],
    ],
  },
  {
    title: 'Open and move',
    lines: [
      ['open Slack', 'opens or switches to an app'],
      ['open the first result', 'opens the 1st to 10th item'],
      ['new tab · close tab · go back', 'works in any browser'],
      ['scroll down', 'scrolls the page'],
    ],
  },
  {
    title: 'Click and fill',
    lines: [
      ['click Sign in', 'presses a button by its name'],
      ['fill in my details', 'fills a form from About me'],
      ['log me in', 'your own words work too'],
    ],
  },
];

/** The key you hold, shown like a keycap, and what happens when you hold it. */
export function HoldKeyCard({ holdKey }: { holdKey: AppStatus['holdKey'] }): React.JSX.Element {
  const key = KEY_NAME[holdKey];
  return (
    <Card title="Or hold a key and speak">
      <div className="flex items-center gap-4">
        <kbd className="flex h-14 min-w-14 items-center justify-center rounded-xl border border-neutral-300 bg-neutral-50 px-3 text-lg font-semibold shadow-[0_2px_0_0] shadow-neutral-300 dark:border-neutral-600 dark:bg-neutral-800 dark:shadow-neutral-700">
          {key}
        </kbd>
        <ul className="text-sm text-neutral-600 dark:text-neutral-300">
          <li>
            Hold <b>{key}</b>, speak, let go: it types what you said.
          </li>
          <li>
            Hold <b>{key} + Shift</b> and say a command.
          </li>
          <li>
            <b>Esc</b> cancels a preview before it runs.
          </li>
        </ul>
      </div>
    </Card>
  );
}

/** Small status chips: what is running, in a line instead of a list. */
export function StatusChips({ status }: { status: AppStatus }): React.JSX.Element {
  const rows = [
    helperRow(status.helper),
    sttRow(status.stt),
    fnRow(status),
    cleanupRow(status.cleanup),
    ...(databaseRow(status.database) ? [databaseRow(status.database) as Row] : []),
  ];
  return (
    <ul aria-label="Status" className="flex flex-wrap gap-2">
      {rows.map((row) => (
        <li
          key={row.label}
          title={row.detail}
          className="flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1 text-xs dark:border-neutral-800"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot[row.tone]}`} />
          {row.label}
        </li>
      ))}
    </ul>
  );
}

export function ThingsToSay(): React.JSX.Element {
  return (
    <Card title="Things you can say">
      <div className="grid gap-4 sm:grid-cols-3">
        {THINGS_TO_SAY.map((group) => (
          <div key={group.title}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {group.title}
            </h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {group.lines.map(([say, does]) => (
                <li key={say}>
                  <span className="font-medium">“{say}”</span>
                  <span className="block text-xs text-neutral-500">{does}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Home: hands-free first, the key to hold, what is running, the last thing you said, what to say. */
export function Home({ status }: { status: AppStatus }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      <Onboarding permissions={status.permissions} />
      <HandsFree
        status={status.handsFree}
        wakeWord={status.wakeWord}
        ready={status.stt.state === 'ready' && status.helper.state === 'connected'}
      />
      <HoldKeyCard holdKey={status.holdKey} />
      <StatusChips status={status} />
      {status.last && (
        <Card title={status.last.mode === 'command' ? 'Last command' : 'Last typed'}>
          <p className="text-xs text-neutral-500">
            {status.last.appName ? `in ${status.last.appName} · ` : ''}
            {status.last.mode === 'command'
              ? `STT ${Math.round(status.last.sttMs)} ms`
              : `${methodLabel[status.last.method]} (${status.last.tone}) · STT ${Math.round(status.last.sttMs)} ms · cleanup ${Math.round(status.last.cleanupMs)} ms`}
          </p>
          {status.last.text && (
            <p className="mt-1.5 line-clamp-6 whitespace-pre-line text-sm">{status.last.text}</p>
          )}
          {status.last.command && (
            <p className="mt-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {status.last.mode === 'command' ? 'ran' : 'then ran'} “
              {status.last.command.replace('_', ' ')}”
            </p>
          )}
        </Card>
      )}
      <ThingsToSay />
      <p className="text-xs text-neutral-500">
        Tip: in System Settings → Keyboard, set “Press 🌐 key to” → Do Nothing, so Fn does not also
        open the emoji picker.{' '}
        <button
          type="button"
          className="underline"
          onClick={() => void window.sayso.permissions.openSettings('keyboard')}
        >
          Open Keyboard settings
        </button>
      </p>
    </div>
  );
}
