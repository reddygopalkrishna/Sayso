import { describe, expect, it } from 'vitest';
import { MAX_LOCAL_WORDS, needsAi } from './needsAi.ts';

describe('needsAi: short, clean text skips the AI', () => {
  it.each([
    'Thank you.',
    'Can we meet at 6 tomorrow?',
    "I'll send it over this afternoon.",
    'Sounds good, see you then!',
    'Open the file and check the logs.',
    'Hello there.',
    'The build is ready.',
  ])('%j', (text) => {
    expect(needsAi(text)).toEqual({ needed: false, reason: 'short and clean' });
  });

  it('a closing full stop is optional in casual text, required in professional text', () => {
    expect(needsAi('Open activity monitor', { tone: 'casual' }).needed).toBe(false);
    expect(needsAi('Open activity monitor').needed).toBe(false);
    expect(needsAi('Open activity monitor', { tone: 'professional' })).toEqual({
      needed: true,
      reason: 'no closing punctuation',
    });
    expect(needsAi('Open activity monitor.', { tone: 'professional' }).needed).toBe(false);
  });

  it.each(['Done.', 'Done!', 'Done?', 'Done…', 'He said "ok."', 'It (really) works.'])(
    'recognises a closing mark in %j',
    (text) => {
      expect(needsAi(text, { tone: 'professional' }).needed).toBe(false);
    },
  );

  it('nothing to clean up is not worth an AI call', () => {
    expect(needsAi('')).toEqual({ needed: false, reason: 'empty' });
    expect(needsAi('   ')).toEqual({ needed: false, reason: 'empty' });
  });
});

describe('needsAi: anything that hints at work for the AI goes to the AI', () => {
  it.each([
    ['a filler or hedge', 'I think you know we should ship it.'],
    ['a filler or hedge', 'I like it.'],
    ['a filler or hedge', 'It is basically done.'],
    ['a filler or hedge', 'That is actually fine.'],
    ['a possible correction', 'Meet at 5, no, 6.'],
    ['a possible correction', 'Sorry, I meant Friday.'],
    ['a possible correction', 'Wait, send it tomorrow.'],
    ['a possible correction', 'No problem.'],
    ['numbered points', 'First, check the logs.'],
    ['numbered points', 'Number one, fix the bug.'],
    ['numbered points', 'Step two is next.'],
    ['a spoken line break', 'Thanks new line Bob.'],
    ['a spoken line break', 'New paragraph.'],
    ['a spoken address (dot / at)', 'Email john at example dot com.'],
    ['a spoken address (dot / at)', 'Visit example dot org.'],
  ])('%s: %j', (reason, text) => {
    expect(needsAi(text)).toEqual({ needed: true, reason });
  });

  it('long text always goes to the AI: that is where it repairs grammar', () => {
    const exactly = Array.from({ length: MAX_LOCAL_WORDS }, () => 'word').join(' ') + '.';
    const over = Array.from({ length: MAX_LOCAL_WORDS + 1 }, () => 'word').join(' ') + '.';
    expect(needsAi(exactly).needed).toBe(false);
    expect(needsAi(over)).toEqual({
      needed: true,
      reason: `${MAX_LOCAL_WORDS + 1} words (more than ${MAX_LOCAL_WORDS})`,
    });
  });

  it('cue words are matched as whole words only', () => {
    // "nobody", "unlike", "dotted", "attack", "firstly" contain a cue but are not one
    expect(needsAi('Nobody attacked the dotted line.').needed).toBe(false);
    expect(needsAi('Unlike before, it works.').needed).toBe(false);
  });
});
