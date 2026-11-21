import { commands } from '@sayso/command-grammar';
import { describe, expect, it } from 'vitest';
import { CommandEngine } from './CommandEngine.ts';

const engine = new CommandEngine(commands);

describe('short commands Whisper mishears (seen live)', () => {
  it.each([
    ['NewTek', 'new_tab'],
    ['NewTown', 'new_tab'],
    ['New Temp', 'new_tab'],
    ['He tender', 'enter'],
    ['Hit tender.', 'enter'],
    ['Scrolla', 'scroll_down'],
    ['Open faster result.', 'open_position'],
    ['Click the faster link', 'open_position'],
    ['New chart?', 'new_chat'],
    ['A new chat?', 'new_chat'],
    ['Open New Chart', 'new_chat'],
    ['new chat', 'new_chat'],
    ['Start a new chat.', 'new_chat'],
  ])('%j → %s', (heard, name) => {
    expect(engine.matchChain(heard)?.[0]?.command.id).toBe(name);
  });

  it('only when it is the whole utterance', () => {
    expect(engine.matchChain('I live in newtown near the park')).toBeNull();
  });
});
