import { describe, expect, it } from 'vitest';
import { BUILT_IN_TERMS } from './builtInTerms.ts';
import { applyDictionary } from './dictionary.ts';
import { afterTypeWord, fixWebAddresses, typeLiterally } from './webAddress.ts';

describe('fixWebAddresses', () => {
  it.each([
    ['chatgpt dot com', 'chatgpt.com'],
    ['Chatgpt.com.', 'chatgpt.com'],
    ['ChatGPT.com', 'chatgpt.com'],
    ['chagpt . com', 'chagpt.com'],
    ['google dot co dot in', 'google.co.in'],
    ['www dot example dot com', 'www.example.com'],
    ['GitHub.com/Sayso/Repo', 'github.com/Sayso/Repo'],
    ['https://Example.com/Path.', 'https://example.com/Path'],
  ])('%j → %j', (input, expected) => {
    expect(fixWebAddresses(input)).toBe(expected);
  });

  it('fixes an address inside a sentence and keeps the sentence as it is', () => {
    expect(fixWebAddresses('Go to chatgpt dot com and sign in.')).toBe(
      'Go to chatgpt.com and sign in.',
    );
    expect(fixWebAddresses('Visit Example.com.')).toBe('Visit example.com.');
  });

  it.each([
    'The dot com bubble burst.',
    'Write to john@Example.com.',
    'Version 3.5 is out.',
    'Wait. So what?',
    'I like the color blue.',
  ])('leaves %j alone', (text) => {
    expect(fixWebAddresses(text)).toBe(text);
  });
});

describe('afterTypeWord', () => {
  it.each([
    ['type chatgpt.com', 'chatgpt.com'],
    ['Type, hello there.', 'hello there.'],
    ['TYPE: ok', 'ok'],
  ])('%j → %j', (input, expected) => {
    expect(afterTypeWord(input)).toBe(expected);
  });

  it.each(['type', 'Type.', 'typewriter keys', 'I will type it later', 'types of cheese', ''])(
    '%j has no "type …" to act on',
    (text) => {
      expect(afterTypeWord(text)).toBeNull();
    },
  );
});

describe('typeLiterally (the hold key\'s "type …")', () => {
  it.each([
    ['chatgpt.com', 'chatgpt.com'],
    ['chart gpt dot com', 'chatgpt.com'],
    ['Chagpt.com.', 'chatgpt.com'],
    ['chat gpt', 'ChatGPT'],
    ['open ai and git hub', 'OpenAI and GitHub'],
    ['send', 'send'],
  ])('%j → %j', (input, expected) => {
    expect(typeLiterally(input, BUILT_IN_TERMS)).toBe(expected);
  });
});

describe('BUILT_IN_TERMS: Indian places, services and names', () => {
  it.each([
    ['i live in hydrabad near gachi bowli', 'i live in Hyderabad near Gachibowli'],
    ['send it by phone pe or pay tm', 'send it by PhonePe or Paytm'],
    ['update my aadhar and pan', 'update my Aadhaar and pan'],
    ['book it on i r c t c', 'book it on IRCTC'],
    ['the g s t number and the i f s c code', 'the GST number and the IFSC code'],
    ['order from swigy or flip kart', 'order from Swiggy or Flipkart'],
    ['we met at the hi tech city office', 'we met at the HITEC City office'],
    ['call venkatesh and priya', 'call Venkatesh and Priya'],
    ['the equal a i team', 'the Equal AI team'],
  ])('%j → %j', (input, expected) => {
    expect(applyDictionary(input, BUILT_IN_TERMS)).toBe(expected);
  });

  it('does not change ordinary sentences', () => {
    for (const text of [
      'pay the bill',
      'the price is fifty',
      'phone me later',
      'the cloud is slow',
    ]) {
      expect(applyDictionary(text, BUILT_IN_TERMS)).toBe(text);
    }
  });

  it('no mishearing is an ordinary English word', () => {
    const risky = ['pay', 'phone', 'big', 'flip', 'cart', 'open', 'swig', 'equal', 'hi', 'city'];
    const heard = BUILT_IN_TERMS.flatMap((t) => (t.spokenAs ? [t.spokenAs] : []));
    for (const word of risky) expect(heard).not.toContain(word);
  });

  it('every name is listed once with its own spelling', () => {
    const phrases = BUILT_IN_TERMS.filter((t) => t.spokenAs === null).map((t) => t.phrase);
    expect(new Set(phrases).size).toBe(phrases.length);
  });
});

describe('BUILT_IN_TERMS', () => {
  it('never maps an ordinary English word to a name', () => {
    const heard = BUILT_IN_TERMS.flatMap((t) => (t.spokenAs ? [t.spokenAs] : []));
    for (const word of ['cloud', 'cursor', 'chart', 'charge', 'type script', 'chat']) {
      expect(heard).not.toContain(word);
    }
  });
});
