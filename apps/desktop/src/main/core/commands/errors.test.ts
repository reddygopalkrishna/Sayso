import { describe, expect, it } from 'vitest';
import { CommandNotUnderstood, needsMoreHint } from './errors.ts';

describe('a command word on its own asks for the rest', () => {
  it.each([
    ['Open.', 'Open what? Say “open Slack”.'],
    ['open', 'Open what? Say “open Slack”.'],
    ['Open it', 'Open what? Say “open Slack”.'],
    ['open the app', 'Open what? Say “open Slack”.'],
    ['Click.', 'Click what? Say “click Sign in”.'],
    ['click the button', 'Click what? Say “click Sign in”.'],
    ['press', 'Press what? Say “press Submit”.'],
    ['Launch', 'Launch what? Say “launch Slack”.'],
    ['switch', 'Switch to which app? Say “switch to Chrome”.'],
    ['Message.', 'Message who? Say “message Priya on Slack saying hello”.'],
  ])('%j → %s', (heard, hint) => {
    expect(needsMoreHint(heard)).toBe(hint);
    expect(new CommandNotUnderstood(heard).message).toBe(hint);
  });

  it.each(['I know.', 'hello there', 'open slack', 'click sign in', 'scroll', 'new', ''])(
    '%j is not a lone command word',
    (heard) => {
      expect(needsMoreHint(heard)).toBeNull();
    },
  );

  it('other things keep the old message', () => {
    expect(new CommandNotUnderstood('I know.').message).toBe("Didn't catch a command: “I know.”");
  });
});
