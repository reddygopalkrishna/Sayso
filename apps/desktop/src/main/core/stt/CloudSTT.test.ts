import { describe, expect, it, vi } from 'vitest';
import type { ReplyMessage, RequestBody } from '@sayso/helper-protocol';
import type { HelperRequester, RequestOptions } from '../../helper/HelperProcess.ts';
import { CloudSTT, RoutedSTT, evenWords, pcmToWav, vocabularyPrompt } from './CloudSTT.ts';
import type { STTProvider } from './types.ts';

// 1 s of silence as base64 16-bit PCM
const pcm = Buffer.alloc(32_000).toString('base64');

function setup(options: { key?: string | null; reply?: unknown; status?: number; fail?: boolean }) {
  const calls: Array<{ body: RequestBody; options: RequestOptions }> = [];
  const helper: HelperRequester = {
    request: vi.fn((body: RequestBody, opts: RequestOptions = {}) => {
      calls.push({ body, options: opts });
      const reply: ReplyMessage =
        body.type === 'recordStopAudio'
          ? { v: 1, type: 'audio', id: opts.id ?? '', pcm16: pcm, sampleRate: 16_000, audioMs: 1000 }
          : { v: 1, type: 'done', id: opts.id ?? '' };
      return Promise.resolve(reply);
    }),
  };
  const sent: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = vi.fn((url: string, init: RequestInit) => {
    sent.push({ url, init });
    if (options.fail) return Promise.reject(new Error('offline'));
    return Promise.resolve(
      new Response(JSON.stringify(options.reply ?? { text: 'hello' }), {
        status: options.status ?? 200,
      }),
    );
  }) as unknown as typeof fetch;
  const stt = new CloudSTT(helper, {
    apiKey: () => (options.key === undefined ? 'sk-test' : options.key),
    language: () => 'en',
    vocabulary: () => ['Claude Code', 'Codex'],
    fetch: fakeFetch,
  });
  return { stt, calls, sent };
}

describe('CloudSTT', () => {
  it('asks the helper for the audio, sends it as a WAV, and maps the words', async () => {
    const { stt, calls, sent } = setup({
      reply: {
        text: ' Open Slack. ',
        words: [
          { word: 'Open', start: 0.1, end: 0.4 },
          { word: 'Slack', start: 0.45, end: 0.9 },
        ],
      },
    });
    await stt.start('u-1');
    const segment = await stt.stop('u-1');
    expect(calls.map((c) => [c.body.type, c.options.id])).toEqual([
      ['recordStart', 'u-1'],
      ['recordStopAudio', 'u-1'],
    ]);
    expect(segment.text).toBe('Open Slack.');
    expect(segment.words).toEqual([
      { text: 'Open', startMs: 100, endMs: 400, p: 1 },
      { text: 'Slack', startMs: 450, endMs: 900, p: 1 },
    ]);
    expect(segment.audioMs).toBe(1000);
    expect(segment.model).toBe('whisper-1');
    const request = sent[0] as { url: string; init: RequestInit };
    expect(request.url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect((request.init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test');
    const form = request.init.body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('language')).toBe('en');
    expect(form.get('prompt')).toBe('Claude Code, Codex');
    expect(form.get('timestamp_granularities[]')).toBe('word');
    expect((form.get('file') as File).type).toBe('audio/wav');
    expect((form.get('file') as File).size).toBe(44 + 32_000);
  });

  it('spreads the words over the audio when the model gives none', async () => {
    const { stt } = setup({ reply: { text: 'send it now' } });
    await stt.start('u-2');
    const segment = await stt.stop('u-2');
    expect(segment.words.map((w) => w.text)).toEqual(['send', 'it', 'now']);
    expect(segment.words.at(-1)?.endMs).toBe(1000);
  });

  it('says what went wrong without leaking the key', async () => {
    await expect(
      (async () => {
        const { stt } = setup({ status: 401 });
        await stt.start('a');
        await stt.stop('a');
      })(),
    ).rejects.toThrow('the OpenAI key was refused');
    await expect(
      (async () => {
        const { stt } = setup({ status: 500 });
        await stt.start('b');
        await stt.stop('b');
      })(),
    ).rejects.toThrow('HTTP 500');
    const offline = setup({ fail: true });
    await offline.stt.start('c');
    await expect(offline.stt.stop('c')).rejects.toThrow('could not reach OpenAI');
    const noKey = setup({ key: null });
    await noKey.stt.start('d');
    await expect(noKey.stt.stop('d')).rejects.toThrow('OPENAI_API_KEY');
    expect(noKey.sent).toHaveLength(0);
  });

  it('is ready only with a key', () => {
    expect(setup({}).stt.readiness()).toEqual({ ready: true });
    expect(setup({ key: null }).stt.readiness()).toMatchObject({ ready: false });
  });
});

describe('helpers', () => {
  it('writes a 16 kHz mono 16-bit WAV header', () => {
    const wav = pcmToWav(new Uint8Array([1, 2, 3, 4]));
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(4);
    expect([...wav.slice(44)]).toEqual([1, 2, 3, 4]);
  });
  it('evenWords and vocabularyPrompt', () => {
    expect(evenWords('', 500)).toEqual([]);
    expect(vocabularyPrompt([])).toBeNull();
    expect(vocabularyPrompt([' A ', 'A', 'B'])).toBe('A, B');
  });
});

describe('RoutedSTT', () => {
  function fake(name: string): STTProvider & { calls: string[] } {
    const calls: string[] = [];
    return {
      name,
      calls,
      readiness: () => ({ ready: true }),
      start: (id) => (calls.push(`start ${id}`), Promise.resolve()),
      stop: (id) => {
        calls.push(`stop ${id}`);
        return Promise.resolve({ text: name, words: [], audioMs: 0, sttMs: 0, model: name });
      },
      cancel: (id) => (calls.push(`cancel ${id}`), Promise.resolve()),
    };
  }
  it('keeps one utterance on the provider it started with, even if the setting flips', async () => {
    const local = fake('local');
    const cloud = fake('cloud');
    let on = true;
    const routed = new RoutedSTT(local, cloud, () => on, () => true);
    await routed.start('u-1');
    on = false;
    expect((await routed.stop('u-1')).text).toBe('cloud');
    await routed.start('u-2');
    expect((await routed.stop('u-2')).text).toBe('local');
    expect(local.calls).toEqual(['start u-2', 'stop u-2']);
  });
  it('readiness follows the chosen provider, and cloud needs the helper up', () => {
    let on = true;
    let up = false;
    const routed = new RoutedSTT(fake('l'), fake('c'), () => on, () => up);
    expect(routed.readiness()).toMatchObject({ ready: false });
    up = true;
    expect(routed.readiness()).toEqual({ ready: true });
    on = false;
    expect(routed.readiness()).toEqual({ ready: true });
  });
});
