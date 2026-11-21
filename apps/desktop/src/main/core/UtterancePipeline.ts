import type { CommandAction, CommandSpec } from '@sayso/command-grammar';
import type { CommandActions, KeyPresser, TextInserter } from './actions/HelperActions.ts';
import { keyStrokeFor } from './actions/sendStrategy.ts';
import type { CleanupResult, TextCleanup } from './cleanup/TextCleanup.ts';
import { CommandFailed, CommandNotUnderstood, CommandRefused } from './commands/errors.ts';
import { fillLabel, type InstantMatch } from './commands/CommandEngine.ts';
import type { AppContext } from './context/HelperContext.ts';
import type { KnownApp, OpenResolution } from './resolver/AppResolver.ts';
import type { ChipResult } from './safety/PreviewChip.ts';
import { canInsertText, decideAction, isExecutable, SafetyRefusal } from './safety/SafetyGate.ts';
import { route, type RoutingDecision } from './router/IntentRouter.ts';
import type { TranscriptSegment } from './stt/types.ts';

/** Hold Fn to dictate; hold Fn+Shift to give commands (everything said is a command). */
export type PipelineMode = 'dictation' | 'command';

export type CommandOutcome =
  | { id: string; result: 'ran' }
  /** The user pressed Esc on the preview chip. In dictation the spoken word was typed instead. */
  | { id: string; result: 'cancelled' }
  | { id: string; result: 'skipped'; reason: string };

export interface UtteranceOutcome {
  mode: PipelineMode;
  segment: TranscriptSegment;
  context: AppContext;
  /** The pause-rule split (dictation only). */
  routing: RoutingDecision | null;
  cleanup: CleanupResult | null;
  inserted: boolean;
  command: CommandOutcome | null;
}

export interface UtterancePipelineOptions {
  readContext: () => Promise<AppContext>;
  cleanup: TextCleanup;
  actions: TextInserter & KeyPresser & CommandActions;
  chip: { confirm(label: string, ms: number): Promise<ChipResult> };
  /** Trailing end commands for the pause rule (dictation mode). */
  endCommands: readonly CommandSpec[];
  /** Whole-utterance command matching (command mode). */
  engine: { match(text: string): InstantMatch | null };
  resolver: {
    resolveOpen(target: string): Promise<OpenResolution>;
    resolveSwitch(name: string): Promise<KnownApp | null>;
  };
  pauseMs: () => number;
  previewMs: () => number;
  onOutcome?: (outcome: UtteranceOutcome) => void;
}

/**
 * What happens to a finished transcript.
 * Dictation: read the target app, split off a trailing end command with the pause rule (on the raw
 * text), clean up and insert the text, then run the command through the SafetyGate.
 * Command mode: match the whole utterance to a command (no AI, nothing is typed) and run it
 * through the same SafetyGate.
 * The context is read again right before every action, because the user may have switched apps or
 * fields while the AI cleanup or the preview chip was running.
 */
export class UtterancePipeline {
  constructor(private readonly opts: UtterancePipelineOptions) {}

  async deliver(segment: TranscriptSegment, mode: PipelineMode = 'dictation'): Promise<void> {
    if (mode === 'command') await this.deliverCommand(segment);
    else await this.deliverDictation(segment);
  }

  private async deliverDictation(segment: TranscriptSegment): Promise<void> {
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

    let command: CommandOutcome | null = null;
    if (routing.command) {
      const match = routing.command;
      const instant: InstantMatch = {
        command: match.command,
        phrase: match.phrase,
        args: {},
        confidence: 1,
      };
      command = await this.runCommand(instant, {
        // Esc on the chip: type what the user said instead (PRD §7.2).
        onCancel: () => this.insert(`${inserted ? ' ' : ''}${match.spokenText}`),
      });
    }
    this.opts.onOutcome?.({
      mode: 'dictation',
      segment,
      context,
      routing,
      cleanup,
      inserted,
      command,
    });
  }

  private async deliverCommand(segment: TranscriptSegment): Promise<void> {
    const context = await this.opts.readContext();
    const match = this.opts.engine.match(segment.text);
    // Command mode never types: an unrecognised utterance is reported, not inserted.
    if (!match) throw new CommandNotUnderstood(segment.text);
    const command = await this.runCommand(match, { failOnRefusal: true });
    this.opts.onOutcome?.({
      mode: 'command',
      segment,
      context,
      routing: null,
      cleanup: null,
      inserted: false,
      command,
    });
  }

  private assertCanInsert(context: AppContext): void {
    const check = canInsertText(context);
    if (!check.ok) throw new SafetyRefusal(check.reason);
  }

  private async insert(text: string): Promise<void> {
    this.assertCanInsert(await this.opts.readContext());
    await this.opts.actions.insertText(text);
  }

  private async runCommand(
    match: InstantMatch,
    how: { onCancel?: () => Promise<void>; failOnRefusal?: boolean },
  ): Promise<CommandOutcome> {
    const spec = match.command;
    const live = await this.opts.readContext();
    const decision = decideAction(spec, live, this.opts.previewMs(), match.args);
    if (decision.kind === 'refuse' || decision.kind === 'confirm') {
      const reason = decision.kind === 'refuse' ? decision.reason : 'needs_confirmation';
      // In command mode nothing is typed, so the user must be told why nothing happened.
      if (how.failOnRefusal) throw new CommandRefused(reason, live.appName);
      return { id: spec.id, result: 'skipped', reason };
    }

    let target = live;
    if (decision.kind === 'preview') {
      if (
        (await this.opts.chip.confirm(fillLabel(spec.label, match.args), decision.ms)) ===
        'cancelled'
      ) {
        await how.onCancel?.();
        return { id: spec.id, result: 'cancelled' };
      }
      target = await this.opts.readContext();
      if (target.bundleId !== live.bundleId) {
        return { id: spec.id, result: 'skipped', reason: 'context_changed' };
      }
      const again = decideAction(spec, target, this.opts.previewMs(), match.args);
      if (again.kind === 'refuse') return { id: spec.id, result: 'skipped', reason: again.reason };
    }

    await this.perform(spec.action, match.args, target);
    return { id: spec.id, result: 'ran' };
  }

  private async perform(
    action: CommandAction,
    args: Readonly<Record<string, string>>,
    target: AppContext,
  ): Promise<void> {
    const { actions, resolver } = this.opts;
    switch (action.type) {
      case 'contextual_send':
      case 'keyPress': {
        const stroke = keyStrokeFor(action, target.bundleId);
        await actions.pressKey(stroke.key, stroke.modifiers);
        return;
      }
      case 'scroll':
        await actions.scroll(action.direction, action.amount);
        return;
      case 'pressElement':
        await actions.pressElement(requiredArg(args, 'label'));
        return;
      case 'openTarget': {
        const resolved = await resolver.resolveOpen(requiredArg(args, 'target'));
        if (resolved.type === 'app') await actions.openApp(resolved.bundleId);
        else await actions.openUrl(resolved.url);
        return;
      }
      case 'switchApp': {
        const name = requiredArg(args, 'app');
        const app = await resolver.resolveSwitch(name);
        if (!app) throw new CommandFailed(`${name} is not running.`);
        await actions.activateApp(app.bundleId);
        return;
      }
      case 'cancel':
        return;
    }
  }
}

function requiredArg(args: Readonly<Record<string, string>>, name: string): string {
  const value = args[name];
  if (!value) throw new CommandFailed(`Missing ${name}.`);
  return value;
}
