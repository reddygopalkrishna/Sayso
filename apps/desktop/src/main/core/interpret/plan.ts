import {
  commands,
  parseMessageRequest,
  parsePosition,
  phraseArgument,
  type CommandSpec,
} from '@sayso/command-grammar';
import { z } from 'zod';
import { PROFILE_KEYS, type ProfileKey } from '../../../shared/profile.ts';
import type { InstantMatch } from '../commands/CommandEngine.ts';

/** The most steps one sentence may turn into (a form can have several fields to fill). */
export const MAX_PLAN_STEPS = 8;

/**
 * Commands the interpreter may use. Never "cancel" or "yes": it must not answer a confirmation
 * for you. Everything else is what you could have said word for word, and goes through the same
 * safety checks as if you had.
 */
const FORBIDDEN = new Set(['cancel', 'confirm']);
const allowed: ReadonlyMap<string, CommandSpec> = new Map(
  commands
    .filter((c) => !c.endOfUtteranceOnly || c.id === 'send' || c.id === 'enter')
    .filter((c) => !FORBIDDEN.has(c.id))
    .map((c) => [c.id, c]),
);

export const ALLOWED_COMMAND_IDS: readonly string[] = [...allowed.keys()];

/** The argument a command takes (label, target, app or position), or null. */
export function argumentOf(command: CommandSpec): string | null {
  for (const phrase of command.phrases) {
    const name = phraseArgument(phrase);
    if (name) return name;
  }
  return null;
}

const StepSchema = z
  .object({
    command: z.string(),
    /** The one argument: a label, a site or app, or a position like "third email". */
    arg: z.string().max(120).optional(),
  })
  .strict();

const TypeStepSchema = z.object({ type: z.string().min(1).max(500) }).strict();

/** Fill the field called `fill` with the saved fact `from`. The AI names a fact, never a value. */
const FillStepSchema = z
  .object({ fill: z.string().min(1).max(120), from: z.enum(PROFILE_KEYS) })
  .strict();

const PlanSchema = z
  .object({
    steps: z.array(z.union([StepSchema, TypeStepSchema, FillStepSchema])).max(MAX_PLAN_STEPS),
  })
  .strict();

/** One step the app can run: a command, or text to type. */
export type PlanStep =
  | { kind: 'command'; match: InstantMatch }
  | { kind: 'type'; text: string }
  | { kind: 'fill'; label: string; key: ProfileKey };

export interface Plan {
  steps: PlanStep[];
}

/** Pulls the JSON object out of a model reply (it may be wrapped in a code fence or a sentence). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Checks what the model said and turns it into steps, or returns null. Anything unexpected makes
 * the whole plan null, so a half-understood sentence never runs half of itself: unknown commands,
 * a missing or unneeded argument, a position that is not a position, too many steps.
 */
export function toPlan(raw: unknown): Plan | null {
  const parsed = PlanSchema.safeParse(raw);
  if (!parsed.success || parsed.data.steps.length === 0) return null;
  const steps: PlanStep[] = [];
  for (const step of parsed.data.steps) {
    if ('type' in step) {
      steps.push({ kind: 'type', text: step.type });
      continue;
    }
    if ('fill' in step) {
      steps.push({ kind: 'fill', label: step.fill, key: step.from });
      continue;
    }
    const spec = allowed.get(step.command);
    if (!spec) return null;
    const name = argumentOf(spec);
    const arg = step.arg?.trim() ?? '';
    if (name === null && arg !== '') return null;
    if (name !== null && arg === '') return null;
    if (name === 'position' && parsePosition(arg) === null) return null;
    if (name === 'message' && parseMessageRequest(arg) === null) return null;
    const phrase = spec.phrases.find((p) => phraseArgument(p) === name) ?? spec.phrases[0] ?? '';
    steps.push({
      kind: 'command',
      match: {
        command: spec,
        phrase,
        args: name ? { [name]: arg.toLowerCase() } : {},
        confidence: 1,
      },
    });
  }
  return { steps };
}
