import { commands } from '@sayso/command-grammar';
import { describe, expect, it } from 'vitest';
import { CommandEngine } from '../commands/CommandEngine.ts';
import type { TranscriptSegment } from '../stt/types.ts';
import {
  classifyHeard,
  isStartTyping,
  isStopListening,
  isStopTyping,
  withoutTrailingStopTyping,
} from './triggers.ts';

const engine = new CommandEngine(commands);
const isCommand = (text: string): boolean => engine.matchChain(text) !== null;

/** A segment with one word timing per word, 300 ms apart. */
function heard(text: string): TranscriptSegment {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => ({ text: w, startMs: i * 300, endMs: i * 300 + 250, p: 0.9 }));
  return { text, words, audioMs: words.length * 300, sttMs: 200, model: 'm' };
}

const classify = (text: string, awake = false) =>
  classifyHeard(heard(text), { wakeWord: 'sayso', awake, isCommand });

describe('classifyHeard: "type …" is dictation', () => {
  it.each([
    ['type hello there', 'hello there'],
    ['Type, can we move the call to 3pm?', 'can we move the call to 3pm?'],
    ['TYPE: ok', 'ok'],
  ])('%j → dictate %j', (text, rest) => {
    const result = classify(text);
    expect(result.intent?.kind).toBe('dictate');
    expect(result.intent?.segment.text).toBe(rest);
    expect(result.triggered).toBe(true);
  });

  it('drops the word "type" from the word timings too (the pause rule still works)', () => {
    const result = classify('type see you soon send');
    expect(result.intent?.segment.words.map((w) => w.text)).toEqual(['see', 'you', 'soon', 'send']);
  });

  it('"type" alone types nothing but wakes Sayso', () => {
    expect(classify('Type.')).toEqual({ intent: null, triggered: true });
  });
});

describe('classifyHeard: commands that need no wake word', () => {
  it.each(['send it', 'Send it.', 'enter', 'new line', 'open Slack', 'Open github.com'])(
    '%j is a command',
    (text) => {
      const result = classify(text);
      expect(result.intent?.kind).toBe('command');
      expect(result.intent?.segment.text).toBe(text);
    },
  );
});

describe('classifyHeard: other commands need the wake word, or Sayso awake', () => {
  it.each(['new tab', 'go back', 'click Reply', 'scroll down'])(
    '%j alone is ignored when asleep',
    (text) => {
      expect(classify(text)).toEqual({ intent: null, triggered: false });
    },
  );

  it.each([
    ['Sayso, new tab', 'new tab'],
    ['sayso go back', 'go back'],
    ['Sayso click Reply', 'click Reply'],
  ])('%j → command %j', (text, rest) => {
    const result = classify(text);
    expect(result.intent?.kind).toBe('command');
    expect(result.intent?.segment.text).toBe(rest);
  });

  it('works without the wake word while awake', () => {
    expect(classify('new tab', true).intent?.kind).toBe('command');
  });

  it('the wake word with your own words is still a command (the interpreter reads it)', () => {
    const result = classify('Sayso, log me in please');
    expect(result.intent?.kind).toBe('command');
    expect(result.intent?.segment.text).toBe('log me in please');
  });

  it('the wake word alone does nothing but wakes', () => {
    expect(classify('Sayso.')).toEqual({ intent: null, triggered: true });
  });
});

describe('classifyHeard: conversation is never typed', () => {
  it.each([
    'I think we should send it tomorrow',
    'can you open the window please',
    'hello how are you',
    'we need to type this up later',
    '',
    '   ',
  ])('%j is ignored', (text) => {
    expect(classify(text).intent).toBeNull();
  });

  it('awake does not turn conversation into a command', () => {
    expect(classify('hello how are you', true).intent).toBeNull();
  });
});

describe('isStopListening', () => {
  it.each([
    'Stop listening.',
    'stop hands-free',
    'Turn off hands free',
    'turn hands-free off',
    'Hands-free off',
    'Go to sleep',
    'Okay, stop listening!',
    'disable hands free mode',
  ])('%j turns hands-free off', (text) => {
    expect(isStopListening(text)).toBe(true);
  });
  it.each([
    'stop',
    'type stop listening',
    'open Slack and stop listening to music',
    'turn off the lights',
    'scroll down',
  ])('%j does not', (text) => {
    expect(isStopListening(text)).toBe(false);
  });
});

describe('typing mode phrases', () => {
  it.each(['Start typing.', 'start dictation', 'Dictation mode', 'begin typing', 'turn on dictation mode'])(
    '%j starts it',
    (text) => expect(isStartTyping(text)).toBe(true),
  );
  it.each(['Stop typing.', 'stop dictation', 'End dictation', 'done typing', 'dictation off'])(
    '%j stops it',
    (text) => expect(isStopTyping(text)).toBe(true),
  );
  it.each(['type start typing', 'I want to start typing a story', 'stop', 'typing'])(
    '%j is neither',
    (text) => {
      expect(isStartTyping(text)).toBe(false);
      expect(isStopTyping(text)).toBe(false);
    },
  );
});

describe('"type …" waives the pause before a trailing command', () => {
  it('marks the typed words so "hit enter" at the end needs no pause', () => {
    const result = classifyHeard(heard('type AWS hit enter'), { wakeWord: 'sayso', awake: false, isCommand });
    expect(result.intent?.kind).toBe('dictate');
    expect(result.intent?.segment.relaxPause).toBe(true);
  });
  it('does not mark commands', () => {
    const result = classifyHeard(heard('new tab'), { wakeWord: 'sayso', awake: false, isCommand });
    expect(result.intent?.segment.relaxPause).toBeUndefined();
  });
});

describe('withoutTrailingStopTyping', () => {
  const seg = (text: string): TranscriptSegment => heard(text);
  it.each([
    ['What is the difference? Stop typing.', 'What is the difference?', 4],
    ['it was a long day, done typing', 'it was a long day', 5],
    ['that is all end dictation', 'that is all', 3],
  ])('%j → %j', (text, rest, wordCount) => {
    const out = withoutTrailingStopTyping(seg(text));
    expect(out?.text).toBe(rest);
    expect(out?.words).toHaveLength(wordCount);
  });
  it('is null when the sentence does not end with it', () => {
    expect(withoutTrailingStopTyping(seg('stop typing is a phrase I use'))).toBeNull();
    expect(withoutTrailingStopTyping(seg('hello there'))).toBeNull();
  });
});
