import type { HotkeyPhase } from './DictationController.ts';

export interface DoubleTapOptions {
  /** A press shorter than this is a tap (same as the dictation minimum hold). */
  tapMaxMs?: number;
  /** The second press must start within this long after the first tap ends. */
  gapMs?: number;
}

/**
 * Spots a quick double tap of the hold key (Fn, Fn, within about half a second). Two taps never
 * dictate anything, so this is free to mean something else: toggling hands-free.
 *
 * `handle` says what to do with each hotkey event: pass it on to dictation, or swallow it because
 * it belongs to the second tap (so no recording starts for it).
 */
export class DoubleTap {
  private readonly tapMaxMs: number;
  private readonly gapMs: number;
  private downAt: number | null = null;
  private lastTapEndedAt: number | null = null;
  private swallowing = false;

  constructor(options: DoubleTapOptions = {}) {
    this.tapMaxMs = options.tapMaxMs ?? 250;
    this.gapMs = options.gapMs ?? 450;
  }

  /**
   * @returns `pass` to give the event to dictation, `swallow` to drop it, `double` when this event
   * is the second press of a double tap (also dropped; act on it).
   */
  handle(phase: HotkeyPhase, now: number): 'pass' | 'swallow' | 'double' {
    switch (phase) {
      case 'down': {
        const tappedRecently =
          this.lastTapEndedAt !== null && now - this.lastTapEndedAt <= this.gapMs;
        this.downAt = now;
        if (tappedRecently) {
          this.lastTapEndedAt = null;
          this.swallowing = true;
          return 'double';
        }
        return 'pass';
      }
      case 'up': {
        if (this.swallowing) {
          this.swallowing = false;
          this.downAt = null;
          return 'swallow';
        }
        const wasTap = this.downAt !== null && now - this.downAt < this.tapMaxMs;
        this.lastTapEndedAt = wasTap ? now : null;
        this.downAt = null;
        return 'pass';
      }
      case 'chord':
      case 'command':
        // Fn used with another key, or Shift for a command: not a tap.
        this.lastTapEndedAt = null;
        this.downAt = null;
        return this.swallowing ? 'swallow' : 'pass';
    }
  }
}
