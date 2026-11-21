import { describe, expect, it } from 'vitest';
import { messageArgument, verbatimIn } from './messageSentence.ts';

describe('messageArgument', () => {
  it.each([
    ['Message Priya saying hi', 'Priya saying hi'],
    ['send a message to Priya that says call me', 'Priya that says call me'],
    ['Send Priya a message saying hi', 'Priya saying hi'],
    ['tell Priya that hi there', 'Priya saying hi there'],
    ['tell Priya to say hi', 'Priya saying hi'],
  ])('%j', (spoken, arg) => expect(messageArgument(spoken)).toBe(arg));

  it.each(['tell Priya hi', 'message', 'message Priya', 'open Slack', 'send it'])(
    '%j is not a message',
    (spoken) => expect(messageArgument(spoken)).toBeNull(),
  );
});

describe('verbatimIn', () => {
  it('returns the words as said, with their case and punctuation', () => {
    expect(verbatimIn("Tell Priya I'm running late, see you at 5.", "i'm running late")).toBe(
      "I'm running late",
    );
  });

  it('keeps the closing punctuation', () => {
    expect(verbatimIn('Message Priya saying call me!', 'call me')).toBe('call me!');
  });

  it('is null when a word was added, changed or reordered', () => {
    expect(verbatimIn('Message Priya saying call me now', 'please call me now')).toBeNull();
    expect(verbatimIn('Message Priya saying call me now', 'call me later')).toBeNull();
    expect(verbatimIn('Message Priya saying call me now', 'me call')).toBeNull();
  });

  it('does not match inside a longer word', () => {
    expect(verbatimIn('message priya saying scallop', 'call')).toBeNull();
  });
});
