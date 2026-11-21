import type { CommandSpec } from '@sayso/command-grammar';
import type { KeyPresser, TextInserter } from './actions/HelperActions.ts';
import { keyStrokeFor } from './actions/sendStrategy.ts';
import type { CleanupResult, TextCleanup } from './cleanup/TextCleanup.ts';
import type { AppContext } from './context/HelperContext.ts';
import type { ChipResult } from './safety/PreviewChip.ts';
import { canInsertText, decideAction, isExecutable, SafetyRefusal } from './safety/SafetyGate.ts';
import { route, type RoutingDecision } from './router/IntentRouter.ts';
import type { TranscriptSegment } from './stt/types.ts';

export type CommandOutcome =
  | { id: string; result: 'ran' }
  /** The user pressed Esc on the preview chip; the spoken word was typed instead. */
  | { id: string; result: 'cancelled' }
  | { id: string; result: 'skipped'; reason: string };

export interface UtteranceOutcome {
  segment: TranscriptSegment;
  context: AppContext;
  routing: RoutingDecision;
  cleanup: CleanupResult | null;
  inserted: boolean;
  command: CommandOutcome | null;
}

export interface UtterancePipelineOptions {
  readContext: () => Promise<AppContext>;
  cleanup: TextCleanup;
  actions: TextInserter & KeyPresser;
  chip: { confirm(label: string, ms: number): Promise<ChipResult> };
  endCommands: readonly CommandSpec[];
  pauseMs: () => number;
  previewMs: () => number;
  onOutcome?: (outcome: UtteranceOutcome) => void;
}

/**
 * What happens to a finished transcript: read the target app, split off a trailing end command
 * with the pause rule (on the raw text), clean up and insert the text, then run the command
 * through the SafetyGate. The context is read again right before every action, because the user
 * may have switched apps or fields while the AI cleanup or the preview chip was running.
 */
export class UtterancePipeline {
  constructor(private readonly opts: UtterancePipelineOptions) {}

  async deliver(segment: TranscriptSegment): Promise<void> {
    const context = await this.opts.readContext();
    const routing = route(segment, {
      endCommands: this.opts.endCommands,
      pauseMs: this.opts.pauseMs(),
      isAllowed: (command) => isExecutable(decideAction(command, context, this.opts.previewMs())),
    });

    let cleanup: CleanupResult | null = null;
    let inserted = false;
    if (routing.dictation !== '') {
      // Refuse before cleanup so nothing said into a password field is sent to the AI either.
      this.assertCanInsert(context);
      cleanup = await this.opts.cleanup.clean({
        rawText: routing.dictation,
        bundleId: context.bundleId,
        appName: context.appName,
      });
      if (cleanup.text !== '') {
        await this.insert(cleanup.text);
        inserted = true;
      }
    }

    const command = routing.command ? await this.runCommand(routing, inserted) : null;
    this.opts.onOutcome?.({ segment, context, routing, cleanup, inserted, command });
  }

  private assertCanInsert(context: AppContext): void {
    const check = canInsertText(context);
    if (!check.ok) throw new SafetyRefusal(check.reason);
  }

  private async insert(text: string): Promise<void> {
    this.assertCanInsert(await this.opts.readContext());
    await this.opts.actions.insertText(text);
  }

  private async runCommand(routing: RoutingDecision, inserted: boolean): Promise<CommandOutcome> {
    const match = routing.command;
    if (!match) throw new Error('runCommand without a command');
    const spec = match.command;
    const live = await this.opts.readContext();
    const decision = decideAction(spec, live, this.opts.previewMs());
    if (decision.kind === 'refuse')
      return { id: spec.id, result: 'skipped', reason: decision.reason };
    // Risky commands need a confirm dialog, which does not exist yet: never run them unconfirmed.
    if (decision.kind === 'confirm')
      return { id: spec.id, result: 'skipped', reason: 'confirm_unavailable' };

    let target = live;
    if (decision.kind === 'preview') {
      if ((await this.opts.chip.confirm(spec.label, decision.ms)) === 'cancelled') {
        // Esc: type what the user said instead (PRD §7.2).
        await this.insert(`${inserted ? ' ' : ''}${match.spokenText}`);
        return { id: spec.id, result: 'cancelled' };
      }
      target = await this.opts.readContext();
      if (target.bundleId !== live.bundleId)
        return { id: spec.id, result: 'skipped', reason: 'context_changed' };
      const again = decideAction(spec, target, this.opts.previewMs());
      if (again.kind === 'refuse') return { id: spec.id, result: 'skipped', reason: again.reason };
    }

    const stroke = keyStrokeFor(spec.action, target.bundleId);
    await this.opts.actions.pressKey(stroke.key, stroke.modifiers);
    return { id: spec.id, result: 'ran' };
  }
}
