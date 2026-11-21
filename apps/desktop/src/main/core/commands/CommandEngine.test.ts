import { commands } from '@sayso/command-grammar';
import { describe, expect, it } from 'vitest';
import { CommandEngine, fillLabel, normalizeUtterance } from './CommandEngine.ts';

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
    ['Open the Slack app.', 'open', { target: 'slack' }],
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
