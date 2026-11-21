import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import {
  decodeHelperLine,
  encode,
  PROTOCOL_VERSION,
  type AppMessage,
  type HelperMessage,
  type ReplyMessage,
  type RequestBody,
} from '@sayso/helper-protocol';
import type { HelperStatus } from '../../shared/status.ts';

/** The parts of a ChildProcess we use, so tests can pass a fake. */
export interface ChildLike {
  readonly stdin: Writable | null;
  readonly stdout: Readable | null;
  readonly stderr: Readable | null;
  kill(signal?: NodeJS.Signals): boolean;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface HelperProcessOptions {
  binaryPath: string;
  /** Extra environment variables for the helper (merged over process.env by the default spawn). */
  env?: Record<string, string>;
  spawn?: (path: string, env: Record<string, string>) => ChildLike;
  exists?: (path: string) => boolean;
  logger?: Logger;
  readyTimeoutMs?: number;
  requestTimeoutMs?: number;
  backoffInitialMs?: number;
  backoffMaxMs?: number;
  shutdownGraceMs?: number;
}

export interface RequestOptions {
  /** Use this id instead of a generated one (e.g. an utterance id shared by start/stop). */
  id?: string;
  timeoutMs?: number;
}

/** Sends a request to the helper and resolves with its reply. Implemented by HelperProcess. */
export interface HelperRequester {
  request(body: RequestBody, options?: RequestOptions): Promise<ReplyMessage>;
}

/** The helper answered a request with an `error` message, or the request failed in transport. */
export class HelperRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HelperRequestError';
  }
}

type Pending = {
  resolve: (reply: ReplyMessage) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
};

const defaultSpawn = (path: string, env: Record<string, string>): ChildLike =>
  nodeSpawn(path, [], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });

/**
 * Owns the native helper child process: spawn, handshake, request/reply, crash restart with
 * capped exponential backoff, and clean shutdown. Product logic stays out of here.
 */
export class HelperProcess implements HelperRequester {
  private readonly opts: Required<Omit<HelperProcessOptions, 'logger'>> & { logger: Logger };
  private child: ChildLike | null = null;
  private current: HelperStatus = { state: 'stopped' };
  private readonly statusListeners = new Set<(s: HelperStatus) => void>();
  private readonly messageListeners = new Set<(m: HelperMessage) => void>();
  private readonly pending = new Map<string, Pending>();
  private nextId = 1;
  private failures = 0;
  private stopping = false;
  private readyTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;

  constructor(options: HelperProcessOptions) {
    this.opts = {
      env: {},
      spawn: defaultSpawn,
      exists: existsSync,
      logger: console,
      readyTimeoutMs: 5_000,
      requestTimeoutMs: 2_000,
      backoffInitialMs: 1_000,
      backoffMaxMs: 30_000,
      shutdownGraceMs: 1_000,
      ...options,
    };
  }

  get status(): HelperStatus {
    return this.current;
  }

  onStatus(listener: (s: HelperStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Every valid message from the helper, including events such as `hotkey` and `sttStatus`. */
  onMessage(listener: (m: HelperMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  start(): void {
    this.stopping = false;
    this.launch();
  }

  /** Asks the helper to exit, then kills it if it has not exited within the grace period. */
  async stop(): Promise<void> {
    this.stopping = true;
    this.clearTimers();
    const child = this.child;
    if (!child) {
      this.setStatus({ state: 'stopped' });
      return;
    }
    await new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => child.kill('SIGKILL'), this.opts.shutdownGraceMs);
      child.on('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });
      this.send({ v: PROTOCOL_VERSION, type: 'shutdown' });
      child.stdin?.end();
    });
  }

  /**
   * Sends a request and resolves with the reply carrying the same id. Rejects with
   * HelperRequestError if the helper answers `error`, times out, is not connected, or exits.
   */
  request(body: RequestBody, options: RequestOptions = {}): Promise<ReplyMessage> {
    const id = options.id ?? `r-${this.nextId++}`;
    return new Promise<ReplyMessage>((resolve, reject) => {
      if (this.current.state !== 'connected') {
        reject(
          new HelperRequestError('not_connected', `helper not connected (${this.current.state})`),
        );
        return;
      }
      if (this.pending.has(id)) {
        reject(new HelperRequestError('duplicate_id', `request ${id} is already pending`));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new HelperRequestError('timeout', `${body.type} ${id} timed out`));
      }, options.timeoutMs ?? this.opts.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ ...body, v: PROTOCOL_VERSION, id } as AppMessage);
    });
  }

  /** Round trip to the helper; resolves with the latency in ms. */
  async ping(): Promise<number> {
    const started = performance.now();
    await this.request({ type: 'ping' });
    return performance.now() - started;
  }

  private launch(): void {
    const path = this.opts.binaryPath;
    if (!this.opts.exists(path)) {
      this.opts.logger.error(`helper binary not found at ${path} (run pnpm helper:build)`);
      this.setStatus({ state: 'missing', path });
      return;
    }
    this.setStatus({ state: 'starting' });
    let child: ChildLike;
    try {
      child = this.opts.spawn(path, this.opts.env);
    } catch (error) {
      this.handleExit(`spawn failed: ${String(error)}`);
      return;
    }
    this.child = child;

    child.on('error', (error) => this.opts.logger.error(`helper process error: ${error.message}`));
    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      this.handleExit(signal ? `killed by ${signal}` : `exited with code ${String(code)}`);
    });

    if (child.stdout) {
      createInterface({ input: child.stdout }).on('line', (line) => this.handleLine(line));
    }
    if (child.stderr) {
      createInterface({ input: child.stderr }).on('line', (line) =>
        this.opts.logger.info(`[helper] ${line}`),
      );
    }

    this.readyTimer = setTimeout(() => {
      this.opts.logger.error('helper did not send ready in time; killing it');
      child.kill('SIGKILL');
    }, this.opts.readyTimeoutMs);
  }

  private handleLine(line: string): void {
    const decoded = decodeHelperLine(line);
    if (!decoded.ok) {
      this.opts.logger.warn(`ignored helper line (${decoded.error}): ${line.slice(0, 200)}`);
      return;
    }
    const message = decoded.message;
    switch (message.type) {
      case 'ready':
        if (this.readyTimer) clearTimeout(this.readyTimer);
        this.readyTimer = null;
        this.failures = 0;
        this.setStatus({
          state: 'connected',
          helperVersion: message.helperVersion,
          os: message.os,
        });
        break;
      case 'pong':
      case 'done':
      case 'transcript':
      case 'context':
      case 'apps':
      case 'permissions':
        this.settle(message.id, message);
        break;
      case 'error':
        if (message.id) this.settle(message.id, message);
        else this.opts.logger.warn(`[helper error ${message.code}] ${message.msg}`);
        break;
      case 'log':
        this.opts.logger.info(`[helper:${message.level}] ${message.msg}`);
        break;
      case 'hotkey':
      case 'escape':
      case 'fnListener':
      case 'sttStatus':
      case 'heard':
        break;
      default: {
        // A new message type must be handled above (replies must settle their request).
        const unhandled: never = message;
        this.opts.logger.warn(`unhandled helper message ${JSON.stringify(unhandled)}`);
      }
    }
    for (const listener of this.messageListeners) listener(message);
  }

  private settle(id: string, reply: ReplyMessage): void {
    const waiting = this.pending.get(id);
    if (!waiting) {
      this.opts.logger.warn(`reply for unknown request ${id} (${reply.type})`);
      return;
    }
    clearTimeout(waiting.timer);
    this.pending.delete(id);
    if (reply.type === 'error') waiting.reject(new HelperRequestError(reply.code, reply.msg));
    else waiting.resolve(reply);
  }

  private handleExit(reason: string): void {
    this.clearTimers();
    for (const [id, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.reject(
        new HelperRequestError('helper_exited', `helper exited before answering ${id}`),
      );
    }
    this.pending.clear();
    if (this.stopping) {
      this.setStatus({ state: 'stopped' });
      return;
    }
    const retryInMs = Math.min(
      this.opts.backoffInitialMs * 2 ** this.failures,
      this.opts.backoffMaxMs,
    );
    this.failures += 1;
    this.opts.logger.warn(`helper ${reason}; restarting in ${retryInMs} ms`);
    this.setStatus({ state: 'crashed', reason, retryInMs });
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.launch();
    }, retryInMs);
  }

  private send(message: AppMessage): void {
    const stdin = this.child?.stdin;
    if (stdin && !stdin.destroyed && stdin.writable) stdin.write(encode(message));
  }

  private clearTimers(): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.readyTimer = null;
    this.restartTimer = null;
  }

  private setStatus(status: HelperStatus): void {
    this.current = status;
    for (const listener of this.statusListeners) listener(status);
  }
}
