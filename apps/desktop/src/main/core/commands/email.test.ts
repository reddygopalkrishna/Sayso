import { describe, expect, it } from 'vitest';
import { gmailComposeUrl, spokenEmailAddress } from './email.ts';

describe('spokenEmailAddress', () => {
  it.each([
    ['priya at gmail dot com', 'priya@gmail.com'],
    ['Priya.Sharma@Gmail.com.', 'priya.sharma@gmail.com'],
    ['ravi at the rate gmail dot com', 'ravi@gmail.com'],
    ['team at acme dot co dot in', 'team@acme.co.in'],
  ])('%s', (spoken, address) => expect(spokenEmailAddress(spoken)).toBe(address));

  it.each(['priya', 'my boss', 'at dot', ''])('is not an address: %s', (spoken) =>
    expect(spokenEmailAddress(spoken)).toBeNull(),
  );
});

describe('gmailComposeUrl', () => {
  it('opens a blank draft', () => {
    expect(gmailComposeUrl()).toBe('https://mail.google.com/mail/?view=cm&fs=1');
    expect(gmailComposeUrl('priya')).toBe('https://mail.google.com/mail/?view=cm&fs=1');
  });
  it('addresses the draft', () => {
    expect(gmailComposeUrl('priya at gmail dot com')).toBe(
      'https://mail.google.com/mail/?view=cm&fs=1&to=priya%40gmail.com',
    );
  });
});
