import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictationState } from '../../../shared/status.ts';
import { HelperRequestError } from '../../helper/HelperProcess.ts';
import type { STTProvider, SttReadiness, TranscriptSegment } from '../stt/types.ts';
import { DictationController } from './DictationController.ts';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const segment = (text: string): TranscriptSegment => ({
  text,
  words: [],
  audioMs: 1000,
  sttMs: 200,
  model: 'm',
});

class FakeSTT implements STTProvider {
  readonly name = 'fake';
  ready: SttReadiness = { ready: true };
  calls: string[] = [];
  startResult: Deferred<undefined> | null = null;
  startError: unknown = null;
  stopResult: TranscriptSegment | Error = segment('hello world');

  readiness(): SttReadiness {
    return this.ready;
  }
  async start(id: string): Promise<void> {
    this.calls.push(`start ${id}`);
    if (this.startError) throw this.startError;
    if (this.startResult) await this.startResult.promise;
  }
  async stop(id: string): Promise<TranscriptSegment> {
    this.calls.push(`stop ${id}`);
    if (this.stopResult instanceof Error) throw this.stopResult;
    return this.stopResult;
  }
  async cancel(id: string): Promise<void> {
    this.calls.push(`cancel ${id}`);
  }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function setup() {
  const stt = new FakeSTT();
  const delivered: string[] = [];
  const deliver = vi.fn(async (s: TranscriptSegment) => {
    delivered.push(s.text);
  });
  const controller = new DictationController({
    stt,
    deliver,
    now: () => Date.now(),
    minHoldMs: 250,
    maxRecordMs: 10_000,
    errorDisplayMs: 3_000,
  });
  const states: DictationState['phase'][] = [];
  controller.onState((s) => states.push(s.phase));
  return { stt, controller, delivered, deliver, states };
}

describe('DictationController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  async function hold(controller: DictationController, ms: number): Promise<void> {
    controller.handleHotkey('down');
    await flush();
    vi.advanceTimersByTime(ms);
    controller.handleHotkey('up');
    await flush();
  }

  it('records, transcribes and delivers on a normal hold', async () => {
    const { stt, controller, delivered, states } = setup();
    await hold(controller, 1_200);
    expect(stt.calls).toEqual(['start u-1', 'stop u-1']);
    expect(delivered).toEqual(['hello world']);
    expect(states).toEqual(['listening', 'transcribing', 'inserting', 'idle']);
  });

  it('treats a short tap as no dictation', async () => {
    const { stt, controller, deliver, states } = setup();
    await hold(controller, 100);
    expect(stt.calls).toEqual(['start u-1', 'cancel u-1']);
    expect(deliver).not.toHaveBeenCalled();
    expect(states).toEqual(['listening', 'idle']);
  });

  it('cancels on an Fn chord (e.g. Fn+Delete)', async () => {
    const { stt, controller, deliver } = setup();
    controller.handleHotkey('down');
    await flush();
    controller.handleHotkey('chord');
    await flush();
    controller.handleHotkey('up');
    await flush();
    expect(stt.calls).toEqual(['start u-1', 'cancel u-1']);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('skips delivery when nothing was said', async () => {
    const { stt, controller, deliver, states } = setup();
    stt.stopResult = segment('');
    await hold(controller, 800);
    expect(deliver).not.toHaveBeenCalled();
    expect(states).toEqual(['listening', 'transcribing', 'idle']);
  });

  it('handles Fn released before the mic finished starting', async () => {
    const { stt, controller, delivered } = setup();
    stt.startResult = deferred<undefined>();
    controller.handleHotkey('down');
    await flush();
    vi.advanceTimersByTime(600);
    controller.handleHotkey('up');
    stt.startResult.resolve(undefined);
    await flush();
    expect(stt.calls).toEqual(['start u-1', 'stop u-1']);
    expect(delivered).toEqual(['hello world']);
  });

  it('handles a chord before the mic finished starting', async () => {
    const { stt, controller, deliver } = setup();
    stt.startResult = deferred<undefined>();
    controller.handleHotkey('down');
    await flush();
    controller.handleHotkey('chord');
    stt.startResult.resolve(undefined);
    await flush();
    expect(stt.calls).toEqual(['start u-1', 'cancel u-1']);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('stops by itself at the max recording length', async () => {
    const { stt, controller, delivered } = setup();
    controller.handleHotkey('down');
    await flush();
    vi.advanceTimersByTime(10_000);
    await flush();
    expect(stt.calls).toEqual(['start u-1', 'stop u-1']);
    expect(delivered).toEqual(['hello world']);
    controller.handleHotkey('up');
    await flush();
    expect(stt.calls).toHaveLength(2);
  });

  it('shows an error when the model is not ready and clears it later', async () => {
    const { stt, controller, states } = setup();
    stt.ready = { ready: false, reason: 'loading', message: 'Speech model is still loading.' };
    controller.handleHotkey('down');
    await flush();
    expect(stt.calls).toEqual([]);
    expect(controller.current).toEqual({
      phase: 'error',
      message: 'Speech model is still loading.',
    });
    vi.advanceTimersByTime(3_000);
    expect(states).toEqual(['error', 'idle']);
  });

  it('maps helper errors to a readable message', async () => {
    const { stt, controller } = setup();
    stt.startError = new HelperRequestError('mic_denied', 'off');
    controller.handleHotkey('down');
    await flush();
    expect(controller.current).toEqual({
      phase: 'error',
      message: 'Microphone access is off for Sayso.',
    });
  });

  it('reports a delivery failure and accepts the next utterance', async () => {
    const { controller, deliver, delivered } = setup();
    deliver.mockRejectedValueOnce(new HelperRequestError('accessibility_denied', 'no AX'));
    await hold(controller, 800);
    expect(controller.current.phase).toBe('error');
    await hold(controller, 800);
    expect(delivered).toEqual(['hello world']);
    expect(controller.current.phase).toBe('idle');
  });

  it('ignores Fn while transcribing and uses a new id per utterance', async () => {
    const { stt, controller } = setup();
    const slow = deferred<TranscriptSegment>();
    stt.stop = async (id: string) => {
      stt.calls.push(`stop ${id}`);
      return slow.promise;
    };
    await hold(controller, 800);
    controller.handleHotkey('down');
    await flush();
    expect(stt.calls).toEqual(['start u-1', 'stop u-1']);
    slow.resolve(segment('one'));
    await flush();
    controller.handleHotkey('up');
    await hold(controller, 800);
    expect(stt.calls).toEqual(['start u-1', 'stop u-1', 'start u-2', 'stop u-2']);
  });

  it('reset drops an in-flight utterance', async () => {
    const { controller, deliver } = setup();
    controller.handleHotkey('down');
    await flush();
    controller.reset('helper crashed');
    expect(controller.current.phase).toBe('idle');
    controller.handleHotkey('up');
    await flush();
    expect(deliver).not.toHaveBeenCalled();
  });
});
