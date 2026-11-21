import { useState } from 'react';
import type { AppStyle } from '../../shared/data.ts';
import {
  CLEANUP_LEVELS,
  HOLD_KEYS,
  LANGUAGES,
  type Language,
  type HoldKeyName,
  SETTING_LIMITS,
  STYLES,
  type Style,
  type UserSettings,
} from '../../shared/settings.ts';
import { Card, fieldClass as field, primaryButtonClass } from './Card.tsx';
import { useLoad } from './useLoad.ts';

const LEVEL_TEXT: Record<UserSettings['cleanupLevel'], string> = {
  off: 'Off: type exactly what was heard',
  light: 'Light: fix capitals and punctuation on this Mac only',
  full: 'Full: also remove fillers and fix grammar with AI',
};

const HOLD_KEY_TEXT: Record<HoldKeyName, string> = {
  fn: 'Fn (globe key)',
  rightOption: 'Right Option ⌥',
  rightCommand: 'Right Command ⌘',
  rightControl: 'Right Control ⌃',
};

const LANGUAGE_TEXT: Record<Language, string> = {
  auto: 'Detect it each time',
  en: 'English',
  te: 'Telugu (తెలుగు)',
  hi: 'Hindi (हिन्दी)',
  ta: 'Tamil (தமிழ்)',
  kn: 'Kannada (ಕನ್ನಡ)',
  ml: 'Malayalam (മലയാളം)',
  mr: 'Marathi (मराठी)',
  bn: 'Bengali (বাংলা)',
  gu: 'Gujarati (ગુજરાતી)',
  pa: 'Punjabi (ਪੰਜਾਬੀ)',
  ur: 'Urdu (اردو)',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
};

const STYLE_CARDS: Record<Style, { title: string; hint: string; example: string }> = {
  default: {
    title: 'Default',
    hint: 'Capitals and full punctuation',
    example: 'Hey, are you free for lunch tomorrow? Let’s do 12 if that works for you.',
  },
  chill: {
    title: 'Chill',
    hint: 'No capitals, minimal punctuation',
    example: 'hey are you free for lunch tomorrow let’s do 12 if that works for you',
  },
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
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <p className="text-xs text-neutral-500">
        Changes apply as soon as you save, with no restart. Your settings file (.env) only gives the
        starting values.
      </p>

      <Card
        title="Voice"
        description="How you start talking: the key, the language and the hands-free word."
      >
        <div className="flex flex-col gap-5">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Key to hold to dictate</span>
            <span className="text-xs text-neutral-500">
              Hold it while you speak. Add Shift for commands. Pick a different key if another
              dictation app already uses Fn, otherwise both type everything you say.
            </span>
            <select
              className={field}
              aria-label="Key to hold to dictate"
              value={values.holdKey}
              onChange={(e) => onChange({ holdKey: e.target.value as HoldKeyName })}
            >
              {HOLD_KEYS.map((key) => (
                <option key={key} value={key}>
                  {HOLD_KEY_TEXT[key]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Language you speak</span>
            <span className="text-xs text-neutral-500">
              Text is typed in this language and its own script. “Detect it each time” suits mixing
              languages, but is a little less accurate. Voice commands (“send”, “open”, “type”) stay
              in English.
            </span>
            <select
              className={field}
              aria-label="Language you speak"
              value={values.language}
              onChange={(e) => onChange({ language: e.target.value as Language })}
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_TEXT[code]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Hands-free wake word</span>
            <span className="text-xs text-neutral-500">
              Say it before a command in hands-free mode (“{values.wakeWord}, new tab”). One word,
              letters and digits, at least two characters.
            </span>
            <input
              className={`${field} w-48`}
              aria-label="Hands-free wake word"
              value={values.wakeWord}
              maxLength={30}
              onChange={(e) =>
                onChange({ wakeWord: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })
              }
            />
          </label>
        </div>
      </Card>

      <Card title="Text" description="How dictated text looks and is cleaned up.">
        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="font-medium">Style</legend>
            <span className="text-xs text-neutral-500">
              How dictated text looks everywhere. You can give single apps their own style below.
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {STYLES.map((style) => (
                <label
                  key={style}
                  className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 ${
                    values.style === style
                      ? 'border-neutral-900 dark:border-white'
                      : 'border-neutral-200 dark:border-neutral-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="style"
                      checked={values.style === style}
                      onChange={() => onChange({ style })}
                    />
                    <span className="font-medium">{STYLE_CARDS[style].title}</span>
                    <span className="text-xs text-neutral-500">{STYLE_CARDS[style].hint}</span>
                  </span>
                  <span className="text-xs text-neutral-600 dark:text-neutral-300">
                    {STYLE_CARDS[style].example}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

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
            <span className="font-medium">
              Pause before “send” —{' '}
              <output aria-label="Pause length">{seconds(values.pauseMs)}</output>
            </span>
            <span className="text-xs text-neutral-500">
              Say “send”, “enter” or “new line” after this much silence and it runs as a command;
              said without a pause, it is typed as a word.
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
        </div>
      </Card>

      <Card
        title="Understanding"
        description="Free-form sentences, and how long you can stop an action."
      >
        <div className="flex flex-col gap-5">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              aria-label="Understand my own words"
              checked={values.interpret}
              onChange={(e) => onChange({ interpret: e.target.checked })}
            />
            <span>
              <span className="font-medium">Understand my own words</span>
              <span className="block text-xs text-neutral-500">
                When you say something that is not an exact command (“log me in”, “open a fresh tab
                and search for AWS”), Sayso asks an AI to work out the steps. It sends what you
                said, the app’s name and the names of the buttons and links on screen (never page
                text or what you typed), only then, and never in password fields or meetings. Every
                step still goes through the same safety checks.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              aria-label="Cloud speech"
              checked={values.cloudSpeech}
              onChange={(e) => onChange({ cloudSpeech: e.target.checked })}
            />
            <span>
              <span className="font-medium">Cloud speech (optional)</span>
              <span className="block text-xs text-neutral-500">
                Off by default: your voice is turned into text on this Mac and never leaves it.
                Turn this on to send each recording to OpenAI instead, which is faster and more
                accurate on short phrases and names, but needs the internet and an OpenAI key, and
                the audio leaves your Mac. Hands-free listening stays on this Mac either way.
              </span>
            </span>
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
        </div>
      </Card>

      <Card title="Privacy and history" description="What is remembered on this Mac.">
        <div className="flex flex-col gap-5">
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
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <button type="submit" className={primaryButtonClass}>
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

interface AppStyleListProps {
  apps: AppStyle[];
  everywhere: Style;
  onChange: (app: AppStyle, style: Style | null) => void;
}

/** The apps you have dictated into, each with its own style or "follows everywhere". */
export function AppStyleList({ apps, everywhere, onChange }: AppStyleListProps): React.JSX.Element {
  return (
    <Card
      label="Style per app"
      title="Style per app"
      description={`Apps appear here after you dictate into them. “Everywhere” follows the style above (${STYLE_CARDS[everywhere].title}).`}
    >
      {apps.length === 0 && <p className="text-sm text-neutral-500">No apps yet.</p>}
      <ul className="flex flex-col gap-1.5">
        {apps.map((app) => (
          <li
            key={app.bundleId}
            className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm dark:bg-neutral-800/60"
          >
            <span className="min-w-0 truncate font-medium">{app.appName ?? app.bundleId}</span>
            <select
              className={`${field} w-40 shrink-0`}
              aria-label={`Style for ${app.appName ?? app.bundleId}`}
              value={app.style ?? 'everywhere'}
              onChange={(e) =>
                onChange(app, e.target.value === 'everywhere' ? null : (e.target.value as Style))
              }
            >
              <option value="everywhere">Everywhere</option>
              <option value="default">Default</option>
              <option value="chill">Chill</option>
            </select>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Loads the settings, lets you change them, and saves them in the app. */
export function Settings(): React.JSX.Element {
  const loaded = useLoad(() => window.sayso.settings.get());
  const appList = useLoad(() => window.sayso.appStyles.list());
  const [appMessage, setAppMessage] = useState<string | null>(null);
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

  const changeApp = async (app: AppStyle, style: Style | null): Promise<void> => {
    try {
      await window.sayso.appStyles.set(app.bundleId, app.appName, style);
      setAppMessage(null);
      await appList.reload();
    } catch (e) {
      setAppMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col gap-4">
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
      <AppStyleList
        apps={appList.data ?? []}
        everywhere={draft.style}
        onChange={(app, style) => void changeApp(app, style)}
      />
      {(appMessage ?? appList.error) && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {appMessage ?? appList.error}
        </p>
      )}
    </div>
  );
}
