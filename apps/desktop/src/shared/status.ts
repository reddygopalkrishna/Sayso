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
  | { phase: 'listening'; mode: 'dictation' | 'command' }
  | { phase: 'transcribing' }
  | { phase: 'inserting' }
  /** A risky action waits for "yes": the text is shown in the pill. */
  | { phase: 'prompt'; message: string }
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
  method: 'off' | 'light' | 'local' | 'llm' | 'fallback';
  tone: 'casual' | 'professional' | 'literal';
  /** Hold Fn dictates; hold Fn+Shift gives commands. */
  mode: 'dictation' | 'command';
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

/** What macOS lets Sayso do. `unknown` until the helper has answered. */
export interface PermissionsStatus {
  microphone: 'granted' | 'denied' | 'undetermined' | 'restricted' | 'unknown';
  accessibility: 'granted' | 'denied' | 'unknown';
}

/** The local database (history, dictionary, remembered choices). */
export type DatabaseStatus = { state: 'unknown' | 'ok' } | { state: 'error'; message: string };

export interface AppStatus {
  helper: HelperStatus;
  stt: SttStatus;
  fnListener: FnListenerStatus;
  cleanup: CleanupStatus;
  dictation: DictationState;
  preview: PreviewStatus | null;
  permissions: PermissionsStatus;
  database: DatabaseStatus;
  last: LastUtterance | null;
}

export const initialStatus: AppStatus = {
  helper: { state: 'stopped' },
  stt: { state: 'unknown' },
  fnListener: 'unknown',
  cleanup: { level: 'full', provider: null },
  dictation: { phase: 'idle' },
  preview: null,
  permissions: { microphone: 'unknown', accessibility: 'unknown' },
  database: { state: 'unknown' },
  last: null,
};

export const IPC = {
  getStatus: 'status:get',
  status: 'status:update',
  listHistory: 'history:list',
  clearHistory: 'history:clear',
  listDictionary: 'dictionary:list',
  addDictionary: 'dictionary:add',
  removeDictionary: 'dictionary:remove',
  listOpenChoices: 'choices:list',
  removeOpenChoice: 'choices:remove',
  requestPermission: 'permissions:request',
  openSettings: 'settings:open',
} as const;

/** The panes of System Settings the onboarding screen can open. */
export type SettingsPane = 'microphone' | 'accessibility' | 'keyboard';
