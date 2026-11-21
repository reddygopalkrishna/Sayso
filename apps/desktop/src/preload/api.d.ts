import type { AppStatus } from '../shared/status.ts';

/** The only surface the renderer can reach (window.sayso). */
export interface SaysoApi {
  getStatus(): Promise<AppStatus>;
  onStatus(callback: (status: AppStatus) => void): () => void;
}

declare global {
  interface Window {
    sayso: SaysoApi;
  }
}
