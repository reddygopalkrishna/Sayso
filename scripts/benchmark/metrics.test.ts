import { describe, expect, it } from 'vitest';
import { entitiesFound, fillerCount, mean, wordErrorRate, words } from './metrics.ts';

describe('words', () => {
  it('lowercases and drops punctuation', () => {
    expect(words('Hello, World! It’s 5 p.m.')).toEqual(['hello', 'world', 'its', '5', 'p', 'm']);
  });
});

describe('wordErrorRate', () => {
  it.each([
    ['same words', 'send the file', 'Send the file.', 0],
    ['one substitution in four', 'a b c d', 'a b x d', 0.25],
    ['one deletion in four', 'a b c d', 'a b d', 0.25],
    ['one insertion in two', 'a b', 'a x b', 0.5],
    ['everything wrong', 'a b', 'x y', 1],
    ['empty both', '', '', 0],
    ['empty reference, something heard', '', 'hi', 1],
  ])('%s', (_name, reference, hypothesis, expected) => {
    expect(wordErrorRate(reference, hypothesis)).toBeCloseTo(expected);
  });
});

describe('entitiesFound', () => {
  it('needs the exact spelling and capitals', () => {
    expect(entitiesFound(['Hyderabad', 'Priya'], 'Priya flew to hyderabad')).toEqual(['Priya']);
  });
  it('matches whole words only', () => {
    expect(entitiesFound(['Pune'], 'Punekar')).toEqual([]);
    expect(entitiesFound(['Pune'], 'in Pune.')).toEqual(['Pune']);
  });
  it('handles names with dots', () => {
    expect(entitiesFound(['node.js'], 'use node.js today')).toEqual(['node.js']);
  });
});

describe('fillerCount', () => {
  it('counts hesitation sounds, not words that contain them', () => {
    expect(fillerCount('um I think uh yes, umbrella')).toBe(2);
  });
});

describe('mean', () => {
  it('is 0 for nothing', () => expect(mean([])).toBe(0));
  it('averages', () => expect(mean([1, 2, 3])).toBe(2));
});
