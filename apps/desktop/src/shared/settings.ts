import { z } from 'zod';

/** What a person can change in the Settings tab. The same limits apply to `.env` values. */
export const SETTING_LIMITS = {
  pauseMs: { min: 200, max: 3_000, step: 100 },
  previewMs: { min: 300, max: 5_000, step: 100 },
  historyKeep: { min: 0, max: 1_000 },
} as const;

export const CLEANUP_LEVELS = ['off', 'light', 'full'] as const;

/** The key that is held to dictate. Fn is the default; the others are the right-hand modifier keys. */
export const HOLD_KEYS = ['fn', 'rightOption', 'rightCommand', 'rightControl'] as const;
export type HoldKeyName = (typeof HOLD_KEYS)[number];

/** Languages you can speak, by their two-letter code; "auto" lets the speech model detect it. */
export const LANGUAGES = [
  'auto',
  'en',
  'te',
  'hi',
  'ta',
  'kn',
  'ml',
  'mr',
  'bn',
  'gu',
  'pa',
  'ur',
  'es',
  'fr',
  'de',
  'pt',
] as const;
export type Language = (typeof LANGUAGES)[number];

/** Default: capitals and full punctuation. Chill: no capitals and minimal punctuation. */
export const STYLES = ['default', 'chill'] as const;
export type Style = (typeof STYLES)[number];

/** Every setting at once, as shown on screen. */
export interface UserSettings {
  /** Silence before a trailing "send" / "enter" / "new line" runs as a command. */
  pauseMs: number;
  /** How long the preview chip shows before an action runs. */
  previewMs: number;
  /** Text cleanup: off (as heard), light (local rules), full (AI). */
  cleanupLevel: (typeof CLEANUP_LEVELS)[number];
  /** Skip the AI for short text the local rules can finish. */
  skipAi: boolean;
  /** History rows to keep; 0 turns history off. */
  historyKeep: number;
  /** How dictated text looks everywhere, unless an app has its own style. */
  style: Style;
  /** The key held to dictate (Shift with it gives commands). */
  holdKey: HoldKeyName;
  /** Hands-free: one word said before a command, lowercase ("sayso"). */
  wakeWord: string;
  /** The language you speak, or "auto" to detect it each time. */
  language: Language;
  /** Understand your own words: when no exact command matches, ask an AI (sends the spoken words and button names). */
  interpret: boolean;
  /** Optional cloud speech: send the recording to OpenAI instead of transcribing on this Mac. Off by default. */
  cloudSpeech: boolean;
}

/** One or more settings to change. Anything else, or any value out of range, is rejected. */
export const SettingsPatchSchema = z
  .object({
    pauseMs: z.number().int().min(SETTING_LIMITS.pauseMs.min).max(SETTING_LIMITS.pauseMs.max),
    previewMs: z.number().int().min(SETTING_LIMITS.previewMs.min).max(SETTING_LIMITS.previewMs.max),
    cleanupLevel: z.enum(CLEANUP_LEVELS),
    skipAi: z.boolean(),
    style: z.enum(STYLES),
    holdKey: z.enum(HOLD_KEYS),
    wakeWord: z.string().regex(/^[a-z][a-z0-9]{1,29}$/),
    language: z.enum(LANGUAGES),
    interpret: z.boolean(),
    cloudSpeech: z.boolean(),
    historyKeep: z
      .number()
      .int()
      .min(SETTING_LIMITS.historyKeep.min)
      .max(SETTING_LIMITS.historyKeep.max),
  })
  .partial()
  .strict();

export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
