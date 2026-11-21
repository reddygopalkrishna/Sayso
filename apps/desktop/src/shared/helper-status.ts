/** Helper connection state, shared by main, preload and renderer. */
export type HelperStatus =
  | { state: 'starting' }
  | { state: 'connected'; helperVersion: string; os: string }
  | { state: 'crashed'; reason: string; retryInMs: number }
  | { state: 'missing'; path: string }
  | { state: 'stopped' };

export const IPC = {
  getHelperStatus: 'helper:get-status',
  helperStatus: 'helper:status',
} as const;
