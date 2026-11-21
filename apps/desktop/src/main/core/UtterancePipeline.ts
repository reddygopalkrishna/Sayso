import type { CommandAction, CommandSpec } from '@sayso/command-grammar';
import type { CommandActions, KeyPresser, TextInserter } from './actions/HelperActions.ts';
import { keyStrokeFor } from './actions/sendStrategy.ts';
import { applyDictionary, type DictionaryTerm } from './cleanup/dictionary.ts';
import { applyStyle } from './cleanup/style.ts';
import { afterTypeWord, fixWebAddresses, typeLiterally } from './cleanup/webAddress.ts';
import type { Style } from '../../shared/settings.ts';
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
  | { id: string; result: 'skipped'; reason: string }
  /** A risky button was named: nothing is pressed until the user says "yes" (see confirmPending). */
  | { id: string; result: 'awaiting' };

/** How long a risky action waits for "yes" before it is dropped. */
const CONFIRM_MS = 8_000;

export interface UtteranceOutcome {
  mode: PipelineMode;
  segment: TranscriptSegment;
  context: AppContext;
  /** The pause-rule split (dictation only). */
  routing: RoutingDecision | null;
  cleanup: CleanupResult | null;
  inserted: boolean;
  /** The text typed when it came from a snippet (no cleanup ran); otherwise absent. */
  insertedText?: string;
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
  engine: {
    match(text: string): InstantMatch | null;
    /** Several commands in one sentence ("open Chrome, new tab"). Falls back to `match`. */
    matchChain?(text: string): InstantMatch[] | null;
  };
  /** Pause between chained steps, so the screen can update first. Default 300 ms. */
  settleMs?: () => number;
  /** Default or chill for the app in front. Chill: no capitals, minimal punctuation. */
  style?: (bundleId: string | null) => Style;
  /** Your snippets: when the whole dictation is a trigger, its text is typed as saved, no AI. */
  snippets?: { find(spoken: string): string | null };
  /** Time a risky action waits for "yes". Default 8 s. */
  confirmMs?: () => number;
  /** Show the "say yes" prompt (and let Esc cancel it), and clear it again. */
  onAwaitConfirm?: (prompt: string, ms: number) => void;
  onConfirmEnd?: () => void;
  /** Your own words: "sounds like" entries also fix mis-heard words in spoken commands. */
  dictionary?: () => readonly DictionaryTerm[];
  resolver: {
    resolveOpen(target: string): Promise<OpenResolution>;
    resolveSwitch(name: string): Promise<KnownApp | null>;
  };
  pauseMs: () => number;
  previewMs: () => number;
  onOutcome?: (outcome: UtteranceOutcome) => void;
  /** Called when delivering failed (refused, not understood, helper error); the error is rethrown. */
  onFailure?: (failure: PipelineFailure) => void;
}

export interface PipelineFailure {
  mode: PipelineMode;
  segment: TranscriptSegment;
  context: AppContext;
  error: unknown;
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
  /** The risky action waiting for "yes": one at a time, and only until it expires. */
  private pending: {
    match: InstantMatch;
    bundleId: string | null;
    expiresAt: number;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor(private readonly opts: UtterancePipelineOptions) {}

  /** Esc, or anything else that ends the wait: drops the risky action without pressing it. */
  cancelPending(): void {
    this.clearPending();
  }

  async deliver(segment: TranscriptSegment, mode: PipelineMode = 'dictation'): Promise<void> {
    const context = await this.opts.readContext();
    try {
      if (mode === 'command') await this.deliverCommand(segment, context);
      else await this.deliverDictation(segment, context);
    } catch (error) {
      this.opts.onFailure?.({ mode, segment, context, error });
      throw error;
    }
  }

  private async deliverDictation(segment: TranscriptSegment, context: AppContext): Promise<void> {
    this.clearPending();

    // "type …" with the hold key: the rest is typed as said, with no AI and no end command.
    const literal = afterTypeWord(segment.text);
    if (literal !== null) {
      this.assertCanInsert(context);
      const text = typeLiterally(literal, this.opts.dictionary?.() ?? []);
      if (text !== '') await this.insert(text);
      this.opts.onOutcome?.({
        mode: 'dictation',
        segment,
        context,
        routing: null,
        cleanup: null,
        inserted: text !== '',
        insertedText: text,
        command: null,
      });
      return;
    }

    const routing = route(segment, {
      endCommands: this.opts.endCommands,
      pauseMs: this.opts.pauseMs(),
      isAllowed: (command) => isExecutable(decideAction(command, context, this.opts.previewMs())),
    });

    let cleanup: CleanupResult | null = null;
    let snippet: string | null = null;
    let styled: string | null = null;
    let inserted = false;
    if (routing.dictation !== '') {
      // Refuse before cleanup so nothing said into a password field is sent to the AI either.
      this.assertCanInsert(context);
      snippet = this.opts.snippets?.find(routing.dictation) ?? null;
      if (snippet !== null) {
        await this.insert(snippet);
        inserted = true;
      } else {
        cleanup = await this.opts.cleanup.clean({
          rawText: routing.dictation,
          bundleId: context.bundleId,
          appName: context.appName,
        });
        const typed = fixWebAddresses(
          applyStyle(
            cleanup.text,
            this.opts.style?.(context.bundleId) ?? 'default',
            this.opts.dictionary?.() ?? [],
          ),
        );
        if (typed !== '') {
          await this.insert(typed);
          inserted = true;
          if (typed !== cleanup.text) styled = typed;
        }
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
      ...((snippet ?? styled) !== null ? { insertedText: snippet ?? styled ?? '' } : {}),
      command,
    });
  }

  private async deliverCommand(segment: TranscriptSegment, context: AppContext): Promise<void> {
    const text = applyDictionary(segment.text, this.opts.dictionary?.() ?? []);
    const steps = this.opts.engine.matchChain
      ? this.opts.engine.matchChain(text)
      : singleStep(this.opts.engine.match(text));
    // Command mode never types: an unrecognised utterance is reported, not inserted.
    if (!steps) throw new CommandNotUnderstood(segment.text);

    // "yes" answers a waiting risky action. Any other command ends that wait.
    const isYes = steps.length === 1 && steps[0]?.command.action.type === 'confirmPending';
    if (!isYes) this.clearPending();
    if (isYes) {
      const command = await this.confirmPending();
      this.opts.onOutcome?.({
        mode: 'command',
        segment,
        context,
        routing: null,
        cleanup: null,
        inserted: false,
        command,
      });
      return;
    }

    // Steps run in order, each after a short settle so the screen can catch up. A refusal or a
    // failure throws and stops the chain; a cancel, a skip or a wait for "yes" stops it.
    let command: CommandOutcome | null = null;
    for (const [index, step] of steps.entries()) {
      if (index > 0)
        await new Promise((resolve) => setTimeout(resolve, this.opts.settleMs?.() ?? 300));
      command = await this.runCommand(step, { failOnRefusal: true, allowConfirm: true });
      if (command.result !== 'ran') break;
    }
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

  /** Asks for "yes" before a risky action. Nothing is pressed here. */
  private awaitConfirmation(match: InstantMatch, live: AppContext): CommandOutcome {
    const spec = match.command;
    const ms = this.opts.confirmMs?.() ?? CONFIRM_MS;
    const what =
      spec.action.type === 'pressElement'
        ? `press “${match.args['label'] ?? ''}”`
        : spec.label.toLowerCase();
    this.clearPending();
    this.pending = {
      match,
      bundleId: live.bundleId,
      expiresAt: Date.now() + ms,
      timer: setTimeout(() => this.clearPending(), ms),
    };
    this.opts.onAwaitConfirm?.(`Say “yes” to ${what}`, ms);
    return { id: spec.id, result: 'awaiting' };
  }

  /** Presses the waiting action, if it is still waiting, still in the same app, and still allowed. */
  private async confirmPending(): Promise<CommandOutcome> {
    const waiting = this.pending;
    this.clearPending();
    if (!waiting || Date.now() > waiting.expiresAt) {
      throw new CommandFailed('Nothing is waiting for “yes”.');
    }
    const live = await this.opts.readContext();
    if (live.bundleId !== waiting.bundleId) {
      throw new CommandFailed('The app changed, so nothing was pressed.');
    }
    const decision = decideAction(
      waiting.match.command,
      live,
      this.opts.previewMs(),
      waiting.match.args,
    );
    if (decision.kind === 'refuse') throw new CommandRefused(decision.reason, live.appName);
    await this.perform(waiting.match.command.action, waiting.match.args, live);
    return { id: waiting.match.command.id, result: 'ran' };
  }

  private clearPending(): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending = null;
    this.opts.onConfirmEnd?.();
  }

  private async runCommand(
    match: InstantMatch,
    how: { onCancel?: () => Promise<void>; failOnRefusal?: boolean; allowConfirm?: boolean },
  ): Promise<CommandOutcome> {
    const spec = match.command;
    const live = await this.opts.readContext();
    const decision = decideAction(spec, live, this.opts.previewMs(), match.args);
    if (decision.kind === 'confirm' && how.allowConfirm) return this.awaitConfirmation(match, live);
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
      case 'confirmPending':
        // Handled in deliverCommand; a "yes" never reaches the generic path.
        throw new CommandFailed('Nothing is waiting for “yes”.');
    }
  }
}

function singleStep(match: InstantMatch | null): InstantMatch[] | null {
  return match ? [match] : null;
}

function requiredArg(args: Readonly<Record<string, string>>, name: string): string {
  const value = args[name];
  if (!value) throw new CommandFailed(`Missing ${name}.`);
  return value;
}
