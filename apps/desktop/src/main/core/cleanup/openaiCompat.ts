import { z } from 'zod';
import { buildSystemPrompt, buildUserPrompt } from './prompt.ts';
import { LLMError, type CleanupRequest, type LLMProvider } from './types.ts';

export interface OpenAICompatOptions {
  /** Short name shown in History and logs, e.g. "groq". */
  name: string;
  apiKey: string;
  /** Address up to and including the version, e.g. https://api.groq.com/openai/v1 */
  baseUrl: string;
  model: string;
  /** Extra request fields, e.g. { reasoning_effort: 'none' } to stop a reasoning model thinking. */
  extraBody?: Record<string, unknown>;
  /** Which field limits the answer length. OpenAI's current models want max_completion_tokens. */
  tokenField?: 'max_tokens' | 'max_completion_tokens';
  /**
   * Some models (OpenAI's reasoning models) refuse temperature 0 with a 400 that names it: retry
   * once without it. Off by default.
   */
  retryWithoutTemperature?: boolean;
  fetch?: typeof fetch;
  /** For tests. */
  now?: () => number;
}

const ResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional() }).optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

const ErrorSchema = z.object({ error: z.object({ message: z.string() }) });

/** Some reasoning models put their thinking in the answer between think tags. */
const THINKING = /^\s*<think>[\s\S]*?<\/think>\s*/i;

/** Any service with an OpenAI-style /chat/completions endpoint (Groq, Cerebras, …). The key goes in a header. */
export class OpenAICompatProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly extraBody: Record<string, unknown>;
  private readonly tokenField: 'max_tokens' | 'max_completion_tokens';
  private readonly retryWithoutTemperature: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private lastWarmUp = -Infinity;

  constructor(options: OpenAICompatOptions) {
    if (!options.apiKey) throw new LLMError(`${options.name} API key is empty`);
    this.name = options.name;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.model = options.model;
    this.extraBody = options.extraBody ?? {};
    this.tokenField = options.tokenField ?? 'max_tokens';
    this.retryWithoutTemperature = options.retryWithoutTemperature ?? false;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  lastUsed(): string {
    return this.name;
  }

  /** Opens the connection ahead of the real request: a bare HEAD, no key, no text, never throws. */
  warmUp(): void {
    const at = this.now();
    if (at - this.lastWarmUp < 2_000) return;
    this.lastWarmUp = at;
    try {
      void this.fetchImpl(`${new URL(this.baseUrl).origin}/`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3_000),
      }).then(
        () => undefined,
        () => undefined,
      );
    } catch {
      // A failed warm-up only means the real request opens its own connection.
    }
  }

  private async post(
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<{ response: Response; json: unknown }> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw new LLMError(`${this.name} request timed out`);
      throw new LLMError(`${this.name} request failed: ${String(error)}`);
    }
    const json: unknown = await response.json().catch(() => null);
    return { response, json };
  }

  async cleanup(request: CleanupRequest, signal: AbortSignal): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      temperature: 0,
      // Room for the cleaned text, which is never much longer than the input.
      [this.tokenField]: Math.min(4096, 128 + Math.ceil(request.rawText.length / 2)),
      ...this.extraBody,
      messages: [
        { role: 'system', content: buildSystemPrompt(request) },
        { role: 'user', content: buildUserPrompt(request) },
      ],
    };
    let { response, json } = await this.post(body, signal);
    if (this.retryWithoutTemperature && response.status === 400) {
      const detail = ErrorSchema.safeParse(json);
      if (detail.success && /temperature/i.test(detail.data.error.message)) {
        const withoutTemperature = { ...body };
        delete withoutTemperature['temperature'];
        ({ response, json } = await this.post(withoutTemperature, signal));
      }
    }
    if (!response.ok) {
      const parsed = ErrorSchema.safeParse(json);
      const detail = parsed.success ? parsed.data.error.message : response.statusText;
      const seconds = Number(response.headers.get('retry-after'));
      const retryAfterMs =
        Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null;
      throw new LLMError(
        `${this.name} ${response.status}: ${detail}`,
        response.status,
        retryAfterMs,
      );
    }
    const parsed = ResponseSchema.safeParse(json);
    if (!parsed.success) throw new LLMError(`${this.name} returned an unexpected response`);
    const choice = parsed.data.choices?.[0];
    if (choice?.finish_reason === 'length') throw new LLMError(`${this.name} output was cut off`);
    const text = (choice?.message?.content ?? '').replace(THINKING, '').trim();
    if (text === '') throw new LLMError(`${this.name} returned no text`);
    return text;
  }
}
