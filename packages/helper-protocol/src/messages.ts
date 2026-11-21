/**
 * Sayso helper protocol (version 1): the contract between the Electron app and a native helper.
 *
 * Channels
 * - stdin  (app → helper): newline-delimited JSON, one AppMessage per line.
 * - stdout (helper → app): newline-delimited JSON, one HelperMessage per line. Nothing else may be
 *   written to stdout.
 * - stderr (helper → app): free-form diagnostics, logged by the app, never parsed.
 * - Audio never crosses the pipe: speech-to-text (WhisperKit) runs inside the helper. If a cloud
 *   STT fallback is added, audio will use a separate fd 3 pipe with length-prefixed frames so
 *   binary data never mixes with JSON lines.
 *
 * Requests (messages with an `id`) are answered with exactly one reply carrying the same `id`:
 * `pong`, `done`, `transcript`, `context`, or `error`. Events (`ready`, `hotkey`, `fnListener`, `sttStatus`, `log`, and
 * `error` without an id) are unsolicited. The helper sends `ready` first.
 *
 * The Swift helper mirrors these types (native/mac-helper/Sources/SaysoHelperCore/Message.swift);
 * both sides decode the examples in ../fixtures in their tests so they cannot drift.
 */
import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

const v = z.literal(PROTOCOL_VERSION);
export const RequestIdSchema = z.string().min(1).max(64);
const id = RequestIdSchema;

// App → helper
export const PingSchema = z.object({ v, type: z.literal('ping'), id }).strict();
export const ShutdownSchema = z.object({ v, type: z.literal('shutdown') }).strict();
/** Start capturing the microphone for utterance `id`. Answered with `done` once recording. */
export const RecordStartSchema = z.object({ v, type: z.literal('recordStart'), id }).strict();
/** Stop capturing and transcribe. Answered with `transcript`. */
export const RecordStopSchema = z.object({ v, type: z.literal('recordStop'), id }).strict();
/** Stop capturing and discard the audio. Answered with `done`. */
export const RecordCancelSchema = z.object({ v, type: z.literal('recordCancel'), id }).strict();
/** Insert text into the focused field (paste, then restore the clipboard). Answered with `done`. */
export const InsertTextSchema = z
  .object({ v, type: z.literal('insertText'), id, text: z.string().min(1).max(100_000) })
  .strict();

/** Read the frontmost app (and, later, the focused element). Answered with `context`. */
export const GetContextSchema = z.object({ v, type: z.literal('getContext'), id }).strict();

export const AppMessageSchema = z.discriminatedUnion('type', [
  PingSchema,
  ShutdownSchema,
  RecordStartSchema,
  RecordStopSchema,
  RecordCancelSchema,
  InsertTextSchema,
  GetContextSchema,
]);

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
export const DoneSchema = z.object({ v, type: z.literal('done'), id }).strict();

export const WordTimingSchema = z
  .object({
    text: z.string(),
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    p: z.number().min(0).max(1),
  })
  .strict();
export const TranscriptSchema = z
  .object({
    v,
    type: z.literal('transcript'),
    id,
    text: z.string(),
    words: z.array(WordTimingSchema),
    audioMs: z.number().nonnegative(),
    sttMs: z.number().nonnegative(),
    model: z.string().min(1),
  })
  .strict();

export const ContextSchema = z
  .object({
    v,
    type: z.literal('context'),
    id,
    /** Frontmost app; null when there is none (e.g. the login window). */
    bundleId: z.string().min(1).nullable(),
    appName: z.string().min(1).nullable(),
  })
  .strict();

export const HotkeySchema = z
  .object({
    v,
    type: z.literal('hotkey'),
    key: z.literal('fn'),
    /** `chord`: another key was pressed while Fn was held (e.g. Fn+Delete), so it is not a hold. */
    phase: z.enum(['down', 'up', 'chord']),
  })
  .strict();
/** Whether the Fn listener (CGEventTap) is running; `unavailable` means Accessibility is off. */
export const FnListenerSchema = z
  .object({ v, type: z.literal('fnListener'), state: z.enum(['active', 'unavailable']) })
  .strict();
export const SttStatusSchema = z
  .object({
    v,
    type: z.literal('sttStatus'),
    state: z.enum(['loading', 'ready', 'error']),
    model: z.string().min(1),
    msg: z.string().optional(),
  })
  .strict();
export const LogSchema = z
  .object({
    v,
    type: z.literal('log'),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    msg: z.string(),
  })
  .strict();
export const ErrorSchema = z
  .object({
    v,
    type: z.literal('error'),
    /** Present when this error answers a request. */
    id: id.optional(),
    code: z.string().min(1),
    msg: z.string(),
  })
  .strict();

export const HelperMessageSchema = z.discriminatedUnion('type', [
  ReadySchema,
  PongSchema,
  DoneSchema,
  TranscriptSchema,
  ContextSchema,
  HotkeySchema,
  FnListenerSchema,
  SttStatusSchema,
  LogSchema,
  ErrorSchema,
]);

export type AppMessage = z.infer<typeof AppMessageSchema>;
export type HelperMessage = z.infer<typeof HelperMessageSchema>;
export type ReadyMessage = z.infer<typeof ReadySchema>;
export type TranscriptMessage = z.infer<typeof TranscriptSchema>;
export type WordTiming = z.infer<typeof WordTimingSchema>;
export type HotkeyMessage = z.infer<typeof HotkeySchema>;
export type ContextMessage = z.infer<typeof ContextSchema>;
export type SttStatusMessage = z.infer<typeof SttStatusSchema>;
export type FnListenerMessage = z.infer<typeof FnListenerSchema>;

/** App messages that expect a reply, minus the envelope fields the transport fills in. */
export type RequestMessage = Extract<AppMessage, { id: string }>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type RequestBody = DistributiveOmit<RequestMessage, 'v' | 'id'>;
/** Helper messages that answer a request. */
export type ReplyMessage = Extract<
  HelperMessage,
  { type: 'pong' | 'done' | 'transcript' | 'context' | 'error' }
>;

/** Error codes the helper sends. */
export const HelperErrorCode = {
  badMessage: 'bad_message',
  micDenied: 'mic_denied',
  micFailed: 'mic_failed',
  notRecording: 'not_recording',
  alreadyRecording: 'already_recording',
  sttFailed: 'stt_failed',
  accessibilityDenied: 'accessibility_denied',
} as const;
