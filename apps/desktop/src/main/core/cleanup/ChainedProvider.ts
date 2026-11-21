import { LLMError, type CleanupRequest, type LLMProvider } from './types.ts';

export interface ChainOptions {
  /** How long the first provider gets before the second is tried. */
  primaryTimeoutMs?: number;
  /** How long to leave the first provider alone after repeated failures. */
  cooldownMs?: number;
  /** Failures in a row before the cooldown starts (a rate limit starts it at once). */
  failuresBeforeCooldown?: number;
  /** Longest a rate limit can keep the first provider out, whatever it asks for. */
  maxRateLimitCooldownMs?: number;
  now?: () => number;
  /** Called whenever the second provider has to step in. */
  onFallback?: (info: { from: string; to: string; reason: string; coolingDown: boolean }) => void;
}

/**
 * Tries a fast provider first and a reliable one second. A rate limit or repeated failure puts the
 * first provider on a short cooldown, so the next dictations go straight to the second instead of
 * each wasting time on a request that will fail.
 */
export class ChainedProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;
  private used: string;
  private coolUntil = 0;
  private failures = 0;
  private readonly primaryTimeoutMs: number;
  private readonly cooldownMs: number;
  private readonly failuresBeforeCooldown: number;
  private readonly maxRateLimitCooldownMs: number;
  private readonly now: () => number;

  constructor(
    private readonly primary: LLMProvider,
    private readonly fallback: LLMProvider,
    private readonly options: ChainOptions = {},
  ) {
    this.name = `${primary.name}+${fallback.name}`;
    this.model = `${primary.model}, then ${fallback.model}`;
    this.used = primary.name;
    this.primaryTimeoutMs = options.primaryTimeoutMs ?? 1_500;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.failuresBeforeCooldown = options.failuresBeforeCooldown ?? 2;
    this.maxRateLimitCooldownMs = options.maxRateLimitCooldownMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  lastUsed(): string {
    return this.used;
  }

  get primaryCoolingDown(): boolean {
    return this.now() < this.coolUntil;
  }

  warmUp(): void {
    (this.primaryCoolingDown ? this.fallback : this.primary).warmUp?.();
  }

  async cleanup(request: CleanupRequest, signal: AbortSignal): Promise<string> {
    if (!this.primaryCoolingDown) {
      try {
        const answer = await this.primary.cleanup(
          request,
          AbortSignal.any([signal, AbortSignal.timeout(this.primaryTimeoutMs)]),
        );
        this.failures = 0;
        this.used = this.primary.name;
        return answer;
      } catch (error) {
        // The caller gave up (its own time limit): do not start another request.
        if (signal.aborted) throw error;
        this.noteFailure(error);
      }
    }
    const answer = await this.fallback.cleanup(request, signal);
    this.used = this.fallback.lastUsed?.() ?? this.fallback.name;
    return answer;
  }

  private noteFailure(error: unknown): void {
    const at = this.now();
    const reason = error instanceof Error ? error.message : String(error);
    if (error instanceof LLMError && error.status === 429) {
      const wait = Math.min(error.retryAfterMs ?? this.cooldownMs, this.maxRateLimitCooldownMs);
      this.coolUntil = at + wait;
      this.failures = 0;
    } else if (++this.failures >= this.failuresBeforeCooldown) {
      this.coolUntil = at + this.cooldownMs;
      this.failures = 0;
    }
    this.options.onFallback?.({
      from: this.primary.name,
      to: this.fallback.name,
      reason,
      coolingDown: this.primaryCoolingDown,
    });
  }
}
