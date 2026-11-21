import { commands, type CommandSpec } from '@sayso/command-grammar';
import { describe, expect, it } from 'vitest';
import type { AppContext } from '../context/HelperContext.ts';
import {
  canInsertText,
  decideAction,
  describeRefusal,
  isExecutable,
  isMeetingApp,
  isRiskyLabel,
  SafetyRefusal,
} from './SafetyGate.ts';

const ctx = (bundleId: string | null, over: Partial<AppContext> = {}): AppContext => ({
  bundleId,
  appName: null,
  focusRole: 'AXTextArea',
  secureField: false,
  ...over,
});

const contexts: Record<string, AppContext> = {
  slack: ctx('com.tinyspeck.slackmacgap'),
  mail: ctx('com.apple.mail'),
  terminal: ctx('com.apple.Terminal'),
  iterm: ctx('com.googlecode.iterm2'),
  zoom: ctx('us.zoom.xos'),
  teams: ctx('com.microsoft.teams2'),
  unknown: ctx(null),
  passwordInSlack: ctx('com.tinyspeck.slackmacgap', {
    focusRole: 'AXTextField',
    secureField: true,
  }),
  passwordInBrowser: ctx('com.apple.Safari', { focusRole: 'AXTextField', secureField: true }),
};

const command = (id: string): CommandSpec => {
  const found = commands.find((c) => c.id === id);
  if (!found) throw new Error(`no command ${id}`);
  return found;
};

type Expected = 'run' | 'preview' | 'blocked_app' | 'meeting_app' | 'password_field';

// Every end command × every context (TECHNICAL_ARCHITECTURE §11). send and enter are Normal
// (preview chip); new_line is Safe (runs at once).
const matrix: Array<[id: string, context: keyof typeof contexts, expected: Expected]> = [
  ['send', 'slack', 'preview'],
  ['send', 'mail', 'preview'],
  ['send', 'terminal', 'blocked_app'],
  ['send', 'iterm', 'blocked_app'],
  ['send', 'zoom', 'meeting_app'],
  ['send', 'teams', 'meeting_app'],
  ['send', 'unknown', 'preview'],
  ['send', 'passwordInSlack', 'password_field'],
  ['send', 'passwordInBrowser', 'password_field'],
  ['enter', 'slack', 'preview'],
  ['enter', 'mail', 'preview'],
  ['enter', 'terminal', 'blocked_app'],
  ['enter', 'iterm', 'blocked_app'],
  ['enter', 'zoom', 'meeting_app'],
  ['enter', 'teams', 'meeting_app'],
  ['enter', 'unknown', 'preview'],
  ['enter', 'passwordInSlack', 'password_field'],
  ['enter', 'passwordInBrowser', 'password_field'],
  ['new_line', 'slack', 'run'],
  ['new_line', 'mail', 'run'],
  ['new_line', 'terminal', 'blocked_app'],
  ['new_line', 'iterm', 'blocked_app'],
  ['new_line', 'zoom', 'meeting_app'],
  ['new_line', 'teams', 'meeting_app'],
  ['new_line', 'unknown', 'run'],
  ['new_line', 'passwordInSlack', 'password_field'],
  ['new_line', 'passwordInBrowser', 'password_field'],
];

// The instant commands (command mode), written out per safety class so the PRD's table is the spec:
// Safe runs at once, Normal shows the chip; every refusal applies to both; "cancel" always runs.
const safeInstant = [
  'next_field',
  'previous_field',
  'undo',
  'redo',
  'select_all',
  'copy',
  'paste',
  'new_tab',
  'go_back',
  'go_forward',
  'confirm',
  'screenshot',
  'scroll_up',
  'scroll_down',
  'open',
  'switch_app',
];
const normalInstant = [
  'backspace',
  'delete_word',
  'delete_that',
  'open_position',
  'click',
  'close_tab',
  'lock_screen',
  'send_message',
];
const argsFor: Record<string, Record<string, string>> = {
  click: { label: 'submit' },
  open: { target: 'slack' },
  switch_app: { app: 'safari' },
  send_message: { message: 'priya on slack saying hello' },
};
const terminalsBlock = ['close_tab']; // Terminals never close tabs by voice

const instantRules: Record<keyof typeof contexts, { safe: Expected; normal: Expected }> = {
  slack: { safe: 'run', normal: 'preview' },
  mail: { safe: 'run', normal: 'preview' },
  terminal: { safe: 'run', normal: 'preview' },
  iterm: { safe: 'run', normal: 'preview' },
  zoom: { safe: 'meeting_app', normal: 'meeting_app' },
  teams: { safe: 'meeting_app', normal: 'meeting_app' },
  unknown: { safe: 'run', normal: 'preview' },
  passwordInSlack: { safe: 'password_field', normal: 'password_field' },
  passwordInBrowser: { safe: 'password_field', normal: 'password_field' },
};

const instantMatrix: Array<[id: string, context: keyof typeof contexts, expected: Expected]> = [
  ...safeInstant.flatMap((id) =>
    Object.entries(instantRules).map(([name, r]): [string, keyof typeof contexts, Expected] => [
      id,
      name,
      r.safe,
    ]),
  ),
  ...normalInstant.flatMap((id) =>
    Object.entries(instantRules).map(([name, r]): [string, keyof typeof contexts, Expected] => [
      id,
      name,
      terminalsBlock.includes(id) && (name === 'terminal' || name === 'iterm')
        ? 'blocked_app'
        : r.normal,
    ]),
  ),
  ...Object.keys(instantRules).map((name): [string, keyof typeof contexts, Expected] => [
    'cancel',
    name,
    'run',
  ]),
];

describe('decideAction: instant commands × context', () => {
  it('covers every instant command exactly once per context', () => {
    const instant = commands.filter((c) => !c.endOfUtteranceOnly).map((c) => c.id);
    expect(new Set(instantMatrix.map(([id]) => id))).toEqual(new Set(instant));
    expect(instantMatrix).toHaveLength(instant.length * Object.keys(contexts).length);
  });

  it('assigns the safety levels the PRD gives them', () => {
    for (const id of safeInstant) expect(command(id).safety).toBe('safe');
    for (const id of [...normalInstant]) expect(command(id).safety).toBe('normal');
    expect(command('cancel').safety).toBe('safe');
  });

  it.each(instantMatrix)('%s in %s → %s', (id, name, expected) => {
    const decision = decideAction(
      command(id),
      contexts[name] ?? ctx(null),
      1000,
      argsFor[id] ?? {},
    );
    if (expected === 'run') expect(decision).toEqual({ kind: 'run' });
    else if (expected === 'preview') expect(decision).toEqual({ kind: 'preview', ms: 1000 });
    else expect(decision).toEqual({ kind: 'refuse', reason: expected });
  });
});

describe('click: buttons that spend money, delete or sign out are refused', () => {
  it.each([
    'pay now',
    'Buy',
    'Delete',
    'delete account',
    'remove',
    'Place order',
    'Sign out',
    'log out',
    'send money',
    'transfer funds',
    'unsubscribe',
    'publish',
    'Post',
  ])('%s', (label) => {
    expect(isRiskyLabel(label)).toBe(true);
    expect(decideAction(command('click'), contexts['slack'] ?? ctx(null), 1000, { label })).toEqual(
      {
        kind: 'confirm',
        reason: 'risky_label',
      },
    );
  });

  it.each([
    'submit',
    'Next',
    'Save',
    'Sign in',
    'Reply',
    'Compose',
    'postage',
    'payload',
    'display',
  ])('%s is fine', (label) => {
    expect(isRiskyLabel(label)).toBe(false);
    expect(decideAction(command('click'), contexts['slack'] ?? ctx(null), 1000, { label })).toEqual(
      {
        kind: 'preview',
        ms: 1000,
      },
    );
  });

  it('the label check applies to click only', () => {
    expect(
      decideAction(command('open'), contexts['slack'] ?? ctx(null), 1000, { target: 'delete' }),
    ).toEqual({ kind: 'run' });
  });
});

describe('describeRefusal', () => {
  it.each([
    ['blocked_app', 'Terminal', 'That command is not allowed in Terminal.'],
    ['blocked_app', null, 'That command is not allowed in this app.'],
    ['meeting_app', null, 'Actions are off while a meeting app is in front.'],
    ['password_field', null, 'Sayso does not act in password fields.'],
  ] as const)('%s / %s', (reason, app, message) => {
    expect(describeRefusal(reason, app)).toBe(message);
  });
});

describe('decideAction: end commands × context', () => {
  it('covers every end command in commands.json', () => {
    const endIds = commands.filter((c) => c.endOfUtteranceOnly).map((c) => c.id);
    expect(new Set(matrix.map(([id]) => id))).toEqual(new Set(endIds));
  });

  it('together with the instant matrix, covers every command in commands.json', () => {
    const covered = new Set([...matrix, ...instantMatrix].map(([id]) => id));
    expect(covered).toEqual(new Set(commands.map((c) => c.id)));
  });

  it.each(matrix)('%s in %s → %s', (id, name, expected) => {
    const decision = decideAction(command(id), contexts[name] ?? ctx(null), 1000);
    if (expected === 'run') expect(decision).toEqual({ kind: 'run' });
    else if (expected === 'preview') expect(decision).toEqual({ kind: 'preview', ms: 1000 });
    else expect(decision).toEqual({ kind: 'refuse', reason: expected });
  });
});

describe('safety levels', () => {
  const base = command('send');

  it('refuses blocked commands everywhere', () => {
    expect(
      decideAction({ ...base, safety: 'blocked' }, contexts['slack'] ?? ctx(null), 1000),
    ).toEqual({
      kind: 'refuse',
      reason: 'blocked_level',
    });
  });

  it('asks for confirmation on risky commands, which are not executable yet', () => {
    const decision = decideAction(
      { ...base, safety: 'risky' },
      contexts['slack'] ?? ctx(null),
      1000,
    );
    expect(decision).toEqual({ kind: 'confirm' });
    expect(isExecutable(decision)).toBe(false);
  });

  it('uses the configured preview time', () => {
    expect(decideAction(base, contexts['slack'] ?? ctx(null), 1500)).toEqual({
      kind: 'preview',
      ms: 1500,
    });
  });

  it('only run and preview are executable', () => {
    expect(isExecutable({ kind: 'run' })).toBe(true);
    expect(isExecutable({ kind: 'preview', ms: 1 })).toBe(true);
    expect(isExecutable({ kind: 'confirm' })).toBe(false);
    expect(isExecutable({ kind: 'refuse', reason: 'meeting_app' })).toBe(false);
  });
});

describe('canInsertText', () => {
  it.each([
    ['slack', true],
    ['terminal', true],
    ['zoom', true], // meeting apps: dictation still works, only actions are off
    ['unknown', true],
    ['passwordInSlack', false],
    ['passwordInBrowser', false],
  ])('%s → %s', (name, ok) => {
    expect(canInsertText(contexts[name] ?? ctx(null)).ok).toBe(ok);
  });

  it('SafetyRefusal explains itself on the pill', () => {
    expect(new SafetyRefusal('password_field').message).toBe(
      'Sayso does not type into password fields.',
    );
  });
});

describe('isMeetingApp', () => {
  it.each([
    ['us.zoom.xos', true],
    ['com.microsoft.teams2', true],
    ['com.apple.FaceTime', true],
    ['com.tinyspeck.slackmacgap', false],
    [null, false],
  ])('%s → %s', (id, expected) => {
    expect(isMeetingApp(id)).toBe(expected);
  });
});
