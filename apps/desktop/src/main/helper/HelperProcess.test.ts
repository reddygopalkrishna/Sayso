import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeAppLine, encode, type AppMessage, type HelperMessage } from '@sayso/helper-protocol';
import type { HelperStatus } from '../../shared/status.ts';
import { HelperProcess, HelperRequestError, type ChildLike, type Logger } from './HelperProcess.ts';

class FakeChild extends EventEmitter implements ChildLike {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly received: AppMessage[] = [];
  killedWith: NodeJS.Signals | undefined;

  constructor() {
    super();
    let buffer = '';
    this.stdin.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const decoded = decodeAppLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (decoded.ok) this.received.push(decoded.message);
      }
    });
  }

  emitMessage(message: HelperMessage): void {
    this.stdout.write(encode(message));
  }

  emitRaw(line: string): void {
    this.stdout.write(`${line}\n`);
  }

  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.emit('exit', code, signal);
  }

  kill(signal?: NodeJS.Signals): boolean {
    this.killedWith = signal;
    queueMicrotask(() => this.exit(null, signal ?? 'SIGTERM'));
    return true;
  }
}

const ready: HelperMessage = {
  v: 1,
  type: 'ready',
  helperVersion: '0.1.0',
  protocol: 1,
  os: 'macOS 14.0',
};

/** Lets readline and stream events run. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await new Promise<void>((r) => setImmediate(r));
};

function setup(overrides: { exists?: boolean } = {}) {
  const children: FakeChild[] = [];
  const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const statuses: HelperStatus[] = [];
  const spawnEnvs: Record<string, string>[] = [];
  const helper = new HelperProcess({
    binaryPath: '/fake/SaysoHelper',
    env: { SAYSO_MODELS_DIR: '/models' },
    exists: () => overrides.exists ?? true,
    spawn: (_path, env) => {
      spawnEnvs.push(env);
      const child = new FakeChild();
      children.push(child);
      return child;
    },
    logger,
    readyTimeoutMs: 5_000,
    requestTimeoutMs: 2_000,
    backoffInitialMs: 1_000,
    backoffMaxMs: 4_000,
    shutdownGraceMs: 1_000,
  });
  helper.onStatus((s) => statuses.push(s));
  const latest = (): FakeChild => {
    const child = children.at(-1);
    if (!child) throw new Error('no child spawned');
    return child;
  };
  return { helper, children, latest, logger, statuses, spawnEnvs };
}

describe('HelperProcess', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports missing when the binary is not built', () => {
    const { helper, children, statuses } = setup({ exists: false });
    helper.start();
    expect(children).toHaveLength(0);
    expect(statuses).toEqual([{ state: 'missing', path: '/fake/SaysoHelper' }]);
  });

  it('goes starting → connected on ready', async () => {
    const { helper, latest, statuses } = setup();
    helper.start();
    latest().emitMessage(ready);
    await flush();
    expect(statuses).toEqual([
      { state: 'starting' },
      { state: 'connected', helperVersion: '0.1.0', os: 'macOS 14.0' },
    ]);
  });

  it('resolves ping when the matching pong arrives', async () => {
    const { helper, latest } = setup();
    helper.start();
    latest().emitMessage(ready);
    await flush();

    const result = helper.ping();
    await flush();
    const sent = latest().received.at(-1);
    expect(sent?.type).toBe('ping');
    if (sent?.type !== 'ping') return;
    latest().emitMessage({ v: 1, type: 'pong', id: sent.id });
    await expect(result).resolves.toBeGreaterThanOrEqual(0);
  });

  it('rejects ping on timeout and when not connected', async () => {
    const { helper, latest } = setup();
    await expect(helper.ping()).rejects.toThrow(/not connected/);
    await expect(helper.ping()).rejects.toBeInstanceOf(HelperRequestError);
    helper.start();
    latest().emitMessage(ready);
    await flush();
    const result = helper.ping();
    const assertion = expect(result).rejects.toThrow(/timed out/);
    vi.advanceTimersByTime(2_000);
    await assertion;
  });

  it('ignores garbage lines and keeps working', async () => {
    const { helper, latest, logger, statuses } = setup();
    helper.start();
    latest().emitRaw('not json');
    latest().emitRaw('{"v":1,"type":"explode"}');
    latest().emitMessage(ready);
    await flush();
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(statuses.at(-1)?.state).toBe('connected');
  });

  it('restarts after a crash with capped exponential backoff', async () => {
    const { helper, children, latest, statuses } = setup();
    helper.start();
    const retries: number[] = [];
    for (let i = 0; i < 4; i++) {
      latest().exit(1);
      const status = statuses.at(-1);
      expect(status?.state).toBe('crashed');
      if (status?.state === 'crashed') retries.push(status.retryInMs);
      vi.advanceTimersByTime(status?.state === 'crashed' ? status.retryInMs : 0);
    }
    expect(retries).toEqual([1_000, 2_000, 4_000, 4_000]);
    expect(children).toHaveLength(5);

    // A successful handshake resets the backoff.
    latest().emitMessage(ready);
    await flush();
    latest().exit(1);
    const status = statuses.at(-1);
    expect(status?.state === 'crashed' && status.retryInMs).toBe(1_000);
  });

  it('kills a helper that never sends ready', () => {
    const { helper, latest } = setup();
    helper.start();
    vi.advanceTimersByTime(5_000);
    expect(latest().killedWith).toBe('SIGKILL');
  });

  it('stop sends shutdown, does not restart, and ends stopped', async () => {
    const { helper, children, latest, statuses } = setup();
    helper.start();
    latest().emitMessage(ready);
    await flush();

    const child = latest();
    const stopped = helper.stop();
    await flush();
    expect(child.received.some((m) => m.type === 'shutdown')).toBe(true);
    child.exit(0);
    await stopped;
    vi.advanceTimersByTime(60_000);
    expect(children).toHaveLength(1);
    expect(statuses.at(-1)).toEqual({ state: 'stopped' });
  });

  it('stop force-kills a helper that ignores shutdown', async () => {
    const { helper, latest } = setup();
    helper.start();
    latest().emitMessage(ready);
    await flush();
    const child = latest();
    const stopped = helper.stop();
    vi.advanceTimersByTime(1_000);
    await stopped;
    expect(child.killedWith).toBe('SIGKILL');
  });

  it('passes the configured env to the helper', () => {
    const { helper, spawnEnvs } = setup();
    helper.start();
    expect(spawnEnvs).toEqual([{ SAYSO_MODELS_DIR: '/models' }]);
  });

  async function connected() {
    const ctx = setup();
    ctx.helper.start();
    ctx.latest().emitMessage(ready);
    await flush();
    return ctx;
  }

  it('uses an explicit id and resolves with the matching reply', async () => {
    const { helper, latest } = await connected();
    const result = helper.request({ type: 'recordStop' }, { id: 'u-7', timeoutMs: 60_000 });
    await flush();
    expect(latest().received.at(-1)).toEqual({ v: 1, type: 'recordStop', id: 'u-7' });
    const transcript: HelperMessage = {
      v: 1,
      type: 'transcript',
      id: 'u-7',
      text: 'hi',
      words: [],
      audioMs: 500,
      sttMs: 100,
      model: 'm',
    };
    latest().emitMessage(transcript);
    await expect(result).resolves.toEqual(transcript);
  });

  it('resolves getContext with the context reply', async () => {
    const { helper, latest } = await connected();
    const result = helper.request({ type: 'getContext' }, { id: 'c-1' });
    const context: HelperMessage = {
      v: 1,
      type: 'context',
      id: 'c-1',
      bundleId: 'com.apple.Notes',
      appName: 'Notes',
      focusRole: 'AXTextArea',
      secureField: false,
    };
    latest().emitMessage(context);
    await expect(result).resolves.toEqual(context);
  });

  it('rejects with the helper error code when the reply is an error', async () => {
    const { helper, latest } = await connected();
    const result = helper.request({ type: 'recordStart' }, { id: 'u-1' });
    latest().emitMessage({ v: 1, type: 'error', id: 'u-1', code: 'mic_denied', msg: 'off' });
    await expect(result).rejects.toMatchObject({ code: 'mic_denied', message: 'off' });
  });

  it('refuses a second pending request with the same id', async () => {
    const { helper } = await connected();
    void helper.request({ type: 'recordStart' }, { id: 'u-1' }).catch(() => undefined);
    await expect(helper.request({ type: 'recordStop' }, { id: 'u-1' })).rejects.toMatchObject({
      code: 'duplicate_id',
    });
  });

  it('rejects pending requests when the helper exits', async () => {
    const { helper, latest } = await connected();
    const result = helper.request({ type: 'recordStop' }, { id: 'u-1', timeoutMs: 60_000 });
    latest().exit(1);
    await expect(result).rejects.toMatchObject({ code: 'helper_exited' });
  });

  it('passes a heard event (hands-free) to message listeners', async () => {
    const { helper, latest } = await connected();
    const seen: string[] = [];
    helper.onMessage((m) => seen.push(m.type === 'heard' ? `heard:${m.text}` : m.type));
    latest().emitMessage({
      v: 1,
      type: 'heard',
      text: 'type hello',
      words: [],
      audioMs: 900,
      sttMs: 300,
      model: 'm',
    });
    await flush();
    expect(seen).toEqual(['heard:type hello']);
  });

  it('passes events to message listeners', async () => {
    const { helper, latest } = await connected();
    const seen: string[] = [];
    helper.onMessage((m) => seen.push(m.type));
    latest().emitMessage({ v: 1, type: 'hotkey', key: 'fn', phase: 'down' });
    latest().emitMessage({ v: 1, type: 'fnListener', state: 'active' });
    await flush();
    expect(seen).toEqual(['hotkey', 'fnListener']);
  });
});
