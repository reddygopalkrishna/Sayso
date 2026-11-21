import { commands } from '@sayso/command-grammar';
import type { HeardMessage } from '@sayso/helper-protocol';
import { describe, expect, it } from 'vitest';
import type { HandsFreeStatus } from '../../../shared/status.ts';
import { CommandEngine } from '../commands/CommandEngine.ts';
import { HandsFreeController } from './HandsFreeController.ts';

const engine = new CommandEngine(commands);

function heard(text: string, audioMs = 1_000, sttMs = 300): HeardMessage {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => ({ text: w, startMs: i * 300, endMs: i * 300 + 250, p: 0.9 }));
  return { v: 1, type: 'heard', text, words, audioMs, sttMs, model: 'm' };
}

function setup(over: { sttReady?: boolean; startFails?: boolean; holdBusy?: boolean } = {}) {
  let clock = 1_000_000;
  let lastHold = 0;
  const log: string[] = [];
  const statuses: HandsFreeStatus[] = [];
  const errors: string[] = [];
  const controller = new HandsFreeController({
    listen: {
      start: async () => {
        if (over.startFails) throw new Error('Microphone access is off for Sayso.');
        log.push('start');
      },
      stop: async () => void log.push('stop'),
    },
    deliver: async (segment, mode) => {
      if (segment.text === 'fail me') throw new Error('Could not do that.');
      log.push(`${mode}: ${segment.text}`);
    },
    isCommand: (text) => engine.matchChain(text) !== null,
    wakeWord: () => 'Sayso',
    sttReady: () => over.sttReady ?? true,
    holdBusy: () => over.holdBusy ?? false,
    lastHoldAt: () => lastHold,
    onError: (message) => void errors.push(message),
    onStatus: (status) => void statuses.push(status),
    describeError: (error) => (error instanceof Error ? error.message : String(error)),
    now: () => clock,
  });
  return {
    controller,
    log,
    statuses,
    errors,
    advance: (ms: number) => (clock += ms),
    holdNow: () => (lastHold = clock),
  };
}

describe('HandsFreeController: voice off switch', () => {
  it('"stop listening" turns hands-free off and does nothing else', async () => {
    const t = setup();
    await t.controller.enable();
    await t.controller.handleHeard(heard('Stop listening.'));
    expect(t.controller.status).toEqual({ state: 'off' });
    expect(t.log).toEqual(['start', 'stop']);
    await t.controller.handleHeard(heard('new tab'));
    expect(t.log).toEqual(['start', 'stop']);
  });
});

describe('HandsFreeController: on and off', () => {
  it('turns listening on and off', async () => {
    const t = setup();
    await t.controller.enable();
    await t.controller.disable();
    expect(t.log).toEqual(['start', 'stop']);
    expect(t.statuses).toEqual([{ state: 'starting' }, { state: 'listening' }, { state: 'off' }]);
  });

  it('refuses while the speech model is loading, with a plain message', async () => {
    const t = setup({ sttReady: false });
    await expect(t.controller.enable()).rejects.toThrow('still loading');
    expect(t.log).toEqual([]);
    expect(t.controller.status).toEqual({ state: 'off' });
  });

  it('reports a microphone problem and stays off', async () => {
    const t = setup({ startFails: true });
    await expect(t.controller.enable()).rejects.toThrow('Microphone access is off');
    expect(t.controller.status).toEqual({
      state: 'error',
      message: 'Microphone access is off for Sayso.',
    });
  });

  it('turning on twice starts the microphone once', async () => {
    const t = setup();
    await t.controller.enable();
    await t.controller.enable();
    expect(t.log).toEqual(['start']);
  });

  it('a helper restart stops it and says so', async () => {
    const t = setup();
    await t.controller.enable();
    t.controller.reset('helper crashed');
    expect(t.controller.status.state).toBe('error');
    await t.controller.handleHeard(heard('type hello'));
    expect(t.log).toEqual(['start']);
  });
});

describe('HandsFreeController: what it acts on', () => {
  it('types after "type" and runs "send it" and "open …"', async () => {
    const t = setup();
    await t.controller.enable();
    await t.controller.handleHeard(heard('type hello there'));
    await t.controller.handleHeard(heard('send it'));
    await t.controller.handleHeard(heard('open Slack'));
    expect(t.log).toEqual([
      'start',
      'dictation: hello there',
      'command: send it',
      'command: open Slack',
    ]);
  });

  it('ignores conversation', async () => {
    const t = setup();
    await t.controller.enable();
    await t.controller.handleHeard(heard('hello how are you'));
    expect(t.log).toEqual(['start']);
  });

  it('other commands need the wake word, then work alone for a minute', async () => {
    const t = setup();
    await t.controller.enable();
    await t.controller.handleHeard(heard('new tab'));
    await t.controller.handleHeard(heard('Sayso, new tab'));
    t.advance(30_000);
    await t.controller.handleHeard(heard('go back'));
    t.advance(61_000);
    await t.controller.handleHeard(heard('go back'));
    expect(t.log).toEqual(['start', 'command: new tab', 'command: go back']);
  });

  it('does nothing when off', async () => {
    const t = setup();
    await t.controller.handleHeard(heard('type hello'));
    expect(t.log).toEqual([]);
  });

  it('never acts on speech said while holding the key', async () => {
    const t = setup({ holdBusy: true });
    await t.controller.enable();
    await t.controller.handleHeard(heard('type hello'));
    expect(t.log).toEqual(['start']);
  });

  it('ignores an utterance that overlaps a held-key dictation that just ended', async () => {
    const t = setup();
    await t.controller.enable();
    t.holdNow();
    t.advance(2_000); // within 1 s audio + 0.3 s transcription + 1.5 s margin
    await t.controller.handleHeard(heard('type hello'));
    t.advance(10_000);
    await t.controller.handleHeard(heard('type again'));
    expect(t.log).toEqual(['start', 'dictation: again']);
  });

  it('shows a failure in the pill and keeps listening', async () => {
    const t = setup();
    await t.controller.enable();
    await t.controller.handleHeard(heard('type fail me'));
    await t.controller.handleHeard(heard('type ok'));
    expect(t.errors).toEqual(['Could not do that.']);
    expect(t.log).toEqual(['start', 'dictation: ok']);
    expect(t.controller.status).toEqual({ state: 'listening' });
  });

  it('handles utterances one at a time, in order', async () => {
    const t = setup();
    await t.controller.enable();
    await Promise.all([
      t.controller.handleHeard(heard('type one')),
      t.controller.handleHeard(heard('type two')),
      t.controller.handleHeard(heard('type three')),
    ]);
    expect(t.log).toEqual(['start', 'dictation: one', 'dictation: two', 'dictation: three']);
  });
});
