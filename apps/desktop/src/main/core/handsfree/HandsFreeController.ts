import type { HeardMessage } from '@sayso/helper-protocol';
import type { HandsFreeStatus } from '../../../shared/status.ts';
import { cleanWords, stripNonSpeech } from '../stt/normalize.ts';
import type { TranscriptSegment } from '../stt/types.ts';
import type { PipelineMode } from '../UtterancePipeline.ts';
import { classifyHeard } from './triggers.ts';

/** How long Sayso stays awake after a trigger: commands then work without the wake word. */
const AWAKE_MS = 60_000;
/** A held-key dictation this close before an utterance means the utterance is that same speech. */
const HOLD_OVERLAP_MS = 1_500;

export interface HandsFreeDeps {
  /** Microphone on and off in the helper. */
  listen: { start(): Promise<void>; stop(): Promise<void> };
  /** Delivers an utterance exactly as a held-key one: dictation or command mode. */
  deliver: (segment: TranscriptSegment, mode: PipelineMode) => Promise<void>;
  isCommand: (text: string) => boolean;
  wakeWord: () => string;
  /** False while the speech model is still loading. */
  sttReady: () => boolean;
  /** True while a held-key dictation is in progress; and when the last one was. */
  holdBusy: () => boolean;
  lastHoldAt: () => number;
  /** Shown in the pill when something an utterance asked for could not be done. */
  onError: (message: string) => void;
  onStatus: (status: HandsFreeStatus) => void;
  describeError: (error: unknown) => string;
  now?: () => number;
  log?: (message: string) => void;
}

/**
 * Hands-free mode: while it is on, the helper reports every utterance it hears, and this decides
 * which ones to act on (see classifyHeard). Utterances are handled one at a time, in order.
 */
export class HandsFreeController {
  private current: HandsFreeStatus = { state: 'off' };
  private awakeUntil = 0;
  private queue: Promise<void> = Promise.resolve();
  private readonly now: () => number;

  constructor(private readonly deps: HandsFreeDeps) {
    this.now = deps.now ?? Date.now;
  }

  get status(): HandsFreeStatus {
    return this.current;
  }

  /** Turns listening on. Throws an Error with a plain message when it cannot. */
  async enable(): Promise<void> {
    if (this.current.state === 'listening' || this.current.state === 'starting') return;
    if (!this.deps.sttReady()) {
      throw new Error('The speech model is still loading. Try again in a moment.');
    }
    this.set({ state: 'starting' });
    try {
      await this.deps.listen.start();
      this.set({ state: 'listening' });
    } catch (error) {
      const message = this.deps.describeError(error);
      this.set({ state: 'error', message });
      throw new Error(message, { cause: error });
    }
  }

  async disable(): Promise<void> {
    if (this.current.state === 'off') return;
    this.set({ state: 'off' });
    this.awakeUntil = 0;
    try {
      await this.deps.listen.stop();
    } catch (error) {
      this.deps.log?.(`[hands-free] stop failed: ${this.deps.describeError(error)}`);
    }
  }

  /** The helper went away: listening stopped with it. */
  reset(reason: string): void {
    if (this.current.state === 'off') return;
    this.awakeUntil = 0;
    this.set({ state: 'error', message: `Hands-free stopped (${reason}). Turn it on again.` });
  }

  /** One utterance from the helper. Handled after the ones before it. */
  handleHeard(message: HeardMessage): Promise<void> {
    const arrivedAt = this.now();
    this.queue = this.queue.then(() => this.process(message, arrivedAt));
    return this.queue;
  }

  private async process(message: HeardMessage, arrivedAt: number): Promise<void> {
    if (this.current.state !== 'listening') return;
    const heardText = `"${message.text.trim()}" (${(message.audioMs / 1000).toFixed(1)} s)`;
    // The held key's own speech is heard by this microphone too: never act on it twice.
    const window = message.audioMs + message.sttMs + HOLD_OVERLAP_MS;
    if (this.deps.holdBusy() || arrivedAt - this.deps.lastHoldAt() < window) {
      this.deps.log?.(`[hands-free] heard ${heardText}: ignored, said while holding the key`);
      return;
    }
    const segment: TranscriptSegment = {
      text: stripNonSpeech(message.text),
      words: cleanWords(message.words),
      audioMs: message.audioMs,
      sttMs: message.sttMs,
      model: message.model,
    };
    const result = classifyHeard(segment, {
      wakeWord: this.deps.wakeWord().toLowerCase(),
      awake: this.now() < this.awakeUntil,
      isCommand: this.deps.isCommand,
    });
    if (result.triggered) this.awakeUntil = this.now() + AWAKE_MS;
    if (!result.intent) {
      this.deps.log?.(
        `[hands-free] heard ${heardText}: ignored, it does not start with "type", "open" or the wake word`,
      );
      return;
    }
    const mode: PipelineMode = result.intent.kind === 'dictate' ? 'dictation' : 'command';
    this.deps.log?.(
      `[hands-free] heard ${heardText}: ${mode === 'dictation' ? 'typing' : 'command'}`,
    );
    try {
      await this.deps.deliver(result.intent.segment, mode);
    } catch (error) {
      this.deps.onError(this.deps.describeError(error));
    }
  }

  private set(status: HandsFreeStatus): void {
    this.current = status;
    this.deps.onStatus(status);
  }
}
