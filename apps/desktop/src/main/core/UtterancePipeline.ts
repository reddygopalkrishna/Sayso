import type { CommandAction, CommandSpec } from '@sayso/command-grammar';
import type { CommandActions, KeyPresser, TextInserter } from './actions/HelperActions.ts';
import { keyStrokeFor } from './actions/sendStrategy.ts';
import { applyDictionary, type DictionaryTerm } from './cleanup/dictionary.ts';
import { applyStyle } from './cleanup/style.ts';
import { afterTypeWord, fixWebAddresses, typeLiterally } from './cleanup/webAddress.ts';
import type { Plan, PlanStep } from './interpret/plan.ts';
import type { ProfileKey } from '../../shared/profile.ts';
import type { Style } from '../../shared/settings.ts';
import type { CleanupResult, TextCleanup } from './cleanup/TextCleanup.ts';
import { parseMessageRequest, parsePosition } from '@sayso/command-grammar';
import { verbatimIn } from './commands/messageSentence.ts';
import { messageAppForBundle, RECIPES, titleCase } from './messaging/recipes.ts';
import { HelperRequestError } from '../helper/HelperProcess.ts';
import { CommandFailed, CommandNotUnderstood, CommandRefused } from './commands/errors.ts';
import { fillLabel, type InstantMatch } from './commands/CommandEngine.ts';
import { DEFAULT_PAGE_WAIT_MS, loadsPage, type StepEffect } from './commands/pageLoad.ts';
import type { AppContext } from './context/HelperContext.ts';
import type { KnownApp, OpenResolution } from './resolver/AppResolver.ts';
import type { ChipResult } from './safety/PreviewChip.ts';
import {
  canInsertText,
  decideAction,
  isExecutable,
  isMeetingApp,
  SafetyRefusal,
} from './safety/SafetyGate.ts';
import { route, type RoutingDecision } from './router/IntentRouter.ts';
import type { TranscriptSegment } from './stt/types.ts';

/** Hold Fn to dictate; hold Fn+Shift to give commands (everything said is a command). */
export type PipelineMode = 'dictation' | 'command';

export type CommandOutcome =
  | {
      id: string;
      result: 'ran';
      /** The step loads a page: wait longer before the next one. */ loadsPage?: true;
    }
  /** The user pressed Esc on the preview chip. In dictation the spoken word was typed instead. */
  | { id: string; result: 'cancelled' }
  | { id: string; result: 'skipped'; reason: string }
  /** A risky button was named: nothing is pressed until the user says "yes" (see confirmPending). */
  | { id: string; result: 'awaiting' };

/** Wait for an opened app to come to the front: poll this often, for at most this long. */
const APP_POLL_MS = 150;
const DEFAULT_APP_READY_MS = 3_000;

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
  /** Pause after a step that loads a page (Enter in a browser, a click, opening a site). Default 1.8 s. */
  pageWaitMs?: () => number;
  /** How long to wait for an opened app to come to the front before the next step. Default 3 s; 0 = do not wait. */
  appReadyMs?: () => number;
  /** Scales the fixed waits of the messaging steps (default 1; 0 for none, used in tests). */
  messageSpeed?: () => number;
  /** How long the "Send … to …?" chip shows before a message is sent. Default 3 s. */
  messagePreviewMs?: () => number;
  /**
   * "Say it in your own words": for a command-mode sentence no exact command matched, a plan made
   * only of the app's own commands (or null). Its steps go through the same safety checks.
   */
  interpret?: (utterance: string, context: AppContext) => Promise<Plan | null>;
  /** A saved fact about the person ("email"), or null when it is not saved. Never leaves this Mac. */
  profileValue?: (key: ProfileKey) => string | null;
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
      // "type my email" / "type calendly": a snippet or a fact about you is typed as saved.
      const text =
        this.opts.snippets?.find(literal) ?? typeLiterally(literal, this.opts.dictionary?.() ?? []);
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
    // No exact command? Try the interpreter. Command mode never types a sentence it did not
    // understand: it is reported, not inserted.
    const planned: PlanStep[] | null = steps
      ? steps.map((match) => ({ kind: 'command', match }))
      : await this.interpretFallback(text, context);
    if (!planned) throw new CommandNotUnderstood(segment.text);

    // "yes" answers a waiting risky action. Any other command ends that wait.
    const first = planned[0];
    const isYes =
      planned.length === 1 &&
      first?.kind === 'command' &&
      first.match.command.action.type === 'confirmPending';
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
    for (const [index, step] of planned.entries()) {
      if (index > 0) {
        const pageLoaded = command?.result === 'ran' && command.loadsPage === true;
        const wait = pageLoaded
          ? (this.opts.pageWaitMs?.() ?? DEFAULT_PAGE_WAIT_MS)
          : (this.opts.settleMs?.() ?? 300);
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      command =
        step.kind === 'command'
          ? await this.runCommand(step.match, { failOnRefusal: true, allowConfirm: true })
          : step.kind === 'fill'
            ? await this.fillStep(step.label, step.key)
            : await this.typeStep(step.text);
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

  /**
   * The interpreter's plan for a sentence no exact command matched. Nothing is read or sent in a
   * password field or a meeting app, and a failure of any kind is just "not understood".
   */
  private async interpretFallback(text: string, context: AppContext): Promise<PlanStep[] | null> {
    if (!this.opts.interpret) return null;
    if (context.secureField || isMeetingApp(context.bundleId)) return null;
    try {
      const steps = (await this.opts.interpret(text, context))?.steps ?? null;
      return steps ? this.keepMessagesVerbatim(steps, text) : null;
    } catch {
      return null;
    }
  }

  /**
   * The AI may choose to send a message, but never writes it: the text of every message step must
   * be words really said, and is replaced by them exactly as said. A plan that rewrote a message
   * is dropped whole.
   */
  private keepMessagesVerbatim(steps: PlanStep[], utterance: string): PlanStep[] | null {
    const out: PlanStep[] = [];
    for (const step of steps) {
      if (step.kind !== 'command' || step.match.command.action.type !== 'sendMessage') {
        out.push(step);
        continue;
      }
      const request = parseMessageRequest(step.match.args['message'] ?? '');
      const said = request ? verbatimIn(utterance, request.text) : null;
      if (!request || !said) return null;
      const app = request.app ? ` on ${request.app}` : '';
      out.push({
        kind: 'command',
        match: { ...step.match, args: { message: `${request.name}${app} saying ${said}` } },
      });
    }
    return out;
  }

  /**
   * "Fill in my details": puts the cursor in the field called `label`, then types the saved fact.
   * The value comes from this Mac, never from the AI. Refused in a password field, before and after
   * the cursor moves, and in meetings.
   */
  private async fillStep(label: string, key: ProfileKey): Promise<CommandOutcome> {
    const live = await this.opts.readContext();
    this.assertCanInsert(live);
    if (isMeetingApp(live.bundleId)) throw new CommandRefused('meeting_app', live.appName);
    const value = this.opts.profileValue?.(key) ?? null;
    if (value === null) {
      throw new CommandFailed(`Your ${key} is not saved yet. Add it in About me.`);
    }
    try {
      await this.opts.actions.focusField(label);
    } catch (error) {
      if (error instanceof HelperRequestError && error.code === 'element_not_found') {
        throw new CommandFailed(`There is no field called “${label}” on screen.`, { cause: error });
      }
      throw error;
    }
    // A short wait for the field to take the cursor; insert() checks for a password field again.
    await new Promise((resolve) => setTimeout(resolve, this.opts.settleMs?.() ?? 300));
    await this.insert(value);
    return { id: 'fill', result: 'ran' };
  }

  /** A "type …" step of a plan: typed as said, with the same checks as typing by voice. */
  private async typeStep(text: string): Promise<CommandOutcome> {
    this.assertCanInsert(await this.opts.readContext());
    const typed = typeLiterally(text, this.opts.dictionary?.() ?? []);
    if (typed !== '') await this.opts.actions.insertText(typed);
    return { id: 'type', result: 'ran' };
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
    const loads = await this.perform(waiting.match.command.action, waiting.match.args, live);
    return loads
      ? { id: waiting.match.command.id, result: 'ran', loadsPage: true }
      : { id: waiting.match.command.id, result: 'ran' };
  }

  private async pause(ms: number): Promise<void> {
    const scaled = Math.round(ms * (this.opts.messageSpeed?.() ?? 1));
    if (scaled > 0) await new Promise((resolve) => setTimeout(resolve, scaled));
  }

  /** The app in front is still the messaging app, and it is not a meeting app or a password field. */
  private async assertStillSafe(bundleId: string): Promise<void> {
    const live = await this.opts.readContext();
    if (isMeetingApp(live.bundleId)) throw new CommandRefused('meeting_app', live.appName);
    this.assertCanInsert(live);
    if (live.bundleId !== bundleId) {
      throw new CommandFailed('The app changed, so the message was not sent.');
    }
  }

  /**
   * "Message Priya on Slack saying I will be late": open the app, open its search, type the name,
   * take the first match, type the text, then show “Send … to …?” and press Enter unless Esc
   * cancels. The steps are fixed (messaging/recipes.ts). Refused in meeting apps and password
   * fields, and checked again before each typing step and before Enter. The text is cleaned up
   * like dictation; the person it goes to is the first match of the typed name, which the chip
   * names so it can be cancelled.
   */
  private async sendMessage(match: InstantMatch, live: AppContext): Promise<CommandOutcome> {
    const id = match.command.id;
    const request = parseMessageRequest(match.args['message'] ?? '');
    if (!request) {
      throw new CommandFailed('Say it like “message Priya on Slack saying I will be late”.');
    }
    const app = request.app ?? messageAppForBundle(live.bundleId);
    if (!app) {
      throw new CommandFailed('Say which app: “message Priya on Slack saying …” or on WhatsApp.');
    }
    const recipe = RECIPES[app];
    const resolved = await this.opts.resolver.resolveOpen(recipe.appName);
    if (resolved.type !== 'app') throw new CommandFailed(`${recipe.appName} is not installed.`);
    const bundleId = resolved.bundleId;
    const name = titleCase(request.name);

    // The message is exactly what was said: no AI and no command reading. Only your own spellings
    // and web addresses ("example dot com" → example.com) are fixed, as when typing by voice.
    const text = typeLiterally(request.text, this.opts.dictionary?.() ?? []).trim() || request.text;

    const wasInFront = live.bundleId === bundleId;
    await this.opts.actions.openApp(bundleId);
    await this.waitForFront(bundleId);
    if (!wasInFront) await this.pause(recipe.appReadyMs);

    await this.assertStillSafe(bundleId);
    await this.opts.actions.pressKey(recipe.openSearch.key, recipe.openSearch.modifiers);
    await this.pause(recipe.afterOpenSearchMs);
    await this.insert(name);
    await this.pause(recipe.afterNameMs);
    for (const stroke of recipe.pickFirst) {
      await this.opts.actions.pressKey(stroke.key, stroke.modifiers);
      await this.pause(150);
    }
    await this.pause(recipe.afterPickMs);

    await this.assertStillSafe(bundleId);
    await this.insert(text);

    const chip = await this.opts.chip.confirm(
      `Send “${text}” to ${name}?`,
      this.opts.messagePreviewMs?.() ?? 3_000,
    );
    if (chip === 'cancelled') return { id, result: 'cancelled' };
    await this.assertStillSafe(bundleId);
    await this.opts.actions.pressKey('enter', []);
    return { id, result: 'ran' };
  }

  /**
   * After opening an app: wait until it is the app in front (polling every 150 ms, up to
   * `appReadyMs`), so the next step does not land in the app that was in front before. It
   * carries on when the time is up: the next step's own checks decide what is safe.
   */
  private async waitForFront(bundleId: string): Promise<void> {
    const limit = this.opts.appReadyMs?.() ?? DEFAULT_APP_READY_MS;
    const started = Date.now();
    while (Date.now() - started < limit) {
      try {
        if ((await this.opts.readContext()).bundleId === bundleId) return;
      } catch {
        // Not readable yet (the app is still starting): try again.
      }
      await new Promise((resolve) => setTimeout(resolve, APP_POLL_MS));
    }
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

    // Messaging has its own steps and shows its own chip, with who and what, right before sending.
    if (spec.action.type === 'sendMessage') return this.sendMessage(match, live);

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

    const loads = await this.perform(spec.action, match.args, target);
    return loads ? { id: spec.id, result: 'ran', loadsPage: true } : { id: spec.id, result: 'ran' };
  }

  /** Runs one action. Returns true when it probably loaded a page (see pageLoad.ts). */
  private async perform(
    action: CommandAction,
    args: Readonly<Record<string, string>>,
    target: AppContext,
  ): Promise<boolean> {
    const { actions, resolver } = this.opts;
    let effect: StepEffect = { type: 'other' };
    switch (action.type) {
      case 'contextual_send':
      case 'keyPress': {
        const stroke = keyStrokeFor(action, target.bundleId);
        await actions.pressKey(stroke.key, stroke.modifiers);
        effect =
          action.type === 'contextual_send'
            ? { type: 'contextual_send' }
            : { type: 'keyPress', key: stroke.key, modifiers: stroke.modifiers ?? [] };
        break;
      }
      case 'scroll':
        await actions.scroll(action.direction, action.amount);
        break;
      case 'pressElement':
        await actions.pressElement(requiredArg(args, 'label'));
        effect = { type: 'pressElement' };
        break;
      case 'pressPosition': {
        const position = parsePosition(requiredArg(args, 'position'));
        if (!position) throw new CommandFailed('Say which one, like “the first result”.');
        try {
          await actions.pressPosition(position.kind, position.index);
        } catch (error) {
          if (error instanceof HelperRequestError && error.code === 'element_not_found') {
            throw new CommandFailed(`There is no ${position.spoken} on screen.`, { cause: error });
          }
          throw error;
        }
        effect = { type: 'pressPosition' };
        break;
      }
      case 'openTarget': {
        const resolved = await resolver.resolveOpen(requiredArg(args, 'target'));
        if (resolved.type === 'app') {
          await actions.openApp(resolved.bundleId);
          await this.waitForFront(resolved.bundleId);
        } else await actions.openUrl(resolved.url);
        effect = { type: 'openTarget', resolved: resolved.type === 'app' ? 'app' : 'url' };
        break;
      }
      case 'switchApp': {
        const name = requiredArg(args, 'app');
        const app = await resolver.resolveSwitch(name);
        if (!app) throw new CommandFailed(`${name} is not running.`);
        await actions.activateApp(app.bundleId);
        break;
      }
      case 'sendMessage':
        // Handled in runCommand, which shows the chip with the message before sending.
        throw new CommandFailed('Say who to message, like “message Priya on Slack saying hello”.');
      case 'cancel':
        break;
      case 'confirmPending':
        // Handled in deliverCommand; a "yes" never reaches the generic path.
        throw new CommandFailed('Nothing is waiting for “yes”.');
    }
    return loadsPage(effect, target.bundleId);
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
