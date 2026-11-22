import { describe, expect, it } from 'vitest';
import raw from '../commands.json' with { type: 'json' };
import { commands, endCommands, GrammarSchema, phraseArgument } from './index.ts';

describe('commands.json', () => {
  it('is valid', () => {
    expect(GrammarSchema.safeParse(raw).success).toBe(true);
  });

  it('has the end-of-utterance commands', () => {
    expect(endCommands.map((c) => c.id)).toEqual(['send', 'enter', 'new_line']);
  });

  it('never runs end commands in terminals', () => {
    for (const command of endCommands) {
      expect(command.blockedIn).toContain('com.apple.Terminal');
      expect(command.blockedIn).toContain('com.googlecode.iterm2');
    }
  });

  it('gives every command a label for the preview chip', () => {
    expect(commands.map((c) => c.label)).toEqual([
      'Send',
      'Press Enter',
      'New line',
      'Next field',
      'Previous field',
      'Backspace',
      'Delete word',
      'New chat',
      'Undo',
      'Redo',
      'Select all',
      'Copy',
      'Paste',
      'Delete selection',
      'Open the {position}',
      'Click “{label}”',
      'Open “{target}”',
      'New tab',
      'Back',
      'Forward',
      'Close tab',
      'Switch to “{app}”',
      'Scroll up',
      'Scroll down',
      'Cancel',
      'Yes',
      'Screenshot',
      'Lock screen',
      'Message',
      'New email draft',
      'Email {to}',
    ]);
  });

  it('only the end commands wait for a pause; the instant commands are whole-utterance', () => {
    expect(commands.filter((c) => !c.endOfUtteranceOnly).map((c) => c.id)).toEqual([
      'next_field',
      'previous_field',
      'backspace',
      'delete_word',
      'new_chat',
      'undo',
      'redo',
      'select_all',
      'copy',
      'paste',
      'delete_that',
      'open_position',
      'click',
      'open',
      'new_tab',
      'go_back',
      'go_forward',
      'close_tab',
      'switch_app',
      'scroll_up',
      'scroll_down',
      'cancel',
      'confirm',
      'screenshot',
      'lock_screen',
      'send_message',
      'compose_email',
      'compose_email_to',
    ]);
  });

  it.each([
    ['click', 'label'],
    ['open', 'target'],
    ['switch_app', 'app'],
    ['send_message', 'message'],
    ['compose_email_to', 'to'],
  ])('%s phrases all end in {%s}', (id, arg) => {
    const spec = commands.find((c) => c.id === id);
    expect(spec?.phrases.length).toBeGreaterThan(0);
    for (const p of spec?.phrases ?? []) expect(phraseArgument(p)).toBe(arg);
  });

  it('Terminals cannot close tabs by voice', () => {
    expect(commands.find((c) => c.id === 'close_tab')?.blockedIn).toContain('com.apple.Terminal');
  });

  it.each([
    ['an argument on a command that takes none', { phrases: ['undo {thing}'] }],
    ['a missing argument on a command that needs one', { id: 'click', phrases: ['click now'] }],
    ['the wrong argument name', { id: 'open', phrases: ['open {app}'] }],
  ])('rejects %s', (_label, over) => {
    const base = commands.find((c) => c.id === (over as { id?: string }).id) ?? commands[3];
    if (!base) throw new Error('no commands');
    expect(GrammarSchema.safeParse({ commands: [{ ...base, ...over }] }).success).toBe(false);
  });

  it('rejects duplicate phrases across commands', () => {
    const base = commands[0];
    if (!base) throw new Error('no commands');
    const result = GrammarSchema.safeParse({
      commands: [base, { ...base, id: 'other' }],
    });
    expect(result.success).toBe(false);
  });

  it.each(['Send', 'send  it', 'send!', ''])('rejects badly formed phrase %j', (phrase) => {
    const base = commands[0];
    if (!base) throw new Error('no commands');
    expect(GrammarSchema.safeParse({ commands: [{ ...base, phrases: [phrase] }] }).success).toBe(
      false,
    );
  });
});
