import type { HelperStatus } from '../shared/helper-status.ts';

/** The only surface the renderer can reach (window.sayso). */
export interface SaysoApi {
  getHelperStatus(): Promise<HelperStatus>;
  onHelperStatus(callback: (status: HelperStatus) => void): () => void;
}

declare global {
  interface Window {
    sayso: SaysoApi;
  }
}
