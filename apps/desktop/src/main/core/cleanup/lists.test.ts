import { describe, expect, it } from 'vitest';
import { lightCleanup } from './light.ts';
import { formatLists } from './lists.ts';

describe('formatLists: spoken numbered points become a list', () => {
  it.each([
    [
      "your real dictation, 'first one … second one …'",
      "First one. It's appearing in history. Second one. I opened dictionary tab. I have added it. Third one. I tried the password box and it works.",
      "1. It's appearing in history.\n2. I opened dictionary tab. I have added it.\n3. I tried the password box and it works.",
    ],
    [
      'first, second, third with commas',
      'First, I checked the logs. Second, I restarted the server. Third, it works now.',
      '1. I checked the logs.\n2. I restarted the server.\n3. It works now.',
    ],
    [
      'a lead-in sentence stays above',
      'For the launch we need three things. First, the build. Second, the docs. Third, the announcement.',
      'For the launch we need three things.\n1. The build.\n2. The docs.\n3. The announcement.',
    ],
    [
      'number words',
      'Number one, fix the login bug. Number two, update the docs.',
      '1. Fix the login bug.\n2. Update the docs.',
    ],
    ['digits and "point"', 'Point 1: speed. Point 2: cost.', '1. Speed.\n2. Cost.'],
    [
      'step one, step two',
      'Step one. Open the app. Step two. Hold Fn.',
      '1. Open the app.\n2. Hold Fn.',
    ],
    ['two items are enough', 'First, wake up. Second, code.', '1. Wake up.\n2. Code.'],
    ['an item is capitalised', 'first, buy milk. second, call mom.', '1. Buy milk.\n2. Call mom.'],
    [
      'only the run from 1 is used; a later stray marker stays text',
      'First, a. Second, b. Fourth, c.',
      '1. A.\n2. B. Fourth, c.',
    ],
  ])('%s', (_label, input, expected) => {
    expect(formatLists(input)).toBe(expected);
  });

  it.each([
    ['a single marker', 'First, I checked the logs. Then I left.'],
    ['first of all', 'First of all, I want to thank everyone. Second of all, enjoy the party.'],
    ['ordinal inside a sentence', 'The first one is red. The second one is blue.'],
    ['ordinals as sentence openers without punctuation', 'First one is red. Second one is blue.'],
    ['hyphenated', 'Third-party tools are risky. Second-hand ones too.'],
    ['out of order', 'Second, b. First, a.'],
    ['starts at two', 'Second, b. Third, c.'],
    ['a gap in the numbers', 'First, a. Third, c.'],
    ['an empty item', 'First. Second. Third.'],
    ['plain text', 'We need milk, eggs and bread. Also bring fruit.'],
    ['no text', ''],
  ])('leaves %s alone', (_label, input) => {
    expect(formatLists(input)).toBe(input);
  });
});

describe('lightCleanup formats lists too (Light level and the fallback when the AI is unavailable)', () => {
  it('cleans fillers and then lists', () => {
    expect(lightCleanup("Um, first one. It's fast. Second one. Uh, it's cheap.")).toBe(
      "1. It's fast.\n2. It's cheap.",
    );
  });

  it('never in a terminal or code editor', () => {
    expect(lightCleanup('First, ls. Second, pwd.', { literal: true })).toBe(
      'First, ls. Second, pwd.',
    );
  });
});
