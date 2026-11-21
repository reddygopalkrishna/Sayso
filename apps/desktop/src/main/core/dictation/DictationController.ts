import type { DictationState } from '../../../shared/status.ts';
import type { STTProvider, TranscriptSegment } from '../stt/types.ts';
import { describeError } from './errors.ts';

export type HotkeyPhase = 'down' | 'up' | 'chord' | 'command';

export interface DictationOptions {
  stt: STTProvider;
  /**
   * What to do with a non-empty transcript: `dictation` (hold Fn) types it, `command` (hold
   * Fn+Shift) treats the whole utterance as a command.
   */
  deliver: (segment: TranscriptSegment, mode: 'dictation' | 'command') => Promise<void>;
  now?: () => number;
  /**
   * Called when a recording ends and will be transcribed (Fn released, not a tap or a cancel):
   * a moment to get ready for what comes next, such as opening the AI connection while
   * speech-to-text runs.
   */
  onRelease?: (mode: 'dictation' | 'command') => void;
  /** Holds shorter than this are taps, not dictation. */
  minHoldMs?: number;
  /** Recording stops by itself after this long. */
  maxRecordMs?: number;
  /** How long an error stays on screen before returning to idle. */
  errorDisplayMs?: number;
  log?: (msg: string) => void;
}

type Internal =
  | { phase: 'idle' }
  | {
      phase: 'starting';
      id: string;
      startedAt: number;
      then: 'stop' | 'cancel' | null;
      command: boolean;
    }
  | { phase: 'recording'; id: string; startedAt: number; command: boolean }
  | { phase: 'transcribing'; id: string }
  | { phase: 'inserting'; id: string }
  | { phase: 'prompt'; message: string }
  | { phase: 'error'; message: string };

/**
 * Fn hold → record → transcribe → deliver, as a state machine. Owns the utterance lifecycle only;
 * what happens to the text is `deliver`'s job.
 */
export class DictationController {
  private state: Internal = { phase: 'idle' };
  private seq = 0;
  private readonly listeners = new Set<(s: DictationState) => void>();
  private maxTimer: NodeJS.Timeout | null = null;
  private errorTimer: NodeJS.Timeout | null = null;
  private promptTimer: NodeJS.Timeout | null = null;
  private readonly now: () => number;
  private readonly minHoldMs: number;
  private readonly maxRecordMs: number;
  private readonly errorDisplayMs: number;
  private readonly log: (msg: string) => void;

  constructor(private readonly opts: DictationOptions) {
    this.now = opts.now ?? Date.now;
    this.minHoldMs = opts.minHoldMs ?? 250;
    this.maxRecordMs = opts.maxRecordMs ?? 5 * 60_000;
    this.errorDisplayMs = opts.errorDisplayMs ?? 3_000;
    this.log = opts.log ?? (() => undefined);
  }

  get current(): DictationState {
    return publicState(this.state);
  }

  onState(listener: (s: DictationState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  handleHotkey(phase: HotkeyPhase): void {
    const s = this.state;
    switch (phase) {
      case 'down':
        if (s.phase === 'idle' || s.phase === 'error' || s.phase === 'prompt') void this.begin();
        break;
      case 'up':
        if (s.phase === 'recording') void this.finish(s.id, s.startedAt);
        else if (s.phase === 'starting') s.then ??= 'stop';
        break;
      case 'chord':
        if (s.phase === 'recording') void this.cancel(s.id, 'Fn shortcut');
        else if (s.phase === 'starting') s.then = 'cancel';
        break;
      case 'command':
        // Shift held with Fn (before or after pressing Fn): this utterance is a command.
        if (s.phase === 'starting' || s.phase === 'recording') this.set({ ...s, command: true });
        break;
    }
  }

  /** The helper went away: whatever was in flight is lost. */
  reset(reason: string): void {
    if (
      this.state.phase === 'idle' ||
      this.state.phase === 'error' ||
      this.state.phase === 'prompt'
    ) {
      return;
    }
    this.log(`dictation reset: ${reason}`);
    this.clearMaxTimer();
    this.set({ phase: 'idle' });
  }

  private async begin(): Promise<void> {
    const readiness = this.opts.stt.readiness();
    if (!readiness.ready) {
      this.fail(readiness.message);
      return;
    }
    const id = `u-${++this.seq}`;
    const startedAt = this.now();
    this.set({ phase: 'starting', id, startedAt, then: null, command: false });
    try {
      await this.opts.stt.start(id);
    } catch (error) {
      if (this.isCurrent(id)) this.fail(describeError(error));
      return;
    }
    const s = this.state;
    if (s.phase !== 'starting' || s.id !== id) return;
    if (s.then === 'cancel') {
      await this.cancel(id, 'Fn shortcut');
      return;
    }
    this.set({ phase: 'recording', id, startedAt, command: s.command });
    if (s.then === 'stop') {
      await this.finish(id, startedAt);
      return;
    }
    this.maxTimer = setTimeout(() => {
      this.log(`recording ${id} hit the ${this.maxRecordMs} ms limit`);
      void this.finish(id, startedAt);
    }, this.maxRecordMs);
  }

  private async finish(id: string, startedAt: number): Promise<void> {
    if (!this.isCurrent(id)) return;
    this.clearMaxTimer();
    if (this.now() - startedAt < this.minHoldMs) {
      await this.cancel(id, 'tap');
      return;
    }
    const mode = this.state.phase === 'recording' && this.state.command ? 'command' : 'dictation';
    try {
      this.opts.onRelease?.(mode);
    } catch (error) {
      this.log(`onRelease failed: ${String(error)}`);
    }
    this.set({ phase: 'transcribing', id });
    let segment: TranscriptSegment;
    try {
      segment = await this.opts.stt.stop(id);
    } catch (error) {
      if (this.isCurrent(id)) this.fail(describeError(error));
      return;
    }
    if (!this.isCurrent(id)) return;
    this.log(
      `utterance ${id}: ${segment.audioMs.toFixed(0)} ms audio, STT ${segment.sttMs.toFixed(0)} ms, ${segment.words.length} words`,
    );
    if (segment.text === '') {
      this.set({ phase: 'idle' });
      return;
    }
    this.set({ phase: 'inserting', id });
    try {
      await this.opts.deliver(segment, mode);
    } catch (error) {
      if (this.isCurrent(id)) this.fail(describeError(error));
      return;
    }
    if (this.isCurrent(id)) this.set({ phase: 'idle' });
  }

  private async cancel(id: string, reason: string): Promise<void> {
    this.clearMaxTimer();
    this.log(`utterance ${id} cancelled (${reason})`);
    this.set({ phase: 'idle' });
    await this.opts.stt.cancel(id);
  }

  private fail(message: string): void {
    this.clearMaxTimer();
    this.log(`dictation error: ${message}`);
    this.set({ phase: 'error', message });
    this.errorTimer = setTimeout(() => {
      this.errorTimer = null;
      if (this.state.phase === 'error') this.set({ phase: 'idle' });
    }, this.errorDisplayMs);
  }

  private isCurrent(id: string): boolean {
    return 'id' in this.state && this.state.id === id;
  }

  private clearMaxTimer(): void {
    if (this.maxTimer) clearTimeout(this.maxTimer);
    this.maxTimer = null;
  }

  /** Shows a "say yes" prompt in the pill for `ms`. Not shown while an utterance is in progress. */
  showPrompt(message: string, ms: number): void {
    if (this.state.phase === 'starting' || this.state.phase === 'recording') return;
    this.set({ phase: 'prompt', message });
    if (this.promptTimer) clearTimeout(this.promptTimer);
    this.promptTimer = setTimeout(() => {
      this.promptTimer = null;
      if (this.state.phase === 'prompt') this.set({ phase: 'idle' });
    }, ms);
  }

  clearPrompt(): void {
    if (this.state.phase === 'prompt') this.set({ phase: 'idle' });
  }

  private set(next: Internal): void {
    if (this.errorTimer && next.phase !== 'error') {
      clearTimeout(this.errorTimer);
      this.errorTimer = null;
    }
    if (this.promptTimer && next.phase !== 'prompt') {
      clearTimeout(this.promptTimer);
      this.promptTimer = null;
    }
    const before = publicState(this.state);
    this.state = next;
    const after = publicState(next);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    for (const listener of this.listeners) listener(after);
  }
}

function publicState(s: Internal): DictationState {
  switch (s.phase) {
    case 'starting':
    case 'recording':
      return { phase: 'listening', mode: s.command ? 'command' : 'dictation' };
    case 'error':
      return { phase: 'error', message: s.message };
    case 'prompt':
      return { phase: 'prompt', message: s.message };
    default:
      return { phase: s.phase };
  }
}
