import { initialStatus, type AppStatus } from '../shared/status.ts';

/** Single source of the status the UI shows; windows subscribe through IPC. */
export class StatusHub {
  private status: AppStatus = initialStatus;
  private readonly listeners = new Set<(s: AppStatus) => void>();

  get current(): AppStatus {
    return this.status;
  }

  update(patch: Partial<AppStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener(this.status);
  }

  onChange(listener: (s: AppStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
