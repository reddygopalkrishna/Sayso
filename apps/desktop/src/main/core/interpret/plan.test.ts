import { describe, expect, it } from 'vitest';
import { ALLOWED_COMMAND_IDS, extractJson, MAX_PLAN_STEPS, toPlan } from './plan.ts';

const idsOf = (plan: ReturnType<typeof toPlan>) =>
  plan?.steps.map((s) =>
    s.kind === 'command'
      ? s.match.command.id
      : s.kind === 'fill'
        ? `fill:${s.label}=${s.key}`
        : `type:${s.text}`,
  );

describe('toPlan', () => {
  it('turns steps into commands with their argument', () => {
    const plan = toPlan({
      steps: [
        { command: 'new_tab' },
        { command: 'click', arg: 'Sign in' },
        { command: 'open', arg: 'Slack' },
      ],
    });
    expect(idsOf(plan)).toEqual(['new_tab', 'click', 'open']);
    const click = plan?.steps[1];
    expect(click?.kind === 'command' && click.match.args).toEqual({ label: 'sign in' });
  });

  it('takes text to type', () => {
    expect(idsOf(toPlan({ steps: [{ type: 'AWS console' }, { command: 'enter' }] }))).toEqual([
      'type:AWS console',
      'enter',
    ]);
  });

  it('takes a fill step: a field name and the NAME of a saved fact', () => {
    expect(
      idsOf(
        toPlan({
          steps: [
            { fill: 'Mobile', from: 'phone' },
            { fill: 'Email', from: 'email' },
          ],
        }),
      ),
    ).toEqual(['fill:Mobile=phone', 'fill:Email=email']);
  });

  it.each([
    ['an unknown fact', { steps: [{ fill: 'Passport', from: 'passport' }] }],
    ['a value instead of a fact name', { steps: [{ fill: 'Email', from: 'keshav@example.com' }] }],
    ['no field name', { steps: [{ fill: '', from: 'email' }] }],
    ['no fact', { steps: [{ fill: 'Email' }] }],
  ])('rejects a fill step with %s', (_label, raw) => {
    expect(toPlan(raw)).toBeNull();
  });

  it('allows up to eight steps (a form), not nine', () => {
    const fill = { fill: 'Name', from: 'name' };
    expect(toPlan({ steps: Array.from({ length: 8 }, () => fill) })?.steps).toHaveLength(8);
    expect(toPlan({ steps: Array.from({ length: 9 }, () => fill) })).toBeNull();
  });

  it('accepts a position for open_position', () => {
    const plan = toPlan({ steps: [{ command: 'open_position', arg: 'third email' }] });
    expect(idsOf(plan)).toEqual(['open_position']);
  });

  it.each(['Login', 'Log in', 'Sign in', 'Sign In', 'login'])(
    'accepts a click on the sign-in button called %j',
    (label) => {
      const plan = toPlan({ steps: [{ command: 'click', arg: label }] });
      expect(idsOf(plan)).toEqual(['click']);
    },
  );

  it('accepts a message for send_message', () => {
    const plan = toPlan({
      steps: [{ command: 'send_message', arg: 'Priya on Slack saying running late' }],
    });
    expect(idsOf(plan)).toEqual(['send_message']);
  });

  it.each([
    ['an empty plan', { steps: [] }],
    ['a message with no text', { steps: [{ command: 'send_message', arg: 'Priya on Slack' }] }],
    ['a message with no argument', { steps: [{ command: 'send_message' }] }],
    ['no steps field', {}],
    ['an unknown command', { steps: [{ command: 'format_disk' }] }],
    ['cancel (the model may not cancel)', { steps: [{ command: 'cancel' }] }],
    ['confirm (the model may never say yes for you)', { steps: [{ command: 'confirm' }] }],
    ['a missing argument', { steps: [{ command: 'click' }] }],
    ['an argument a command does not take', { steps: [{ command: 'new_tab', arg: 'x' }] }],
    ['a position that is not one', { steps: [{ command: 'open_position', arg: 'app store' }] }],
    ['an extra field', { steps: [{ command: 'new_tab', sudo: true }] }],
    [
      'too many steps',
      { steps: Array.from({ length: MAX_PLAN_STEPS + 1 }, () => ({ command: 'new_tab' })) },
    ],
    ['a half-bad plan (nothing runs)', { steps: [{ command: 'new_tab' }, { command: 'nope' }] }],
    ['not an object', 'new tab'],
    ['null', null],
  ])('rejects %s', (_label, raw) => {
    expect(toPlan(raw)).toBeNull();
  });

  it('never offers cancel or confirm', () => {
    expect(ALLOWED_COMMAND_IDS).not.toContain('cancel');
    expect(ALLOWED_COMMAND_IDS).not.toContain('confirm');
    expect(ALLOWED_COMMAND_IDS).toContain('click');
  });
});

describe('extractJson', () => {
  it.each([
    ['{"steps":[]}', { steps: [] }],
    ['```json\n{"steps":[{"command":"new_tab"}]}\n```', { steps: [{ command: 'new_tab' }] }],
    ['Sure! {"steps":[]} done', { steps: [] }],
  ])('reads %j', (text, expected) => {
    expect(extractJson(text)).toEqual(expected);
  });

  it.each(['', 'no json here', '{broken', '}{'])('gives null for %j', (text) => {
    expect(extractJson(text)).toBeNull();
  });
});
