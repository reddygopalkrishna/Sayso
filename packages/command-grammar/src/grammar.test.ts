import { describe, expect, it } from 'vitest';
import raw from '../commands.json' with { type: 'json' };
import { commands, endCommands, GrammarSchema } from './index.ts';

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
    expect(GrammarSchema.safeParse({ commands: [{ ...base, phrases: [phrase] }] }).success).toBe(false);
  });
});
