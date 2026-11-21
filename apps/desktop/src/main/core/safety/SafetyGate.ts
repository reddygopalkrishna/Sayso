import type { CommandSpec } from '@sayso/command-grammar';
import type { AppContext } from '../context/HelperContext.ts';

export type RefuseReason = 'blocked_level' | 'blocked_app' | 'meeting_app' | 'password_field';

/** What may happen to an action here (PRD §7.8): run, show the chip first, confirm, or refuse. */
export type SafetyDecision =
  | { kind: 'run' }
  | { kind: 'preview'; ms: number }
  | { kind: 'confirm' }
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
): SafetyDecision {
  if (command.safety === 'blocked') return { kind: 'refuse', reason: 'blocked_level' };
  if (context.bundleId && command.blockedIn.includes(context.bundleId)) {
    return { kind: 'refuse', reason: 'blocked_app' };
  }
  if (isMeetingApp(context.bundleId)) return { kind: 'refuse', reason: 'meeting_app' };
  if (context.secureField) return { kind: 'refuse', reason: 'password_field' };
  switch (command.safety) {
    case 'safe':
      return { kind: 'run' };
    case 'normal':
      return { kind: 'preview', ms: previewMs };
    case 'risky':
      return { kind: 'confirm' };
  }
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
