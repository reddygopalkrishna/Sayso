import { commands } from '@sayso/command-grammar';
import { describe, expect, it } from 'vitest';
import { CommandEngine } from './CommandEngine.ts';

const engine = new CommandEngine(commands);

describe('"open WhatsApp and send hi to Ravi" as one sentence', () => {
  it.each([
    'open WhatsApp and send hi to Ravi',
    'Open WhatsApp, send hi to Ravi',
    'open whatsapp then send hi to ravi',
  ])('%j → open, then a message to Ravi saying hi', (spoken) => {
    const steps = engine.matchChain(spoken);
    expect(steps?.map((step) => step.command.id)).toEqual(['open', 'send_message']);
    expect(steps?.[1]?.args['message']?.toLowerCase()).toBe('ravi saying hi');
  });

  it('on its own, with the app named', () => {
    const step = engine.match('send hi to Ravi on WhatsApp');
    expect(step?.command.id).toBe('send_message');
    expect(step?.args['message']).toBe('Ravi on WhatsApp saying hi');
  });

  it('a bare "and" elsewhere is still not a joint', () => {
    expect(engine.matchChain('open Tom and Jerry')?.map((step) => step.command.id)).toEqual(['open']);
  });
});
