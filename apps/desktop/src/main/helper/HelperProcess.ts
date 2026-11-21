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
} from '@sayso/helper-protocol';
import type { HelperStatus } from '../../shared/helper-status.ts';

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
  spawn?: (path: string) => ChildLike;
  exists?: (path: string) => boolean;
  logger?: Logger;
  readyTimeoutMs?: number;
  requestTimeoutMs?: number;
  backoffInitialMs?: number;
  backoffMaxMs?: number;
  shutdownGraceMs?: number;
}

type Pending = { resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout };

const defaultSpawn = (path: string): ChildLike =>
  nodeSpawn(path, [], { stdio: ['pipe', 'pipe', 'pipe'] });

/**
 * Owns the native helper child process: spawn, handshake, request/response, crash restart with
 * capped exponential backoff, and clean shutdown. Product logic stays out of here.
 */
export class HelperProcess {
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

  /** Round trip to the helper; resolves with the latency in ms. */
  async ping(): Promise<number> {
    const started = performance.now();
    const id = `p-${this.nextId++}`;
    await new Promise<void>((resolve, reject) => {
      if (this.current.state !== 'connected') {
        reject(new Error(`helper not connected (${this.current.state})`));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ping ${id} timed out`));
      }, this.opts.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ v: PROTOCOL_VERSION, type: 'ping', id });
    });
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
      child = this.opts.spawn(path);
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
      case 'pong': {
        const waiting = this.pending.get(message.id);
        if (waiting) {
          clearTimeout(waiting.timer);
          this.pending.delete(message.id);
          waiting.resolve();
        }
        break;
      }
      case 'log':
        this.opts.logger.info(`[helper:${message.level}] ${message.msg}`);
        break;
      case 'error':
        this.opts.logger.warn(`[helper error ${message.code}] ${message.msg}`);
        break;
    }
    for (const listener of this.messageListeners) listener(message);
  }

  private handleExit(reason: string): void {
    this.clearTimers();
    for (const [id, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error(`helper exited before answering ${id}`));
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
