import { commands } from '@sayso/command-grammar';
import { describe, expect, it } from 'vitest';
import {
  CommandEngine,
  fillLabel,
  MAX_CHAIN_STEPS,
  normalizeUtterance,
  splitChain,
} from './CommandEngine.ts';

const engine = new CommandEngine(commands);

describe('CommandEngine: plain phrases', () => {
  // [spoken, expected command id]
  it.each([
    ['Undo.', 'undo'],
    ['undo that', 'undo'],
    ['Redo', 'redo'],
    ['select all', 'select_all'],
    ['Select everything.', 'select_all'],
    ['copy', 'copy'],
    ['copy that', 'copy'],
    ['Paste.', 'paste'],
    ['paste it', 'paste'],
    ['delete that', 'delete_that'],
    ['Delete the selection.', 'delete_that'],
    ['new tab', 'new_tab'],
    ['open new tab', 'new_tab'], // beats "open {target}"
    ['open a new tab', 'new_tab'],
    ['close tab', 'close_tab'],
    ['close this tab', 'close_tab'],
    ['scroll up', 'scroll_up'],
    ['Scroll down.', 'scroll_down'],
    ['page down', 'scroll_down'],
    ['cancel', 'cancel'],
    ['Never mind.', 'cancel'],
    ['stop', 'cancel'],
    ['send', 'send'],
    ['Send it.', 'send'],
    ['press enter', 'enter'], // beats "press {label}"
    ['new line', 'new_line'],
  ])('%j → %s', (spoken, id) => {
    const match = engine.match(spoken);
    expect(match?.command.id).toBe(id);
    expect(match?.args).toEqual({});
    expect(match?.confidence).toBe(1);
  });

  it.each(['please undo', 'Can you undo that?', 'undo, please', 'Could you please paste it'])(
    'ignores politeness: %j',
    (spoken) => {
      expect(engine.match(spoken)).not.toBeNull();
    },
  );
});

describe('CommandEngine: arguments', () => {
  it.each([
    ['click Submit', 'click', { label: 'submit' }],
    ['Click Submit.', 'click', { label: 'submit' }],
    ['click on the Submit button', 'click', { label: 'submit' }],
    ['press Save', 'click', { label: 'save' }],
    ['tap the Next link', 'click', { label: 'next' }],
    ['click Sign in', 'click', { label: 'sign in' }],
    ['open Slack', 'open', { target: 'slack' }],
    ['Open the Slack app.', 'open', { target: 'slack app' }],
    ['open GitHub website', 'open', { target: 'github website' }],
    ['launch Visual Studio Code', 'open', { target: 'visual studio code' }],
    ['open GitHub dot com', 'open', { target: 'github dot com' }],
    ['switch to Safari', 'switch_app', { app: 'safari' }],
    ['Focus the Terminal app', 'switch_app', { app: 'terminal' }],
    ['go to Mail', 'switch_app', { app: 'mail' }],
  ])('%j → %s %j', (spoken, id, args) => {
    const match = engine.match(spoken);
    expect(match?.command.id).toBe(id);
    expect(match?.args).toEqual(args);
    expect(match?.confidence).toBe(1);
  });

  it.each([
    'click',
    'open',
    'switch to',
    'click the button',
    'click it',
    'open that',
    'press here',
  ])('needs a real argument: %j', (spoken) => {
    // Generic words ("the button", "it") name nothing, so there is nothing to click or open.
    expect(engine.match(spoken)).toBeNull();
  });
});

describe('CommandEngine: near-misses are not commands', () => {
  it.each([
    ['', 'nothing'],
    ['thank you', 'Whisper noise on silence'],
    ['I need to undo my changes later', 'a sentence that contains a command'],
    ['copying the file', 'a different word'],
    ['pasta', 'too far from paste'],
    ['unto', 'too far from undo'],
    ['hello there', 'plain speech'],
    ['sending', 'too short to fuzz'],
  ])('%j (%s)', (spoken) => {
    expect(engine.match(spoken)).toBeNull();
  });
});

describe('CommandEngine: fuzzy mis-hearings', () => {
  it.each([
    ['new tap', 'new_tab'],
    ['close tub', 'close_tab'],
    ['scroll dawn', 'scroll_down'],
    ['select al', 'select_all'],
    ['delete thet', 'delete_that'],
    ['never mine', 'cancel'],
  ])('%j → %s', (spoken, id) => {
    const match = engine.match(spoken);
    expect(match?.command.id).toBe(id);
    expect(match?.confidence).toBeLessThan(1);
    expect(match?.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('keeps the argument of a mis-heard phrase with an argument', () => {
    const match = engine.match('swich to Safari');
    expect(match?.command.id).toBe('switch_app');
    expect(match?.args).toEqual({ app: 'safari' });
  });

  it('does not fuzz short phrases (undo vs undue)', () => {
    expect(engine.match('undue')).toBeNull();
  });
});

describe('helpers', () => {
  it.each([
    ['Click "Submit"!', 'click submit'],
    ['  Please   undo  ', 'undo'],
    ['Open GitHub.com', 'open github com'],
  ])('normalizeUtterance(%j) → %j', (input, expected) => {
    expect(normalizeUtterance(input)).toBe(expected);
  });

  it('fillLabel puts the argument into the chip label', () => {
    expect(fillLabel('Click “{label}”', { label: 'submit' })).toBe('Click “submit”');
    expect(fillLabel('Undo', {})).toBe('Undo');
  });
});

describe('CommandEngine: back and forward', () => {
  it.each([
    ['go back', 'go_back'],
    ['Back page', 'go_back'],
    ['go forward', 'go_forward'],
    ['next page', 'go_forward'],
  ])('%j is %s', (text, id) => {
    expect(engine.match(text)?.command.id).toBe(id);
  });

  it.each(['go backwards and forget it', 'the back of the room', 'forward this email to Sam'])(
    'near-miss %j is not a navigation command',
    (text) => {
      const id = engine.match(text)?.command.id ?? '';
      expect(id.startsWith('go_')).toBe(false);
    },
  );
});

describe('CommandEngine: chained commands', () => {
  it.each([
    ['open Chrome, new tab', ['open Chrome', 'new tab']],
    ['undo then redo', ['undo', 'redo']],
    ['copy that; paste', ['copy that', 'paste']],
    ['select all and then copy that', ['select all', 'copy that']],
    ['open Tom and Jerry', ['open Tom and Jerry']],
  ])('splitChain(%j) → %j', (text, expected) => {
    expect(splitChain(text)).toEqual(expected);
  });

  it.each([
    ['open Chrome, new tab', 2],
    ['undo, redo, select all', 3],
    ['new tab', 1],
  ])('%j becomes %i command(s)', (text, count) => {
    expect(engine.matchChain(text)?.length).toBe(count);
  });

  it('keeps each step with its own command and argument', () => {
    const steps = engine.matchChain('click Submit, scroll down');
    expect(steps?.map((s) => s.command.id)).toEqual(['click', 'scroll_down']);
    expect(steps?.[0]?.args).toEqual({ label: 'submit' });
  });

  it('is null when any step is not a command, so nothing runs', () => {
    expect(engine.matchChain('undo, hello there how are you')).toBeNull();
    expect(engine.matchChain('hello there, undo')).toBeNull();
  });

  it(`is null above ${MAX_CHAIN_STEPS} steps`, () => {
    expect(engine.matchChain('undo, redo, copy that, paste, select all')).toBeNull();
  });
});

describe('CommandEngine: messages', () => {
  it.each([
    ['Message Priya on Slack saying I will be late.', 'priya on slack saying i will be late'],
    ['message priya on whatsapp running late', 'priya on whatsapp running late'],
    ['Send a message to Priya Sharma saying call me', 'priya sharma saying call me'],
    ['send message to priya that I am here', 'priya that i am here'],
    ['message a friend saying hello', 'a friend saying hello'],
  ])('%j → send_message with the rest as the argument', (spoken, arg) => {
    const match = engine.match(spoken);
    expect(match?.command.id).toBe('send_message');
    expect(match?.args['message']).toBe(arg);
  });

  it.each(['message', 'message priya', 'message priya on slack', 'send a message to priya'])(
    '%j names no text, so it is not a message command',
    (spoken) => {
      expect(engine.match(spoken)?.command.id).not.toBe('send_message');
    },
  );

  it('"send message" alone is still the send command', () => {
    expect(engine.match('send message')?.command.id).toBe('send');
  });

  it('works inside a chain', () => {
    const steps = engine.matchChain('open Slack, message priya saying hello');
    expect(steps?.map((s) => s.command.id)).toEqual(['open', 'send_message']);
  });
});
