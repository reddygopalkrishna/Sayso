import type { HandsFreeStatus } from '../../shared/status.ts';

export const SECTIONS = [
  {
    id: 'home',
    label: 'Home',
    title: 'Home',
    subtitle: 'Talk to your Mac. Type and act by voice.',
  },
  {
    id: 'history',
    label: 'Activity',
    title: 'Activity',
    subtitle: 'Everything you dictated or asked Sayso to do.',
  },
  {
    id: 'profile',
    label: 'About me',
    title: 'About me',
    subtitle: 'Facts Sayso can type and fill in for you.',
  },
  {
    id: 'dictionary',
    label: 'Words',
    title: 'Words',
    subtitle: 'Names, snippets and what Sayso remembers.',
  },
  {
    id: 'settings',
    label: 'Settings',
    title: 'Settings',
    subtitle: 'Keys, language, style and how Sayso listens.',
  },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];

const ICONS: Record<SectionId, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  history: 'M12 7v5l3 2M21 12a9 9 0 1 1-3-6.7M21 3v5h-5',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6',
  dictionary: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4zM5 17a3 3 0 0 1 3-3h11',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1.5-2-3.5-2.4.8a7 7 0 0 0-1.7-1L14.5 4h-4l-.4 2.8a7 7 0 0 0-1.7 1L6 7 4 10.5 6 12a7 7 0 0 0 0 2L4 15.5 6 19l2.4-.8c.5.4 1.1.8 1.7 1l.4 2.8h4l.4-2.8c.6-.2 1.2-.6 1.7-1l2.4.8 2-3.5-2-1.5a7 7 0 0 0 0-2z',
};

function Icon({ id }: { id: SectionId }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICONS[id]} />
    </svg>
  );
}

const HANDS_FREE_TEXT: Record<HandsFreeStatus['state'], string> = {
  off: 'Hands-free off',
  starting: 'Starting…',
  listening: 'Listening',
  error: 'Hands-free stopped',
};

interface Props {
  current: SectionId;
  onSelect: (id: SectionId) => void;
  handsFree: HandsFreeStatus['state'];
}

/** The left navigation: the app name, the sections with icons, and whether hands-free is on. */
export function Sidebar({ current, onSelect, handsFree }: Props): React.JSX.Element {
  return (
    <nav
      aria-label="Sections"
      className="flex w-52 shrink-0 flex-col gap-1 border-r border-neutral-200 bg-neutral-100/70 px-3 py-4 dark:border-neutral-800 dark:bg-neutral-950/40"
    >
      <div className="mb-4 flex items-center gap-2 px-2">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </span>
        <span className="text-lg font-semibold tracking-tight">Sayso</span>
      </div>
      <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-0.5">
        {SECTIONS.map((section) => {
          const active = current === section.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              id={`tab-${section.id}`}
              aria-selected={active}
              aria-controls={`panel-${section.id}`}
              onClick={() => onSelect(section.id)}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors ${
                active
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white'
                  : 'text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/60 dark:hover:text-white'
              }`}
            >
              <Icon id={section.id} />
              {section.label}
            </button>
          );
        })}
      </div>
      <div
        role="status"
        className="mt-auto flex items-center gap-2 rounded-lg border border-neutral-200 px-2.5 py-2 text-xs dark:border-neutral-800"
      >
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full ${
            handsFree === 'listening'
              ? 'animate-pulse bg-emerald-500'
              : handsFree === 'error'
                ? 'bg-amber-500'
                : 'bg-neutral-400'
          }`}
        />
        <span className="text-neutral-600 dark:text-neutral-300">{HANDS_FREE_TEXT[handsFree]}</span>
      </div>
    </nav>
  );
}
