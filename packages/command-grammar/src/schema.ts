import { KeySchema, ModifierSchema } from '@sayso/helper-protocol';
import { z } from 'zod';

export const SafetyLevelSchema = z.enum(['safe', 'normal', 'risky', 'blocked']);
export type SafetyLevel = z.infer<typeof SafetyLevelSchema>;

export { KeySchema, ModifierSchema, type Key, type Modifier } from '@sayso/helper-protocol';

/** Actions a command can name in commands.json (a subset of the Action model, TECHNICAL_ARCHITECTURE 5.1). */
export const CommandActionSchema = z.discriminatedUnion('type', [
  /** Enter in chat apps; the app's send shortcut in mail apps (per-app send strategy). */
  z.object({ type: z.literal('contextual_send') }).strict(),
  z
    .object({
      type: z.literal('keyPress'),
      key: KeySchema,
      modifiers: z.array(ModifierSchema).optional(),
    })
    .strict(),
]);
export type CommandAction = z.infer<typeof CommandActionSchema>;

const phrase = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?: [a-z0-9]+)*$/, 'phrases are lowercase words separated by single spaces');

export const CommandSpecSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    /** Short name shown on the preview chip, e.g. "Send". */
    label: z.string().min(1).max(30),
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
