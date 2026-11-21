import { describe, expect, it } from 'vitest';
import { lightCleanup } from './light.ts';

describe('lightCleanup', () => {
  it.each([
    [
      'Um, so I think we should, uh, ship it on Friday.',
      'So I think we should, ship it on Friday.',
    ],
    ['uh hello there', 'Hello there'],
    ['I I think the the plan works', 'I think the plan works'],
    ['I had had enough', 'I had had enough'],
    ['umbrella and summer', 'Umbrella and summer'],
    ['hmm, ok', 'Ok'],
    ['Um.', ''],
    ['', ''],
    ['meet at 5   pm', 'Meet at 5 pm'],
  ])('%j → %j', (input, expected) => {
    expect(lightCleanup(input)).toBe(expected);
  });

  it.each([
    ['um ls -la', 'ls -la'],
    ['git git status', 'git git status'],
    ['npm run dev', 'npm run dev'],
  ])('literal %j → %j', (input, expected) => {
    expect(lightCleanup(input, { literal: true })).toBe(expected);
  });
});
