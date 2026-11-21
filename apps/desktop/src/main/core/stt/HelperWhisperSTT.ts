import type { SttStatusMessage } from '@sayso/helper-protocol';
import type { HelperRequester } from '../../helper/HelperProcess.ts';
import { cleanWords, stripNonSpeech } from './normalize.ts';
import type { STTProvider, SttReadiness, TranscriptSegment } from './types.ts';

export interface HelperWhisperSTTOptions {
  /** Mic permission prompts can take a while on first use. */
  startTimeoutMs?: number;
  stopTimeoutMs?: number;
}

/** WhisperKit running inside the Swift helper. Audio never leaves the helper. */
export class HelperWhisperSTT implements STTProvider {
  readonly name = 'whisperkit';
  private status: SttStatusMessage | null = null;
  private readonly startTimeoutMs: number;
  private readonly stopTimeoutMs: number;

  constructor(
    private readonly helper: HelperRequester,
    options: HelperWhisperSTTOptions = {},
  ) {
    this.startTimeoutMs = options.startTimeoutMs ?? 30_000;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 60_000;
  }

  /** Feed `sttStatus` events from the helper. */
  updateStatus(status: SttStatusMessage | null): void {
    this.status = status;
  }

  readiness(): SttReadiness {
    switch (this.status?.state) {
      case 'ready':
        return { ready: true };
      case 'loading':
        return {
          ready: false,
          reason: 'loading',
          message: 'Speech model is still loading (the first run downloads it).',
        };
      case 'error':
        return { ready: false, reason: 'error', message: 'Speech model failed to load.' };
      default:
        return { ready: false, reason: 'unavailable', message: 'Helper is not running.' };
    }
  }

  async start(utteranceId: string): Promise<void> {
    await this.helper.request(
      { type: 'recordStart' },
      { id: utteranceId, timeoutMs: this.startTimeoutMs },
    );
  }

  async stop(utteranceId: string): Promise<TranscriptSegment> {
    const reply = await this.helper.request(
      { type: 'recordStop' },
      { id: utteranceId, timeoutMs: this.stopTimeoutMs },
    );
    if (reply.type !== 'transcript') {
      throw new Error(`expected transcript for ${utteranceId}, got ${reply.type}`);
    }
    return {
      text: stripNonSpeech(reply.text),
      words: cleanWords(reply.words),
      audioMs: reply.audioMs,
      sttMs: reply.sttMs,
      model: reply.model,
    };
  }

  async cancel(utteranceId: string): Promise<void> {
    try {
      // Same id as the recording: the helper only cancels the matching utterance.
      await this.helper.request({ type: 'recordCancel' }, { id: utteranceId });
    } catch {
      // Best effort: the helper drops the recording on its own if it restarts.
    }
  }
}
