import { useState } from 'react';
import { PROFILE_FIELDS, type ProfileKey, type ProfileValues } from '../../shared/profile.ts';
import { useLoad } from './useLoad.ts';

const field =
  'w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800';

interface FormProps {
  values: Record<ProfileKey, string>;
  message: string | null;
  saved: boolean;
  onChange: (key: ProfileKey, value: string) => void;
  onSave: () => void;
}

/** The form itself, with no loading or saving of its own (so it can be tested on its own). */
export function AboutMeForm({
  values,
  message,
  saved,
  onChange,
  onSave,
}: FormProps): React.JSX.Element {
  return (
    <form
      aria-label="About me"
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div>
        <h2 className="text-base font-semibold">About me</h2>
        <p className="text-xs text-neutral-500">
          Facts Sayso can type for you. Say “type my email” or “my address” into any field, by
          voice, in any app. They stay on this Mac: they are never sent anywhere, not even to the
          AI.
        </p>
      </div>
      {PROFILE_FIELDS.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{f.label}</span>
          {f.key === 'address' ? (
            <textarea
              className={`${field} min-h-16`}
              value={values[f.key]}
              maxLength={500}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          ) : (
            <input
              className={field}
              value={values[f.key]}
              maxLength={500}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          )}
          <span className="text-xs text-neutral-500">Say “type {f.phrases[0]}”</span>
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
        >
          Save
        </button>
        <p role="status" className="min-h-4 text-xs">
          {message ? (
            <span className="text-red-600 dark:text-red-400">{message}</span>
          ) : saved ? (
            <span className="text-green-700 dark:text-green-400">Saved.</span>
          ) : null}
        </p>
      </div>
    </form>
  );
}

const blank = (saved: ProfileValues): Record<ProfileKey, string> =>
  Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, saved[f.key] ?? ''])) as Record<
    ProfileKey,
    string
  >;

/** Loads what is saved, lets you change it, and saves it on this Mac. */
export function AboutMe(): React.JSX.Element {
  const loaded = useLoad(() => window.sayso.profile.get());
  const [confirmed, setConfirmed] = useState<ProfileValues | null>(null);
  const [edits, setEdits] = useState<Partial<Record<ProfileKey, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const base = confirmed ?? loaded.data;
  if (loaded.error) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {loaded.error}
      </p>
    );
  }
  if (!base) return <p className="text-sm text-neutral-500">Loading…</p>;
  const values = { ...blank(base), ...edits };

  return (
    <AboutMeForm
      values={values}
      message={message}
      saved={saved}
      onChange={(key, value) => {
        setEdits({ ...edits, [key]: value });
        setSaved(false);
      }}
      onSave={() => {
        window.sayso.profile
          .set(values)
          .then((all) => {
            setConfirmed(all);
            setEdits({});
            setMessage(null);
            setSaved(true);
          })
          .catch((e: unknown) => {
            setSaved(false);
            setMessage(e instanceof Error ? e.message : String(e));
          });
      }}
    />
  );
}
