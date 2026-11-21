/** Shown when the renderer's dev URL is opened in a browser instead of the Sayso app. */
export function OpenInApp(): React.JSX.Element {
  return (
    <main className="flex h-screen items-center justify-center bg-neutral-50 p-6 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="max-w-md space-y-3 text-sm">
        <h1 className="text-xl font-semibold">This page only works inside the Sayso app</h1>
        <p>
          localhost:5173 is the development server that feeds the Sayso window. Opened in a browser
          it has no connection to the app.
        </p>
        <p>
          The Sayso window opens by itself when you run <code>pnpm dev</code>. If you closed it,
          click the <strong>Electron</strong> icon in the Dock to open it again.
        </p>
      </div>
    </main>
  );
}
