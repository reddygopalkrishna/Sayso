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
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}
