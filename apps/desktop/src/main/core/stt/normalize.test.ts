import { describe, expect, it } from 'vitest';
import { cleanWords, stripNonSpeech } from './normalize.ts';

describe('stripNonSpeech', () => {
  it.each([
    ['[BLANK_AUDIO]', ''],
    [' Hello world. ', 'Hello world.'],
    ['Hello [MUSIC] there', 'Hello there'],
    ['(upbeat music)', ''],
    ['*laughs* that is funny', 'that is funny'],
    ['( Silence )', ''],
    ['call me (after lunch) please', 'call me (after lunch) please'],
    ['meet at 5  pm', 'meet at 5 pm'],
  ])('%j → %j', (input, expected) => {
    expect(stripNonSpeech(input)).toBe(expected);
  });
});

describe('cleanWords', () => {
  it('trims words and drops non-speech fragments', () => {
    const w = (text: string, startMs: number) => ({ text, startMs, endMs: startMs + 100, p: 0.9 });
    expect(
      cleanWords([w(' Hello', 0), w('[BLANK_AUDIO]', 200), w('[', 300), w(' world', 400)]),
    ).toEqual([w('Hello', 0), w('world', 400)]);
  });
});
