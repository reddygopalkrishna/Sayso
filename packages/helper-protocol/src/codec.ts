import type { z } from 'zod';
import {
  AppMessageSchema,
  HelperMessageSchema,
  type AppMessage,
  type HelperMessage,
} from './messages.ts';

export type DecodeResult<T> = { ok: true; message: T } | { ok: false; error: string };

/** Serialises one message as a single NDJSON line (with the trailing newline). */
export function encode(message: AppMessage | HelperMessage): string {
  return `${JSON.stringify(message)}\n`;
}

function decodeWith<T>(schema: z.ZodType<T>, line: string): DecodeResult<T> {
  const trimmed = line.trim();
  if (trimmed === '') return { ok: false, error: 'empty line' };
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'invalid JSON' };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return { ok: false, error: `invalid message: ${where}${issue?.message ?? 'unknown'}` };
  }
  return { ok: true, message: parsed.data };
}

/** Decodes one line written by the helper. Never throws. */
export function decodeHelperLine(line: string): DecodeResult<HelperMessage> {
  return decodeWith(HelperMessageSchema, line);
}

/** Decodes one line written by the app (used by tests and any TS-side helper fakes). Never throws. */
export function decodeAppLine(line: string): DecodeResult<AppMessage> {
  return decodeWith(AppMessageSchema, line);
}
