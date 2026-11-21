import { describe, expect, it } from 'vitest';
import { keyStrokeFor } from './sendStrategy.ts';

describe('keyStrokeFor', () => {
  it.each([
    ['com.tinyspeck.slackmacgap', { key: 'enter', modifiers: [] }],
    ['com.anthropic.claudefordesktop', { key: 'enter', modifiers: [] }],
    ['com.apple.mail', { key: 'd', modifiers: ['cmd', 'shift'] }],
    ['com.microsoft.Outlook', { key: 'enter', modifiers: ['cmd'] }],
    [null, { key: 'enter', modifiers: [] }],
  ])('send in %s', (bundleId, stroke) => {
    expect(keyStrokeFor({ type: 'contextual_send' }, bundleId)).toEqual(stroke);
  });

  it('passes key presses through', () => {
    expect(
      keyStrokeFor({ type: 'keyPress', key: 'enter', modifiers: ['shift'] }, 'com.apple.mail'),
    ).toEqual({
      key: 'enter',
      modifiers: ['shift'],
    });
    expect(keyStrokeFor({ type: 'keyPress', key: 'enter' }, null)).toEqual({
      key: 'enter',
      modifiers: [],
    });
  });
});
