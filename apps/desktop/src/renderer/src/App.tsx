import { useState } from 'react';
import { AboutMe } from './AboutMe.tsx';
import { Dictionary } from './Dictionary.tsx';
import { History } from './History.tsx';
import { Home } from './Home.tsx';
import { Settings } from './Settings.tsx';
import { useStatus } from './useStatus.ts';

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'history', label: 'History' },
  { id: 'profile', label: 'About me' },
  { id: 'dictionary', label: 'Dictionary' },
  { id: 'settings', label: 'Settings' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function App(): React.JSX.Element {
  const status = useStatus();
  const [tab, setTab] = useState<TabId>('home');

  return (
    <main className="flex h-screen flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <header className="flex items-end justify-between border-b border-neutral-200 px-6 pt-5 dark:border-neutral-700">
        <h1 className="pb-3 text-2xl font-semibold tracking-tight">Sayso</h1>
        <div role="tablist" aria-label="Sections" className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              className={`border-b-2 px-3 pb-3 text-sm font-medium ${
                tab === t.id
                  ? 'border-neutral-900 dark:border-white'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="flex-1 overflow-y-auto p-6"
      >
        {!status ? (
          <p className="text-sm text-neutral-500">Starting…</p>
        ) : tab === 'home' ? (
          <Home status={status} />
        ) : tab === 'history' ? (
          <History status={status} />
        ) : tab === 'profile' ? (
          <AboutMe />
        ) : tab === 'settings' ? (
          <Settings />
        ) : (
          <Dictionary status={status} />
        )}
      </div>
    </main>
  );
}
