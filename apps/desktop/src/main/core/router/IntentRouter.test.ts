import { readFileSync } from 'node:fs';
import { endCommands } from '@sayso/command-grammar';
import { describe, expect, it } from 'vitest';
import type { TranscriptSegment, TranscriptWord } from '../stt/types.ts';
import { normalizeWord, route, type RouteOptions } from './IntentRouter.ts';

/** Builds words from "hello there [700] send": [N] is a pause of N ms, otherwise 50 ms gaps. */
function utterance(script: string): TranscriptSegment {
  const words: TranscriptWord[] = [];
  let t = 100;
  let gap = 0;
  for (const token of script.split(' ')) {
    const pause = /^\[(\d+)\]$/.exec(token);
    if (pause) {
      gap = Number(pause[1]);
      continue;
    }
    t += words.length === 0 ? 0 : gap || 50;
    words.push({ text: token, startMs: t, endMs: t + 250, p: 0.95 });
    t += 250;
    gap = 0;
  }
  return {
    text: words.map((w) => w.text).join(' '),
    words,
    audioMs: t + 200,
    sttMs: 300,
    model: 'test',
  };
}

const opts: RouteOptions = { endCommands, pauseMs: 600, isAllowed: () => true };

describe('route (pause rule)', () => {
  it.each([
    // [utterance, expected dictation, expected command id or null, reason kept as text]
    ['can we meet at 5 tomorrow? [700] send', 'can we meet at 5 tomorrow?', 'send', undefined],
    ['send me a flower', 'send me a flower', null, undefined],
    ['reply send', 'reply send', null, 'no_pause'],
    ['reply [599] send', 'reply send', null, 'no_pause'],
    ['reply [600] send', 'reply', 'send', undefined],
    ['send', '', 'send', undefined],
    ['Send.', '', 'send', undefined],
    ['looks good [800] Send it.', 'looks good', 'send', undefined],
    ['looks good, [800] send it', 'looks good', 'send', undefined],
    ['first point [900] new line', 'first point', 'new_line', undefined],
    ['first point [900] newline', 'first point', 'new_line', undefined],
    ['run the build [700] press enter', 'run the build', 'enter', undefined],
    ['run the build [700] enter', 'run the build', 'enter', undefined],
    ['I will send it [700] later', 'I will send it later', null, undefined],
    ['please [100] send [800] it', 'please send it', null, 'no_pause'],
  ])('%j', (script, dictation, commandId, keptAsText) => {
    const decision = route(utterance(script), opts);
    expect(decision.dictation).toBe(dictation);
    expect(decision.command?.command.id ?? null).toBe(commandId);
    expect(decision.keptAsText).toBe(keptAsText);
  });

  it('uses the gap before the first word of a multi-word command', () => {
    const decision = route(utterance('ship it [650] send [40] it'), opts);
    expect(decision.command?.phrase).toBe('send it');
    expect(decision.command?.gapMs).toBe(650);
  });

  it('keeps the words as transcribed for typing them back if the command is cancelled', () => {
    const segment = utterance('hello [700] Send.');
    expect(route(segment, opts).command?.spokenText).toBe('Send.');
    expect(route(utterance('ship it [650] send [40] it'), opts).command?.spokenText).toBe(
      'send it',
    );
  });

  it('reports no gap when the command is said on its own', () => {
    expect(route(utterance('send'), opts).command?.gapMs).toBeNull();
  });

  it('keeps the words as text when the command is not allowed here (e.g. Terminal)', () => {
    const decision = route(utterance('git push [800] enter'), { ...opts, isAllowed: () => false });
    expect(decision).toEqual({
      dictation: 'git push enter',
      command: null,
      keptAsText: 'not_allowed',
    });
  });

  it('honours a custom pause threshold', () => {
    const segment = utterance('hello [700] send');
    expect(route(segment, { ...opts, pauseMs: 800 }).command).toBeNull();
    expect(route(segment, { ...opts, pauseMs: 700 }).command?.command.id).toBe('send');
  });

  it('ignores punctuation-only words', () => {
    const segment = utterance('hello [700] send');
    segment.words.push({ text: '.', startMs: 1500, endMs: 1500, p: 1 });
    expect(route(segment, opts).command?.command.id).toBe('send');
  });

  it('handles an empty transcript', () => {
    expect(route({ text: '', words: [], audioMs: 0, sttMs: 0, model: 'm' }, opts)).toEqual({
      dictation: '',
      command: null,
    });
  });
});

describe('route on real WhisperKit transcripts', () => {
  const load = (name: string): TranscriptSegment => {
    const raw = JSON.parse(
      readFileSync(new URL(`../stt/fixtures/${name}`, import.meta.url), 'utf8'),
    ) as TranscriptSegment;
    return {
      text: raw.text,
      words: raw.words,
      audioMs: raw.audioMs,
      sttMs: raw.sttMs,
      model: raw.model,
    };
  };

  it('"… tomorrow? [pause] Send." types the question and sends it', () => {
    const decision = route(load('whisper-trailing-send.json'), opts);
    expect(decision.dictation).toBe('Hey, can we move the meeting to 3 p.m. tomorrow?');
    expect(decision.command?.command.id).toBe('send');
    expect(decision.command?.gapMs).toBeGreaterThanOrEqual(600);
  });

  it('a normal sentence stays text', () => {
    const decision = route(load('whisper-fillers.json'), opts);
    expect(decision.command).toBeNull();
    expect(decision.dictation).toContain('ship the new onboarding flow on Friday.');
  });
});

describe('normalizeWord', () => {
  it.each([
    ['Send.', 'send'],
    ['p.m.', 'pm'],
    ['NEW', 'new'],
    ['?', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeWord(input)).toBe(expected);
  });
});
