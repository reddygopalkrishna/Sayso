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

describe('stripNonSpeech: dialogue dashes', () => {
  it.each([
    ['- Delete last word.', 'Delete last word.'],
    ['- Yes. - No.', 'Yes. No.'],
    ['— Open Chrome', 'Open Chrome'],
    ['well-known and e-mail', 'well-known and e-mail'],
    ['Wait - what?', 'Wait - what?'],
  ])('%j → %j', (input, expected) => {
    expect(stripNonSpeech(input)).toBe(expected);
  });
});

describe('stripNonSpeech: phrases Whisper invents from silence', () => {
  it.each([
    ['Thanks for watching!', ''],
    ['Thank you for watching.', ''],
    ['Please subscribe', ''],
    ['Subtitles by the Amara.org community', ''],
    ['Thank you', 'Thank you'],
    ['Thanks for watching the demo with me today', 'Thanks for watching the demo with me today'],
    ['open youtube and subscribe to the channel list', 'open youtube and subscribe to the channel list'],
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
