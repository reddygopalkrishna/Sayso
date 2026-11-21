import type { HelperRequester } from '../../helper/HelperProcess.ts';
import { cleanWords, stripNonSpeech } from './normalize.ts';
import type { STTProvider, SttReadiness, TranscriptSegment, TranscriptWord } from './types.ts';

export const OPENAI_TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';
/** whisper-1 returns word times, which the pause rule needs. */
export const DEFAULT_CLOUD_STT_MODEL = 'whisper-1';
const SAMPLE_RATE = 16_000;

export interface CloudSTTOptions {
  apiKey: () => string | null;
  model?: string;
  /** Two-letter language code, or null to let the model detect it. */
  language: () => string | null;
  /** Names and terms to spell correctly (sent as a short prompt, never the audio's context). */
  vocabulary?: () => readonly string[];
  fetch?: typeof fetch;
  timeoutMs?: number;
  startTimeoutMs?: number;
}

/** 16-bit mono PCM at 16 kHz wrapped in a WAV header. */
export function pcmToWav(pcm: Uint8Array): Uint8Array {
  const header = new DataView(new ArrayBuffer(44));
  const text = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i += 1) header.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  header.setUint32(4, 36 + pcm.length, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, SAMPLE_RATE, true);
  header.setUint32(28, SAMPLE_RATE * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  text(36, 'data');
  header.setUint32(40, pcm.length, true);
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(header.buffer), 0);
  wav.set(pcm, 44);
  return wav;
}

/** Spreads the words evenly over the audio when the model gives text without word times. */
export function evenWords(text: string, audioMs: number): TranscriptWord[] {
  const parts = text.split(/\s+/).filter((w) => w !== '');
  if (parts.length === 0) return [];
  const slot = audioMs / parts.length;
  return parts.map((word, i) => ({
    text: word,
    startMs: Math.round(i * slot),
    endMs: Math.round((i + 1) * slot),
    p: 1,
  }));
}

/** Short prompt of names so the model spells them right (about 200 words at most). */
export function vocabularyPrompt(terms: readonly string[]): string | null {
  const unique = [...new Set(terms.map((t) => t.trim()).filter((t) => t !== ''))].slice(0, 200);
  return unique.length === 0 ? null : unique.join(', ');
}

interface TranscriptionReply {
  text?: unknown;
  words?: unknown;
}

/**
 * Optional cloud speech (off by default): the helper records, hands the audio back, and it is sent
 * to OpenAI. The audio leaves this Mac only while this is turned on in Settings.
 */
export class CloudSTT implements STTProvider {
  readonly name = 'openai';
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly startTimeoutMs: number;

  constructor(
    private readonly helper: HelperRequester,
    private readonly options: CloudSTTOptions,
  ) {
    this.model = options.model ?? DEFAULT_CLOUD_STT_MODEL;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.startTimeoutMs = options.startTimeoutMs ?? 30_000;
  }

  /** Ready as soon as the key is set; the helper being up is checked by the caller. */
  readiness(): SttReadiness {
    return this.options.apiKey()
      ? { ready: true }
      : {
          ready: false,
          reason: 'unavailable',
          message: 'Cloud speech needs OPENAI_API_KEY in .env.',
        };
  }

  async start(utteranceId: string): Promise<void> {
    await this.helper.request(
      { type: 'recordStart' },
      { id: utteranceId, timeoutMs: this.startTimeoutMs },
    );
  }

  async stop(utteranceId: string): Promise<TranscriptSegment> {
    const reply = await this.helper.request(
      { type: 'recordStopAudio' },
      { id: utteranceId, timeoutMs: 15_000 },
    );
    if (reply.type !== 'audio') {
      throw new Error(`expected audio for ${utteranceId}, got ${reply.type}`);
    }
    const key = this.options.apiKey();
    if (!key) throw new Error('Cloud speech needs OPENAI_API_KEY in .env.');
    if (reply.audioMs < 150) {
      return { text: '', words: [], audioMs: reply.audioMs, sttMs: 0, model: this.model };
    }
    const started = Date.now();
    const wav = pcmToWav(Buffer.from(reply.pcm16, 'base64'));
    const form = new FormData();
    form.append('file', new Blob([wav.buffer as ArrayBuffer], { type: 'audio/wav' }), 'speech.wav');
    form.append('model', this.model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    const language = this.options.language();
    if (language) form.append('language', language);
    const prompt = vocabularyPrompt(this.options.vocabulary?.() ?? []);
    if (prompt) form.append('prompt', prompt);

    const fetchImpl = this.options.fetch ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(OPENAI_TRANSCRIPTIONS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new Error('Cloud speech could not reach OpenAI. Check the internet, or turn it off.');
    }
    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? 'Cloud speech: the OpenAI key was refused.'
          : `Cloud speech failed (HTTP ${response.status}). Try again, or turn it off.`,
      );
    }
    const body = (await response.json()) as TranscriptionReply;
    const text = stripNonSpeech(typeof body.text === 'string' ? body.text : '');
    const words = cleanWords(parseWords(body.words));
    return {
      text,
      words: words.length > 0 ? words : evenWords(text, reply.audioMs),
      audioMs: reply.audioMs,
      sttMs: Date.now() - started,
      model: this.model,
    };
  }

  async cancel(utteranceId: string): Promise<void> {
    try {
      await this.helper.request({ type: 'recordCancel' }, { id: utteranceId });
    } catch {
      // Best effort, as for the local provider.
    }
  }
}

function parseWords(raw: unknown): TranscriptWord[] {
  if (!Array.isArray(raw)) return [];
  const out: TranscriptWord[] = [];
  for (const item of raw as Array<Record<string, unknown>>) {
    const { word, start, end } = item;
    if (typeof word !== 'string' || typeof start !== 'number' || typeof end !== 'number') continue;
    out.push({
      text: word,
      startMs: Math.max(0, Math.round(start * 1000)),
      endMs: Math.max(0, Math.round(end * 1000)),
      p: 1,
    });
  }
  return out;
}

/** Chooses cloud or on-device per recording, and sends the same utterance's stop to the same one. */
export class RoutedSTT implements STTProvider {
  readonly name = 'routed';
  private readonly chosen = new Map<string, STTProvider>();

  constructor(
    private readonly local: STTProvider,
    private readonly cloud: STTProvider,
    /** True when the setting is on and the key is set. */
    private readonly useCloud: () => boolean,
    /** True while the helper is connected (cloud does not wait for the Whisper model to load). */
    private readonly helperUp: () => boolean,
  ) {}

  private current(): STTProvider {
    return this.useCloud() ? this.cloud : this.local;
  }

  readiness(): SttReadiness {
    if (this.useCloud()) {
      return this.helperUp()
        ? this.cloud.readiness()
        : { ready: false, reason: 'unavailable', message: 'Helper is not running.' };
    }
    return this.local.readiness();
  }

  async start(utteranceId: string): Promise<void> {
    const provider = this.current();
    this.chosen.set(utteranceId, provider);
    try {
      await provider.start(utteranceId);
    } catch (error) {
      this.chosen.delete(utteranceId);
      throw error;
    }
  }

  async stop(utteranceId: string): Promise<TranscriptSegment> {
    const provider = this.chosen.get(utteranceId) ?? this.current();
    this.chosen.delete(utteranceId);
    return provider.stop(utteranceId);
  }

  async cancel(utteranceId: string): Promise<void> {
    const provider = this.chosen.get(utteranceId) ?? this.current();
    this.chosen.delete(utteranceId);
    await provider.cancel(utteranceId);
  }
}
