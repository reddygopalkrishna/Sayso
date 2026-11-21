export type Tone = 'casual' | 'professional' | 'literal';

/** Off: insert the raw transcript. Light: local filler removal only. Full: LLM cleanup. */
export type CleanupLevel = 'off' | 'light' | 'full';

export interface CleanupRequest {
  rawText: string;
  tone: Exclude<Tone, 'literal'>;
  /** Terms to keep exactly as written (names, product terms, code identifiers). */
  dictionary: readonly string[];
  appName: string | null;
}

/** One LLM behind one interface; add a provider file to switch models. */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  /** Returns the cleaned text only. Must honour `signal` for timeouts. */
  cleanup(request: CleanupRequest, signal: AbortSignal): Promise<string>;
  /**
   * Optional: get ready for a request that is about to come (open the network connection), so
   * the real one is faster. Must be cheap, must never throw and must not send any text.
   */
  warmUp?(): void;
  /** Optional: which provider produced the latest answer (differs from `name` for a chain). */
  lastUsed?(): string;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    /** From a Retry-After header: how long to leave this provider alone, in ms. */
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}
