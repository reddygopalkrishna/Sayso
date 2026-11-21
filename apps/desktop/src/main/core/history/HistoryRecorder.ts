import type { HistoryAction, HistoryOutcome } from '../../../shared/data.ts';
import { CommandRefused } from '../commands/errors.ts';
import { SafetyRefusal } from '../safety/SafetyGate.ts';
import type { NewHistoryEntry } from '../storage/HistoryRepo.ts';
import type { PipelineFailure, UtteranceOutcome } from '../UtterancePipeline.ts';

/**
 * Turns what the pipeline did into a history row. Anything refused in a password field is stored
 * with no text at all: what was said into one may be a password.
 */
export class HistoryRecorder {
  constructor(private readonly store: { record(entry: NewHistoryEntry): unknown }) {}

  /** `elapsedMs` is the time since the transcript was ready; STT time is added to it. */
  recordOutcome(outcome: UtteranceOutcome, elapsedMs: number): void {
    const { command, inserted, cleanup, segment, context, mode } = outcome;
    if (!inserted && !command) return; // nothing happened (only fillers were said)
    let result: HistoryOutcome = 'done';
    if (command?.result === 'cancelled') result = 'cancelled';
    else if (command?.result === 'skipped') result = 'blocked';
    const action: HistoryAction | null = command
      ? { command: command.id, result: command.result }
      : null;
    this.store.record({
      appBundleId: context.bundleId,
      appName: context.appName,
      mode,
      rawText: segment.text,
      finalText: inserted ? (cleanup?.text ?? null) : null,
      action,
      outcome: result,
      latencyMs: segment.sttMs + elapsedMs,
    });
  }

  recordFailure(failure: PipelineFailure, elapsedMs: number): void {
    const { error, segment, context, mode } = failure;
    const refusedInPasswordField =
      (error instanceof SafetyRefusal || error instanceof CommandRefused) &&
      error.reason === 'password_field';
    const refused = error instanceof SafetyRefusal || error instanceof CommandRefused;
    this.store.record({
      appBundleId: context.bundleId,
      appName: context.appName,
      mode,
      rawText: refusedInPasswordField ? null : segment.text,
      finalText: null,
      action: null,
      outcome: refused ? 'blocked' : 'failed',
      latencyMs: segment.sttMs + elapsedMs,
    });
  }
}
