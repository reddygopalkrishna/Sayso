/**
 * Sayso helper protocol (version 1): the contract between the Electron app and a native helper.
 *
 * Channels
 * - stdin  (app → helper): newline-delimited JSON, one AppMessage per line.
 * - stdout (helper → app): newline-delimited JSON, one HelperMessage per line. Nothing else may be
 *   written to stdout.
 * - stderr (helper → app): free-form diagnostics, logged by the app, never parsed.
 * - fd 3   (helper → app, from Phase 0 step 2): audio as length-prefixed binary frames, so binary
 *   data never mixes with JSON lines.
 *
 * The helper sends `ready` first. Every message carries `v: PROTOCOL_VERSION`.
 * The Swift helper mirrors these types (native/mac-helper/Sources/SaysoHelperCore/Message.swift);
 * both sides decode the examples in ../fixtures in their tests so they cannot drift.
 */
import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

const v = z.literal(PROTOCOL_VERSION);
const id = z.string().min(1).max(64);

// App → helper
export const PingSchema = z.object({ v, type: z.literal('ping'), id }).strict();
export const ShutdownSchema = z.object({ v, type: z.literal('shutdown') }).strict();

export const AppMessageSchema = z.discriminatedUnion('type', [PingSchema, ShutdownSchema]);

// Helper → app
export const ReadySchema = z
  .object({
    v,
    type: z.literal('ready'),
    helperVersion: z.string().min(1),
    protocol: z.number().int().positive(),
    os: z.string().min(1),
  })
  .strict();
export const PongSchema = z.object({ v, type: z.literal('pong'), id }).strict();
export const LogSchema = z
  .object({
    v,
    type: z.literal('log'),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    msg: z.string(),
  })
  .strict();
export const ErrorSchema = z
  .object({ v, type: z.literal('error'), code: z.string().min(1), msg: z.string() })
  .strict();

export const HelperMessageSchema = z.discriminatedUnion('type', [
  ReadySchema,
  PongSchema,
  LogSchema,
  ErrorSchema,
]);

export type AppMessage = z.infer<typeof AppMessageSchema>;
export type HelperMessage = z.infer<typeof HelperMessageSchema>;
export type ReadyMessage = z.infer<typeof ReadySchema>;
