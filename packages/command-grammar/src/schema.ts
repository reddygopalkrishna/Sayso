import { KeySchema, ModifierSchema } from '@sayso/helper-protocol';
import { z } from 'zod';

export const SafetyLevelSchema = z.enum(['safe', 'normal', 'risky', 'blocked']);
export type SafetyLevel = z.infer<typeof SafetyLevelSchema>;

export { KeySchema, ModifierSchema, type Key, type Modifier } from '@sayso/helper-protocol';

/** Actions a command can name in commands.json (a subset of the Action model, TECHNICAL_ARCHITECTURE 5.1). */
export const CommandActionSchema = z.discriminatedUnion('type', [
  /** Enter in chat apps; the app's send shortcut in mail apps (per-app send strategy). */
  z.object({ type: z.literal('contextual_send') }).strict(),
  /** Scroll the view under the pointer by `amount` pixels. */
  z
    .object({
      type: z.literal('scroll'),
      direction: z.enum(['up', 'down']),
      amount: z.number().int().min(50).max(5000),
    })
    .strict(),
  /** Press a visible button, link or menu item; the label is the `{label}` argument. */
  z.object({ type: z.literal('pressElement') }).strict(),
  /** Open an app or website; the name is the `{target}` argument (resolved by the AppResolver). */
  z.object({ type: z.literal('openTarget') }).strict(),
  /** Bring a running app to the front; the name is the `{app}` argument. */
  z.object({ type: z.literal('switchApp') }).strict(),
  /** Do nothing: "cancel" / "never mind". */
  z.object({ type: z.literal('cancel') }).strict(),
  z
    .object({
      type: z.literal('keyPress'),
      key: KeySchema,
      modifiers: z.array(ModifierSchema).optional(),
    })
    .strict(),
]);
export type CommandAction = z.infer<typeof CommandActionSchema>;

/** Lowercase words separated by single spaces, optionally ending in one {argument}. */
const phrase = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9]+(?: [a-z0-9]+)*(?: \{[a-z]+\})?$/,
    'phrases are lowercase words separated by single spaces, optionally ending in {name}',
  );

/** The argument each action takes from the end of the phrase (none for the others). */
const ACTION_ARGUMENT: Partial<Record<CommandAction['type'], string>> = {
  pressElement: 'label',
  openTarget: 'target',
  switchApp: 'app',
};

/** The {name} a phrase ends with, or null. */
export function phraseArgument(p: string): string | null {
  const m = /\{([a-z]+)\}$/.exec(p);
  return m?.[1] ?? null;
}

export const CommandSpecSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    /** Short name shown on the preview chip; {label}, {target} or {app} is filled from the phrase. */
    label: z.string().min(1).max(60),
    phrases: z.array(phrase).min(1),
    /** Only recognised as the last words of an utterance, after a pause (the pause rule). */
    endOfUtteranceOnly: z.boolean(),
    action: CommandActionSchema,
    safety: SafetyLevelSchema,
    /** Bundle ids where the command never runs; the words are typed as text instead. */
    blockedIn: z.array(z.string().min(1)),
  })
  .strict();
export type CommandSpec = z.infer<typeof CommandSpecSchema>;

export const GrammarSchema = z
  .object({ $comment: z.string().optional(), commands: z.array(CommandSpecSchema) })
  .strict()
  .superRefine((grammar, ctx) => {
    for (const command of grammar.commands) {
      const wanted = ACTION_ARGUMENT[command.action.type] ?? null;
      for (const p of command.phrases) {
        if (phraseArgument(p) !== wanted) {
          ctx.addIssue({
            code: 'custom',
            message: `phrase "${p}" of ${command.id} must ${wanted ? `end with {${wanted}}` : 'have no {argument}'}`,
          });
        }
      }
      if (command.endOfUtteranceOnly && wanted) {
        ctx.addIssue({
          code: 'custom',
          message: `${command.id}: end commands cannot take arguments`,
        });
      }
    }
    const ids = new Set<string>();
    const phrases = new Map<string, string>();
    for (const command of grammar.commands) {
      if (ids.has(command.id))
        ctx.addIssue({ code: 'custom', message: `duplicate id ${command.id}` });
      ids.add(command.id);
      for (const p of command.phrases) {
        const owner = phrases.get(p);
        if (owner) {
          ctx.addIssue({
            code: 'custom',
            message: `phrase "${p}" is in both ${owner} and ${command.id}`,
          });
        }
        phrases.set(p, command.id);
      }
    }
  });
