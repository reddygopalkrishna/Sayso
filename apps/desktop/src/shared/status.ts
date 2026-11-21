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

export interface AppStatus {
  helper: HelperStatus;
  stt: SttStatus;
  fnListener: FnListenerStatus;
  dictation: DictationState;
  /** Last inserted text, for the status window. */
  lastText: string | null;
}

export const initialStatus: AppStatus = {
  helper: { state: 'stopped' },
  stt: { state: 'unknown' },
  fnListener: 'unknown',
  dictation: { phase: 'idle' },
  lastText: null,
};

export const IPC = {
  getStatus: 'status:get',
  status: 'status:update',
} as const;
