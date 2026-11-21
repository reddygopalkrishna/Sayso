/** Data shown in the UI and stored locally. Shared by main, preload and renderer. */

export type HistoryMode = 'dictation' | 'command';
export type HistoryOutcome = 'done' | 'cancelled' | 'blocked' | 'failed';

export interface HistoryAction {
  /** The command that ran or was attempted, e.g. "send" or "click". */
  command: string;
  /** 'awaiting': a risky action is waiting for "yes". */
  result: 'ran' | 'cancelled' | 'skipped' | 'awaiting';
  args?: Record<string, string>;
}

/** How the text was produced: raw, local rules, local rules because the AI was not needed, AI, or AI failed. */
export type CleanupMethodName = 'off' | 'light' | 'local' | 'llm' | 'fallback';

export interface HistoryCleanup {
  method: CleanupMethodName;
  /** Time the cleanup step took, in ms. */
  ms: number;
  /** Which AI answered (e.g. "groq", "gemini"), when the method is llm; absent on older rows. */
  provider?: string;
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  appBundleId: string | null;
  appName: string | null;
  mode: HistoryMode;
  /** What was heard. Null when it was refused in a password field. */
  rawText: string | null;
  /** What was typed (dictation), if anything. */
  finalText: string | null;
  action: HistoryAction | null;
  outcome: HistoryOutcome;
  /** End of speech to done, in ms. */
  latencyMs: number | null;
  /** The cleanup step (dictation only); null for commands and for rows saved before it was recorded. */
  cleanup: HistoryCleanup | null;
}

export interface DictionaryEntry {
  id: string;
  /** The exact spelling to use, e.g. "Sayso" or "GitHub". */
  phrase: string;
  /** What the speech model tends to hear instead, e.g. "say so". Optional. */
  spokenAs: string | null;
  updatedAt: number;
}

/** A spoken trigger that types a longer saved text, e.g. "calendly" → a booking link. */
export interface Snippet {
  id: string;
  /** The words you say, as you typed them. */
  trigger: string;
  /** The text typed when the whole phrase is the trigger. */
  body: string;
  updatedAt: number;
}

/** An app you have dictated into, with the style chosen for it (null: follows the everywhere style). */
export interface AppStyle {
  bundleId: string;
  appName: string | null;
  style: 'default' | 'chill' | null;
}

/** What every IPC call from the renderer returns, so errors arrive as plain messages. */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** A remembered answer for "open X" (PRD §7.5): phrase → app or website. */
export interface OpenChoice {
  phrase: string;
  targetType: 'app' | 'url';
  /** Bundle id for an app, URL for a website. */
  target: string;
  updatedAt: number;
}
