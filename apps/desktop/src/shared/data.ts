/** Data shown in the UI and stored locally. Shared by main, preload and renderer. */

export type HistoryMode = 'dictation' | 'command';
export type HistoryOutcome = 'done' | 'cancelled' | 'blocked' | 'failed';

export interface HistoryAction {
  /** The command that ran or was attempted, e.g. "send" or "click". */
  command: string;
  result: 'ran' | 'cancelled' | 'skipped';
  args?: Record<string, string>;
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
}

export interface DictionaryEntry {
  id: string;
  /** The exact spelling to use, e.g. "Sayso" or "GitHub". */
  phrase: string;
  /** What the speech model tends to hear instead, e.g. "say so". Optional. */
  spokenAs: string | null;
  updatedAt: number;
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
