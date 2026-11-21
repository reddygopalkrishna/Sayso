import raw from '../commands.json' with { type: 'json' };
import { GrammarSchema, type CommandSpec } from './schema.ts';

export * from './schema.ts';
export * from './position.ts';

/** All commands, validated at load time (a bad commands.json fails fast). */
export const commands: readonly CommandSpec[] = GrammarSchema.parse(raw).commands;

/** Commands that only count at the end of an utterance (send, enter, new line). */
export const endCommands: readonly CommandSpec[] = commands.filter((c) => c.endOfUtteranceOnly);
