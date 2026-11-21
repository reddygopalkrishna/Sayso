import type { CommandSpec } from '@sayso/command-grammar';
import type { KeyPresser, TextInserter } from './actions/HelperActions.ts';
import { keyStrokeFor } from './actions/sendStrategy.ts';
import type { CleanupResult, TextCleanup } from './cleanup/TextCleanup.ts';
import type { AppContext } from './context/HelperContext.ts';
import { route, type RoutingDecision } from './router/IntentRouter.ts';
import type { TranscriptSegment } from './stt/types.ts';

export interface UtteranceOutcome {
  segment: TranscriptSegment;
  context: AppContext;
  routing: RoutingDecision;
  cleanup: CleanupResult | null;
  inserted: boolean;
  /** Id of the end command that ran, if any. */
  ranCommand: string | null;
}

export interface UtterancePipelineOptions {
  readContext: () => Promise<AppContext>;
  cleanup: TextCleanup;
  actions: TextInserter & KeyPresser;
  endCommands: readonly CommandSpec[];
  pauseMs: () => number;
  onOutcome?: (outcome: UtteranceOutcome) => void;
}

/**
 * What happens to a finished transcript: read the target app, split off a trailing end command
 * with the pause rule (on the raw text), clean up and insert the text, then run the command.
 */
export class UtterancePipeline {
  constructor(private readonly opts: UtterancePipelineOptions) {}

  async deliver(segment: TranscriptSegment): Promise<void> {
    const context = await this.opts.readContext();
    const routing = route(segment, {
      endCommands: this.opts.endCommands,
      pauseMs: this.opts.pauseMs(),
      // Step 5 replaces this with the SafetyGate (preview chip, password fields, meeting apps).
      isAllowed: (command) => !(context.bundleId && command.blockedIn.includes(context.bundleId)),
    });

    let cleanup: CleanupResult | null = null;
    let inserted = false;
    if (routing.dictation !== '') {
      cleanup = await this.opts.cleanup.clean({
        rawText: routing.dictation,
        bundleId: context.bundleId,
        appName: context.appName,
      });
      if (cleanup.text !== '') {
        await this.opts.actions.insertText(cleanup.text);
        inserted = true;
      }
    }

    let ranCommand: string | null = null;
    if (routing.command) {
      const stroke = keyStrokeFor(routing.command.command.action, context.bundleId);
      await this.opts.actions.pressKey(stroke.key, stroke.modifiers);
      ranCommand = routing.command.command.id;
    }
    this.opts.onOutcome?.({ segment, context, routing, cleanup, inserted, ranCommand });
  }
}
