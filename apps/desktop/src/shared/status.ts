/** App status shown in the UI. Shared by main, preload and renderer (no Node imports here). */
export type HelperStatus =
  | { state: 'starting' }
  | { state: 'connected'; helperVersion: string; os: string }
  | { state: 'crashed'; reason: string; retryInMs: number }
  | { state: 'missing'; path: string }
  | { state: 'stopped' };

export type SttStatus =
  | { state: 'unknown' }
  | { state: 'loading' | 'ready'; model: string }
  | { state: 'error'; model: string; message: string };

export type FnListenerStatus = 'unknown' | 'active' | 'unavailable';

export type DictationState =
  | { phase: 'idle' }
  | { phase: 'listening' }
  | { phase: 'transcribing' }
  | { phase: 'inserting' }
  | { phase: 'error'; message: string };

export interface CleanupStatus {
  level: 'off' | 'light' | 'full';
  /** e.g. "gemini · gemini-flash-latest"; null when Full cleanup has no provider (no API key). */
  provider: string | null;
}

export interface LastUtterance {
  text: string;
  appName: string | null;
  /** How the text was produced: raw (off), local light cleanup, LLM, or LLM fallback. */
  method: 'off' | 'light' | 'llm' | 'fallback';
  tone: 'casual' | 'professional' | 'literal';
  /** End command that ran after the text ("send", "enter", "new_line"), if any. */
  command: string | null;
  sttMs: number;
  cleanupMs: number;
}

/** The preview chip: what is about to happen, and for how long Esc can cancel it. */
export interface PreviewStatus {
  /** Changes for every chip so the progress bar restarts. */
  id: number;
  label: string;
  ms: number;
}

export interface AppStatus {
  helper: HelperStatus;
  stt: SttStatus;
  fnListener: FnListenerStatus;
  cleanup: CleanupStatus;
  dictation: DictationState;
  preview: PreviewStatus | null;
  last: LastUtterance | null;
}

export const initialStatus: AppStatus = {
  helper: { state: 'stopped' },
  stt: { state: 'unknown' },
  fnListener: 'unknown',
  cleanup: { level: 'full', provider: null },
  dictation: { phase: 'idle' },
  preview: null,
  last: null,
};

export const IPC = {
  getStatus: 'status:get',
  status: 'status:update',
} as const;
