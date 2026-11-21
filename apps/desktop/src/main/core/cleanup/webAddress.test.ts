import { describe, expect, it } from 'vitest';
import { BUILT_IN_TERMS } from './builtInTerms.ts';
import { afterTypeWord, fixWebAddresses, typeLiterally } from './webAddress.ts';

describe('fixWebAddresses', () => {
  it.each([
    ['chatgpt dot com', 'chatgpt.com'],
    ['Chatgpt.com.', 'chatgpt.com'],
    ['ChatGPT.com', 'chatgpt.com'],
    ['chagpt . com', 'chagpt.com'],
    ['google dot co dot in', 'google.co.in'],
    ['www dot example dot com', 'www.example.com'],
    ['GitHub.com/Sayso/Repo', 'github.com/Sayso/Repo'],
    ['https://Example.com/Path.', 'https://example.com/Path'],
  ])('%j → %j', (input, expected) => {
    expect(fixWebAddresses(input)).toBe(expected);
  });

  it('fixes an address inside a sentence and keeps the sentence as it is', () => {
    expect(fixWebAddresses('Go to chatgpt dot com and sign in.')).toBe(
      'Go to chatgpt.com and sign in.',
    );
    expect(fixWebAddresses('Visit Example.com.')).toBe('Visit example.com.');
  });

  it.each([
    'The dot com bubble burst.',
    'Write to john@Example.com.',
    'Version 3.5 is out.',
    'Wait. So what?',
    'I like the color blue.',
  ])('leaves %j alone', (text) => {
    expect(fixWebAddresses(text)).toBe(text);
  });
});

describe('afterTypeWord', () => {
  it.each([
    ['type chatgpt.com', 'chatgpt.com'],
    ['Type, hello there.', 'hello there.'],
    ['TYPE: ok', 'ok'],
  ])('%j → %j', (input, expected) => {
    expect(afterTypeWord(input)).toBe(expected);
  });

  it.each(['type', 'Type.', 'typewriter keys', 'I will type it later', 'types of cheese', ''])(
    '%j has no "type …" to act on',
    (text) => {
      expect(afterTypeWord(text)).toBeNull();
    },
  );
});

describe('typeLiterally (the hold key\'s "type …")', () => {
  it.each([
    ['chatgpt.com', 'chatgpt.com'],
    ['chart gpt dot com', 'chatgpt.com'],
    ['Chagpt.com.', 'chatgpt.com'],
    ['chat gpt', 'ChatGPT'],
    ['open ai and git hub', 'OpenAI and GitHub'],
    ['send', 'send'],
  ])('%j → %j', (input, expected) => {
    expect(typeLiterally(input, BUILT_IN_TERMS)).toBe(expected);
  });
});

describe('BUILT_IN_TERMS', () => {
  it('never maps an ordinary English word to a name', () => {
    const heard = BUILT_IN_TERMS.flatMap((t) => (t.spokenAs ? [t.spokenAs] : []));
    for (const word of ['cloud', 'cursor', 'chart', 'charge', 'type script', 'chat']) {
      expect(heard).not.toContain(word);
    }
  });
});
