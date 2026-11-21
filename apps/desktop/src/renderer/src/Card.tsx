/** The rounded card every screen is built from (Home, Activity, About me, Words, Settings). */
export function Card({
  title,
  description,
  children,
  label,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** Accessible name when it should differ from the title. */
  label?: string;
}): React.JSX.Element {
  return (
    <section
      aria-label={label ?? title}
      className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      {(title || description) && (
        <div className="mb-3">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Text boxes and selects inside cards. */
export const fieldClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800';

export const primaryButtonClass =
  'rounded-lg bg-neutral-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200';

/** One row inside a card: calm, rounded, with a soft fill. */
export const rowClass = 'rounded-lg bg-neutral-50 px-3 py-2 text-sm dark:bg-neutral-800/60';

/** A line saying nothing is here yet. */
export function Empty({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="text-sm text-neutral-500">{children}</p>;
}
