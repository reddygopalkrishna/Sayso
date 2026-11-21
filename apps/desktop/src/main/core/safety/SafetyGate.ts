import type { CommandSpec } from '@sayso/command-grammar';
import type { AppContext } from '../context/HelperContext.ts';

export type RefuseReason =
  'blocked_level' | 'blocked_app' | 'meeting_app' | 'password_field' | 'risky_label';

/** What may happen to an action here (PRD §7.8): run, show the chip first, confirm, or refuse. */
export type SafetyDecision =
  | { kind: 'run' }
  | { kind: 'preview'; ms: number }
  | { kind: 'confirm'; reason?: 'risky_label' }
  | { kind: 'refuse'; reason: RefuseReason };

/**
 * Meeting apps: actions are off while one is in front (dictation still works). The PRD adds "with
 * the mic active"; the helper cannot tell that yet, so any meeting app in front counts. Google
 * Meet runs in a browser tab and is not detected.
 */
export const MEETING_APPS: ReadonlySet<string> = new Set([
  'us.zoom.xos',
  'com.microsoft.teams2',
  'com.microsoft.teams',
  'Cisco-Systems.Spark',
  'com.cisco.webexmeetingsapp',
  'com.apple.FaceTime',
]);

export function isMeetingApp(bundleId: string | null): boolean {
  return bundleId !== null && MEETING_APPS.has(bundleId);
}

/**
 * Decides whether a command may run in this context. Order matters: hard refusals first, then the
 * command's own safety level. The caller must pass a fresh context (read just before acting).
 */
export function decideAction(
  command: CommandSpec,
  context: AppContext,
  previewMs: number,
  args: Readonly<Record<string, string>> = {},
): SafetyDecision {
  // "Cancel" does nothing, so it is allowed everywhere.
  if (command.action.type === 'cancel') return { kind: 'run' };
  if (command.safety === 'blocked') return { kind: 'refuse', reason: 'blocked_level' };
  if (context.bundleId && command.blockedIn.includes(context.bundleId)) {
    return { kind: 'refuse', reason: 'blocked_app' };
  }
  if (isMeetingApp(context.bundleId)) return { kind: 'refuse', reason: 'meeting_app' };
  if (context.secureField) return { kind: 'refuse', reason: 'password_field' };
  if (command.action.type === 'pressElement' && isRiskyLabel(args['label'] ?? '')) {
    return { kind: 'confirm', reason: 'risky_label' };
  }
  switch (command.safety) {
    case 'safe':
      return { kind: 'run' };
    case 'normal':
      return { kind: 'preview', ms: previewMs };
    case 'risky':
      return { kind: 'confirm' };
  }
}

/**
 * Buttons that spend money, send money, delete or sign out (PRD F17 asks "yes?" before pressing
 * these; there is no confirm dialog yet, so "click" refuses them instead).
 */
const RISKY_LABEL =
  /\b(?:pay|payment|purchase|buy|checkout|check out|place order|order now|transfer|send money|wire|withdraw|trade|sell|delete|remove|erase|sign out|log out|logout|deactivate|unsubscribe|cancel subscription|publish|post)\b/;

export function isRiskyLabel(label: string): boolean {
  return RISKY_LABEL.test(label.toLowerCase());
}

/** True when the command can be carried out now (it may still need the preview chip first). */
export function isExecutable(decision: SafetyDecision): boolean {
  return decision.kind === 'run' || decision.kind === 'preview';
}

export type InsertCheck = { ok: true } | { ok: false; reason: 'password_field' };

/** Sayso never types into password fields. */
export function canInsertText(context: AppContext): InsertCheck {
  return context.secureField ? { ok: false, reason: 'password_field' } : { ok: true };
}

/** What the pill says when a spoken command is refused. */
export function describeRefusal(
  reason: RefuseReason | 'needs_confirmation',
  appName: string | null,
): string {
  switch (reason) {
    case 'blocked_level':
      return 'That action is blocked.';
    case 'blocked_app':
      return `That command is not allowed in ${appName ?? 'this app'}.`;
    case 'meeting_app':
      return 'Actions are off while a meeting app is in front.';
    case 'password_field':
      return 'Sayso does not act in password fields.';
    case 'risky_label':
      return 'That button needs confirmation, which Sayso cannot ask for yet.';
    case 'needs_confirmation':
      return 'That action needs confirmation, which Sayso cannot ask for yet.';
  }
}

const MESSAGES: Record<'password_field', string> = {
  password_field: 'Sayso does not type into password fields.',
};

/** Thrown when text must not be inserted; the message is shown on the listening pill. */
export class SafetyRefusal extends Error {
  constructor(readonly reason: 'password_field') {
    super(MESSAGES[reason]);
    this.name = 'SafetyRefusal';
  }
}
