import { describe, expect, it, vi } from 'vitest';
import type { ReplyMessage, RequestBody } from '@sayso/helper-protocol';
import type { HelperRequester, RequestOptions } from '../../helper/HelperProcess.ts';
import { HelperWhisperSTT } from './HelperWhisperSTT.ts';

function fakeHelper(reply: (body: RequestBody, options: RequestOptions) => ReplyMessage) {
  const calls: Array<{ body: RequestBody; options: RequestOptions }> = [];
  const helper: HelperRequester = {
    request: vi.fn((body: RequestBody, options: RequestOptions = {}) => {
      calls.push({ body, options });
      return Promise.resolve(reply(body, options));
    }),
  };
  return { helper, calls };
}

describe('HelperWhisperSTT', () => {
  it('maps sttStatus to readiness', () => {
    const stt = new HelperWhisperSTT(fakeHelper(() => ({ v: 1, type: 'done', id: 'x' })).helper);
    expect(stt.readiness()).toMatchObject({ ready: false, reason: 'unavailable' });
    stt.updateStatus({ v: 1, type: 'sttStatus', state: 'loading', model: 'm' });
    expect(stt.readiness()).toMatchObject({ ready: false, reason: 'loading' });
    stt.updateStatus({ v: 1, type: 'sttStatus', state: 'ready', model: 'm' });
    expect(stt.readiness()).toEqual({ ready: true });
  });

  it('uses the utterance id for start, stop and cancel', async () => {
    const { helper, calls } = fakeHelper((body, options) =>
      body.type === 'recordStop'
        ? {
            v: 1,
            type: 'transcript',
            id: options.id ?? '',
            text: ' Hello [BLANK_AUDIO] world ',
            words: [
              { text: ' Hello', startMs: 0, endMs: 300, p: 0.9 },
              { text: ' world', startMs: 350, endMs: 700, p: 0.8 },
            ],
            audioMs: 900,
            sttMs: 120,
            model: 'm',
          }
        : { v: 1, type: 'done', id: options.id ?? '' },
    );
    const stt = new HelperWhisperSTT(helper);
    await stt.start('u-1');
    const segment = await stt.stop('u-1');
    await stt.cancel('u-2');
    expect(calls.map((c) => [c.body.type, c.options.id])).toEqual([
      ['recordStart', 'u-1'],
      ['recordStop', 'u-1'],
      ['recordCancel', 'u-2'],
    ]);
    expect(segment).toEqual({
      text: 'Hello world',
      words: [
        { text: 'Hello', startMs: 0, endMs: 300, p: 0.9 },
        { text: 'world', startMs: 350, endMs: 700, p: 0.8 },
      ],
      audioMs: 900,
      sttMs: 120,
      model: 'm',
    });
  });

  it('cancel never throws', async () => {
    const helper: HelperRequester = { request: () => Promise.reject(new Error('gone')) };
    await expect(new HelperWhisperSTT(helper).cancel('u-1')).resolves.toBeUndefined();
  });
});
