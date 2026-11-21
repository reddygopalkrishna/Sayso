import { z } from 'zod';

/** Asks a model one question and returns its reply text. */
export interface ChatJson {
  readonly name: string;
  readonly model: string;
  complete(system: string, user: string, signal: AbortSignal): Promise<string>;
}

export interface ChatJsonOptions {
  name: string;
  model: string;
  apiKey: string;
  /** An OpenAI-style base URL, e.g. https://api.groq.com/openai/v1 */
  baseUrl: string;
  /** Extra request fields, e.g. { reasoning_effort: 'none' }. */
  extraBody?: Record<string, unknown>;
  /** Which field limits the answer length. OpenAI's current models want max_completion_tokens. */
  tokenField?: 'max_tokens' | 'max_completion_tokens';
  fetch?: typeof fetch;
}

const ResponseSchema = z.object({
  choices: z
    .array(
      z.object({ message: z.object({ content: z.string().nullable().optional() }).optional() }),
    )
    .optional(),
});
const THINKING = /<think>[\s\S]*?<\/think>/g;

/** Any OpenAI-style chat endpoint (Groq, OpenAI…). The key goes in a header, never the URL. */
export class OpenAIChatJson implements ChatJson {
  readonly name: string;
  readonly model: string;
  private readonly options: ChatJsonOptions;

  constructor(options: ChatJsonOptions) {
    if (!options.apiKey) throw new Error(`${options.name} API key is empty`);
    this.options = options;
    this.name = options.name;
    this.model = options.model;
  }

  async complete(system: string, user: string, signal: AbortSignal): Promise<string> {
    const { baseUrl, apiKey, extraBody, fetch: fetchImpl = fetch } = this.options;
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        [this.options.tokenField ?? 'max_tokens']: 400,
        ...extraBody,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal,
    });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${this.name} ${response.status}`);
    const parsed = ResponseSchema.safeParse(json);
    const text = parsed.success ? (parsed.data.choices?.[0]?.message?.content ?? '') : '';
    const clean = text.replace(THINKING, '').trim();
    if (clean === '') throw new Error(`${this.name} returned no text`);
    return clean;
  }
}
