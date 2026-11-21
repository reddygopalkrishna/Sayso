import { describe, expect, it } from 'vitest';
import { parseMessageRequest } from './message.ts';

describe('parseMessageRequest', () => {
  it.each([
    ['priya on slack i will be late', 'slack', 'priya', 'i will be late'],
    ['priya on whatsapp i will be late', 'whatsapp', 'priya', 'i will be late'],
    [
      'priya on whats app running ten minutes late',
      'whatsapp',
      'priya',
      'running ten minutes late',
    ],
    ['priya saying i will be late', null, 'priya', 'i will be late'],
    ['priya on slack saying i will be late', 'slack', 'priya', 'i will be late'],
    ['priya sharma on whatsapp saying call me', 'whatsapp', 'priya sharma', 'call me'],
    ['priya sharma that i am running late', null, 'priya sharma', 'i am running late'],
    ['to priya saying hello', null, 'priya', 'hello'],
    ['priya hello there', null, 'priya', 'hello there'],
    ['Priya on Slack see you at 5', 'slack', 'Priya', 'see you at 5'],
    ['priya say thanks', null, 'priya', 'thanks'],
    ['priya saying thanks that was great', null, 'priya', 'thanks that was great'],
    ['priya hello on slack', null, 'priya', 'hello on slack'],
  ])('%j → app %s, name %j, text %j', (input, app, name, text) => {
    expect(parseMessageRequest(input)).toEqual({ app, name, text });
  });

  it.each([
    ['nothing', ''],
    ['only a name', 'priya'],
    ['a name and an app, no text', 'priya on slack'],
    ['a marker with no text', 'priya saying'],
    ['a marker first', 'saying hello'],
    ['too long to be a name', 'one two three four five saying hi'],
    ['punctuation in the name', 'pri!ya saying hi'],
  ])('is not a message: %s', (_label, input) => {
    expect(parseMessageRequest(input)).toBeNull();
  });
});
