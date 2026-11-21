import { z } from 'zod';
import { buildSystemPrompt, buildUserPrompt } from './prompt.ts';
import { LLMError, type CleanupRequest, type LLMProvider } from './types.ts';

export interface GeminiOptions {
  apiKey: string;
  /** `gemini-flash-latest` follows Google's current Flash model. */
  model?: string;
  fetch?: typeof fetch;
  baseUrl?: string;
}

const ResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

const ErrorSchema = z.object({ error: z.object({ message: z.string() }) });

/** Gemini via the REST generateContent endpoint. The key goes in a header, never the URL. */
export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  readonly model: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(options: GeminiOptions) {
    if (!options.apiKey) throw new LLMError('Gemini API key is empty');
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'gemini-flash-latest';
    this.fetchImpl = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  async cleanup(request: CleanupRequest, signal: AbortSignal): Promise<string> {
    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: buildSystemPrompt(request) }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(request) }] }],
      generationConfig: {
        temperature: 0,
        candidateCount: 1,
        // Room for the cleaned text, which is never much longer than the input.
        maxOutputTokens: Math.min(8192, 64 + Math.ceil(request.rawText.length / 2)),
      },
    };
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw new LLMError('Gemini request timed out');
      throw new LLMError(`Gemini request failed: ${String(error)}`);
    }
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = ErrorSchema.safeParse(json);
      const detail = parsed.success ? parsed.data.error.message : response.statusText;
      throw new LLMError(`Gemini ${response.status}: ${detail}`, response.status);
    }
    const parsed = ResponseSchema.safeParse(json);
    if (!parsed.success) throw new LLMError('Gemini returned an unexpected response');
    const blocked = parsed.data.promptFeedback?.blockReason;
    if (blocked) throw new LLMError(`Gemini blocked the request (${blocked})`);
    const candidate = parsed.data.candidates?.[0];
    if (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
      throw new LLMError(`Gemini stopped early (${candidate.finishReason})`);
    }
    const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new LLMError('Gemini output was cut off');
    }
    return text;
  }
}
