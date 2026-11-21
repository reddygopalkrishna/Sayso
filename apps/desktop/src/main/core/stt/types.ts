import type { WordTiming } from '@sayso/helper-protocol';

export type TranscriptWord = WordTiming;

/** One utterance from speech-to-text. Word timings are required (the pause rule needs them). */
export interface TranscriptSegment {
  /** Raw transcript with non-speech markers removed; not cleaned up by AI. */
  text: string;
  words: TranscriptWord[];
  audioMs: number;
  sttMs: number;
  model: string;
}

export type SttReadiness =
  { ready: true } | { ready: false; reason: 'loading' | 'error' | 'unavailable'; message: string };

/** Speech-to-text behind one interface, so a cloud fallback can be added later. */
export interface STTProvider {
  readonly name: string;
  readiness(): SttReadiness;
  /** Starts capturing audio for this utterance. */
  start(utteranceId: string): Promise<void>;
  /** Stops capturing and returns the transcript. */
  stop(utteranceId: string): Promise<TranscriptSegment>;
  /** Stops capturing and discards the audio. Never throws. */
  cancel(utteranceId: string): Promise<void>;
}
