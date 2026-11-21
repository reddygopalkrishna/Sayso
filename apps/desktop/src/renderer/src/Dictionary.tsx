import { useEffect, useState } from 'react';
import type { AppStatus } from '../../shared/status.ts';
import { useLoad } from './useLoad.ts';

const input =
  'w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800';

/** Your own words (names, product terms) spelled the way you want, and what "open X" remembered. */
export function Dictionary({ status }: { status: AppStatus }): React.JSX.Element {
  const words = useLoad(() => window.sayso.dictionary.list());
  const choices = useLoad(() => window.sayso.openChoices.list());
  const [phrase, setPhrase] = useState('');
  const [spokenAs, setSpokenAs] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Saying "open GitHub" adds a remembered choice: show it without reopening the tab.
  const signal = `${status.last?.mode ?? ''}|${status.last?.text ?? ''}|${status.last?.sttMs ?? ''}`;
  const reloadChoices = choices.reload;
  useEffect(() => {
    void reloadChoices();
  }, [signal, reloadChoices]);

  const add = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    try {
      await window.sayso.dictionary.add(phrase, spokenAs.trim() === '' ? null : spokenAs);
      setPhrase('');
      setSpokenAs('');
      setMessage(null);
      await words.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Dictionary" className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Your words</h2>
          <p className="text-xs text-neutral-500">
            Names and terms to spell your way. Add what Sayso tends to hear instead (“sounds like”)
            to fix words it mishears, such as “say so” → Sayso.
          </p>
        </div>
        <form onSubmit={(e) => void add(e)} className="flex flex-wrap items-end gap-2">
          <label className="min-w-40 flex-1 text-xs">
            Word or name
            <input
              className={`${input} mt-1`}
              value={phrase}
              maxLength={100}
              placeholder="Sayso"
              onChange={(e) => setPhrase(e.target.value)}
            />
          </label>
          <label className="min-w-40 flex-1 text-xs">
            Sounds like (optional)
            <input
              className={`${input} mt-1`}
              value={spokenAs}
              maxLength={100}
              placeholder="say so"
              onChange={(e) => setSpokenAs(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            disabled={phrase.trim() === ''}
          >
            Add
          </button>
        </form>
        <p role="status" className="min-h-4 text-xs text-red-600 dark:text-red-400">
          {message}
        </p>
        {words.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {words.error}
          </p>
        )}
        {words.data?.length === 0 && <p className="text-sm text-neutral-500">No words yet.</p>}
        <ul className="flex flex-col gap-1.5">
          {words.data?.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700"
            >
              <span>
                <span className="font-medium">{entry.phrase}</span>
                {entry.spokenAs && (
                  <span className="text-neutral-500"> · sounds like “{entry.spokenAs}”</span>
                )}
              </span>
              <button
                type="button"
                className="text-xs underline"
                aria-label={`Remove ${entry.phrase}`}
                onClick={() => void window.sayso.dictionary.remove(entry.id).then(words.reload)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Remembered choices" className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Remembered “open” choices</h2>
          <p className="text-xs text-neutral-500">
            Sayso remembers what “open …” opened, so the same words open the same thing next time.
            Say “open GitHub app” or “open GitHub website” to change it, or forget it here.
          </p>
        </div>
        {choices.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {choices.error}
          </p>
        )}
        {choices.data?.length === 0 && (
          <p className="text-sm text-neutral-500">Nothing remembered yet.</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {choices.data?.map((choice) => (
            <li
              key={choice.phrase}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700"
            >
              <span className="min-w-0">
                <span className="font-medium">“open {choice.phrase}”</span>
                <span className="text-neutral-500">
                  {' '}
                  → {choice.targetType === 'app' ? 'the app' : 'the website'}{' '}
                  <span className="break-all">{choice.target}</span>
                </span>
              </span>
              <button
                type="button"
                className="shrink-0 text-xs underline"
                aria-label={`Forget open ${choice.phrase}`}
                onClick={() =>
                  void window.sayso.openChoices.remove(choice.phrase).then(choices.reload)
                }
              >
                Forget
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
