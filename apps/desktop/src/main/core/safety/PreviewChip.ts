export type ChipResult = 'proceed' | 'cancelled';

export interface PreviewChipDeps {
  show(label: string, ms: number): void;
  hide(): void;
  /** Ask the helper to swallow Escape and report it (it also switches itself off after seconds). */
  captureEscape(enabled: boolean): Promise<void>;
  /** Subscribe to Escape presses reported by the helper. Returns an unsubscribe function. */
  onEscape(listener: () => void): () => void;
}

/**
 * The preview chip for Normal-level actions: shows what is about to happen for ~1 s. Esc cancels;
 * otherwise the action proceeds. One at a time (utterances are handled serially).
 */
export class PreviewChip {
  constructor(private readonly deps: PreviewChipDeps) {}

  async confirm(label: string, ms: number): Promise<ChipResult> {
    let cancelled = false;
    let wake: (() => void) | null = null;
    const unsubscribe = this.deps.onEscape(() => {
      cancelled = true;
      wake?.();
    });
    try {
      // If the helper cannot capture Escape the chip still shows and the action proceeds.
      await this.deps.captureEscape(true).catch(() => undefined);
      this.deps.show(label, ms);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
        if (cancelled) wake();
      });
    } finally {
      unsubscribe();
      this.deps.hide();
      await this.deps.captureEscape(false).catch(() => undefined);
    }
    return cancelled ? 'cancelled' : 'proceed';
  }
}
