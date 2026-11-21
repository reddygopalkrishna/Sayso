import type { PermissionsMessage } from '@sayso/helper-protocol';
import type { PermissionsStatus } from '../../../shared/status.ts';

export const unknownPermissions: PermissionsStatus = {
  microphone: 'unknown',
  accessibility: 'unknown',
};

export function toStatus(message: PermissionsMessage): PermissionsStatus {
  return {
    microphone: message.microphone,
    accessibility: message.accessibility ? 'granted' : 'denied',
  };
}

export function isComplete(p: PermissionsStatus): boolean {
  return p.microphone === 'granted' && p.accessibility === 'granted';
}

export interface PermissionsMonitorDeps {
  /** Asks the helper for the current permissions; rejects while it is not connected. */
  ask: () => Promise<PermissionsMessage>;
  onChange: (status: PermissionsStatus) => void;
  /** While something is missing the user is probably in System Settings, so look often. */
  fastMs?: number;
  /** Once everything is granted, only watch for it being switched off again. */
  slowMs?: number;
}

/** Keeps the onboarding screen's permission status fresh without the user pressing anything. */
export class PermissionsMonitor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private current: PermissionsStatus = unknownPermissions;
  private readonly fastMs: number;
  private readonly slowMs: number;

  constructor(private readonly deps: PermissionsMonitorDeps) {
    this.fastMs = deps.fastMs ?? 2_000;
    this.slowMs = deps.slowMs ?? 15_000;
  }

  get status(): PermissionsStatus {
    return this.current;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Looks now (after the user pressed a button) instead of waiting for the next poll. */
  async refresh(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.tick();
  }

  /** The helper went away: the last answer no longer means anything. */
  reset(): void {
    this.set(unknownPermissions);
  }

  /** Use an answer we already have (e.g. the reply to a permission request). */
  accept(message: PermissionsMessage): void {
    this.set(toStatus(message));
  }

  private async tick(): Promise<void> {
    try {
      this.set(toStatus(await this.deps.ask()));
    } catch {
      this.set(unknownPermissions);
    }
    if (!this.running) return;
    this.timer = setTimeout(
      () => void this.tick(),
      isComplete(this.current) ? this.slowMs : this.fastMs,
    );
  }

  private set(next: PermissionsStatus): void {
    if (
      next.microphone === this.current.microphone &&
      next.accessibility === this.current.accessibility
    )
      return;
    this.current = next;
    this.deps.onChange(next);
  }
}
