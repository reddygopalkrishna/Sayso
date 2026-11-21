import { describe, expect, it } from 'vitest';
import { toneForApp } from './tone.ts';

describe('toneForApp', () => {
  it.each([
    ['com.tinyspeck.slackmacgap', 'casual'],
    ['com.apple.mail', 'professional'],
    ['com.apple.Terminal', 'literal'],
    ['com.jetbrains.intellij', 'literal'],
    ['com.example.unknown', 'casual'],
    [null, 'casual'],
  ] as const)('%s → %s', (bundleId, tone) => {
    expect(toneForApp(bundleId)).toBe(tone);
  });

  it('applies per-app overrides first', () => {
    expect(toneForApp('com.apple.mail', { 'com.apple.mail': 'casual' })).toBe('casual');
  });
});
