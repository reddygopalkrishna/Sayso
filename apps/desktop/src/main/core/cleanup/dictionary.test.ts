import { describe, expect, it } from 'vitest';
import { applyDictionary, type DictionaryTerm } from './dictionary.ts';

const term = (phrase: string, spokenAs: string | null = null): DictionaryTerm => ({
  phrase,
  spokenAs,
});

describe('applyDictionary', () => {
  it.each([
    // [text, terms, expected]
    ['I use github every day', [term('GitHub')], 'I use GitHub every day'],
    ['GITHUB and Github', [term('GitHub')], 'GitHub and GitHub'],
    ['say so is great', [term('Sayso', 'say so')], 'Sayso is great'],
    ["Say   so's new", [term('Sayso', 'say so')], "Sayso's new"],
    ['ping kai row about it', [term('Kairo', 'kai row')], 'ping Kairo about it'],
    [
      'the get hub pages site',
      [term('GitHub', 'get hub'), term('GitHub Pages', 'get hub pages')],
      'the GitHub Pages site',
    ],
    ['use node.js and c++ too', [term('Node.js'), term('C++')], 'use Node.js and C++ too'],
    ['visual studio code', [term('VS Code', 'visual studio code')], 'VS Code'],
  ])('%j', (text, terms, expected) => {
    expect(applyDictionary(text, terms)).toBe(expected);
  });

  it.each([
    ['githubs and mygithub', [term('GitHub')]],
    ['sayings', [term('Sayso', 'say so')]],
    ['nothing to change', [term('GitHub')]],
    ['', [term('GitHub')]],
  ])('leaves %j alone (whole words only)', (text, terms) => {
    expect(applyDictionary(text, terms)).toBe(text);
  });

  it('does nothing without terms', () => {
    expect(applyDictionary('hello', [])).toBe('hello');
  });

  it('never replaces a replacement again', () => {
    expect(applyDictionary('a', [term('a b', 'a'), term('b', 'a b')])).toBe('a b');
  });

  it('treats regex characters in terms as plain text', () => {
    expect(applyDictionary('call (555) now', [term('(555)')])).toBe('call (555) now');
    expect(applyDictionary('a.b and axb', [term('A.B')])).toBe('A.B and axb');
  });
});
