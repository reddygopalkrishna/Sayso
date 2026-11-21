import { useState } from 'react';
import { CLEANUP_LEVELS, SETTING_LIMITS, type UserSettings } from '../../shared/settings.ts';
import { useLoad } from './useLoad.ts';

const field =
  'w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800';

const LEVEL_TEXT: Record<UserSettings['cleanupLevel'], string> = {
  off: 'Off: type exactly what was heard',
  light: 'Light: fix capitals and punctuation on this Mac only',
  full: 'Full: also remove fillers and fix grammar with AI',
};

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

interface FormProps {
  values: UserSettings;
  message: string | null;
  saved: boolean;
  onChange: (patch: Partial<UserSettings>) => void;
  onSave: () => void;
  onReset: () => void;
}

/** The form itself, with no loading or saving of its own (so it can be tested on its own). */
export function SettingsForm({
  values,
  message,
  saved,
  onChange,
  onSave,
  onReset,
}: FormProps): React.JSX.Element {
  return (
    <form
      aria-label="Settings"
      className="flex max-w-xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div>
        <h2 className="text-base font-semibold">Settings</h2>
        <p className="text-xs text-neutral-500">
          Changes apply as soon as you save, with no restart. Your settings file (.env) only gives
          the starting values.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Pause before “send” — <output aria-label="Pause length">{seconds(values.pauseMs)}</output>
        </span>
        <span className="text-xs text-neutral-500">
          Say “send”, “enter” or “new line” after this much silence and it runs as a command; said
          without a pause, it is typed as a word.
        </span>
        <input
          type="range"
          min={SETTING_LIMITS.pauseMs.min}
          max={SETTING_LIMITS.pauseMs.max}
          step={SETTING_LIMITS.pauseMs.step}
          value={values.pauseMs}
          onChange={(e) => onChange({ pauseMs: Number(e.target.value) })}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Preview time — <output aria-label="Preview time">{seconds(values.previewMs)}</output>
        </span>
        <span className="text-xs text-neutral-500">
          How long the preview chip shows before an action runs. Press Esc during it to cancel.
        </span>
        <input
          type="range"
          min={SETTING_LIMITS.previewMs.min}
          max={SETTING_LIMITS.previewMs.max}
          step={SETTING_LIMITS.previewMs.step}
          value={values.previewMs}
          onChange={(e) => onChange({ previewMs: Number(e.target.value) })}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Text cleanup</span>
        <select
          className={field}
          value={values.cleanupLevel}
          onChange={(e) =>
            onChange({ cleanupLevel: e.target.value as UserSettings['cleanupLevel'] })
          }
        >
          {CLEANUP_LEVELS.map((level) => (
            <option key={level} value={level}>
              {LEVEL_TEXT[level]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={values.skipAi}
          onChange={(e) => onChange({ skipAi: e.target.checked })}
        />
        <span>
          <span className="font-medium">Skip the AI for short, clean text</span>
          <span className="block text-xs text-neutral-500">
            Faster, and the text stays on this Mac. Turn off to send everything to the AI.
          </span>
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">History kept</span>
        <span className="text-xs text-neutral-500">
          How many past dictations to remember. 0 turns history off.
        </span>
        <input
          type="number"
          className={`${field} w-32`}
          min={SETTING_LIMITS.historyKeep.min}
          max={SETTING_LIMITS.historyKeep.max}
          value={values.historyKeep}
          onChange={(e) => onChange({ historyKeep: Math.trunc(Number(e.target.value) || 0) })}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900"
        >
          Save
        </button>
        <button type="button" className="text-sm underline" onClick={onReset}>
          Reset to defaults
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

/** Loads the settings, lets you change them, and saves them in the app. */
export function Settings(): React.JSX.Element {
  const loaded = useLoad(() => window.sayso.settings.get());
  // What the app confirmed last (after a save or reset), and the changes not saved yet.
  const [confirmed, setConfirmed] = useState<UserSettings | null>(null);
  const [edits, setEdits] = useState<Partial<UserSettings>>({});
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
  const draft: UserSettings = { ...base, ...edits };

  const run = async (action: () => Promise<UserSettings>): Promise<void> => {
    try {
      setConfirmed(await action());
      setEdits({});
      setMessage(null);
      setSaved(true);
    } catch (e) {
      setSaved(false);
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SettingsForm
      values={draft}
      message={message}
      saved={saved}
      onChange={(patch) => {
        setEdits({ ...edits, ...patch });
        setSaved(false);
      }}
      onSave={() => void run(() => window.sayso.settings.set(draft))}
      onReset={() => void run(() => window.sayso.settings.reset())}
    />
  );
}
