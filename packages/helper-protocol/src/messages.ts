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
 * `pong`, `done`, `transcript`, `context`, `apps`, `permissions`, or `error`. Events (`ready`, `hotkey`, `escape`, `fnListener`, `sttStatus`, `log`, and
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

export const ModifierSchema = z.enum(['cmd', 'shift', 'option', 'ctrl']);
/** Named keys plus single lowercase letters/digits (ANSI layout) for shortcuts like ⌘Z. */
export const KeySchema = z.union([
  z.enum([
    'enter',
    'tab',
    'escape',
    'space',
    'delete',
    'forwardDelete',
    'up',
    'down',
    'left',
    'right',
    'home',
    'end',
    'pageUp',
    'pageDown',
    'leftBracket',
    'rightBracket',
  ]),
  z.string().regex(/^[a-z0-9]$/),
]);
/** Press a key (with modifiers) in the frontmost app. Answered with `done`. */
export const KeyPressSchema = z
  .object({
    v,
    type: z.literal('keyPress'),
    id,
    key: KeySchema,
    modifiers: z.array(ModifierSchema).max(4),
  })
  .strict();

/**
 * Swallow the Escape key (it does not reach the app) and report it as an `escape` event, for the
 * preview chip's "Esc cancels". The helper switches this off by itself after a few seconds, so a
 * crashed app can never leave Escape disabled. Answered with `done`.
 */
export const CaptureEscapeSchema = z
  .object({ v, type: z.literal('captureEscape'), id, enabled: z.boolean() })
  .strict();

/**
 * Start listening continuously (hands-free): the microphone stays on and every utterance is
 * transcribed and reported as a `heard` event. Nothing is saved. Answered with `done`.
 */
export const StartListeningSchema = z.object({ v, type: z.literal('startListening'), id }).strict();

/** Stop listening. The utterance in progress is still transcribed and reported. Answered with `done`. */
export const StopListeningSchema = z.object({ v, type: z.literal('stopListening'), id }).strict();

/**
 * The language spoken, as a two-letter code ("en", "te", "hi"), or null to let the speech model
 * detect it. Takes effect for the next utterance. Answered with `done`.
 */
export const SetLanguageSchema = z
  .object({
    v,
    type: z.literal('setLanguage'),
    id,
    language: z
      .string()
      .regex(/^[a-z]{2}$/)
      .nullable(),
  })
  .strict();

/** The keys that can be held to dictate. Fn is the default; the others sit on the right. */
export const HoldKeySchema = z.enum(['fn', 'rightOption', 'rightCommand', 'rightControl']);

/**
 * Change the key that is held to dictate. Takes effect for the next hold. The `hotkey` events keep
 * saying `fn`: they mean "the hold key". Answered with `done`.
 */
export const SetHoldKeySchema = z
  .object({ v, type: z.literal('setHoldKey'), id, key: HoldKeySchema })
  .strict();

/** Scroll the view under the pointer by `amount` pixels. Answered with `done`. */
export const ScrollSchema = z
  .object({
    v,
    type: z.literal('scroll'),
    id,
    direction: z.enum(['up', 'down']),
    amount: z.number().int().min(50).max(5000),
  })
  .strict();
/**
 * Press (AXPress) the button, link or menu item in the frontmost app whose title or description
 * matches `label`. Answered with `done`, or `error` element_not_found.
 */
export const PressElementSchema = z
  .object({ v, type: z.literal('pressElement'), id, label: z.string().min(1).max(200) })
  .strict();
/** Installed and running apps. Answered with `apps`. */
export const ListAppsSchema = z.object({ v, type: z.literal('listApps'), id }).strict();
/** Launch an app, or bring it to the front if it is running. Answered with `done`. */
export const OpenAppSchema = z
  .object({ v, type: z.literal('openApp'), id, bundleId: z.string().min(1).max(200) })
  .strict();
/** Bring a running app to the front. Answered with `done`, or `error` app_not_found. */
export const ActivateAppSchema = z
  .object({ v, type: z.literal('activateApp'), id, bundleId: z.string().min(1).max(200) })
  .strict();
/** Open an http(s) URL in the default browser. Answered with `done`, or `error` bad_url. */
export const OpenUrlSchema = z
  .object({
    v,
    type: z.literal('openURL'),
    id,
    url: z
      .string()
      .max(2048)
      .regex(/^https?:\/\/\S+$/i),
  })
  .strict();

export const PermissionKindSchema = z.enum(['microphone', 'accessibility']);
export const MicrophoneAccessSchema = z.enum(['granted', 'denied', 'undetermined', 'restricted']);

/** Current Microphone and Accessibility status, for the onboarding screen. Answered with `permissions`. */
export const GetPermissionsSchema = z.object({ v, type: z.literal('getPermissions'), id }).strict();
/**
 * Ask macOS for a permission. Microphone shows the system prompt and waits for the answer;
 * Accessibility shows the system dialog that points to System Settings and answers at once.
 * Answered with `permissions` (the status afterwards).
 */
export const RequestPermissionSchema = z
  .object({ v, type: z.literal('requestPermission'), id, kind: PermissionKindSchema })
  .strict();

/** Read the frontmost app and the focused element. Answered with `context`. */
export const GetContextSchema = z.object({ v, type: z.literal('getContext'), id }).strict();

export const AppMessageSchema = z.discriminatedUnion('type', [
  PingSchema,
  ShutdownSchema,
  RecordStartSchema,
  RecordStopSchema,
  RecordCancelSchema,
  InsertTextSchema,
  GetContextSchema,
  KeyPressSchema,
  CaptureEscapeSchema,
  SetHoldKeySchema,
  StartListeningSchema,
  StopListeningSchema,
  SetLanguageSchema,
  ScrollSchema,
  PressElementSchema,
  ListAppsSchema,
  OpenAppSchema,
  ActivateAppSchema,
  OpenUrlSchema,
  GetPermissionsSchema,
  RequestPermissionSchema,
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

/**
 * One utterance heard while listening continuously (hands-free), in the same shape as a
 * transcript but not an answer to a request, so it has no `id`.
 */
export const HeardSchema = z
  .object({
    v,
    type: z.literal('heard'),
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
    /** Accessibility role of the focused element (e.g. "AXTextField"); null when unknown. */
    focusRole: z.string().min(1).nullable(),
    /** True when the focused element is a password field (AXSecureTextField). */
    secureField: z.boolean(),
  })
  .strict();

export const PermissionsSchema = z
  .object({
    v,
    type: z.literal('permissions'),
    id,
    microphone: MicrophoneAccessSchema,
    accessibility: z.boolean(),
  })
  .strict();

export const AppInfoSchema = z
  .object({ name: z.string().min(1), bundleId: z.string().min(1), running: z.boolean() })
  .strict();
export const AppsSchema = z
  .object({ v, type: z.literal('apps'), id, apps: z.array(AppInfoSchema) })
  .strict();

/** Escape was pressed while `captureEscape` was on (the key was swallowed). */
export const EscapeSchema = z.object({ v, type: z.literal('escape') }).strict();

export const HotkeySchema = z
  .object({
    v,
    type: z.literal('hotkey'),
    key: z.literal('fn'),
    /**
     * `chord`: another key was pressed while Fn was held (e.g. Fn+Delete), so it is not a hold.
     * `command`: Shift was held together with Fn, so this utterance is a command, not dictation.
     */
    phase: z.enum(['down', 'up', 'chord', 'command']),
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
  HeardSchema,
  ContextSchema,
  AppsSchema,
  PermissionsSchema,
  EscapeSchema,
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
export type HeardMessage = z.infer<typeof HeardSchema>;
export type WordTiming = z.infer<typeof WordTimingSchema>;
export type HotkeyMessage = z.infer<typeof HotkeySchema>;
export type ContextMessage = z.infer<typeof ContextSchema>;
export type AppInfo = z.infer<typeof AppInfoSchema>;
export type PermissionKind = z.infer<typeof PermissionKindSchema>;
export type MicrophoneAccess = z.infer<typeof MicrophoneAccessSchema>;
export type PermissionsMessage = z.infer<typeof PermissionsSchema>;
export type Key = z.infer<typeof KeySchema>;
export type Modifier = z.infer<typeof ModifierSchema>;
export type SttStatusMessage = z.infer<typeof SttStatusSchema>;
export type FnListenerMessage = z.infer<typeof FnListenerSchema>;

/** App messages that expect a reply, minus the envelope fields the transport fills in. */
export type RequestMessage = Extract<AppMessage, { id: string }>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type RequestBody = DistributiveOmit<RequestMessage, 'v' | 'id'>;
/** Helper messages that answer a request. */
export type ReplyMessage = Extract<
  HelperMessage,
  { type: 'pong' | 'done' | 'transcript' | 'context' | 'apps' | 'permissions' | 'error' }
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
  elementNotFound: 'element_not_found',
  appNotFound: 'app_not_found',
  badUrl: 'bad_url',
} as const;
