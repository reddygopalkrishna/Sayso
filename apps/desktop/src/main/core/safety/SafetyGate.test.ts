import { commands, type CommandSpec } from '@sayso/command-grammar';
import { describe, expect, it } from 'vitest';
import type { AppContext } from '../context/HelperContext.ts';
import {
  canInsertText,
  decideAction,
  isExecutable,
  isMeetingApp,
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

describe('decideAction: every command × context', () => {
  it('covers every command in commands.json', () => {
    expect(new Set(matrix.map(([id]) => id))).toEqual(new Set(commands.map((c) => c.id)));
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
