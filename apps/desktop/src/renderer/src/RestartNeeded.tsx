/**
 * The preload API the window needs. If the app (main process and preload) is older than the
 * window, which happens in development when the screens hot-reload but the backend does not, some
 * of these are missing and the screens would crash on first use.
 */
export function hasCurrentApi(api: unknown): boolean {
  if (typeof api !== 'object' || api === null) return false;
  const a = api as Record<string, unknown>;
  return ['history', 'dictionary', 'openChoices', 'permissions'].every(
    (key) => typeof a[key] === 'object' && a[key] !== null,
  );
}

/** Shown instead of the app when the window is newer than the program behind it. */
export function RestartNeeded(): React.JSX.Element {
  return (
    <main className="flex h-screen items-center justify-center bg-neutral-50 p-6 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <div role="alert" className="max-w-md space-y-3 text-sm">
        <h1 className="text-xl font-semibold">Restart Sayso</h1>
        <p>
          This window is newer than the Sayso program running behind it, so some parts cannot work
          yet.
        </p>
        <p>
          Quit Sayso (⌘Q), then start it again. In development: press Ctrl+C in the terminal and run{' '}
          <code>pnpm dev</code> again.
        </p>
      </div>
    </main>
  );
}
