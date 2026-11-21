import { commands } from '@sayso/command-grammar';
import { describe, expect, it } from 'vitest';
import { CommandEngine } from './CommandEngine.ts';

const engine = new CommandEngine(commands);
const id = (text: string): string | undefined => engine.match(text)?.command.id;

describe('moving between fields and deleting', () => {
  it.each([
    ['next field', 'next_field'],
    ['Go to next.', 'next_field'],
    ['go to the next box', 'next_field'],
    ['Tab', 'next_field'],
    ['previous field', 'previous_field'],
    ['Shift tab', 'previous_field'],
    ['Backspace.', 'backspace'],
    ['delete last word', 'delete_word'],
    ['delete that', 'delete_that'],
  ])('%j → %s', (text, expected) => {
    expect(id(text)).toBe(expected);
  });

  it('clears a field with two commands in a row', () => {
    const steps = engine.matchChain('select all, delete that');
    expect(steps?.map((s) => s.command.id)).toEqual(['select_all', 'delete_that']);
  });

  it('a bare "next" is not a command (too easy to say by accident)', () => {
    expect(id('next')).toBeUndefined();
  });
});
