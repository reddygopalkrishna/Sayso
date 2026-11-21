import { describe, expect, it } from 'vitest';
import { CommandFailed, CommandNotUnderstood, CommandRefused } from '../commands/errors.ts';
import { SafetyRefusal } from '../safety/SafetyGate.ts';
import type { NewHistoryEntry } from '../storage/HistoryRepo.ts';
import type { PipelineFailure, UtteranceOutcome } from '../UtterancePipeline.ts';
import type { TranscriptSegment } from '../stt/types.ts';
import { HistoryRecorder } from './HistoryRecorder.ts';

const segment = (text: string): TranscriptSegment => ({
  text,
  words: [],
  audioMs: 2000,
  sttMs: 400,
  model: 'm',
});
const context = {
  bundleId: 'com.tinyspeck.slackmacgap',
  appName: 'Slack',
  focusRole: null,
  secureField: false,
};

function setup() {
  const rows: NewHistoryEntry[] = [];
  return { recorder: new HistoryRecorder({ record: (e) => void rows.push(e) }), rows };
}

const outcome = (over: Partial<UtteranceOutcome> = {}): UtteranceOutcome => ({
  mode: 'dictation',
  segment: segment('um hello there'),
  context,
  routing: null,
  cleanup: { text: 'Hello there.', method: 'llm', tone: 'casual', ms: 900 },
  inserted: true,
  command: null,
  ...over,
});

describe('HistoryRecorder: outcomes', () => {
  it('records dictation with the raw and final text and the total time', () => {
    const { recorder, rows } = setup();
    recorder.recordOutcome(outcome(), 1100);
    expect(rows).toEqual([
      {
        appBundleId: 'com.tinyspeck.slackmacgap',
        appName: 'Slack',
        mode: 'dictation',
        rawText: 'um hello there',
        finalText: 'Hello there.',
        action: null,
        outcome: 'done',
        latencyMs: 1500, // STT 400 + 1100
        cleanup: { method: 'llm', ms: 900 },
      },
    ]);
  });

  it.each([
    ['ran', 'done'],
    ['cancelled', 'cancelled'],
    ['skipped', 'blocked'],
  ] as const)('a command that %s is %s', (result, expected) => {
    const { recorder, rows } = setup();
    const command =
      result === 'skipped'
        ? ({ id: 'send', result, reason: 'context_changed' } as const)
        : ({ id: 'send', result } as const);
    recorder.recordOutcome(outcome({ command }), 100);
    expect(rows[0]).toMatchObject({ outcome: expected, action: { command: 'send', result } });
  });

  it('command mode records the command, not typed text', () => {
    const { recorder, rows } = setup();
    recorder.recordOutcome(
      outcome({
        mode: 'command',
        segment: segment('Click Submit.'),
        cleanup: null,
        inserted: false,
        command: { id: 'click', result: 'ran' },
      }),
      200,
    );
    expect(rows[0]).toMatchObject({
      mode: 'command',
      rawText: 'Click Submit.',
      finalText: null,
      action: { command: 'click', result: 'ran' },
    });
  });

  it('records nothing when nothing happened (only fillers)', () => {
    const { recorder, rows } = setup();
    recorder.recordOutcome(outcome({ inserted: false, cleanup: null, command: null }), 100);
    expect(rows).toEqual([]);
  });
});

describe('HistoryRecorder: failures', () => {
  const failure = (error: unknown): PipelineFailure => ({
    mode: 'dictation',
    segment: segment('my password is hunter two'),
    context,
    error,
  });

  it('stores NO text for anything refused in a password field', () => {
    const { recorder, rows } = setup();
    recorder.recordFailure(failure(new SafetyRefusal('password_field')), 50);
    recorder.recordFailure(failure(new CommandRefused('password_field', 'Safari')), 50);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ rawText: null, finalText: null, outcome: 'blocked' });
      expect(JSON.stringify(row)).not.toContain('hunter');
    }
  });

  it('other refusals are blocked but keep what was heard', () => {
    const { recorder, rows } = setup();
    recorder.recordFailure(failure(new CommandRefused('meeting_app', 'Zoom')), 50);
    expect(rows[0]).toMatchObject({ outcome: 'blocked', rawText: 'my password is hunter two' });
  });

  it.each([
    ['not understood', new CommandNotUnderstood('blah')],
    ['could not run', new CommandFailed('x is not running.')],
    ['helper error', new Error('timeout')],
  ])('%s is failed', (_label, error) => {
    const { recorder, rows } = setup();
    recorder.recordFailure(failure(error), 50);
    expect(rows[0]).toMatchObject({ outcome: 'failed', finalText: null });
  });
});
