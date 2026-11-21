import { useState } from 'react';
import { AboutMe } from './AboutMe.tsx';
import { Dictionary } from './Dictionary.tsx';
import { History } from './History.tsx';
import { Home } from './Home.tsx';
import { SECTIONS, Sidebar, type SectionId } from './Sidebar.tsx';
import { Settings } from './Settings.tsx';
import { useStatus } from './useStatus.ts';

export function App(): React.JSX.Element {
  const status = useStatus();
  const [section, setSection] = useState<SectionId>('home');
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <main className="flex h-screen bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <Sidebar
        current={section}
        onSelect={setSection}
        handsFree={status?.handsFree.state ?? 'off'}
      />
      <div
        role="tabpanel"
        id={`panel-${section}`}
        aria-labelledby={`tab-${section}`}
        className="flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-8 py-8">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">{current.title}</h1>
            <p className="mt-1 text-sm text-neutral-500">{current.subtitle}</p>
          </header>
          {!status ? (
            <p className="text-sm text-neutral-500">Starting…</p>
          ) : section === 'home' ? (
            <Home status={status} />
          ) : section === 'history' ? (
            <History status={status} />
          ) : section === 'profile' ? (
            <AboutMe />
          ) : section === 'settings' ? (
            <Settings />
          ) : (
            <Dictionary status={status} />
          )}
        </div>
      </div>
    </main>
  );
}
