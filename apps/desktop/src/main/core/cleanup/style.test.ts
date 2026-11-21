import { describe, expect, it } from 'vitest';
import { applyStyle } from './style.ts';

const terms = [
  { phrase: 'GitHub', spokenAs: null },
  { phrase: 'Priya', spokenAs: null },
];

describe('applyStyle: default', () => {
  it('leaves the text as it is', () => {
    const text = 'Hey, are you free tomorrow? Let’s do 12.';
    expect(applyStyle(text, 'default', terms)).toBe(text);
  });
});

describe('applyStyle: chill', () => {
  it.each([
    [
      'Hey, are you free for lunch tomorrow? Let’s do 12 if that works for you.',
      'hey are you free for lunch tomorrow let’s do 12 if that works for you',
    ],
    ['I think so.', 'i think so'],
    ['Wait... what?!', 'wait what'],
    ['Okay; sounds good: see you', 'okay sounds good see you'],
    ['It costs 3.5 dollars at 3 p.m.', 'it costs 3.5 dollars at 3 p.m'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(applyStyle(input, 'chill')).toBe(expected);
  });

  it('keeps your own words spelled your way, in any case heard', () => {
    expect(applyStyle('Ask Priya about GitHub.', 'chill', terms)).toBe('ask Priya about GitHub');
    expect(applyStyle('ask priya about github', 'chill', terms)).toBe('ask Priya about GitHub');
  });

  it('does not touch a word that only contains one of your words', () => {
    expect(applyStyle('Priyanka said hi.', 'chill', terms)).toBe('priyanka said hi');
  });

  it('keeps links and emails exactly as written', () => {
    expect(applyStyle('Mail John@Example.com, then open https://Example.com/Path.', 'chill')).toBe(
      'mail John@Example.com then open https://Example.com/Path',
    );
  });

  it('keeps list numbers and line breaks', () => {
    expect(applyStyle('1. First thing.\n2. Second thing.', 'chill')).toBe(
      '1. first thing\n2. second thing',
    );
    expect(applyStyle('Hello there.\n\nNew paragraph.', 'chill')).toBe(
      'hello there\n\nnew paragraph',
    );
  });

  it('is the same when applied twice', () => {
    const once = applyStyle('Hey, Priya! Open https://Example.com/A.', 'chill', terms);
    expect(applyStyle(once, 'chill', terms)).toBe(once);
  });

  it('works for text that is only punctuation', () => {
    expect(applyStyle('...', 'chill')).toBe('');
  });
});
