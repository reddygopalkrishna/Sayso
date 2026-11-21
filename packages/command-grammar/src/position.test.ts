import { describe, expect, it } from 'vitest';
import { parsePosition } from './position.ts';

describe('parsePosition', () => {
  it.each([
    ['first result', 1, 'result'],
    ['the first search result', 1, 'result'],
    ['third email', 3, 'row'],
    ['2nd link', 2, 'link'],
    ['last message', -1, 'row'],
    ['top result', 1, 'result'],
    ['tenth item', 10, 'row'],
    ['second one', 2, 'any'],
    ['first', 1, 'any'],
    ['fourth button', 4, 'button'],
    ['Fifth Email.', 5, 'row'],
  ])('%j → item %i (%s)', (text, index, kind) => {
    expect(parsePosition(text)).toMatchObject({ index, kind });
  });

  it.each([
    'app store',
    'google',
    'first of all',
    'second hand shop',
    'eleventh result',
    'one',
    '',
    'my first car',
  ])('%j is not a position', (text) => {
    expect(parsePosition(text)).toBeNull();
  });

  it('remembers how it was said, for messages', () => {
    expect(parsePosition('the third email')?.spoken).toBe('third email');
  });
});
